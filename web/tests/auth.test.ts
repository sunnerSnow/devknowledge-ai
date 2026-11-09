import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuth, ensureLocalUsers } from "@/lib/auth/better-auth";
import { LOCAL_USERS } from "@/lib/auth/local-users";
import { appOrigin } from "@/lib/config";
import type { Db } from "@/lib/db/local";
import { withUser } from "@/lib/db/with-user";
import type { Mailer, MailMessage } from "@/lib/mail";
import { getProgressStats } from "@/lib/services/knowledge";
import { getProfile } from "@/lib/services/profiles";
import { createTestDb, rowsOf } from "./helpers/db";

let db: Db;
let auth: ReturnType<typeof createAuth>;

beforeEach(async () => {
  db = await createTestDb();
  auth = createAuth(db);
});

/** 從 Better Auth 的回應取出 session cookie，模擬瀏覽器下一個請求 */
async function signInCookie(email: string, password: string): Promise<string> {
  const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = /(better-auth\.session_token=[^;]+)/.exec(setCookie);
  if (!match) throw new Error(`沒有 session cookie：${setCookie}`);
  return match[1];
}

describe("Better Auth（PGlite）", () => {
  it("註冊後可登入；session 對應到 auth.users 的 uuid，RLS 以它隔離", async () => {
    const signUp = await auth.api.signUpEmail({ body: { email: "yuki@example.test", password: "correct-horse-9", name: "Yuki" } });
    expect(signUp.user.email).toBe("yuki@example.test");
    expect(signUp.user.id).toMatch(/^[0-9a-f-]{36}$/);

    const cookie = await signInCookie("yuki@example.test", "correct-horse-9");
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.id).toBe(signUp.user.id);
    expect(session?.user.name).toBe("Yuki");

    // 註冊時 databaseHooks 已建立 dk.profiles；這個 id 可以直接當 RLS 身分使用
    const profile = await getProfile(db, signUp.user.id);
    expect(profile).toMatchObject({ email: "yuki@example.test", displayName: "Yuki" });
    expect(await getProgressStats(db, signUp.user.id)).toEqual({ not_started: 0, learning: 0, understood: 0, implemented: 0 });
    const uid = rowsOf<{ uid: string }>(await withUser(db, signUp.user.id, (tx) => tx.execute(sql`select auth.uid()::text as uid`)));
    expect(uid[0].uid).toBe(signUp.user.id);
  });

  it("profile 缺列時 getProfile 會補建", async () => {
    const signUp = await auth.api.signUpEmail({ body: { email: "heal@example.test", password: "password-123", name: "Heal" } });
    await db.execute(sql`delete from dk.profiles where id = ${signUp.user.id}`);
    const profile = await getProfile(db, signUp.user.id);
    expect(profile).toMatchObject({ id: signUp.user.id, email: "heal@example.test", displayName: "Heal" });
    expect(await getProfile(db, "00000000-0000-4000-8000-000000000099")).toBeNull();
  });

  it("密碼錯誤或帳號不存在都回 401；重複註冊回 422", async () => {
    await auth.api.signUpEmail({ body: { email: "a@example.test", password: "password-123", name: "A" } });
    const wrong = await auth.api.signInEmail({ body: { email: "a@example.test", password: "wrong-password" }, asResponse: true });
    expect(wrong.status).toBe(401);
    const missing = await auth.api.signInEmail({ body: { email: "nobody@example.test", password: "password-123" }, asResponse: true });
    expect(missing.status).toBe(401);
    const dup = await auth.api.signUpEmail({ body: { email: "A@example.test", password: "password-123", name: "A2" }, asResponse: true });
    expect(dup.status).toBe(422);
  });

  it("密碼太短被拒絕", async () => {
    const res = await auth.api.signUpEmail({ body: { email: "b@example.test", password: "short", name: "B" }, asResponse: true });
    expect(res.status).toBe(400);
  });

  it("登出後 session 失效", async () => {
    await auth.api.signUpEmail({ body: { email: "c@example.test", password: "password-123", name: "C" } });
    const cookie = await signInCookie("c@example.test", "password-123");
    await auth.api.signOut({ headers: new Headers({ cookie }) });
    expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  });

  it("示範使用者可重複建立且能登入", async () => {
    await ensureLocalUsers(auth);
    await ensureLocalUsers(auth);
    const cookie = await signInCookie(LOCAL_USERS[0].email, LOCAL_USERS[0].password);
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.email).toBe(LOCAL_USERS[0].email);
    const n = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from auth.users`));
    expect(n[0].n).toBe(2);
  });
});

/** 攔下寄出的信，從內文取出連結裡的 token */
function captureMailer(): Mailer & { sent: MailMessage[]; lastToken(path: string): string } {
  const sent: MailMessage[] = [];
  return {
    kind: "log",
    sent,
    async send(message) {
      sent.push(message);
    },
    lastToken(path) {
      const last = sent.at(-1);
      if (!last) throw new Error("沒有寄出任何信");
      const marker = `${path}?token=`;
      const start = last.text.indexOf(marker);
      if (start < 0) throw new Error(`信裡沒有 ${path} 連結：${last.text}`);
      const rest = last.text.slice(start + marker.length);
      const end = rest.search(/[\s&]/);
      return decodeURIComponent(end < 0 ? rest : rest.slice(0, end));
    },
  };
}

describe("忘記密碼與 Email 驗證（Phase 5）", () => {
  it("重設密碼：信裡的 token 可設定新密碼，舊密碼與舊 session 失效，token 只能用一次", async () => {
    const mailer = captureMailer();
    const auth2 = createAuth(db, { mailer, requireVerification: false });
    await auth2.api.signUpEmail({ body: { email: "reset@example.test", password: "old-password-1", name: "R" } });
    const oldCookie = (async () => {
      const res = await auth2.api.signInEmail({ body: { email: "reset@example.test", password: "old-password-1" }, asResponse: true });
      return /(better-auth\.session_token=[^;]+)/.exec(res.headers.get("set-cookie") ?? "")?.[1] ?? "";
    })();
    expect(await oldCookie).not.toBe("");
    const before = mailer.sent.length;

    await auth2.api.requestPasswordReset({ body: { email: "reset@example.test" } });
    expect(mailer.sent.length).toBe(before + 1);
    expect(mailer.sent.at(-1)?.to).toBe("reset@example.test");
    expect(mailer.sent.at(-1)?.text).toContain(`${appOrigin()}/reset-password?token=`);
    const token = mailer.lastToken("/reset-password");

    await auth2.api.resetPassword({ body: { newPassword: "new-password-2", token } });
    const oldLogin = await auth2.api.signInEmail({ body: { email: "reset@example.test", password: "old-password-1" }, asResponse: true });
    expect(oldLogin.status).toBe(401);
    const newLogin = await auth2.api.signInEmail({ body: { email: "reset@example.test", password: "new-password-2" }, asResponse: true });
    expect(newLogin.status).toBe(200);
    // 舊 session 已撤銷
    expect(await auth2.api.getSession({ headers: new Headers({ cookie: await oldCookie }) })).toBeNull();
    // 同一個 token 不能再用
    const reuse = await auth2.api.resetPassword({ body: { newPassword: "another-pass-3", token }, asResponse: true });
    expect(reuse.status).toBe(400);
    expect((await reuse.json()).code).toBe("INVALID_TOKEN");
  });

  it("不存在的 Email 也回成功且不寄信；亂寫的 token 被拒絕", async () => {
    const mailer = captureMailer();
    const auth2 = createAuth(db, { mailer, requireVerification: false });
    const res = await auth2.api.requestPasswordReset({ body: { email: "nobody@example.test" }, asResponse: true });
    expect(res.status).toBe(200);
    expect(mailer.sent.length).toBe(0);
    const bad = await auth2.api.resetPassword({ body: { newPassword: "whatever-pass-1", token: "not-a-real-token" }, asResponse: true });
    expect(bad.status).toBe(400);
  });

  it("Email 驗證：註冊時寄出驗證信，token 驗證後 emailVerified 為 true", async () => {
    const mailer = captureMailer();
    const auth2 = createAuth(db, { mailer, requireVerification: false });
    const signUp = await auth2.api.signUpEmail({ body: { email: "verify@example.test", password: "password-123", name: "V" } });
    expect(mailer.sent.length).toBe(1);
    expect(mailer.sent[0].to).toBe("verify@example.test");
    const token = mailer.lastToken("/verify-email");
    const verified = await auth2.api.verifyEmail({ query: { token }, asResponse: true });
    expect(verified.status).toBe(200);
    // autoSignInAfterVerification：驗證成功就發 session cookie
    expect(verified.headers.get("set-cookie") ?? "").toContain("better-auth.session_token=");
    const rows = rowsOf<{ v: boolean }>(await db.execute(sql`select email_verified v from auth.users where id = ${signUp.user.id}`));
    expect(rows[0].v).toBe(true);
    // 壞 token 被拒絕
    const bad = await auth2.api.verifyEmail({ query: { token: "garbage" }, asResponse: true });
    expect(bad.status).toBeGreaterThanOrEqual(400);
  });

  it("要求驗證時，未驗證的帳號不能登入並會再收到驗證信；驗證後可登入", async () => {
    const mailer = captureMailer();
    const auth2 = createAuth(db, { mailer, requireVerification: true });
    const signUp = await auth2.api.signUpEmail({ body: { email: "strict@example.test", password: "password-123", name: "S" } });
    // 註冊成功但沒有 session（loginAction 靠這個判斷要導去「請收信」提示）
    expect(signUp.token).toBeNull();
    const blocked = await auth2.api.signInEmail({ body: { email: "strict@example.test", password: "password-123" }, asResponse: true });
    expect(blocked.status).toBe(403);
    expect((await blocked.json()).code).toBe("EMAIL_NOT_VERIFIED");
    expect(mailer.sent.length).toBe(2);
    await auth2.api.verifyEmail({ query: { token: mailer.lastToken("/verify-email") } });
    const ok = await auth2.api.signInEmail({ body: { email: "strict@example.test", password: "password-123" }, asResponse: true });
    expect(ok.status).toBe(200);
  });

  it("要求驗證時，已存在的 Email 再註冊也回同樣的「沒有 session」結果，不洩漏帳號是否存在", async () => {
    const mailer = captureMailer();
    const auth2 = createAuth(db, { mailer, requireVerification: true });
    await auth2.api.signUpEmail({ body: { email: "dup@example.test", password: "password-123", name: "D" } });
    const again = await auth2.api.signUpEmail({ body: { email: "dup@example.test", password: "other-password-9", name: "D2" }, asResponse: true });
    expect(again.status).toBe(200);
    expect((await again.json()).token).toBeNull();
    // 不會寄第二封信給別人的信箱
    expect(mailer.sent.length).toBe(1);
  });

  it("寄信失敗：註冊仍成功（Better Auth 自己記錄），手動重寄會把錯誤丟回來", async () => {
    const failing: Mailer = {
      kind: "log",
      async send() {
        throw new Error("寄信服務掛了");
      },
    };
    const auth2 = createAuth(db, { mailer: failing, requireVerification: false });
    const signUp = await auth2.api.signUpEmail({ body: { email: "mailfail@example.test", password: "password-123", name: "M" }, asResponse: true });
    expect(signUp.status).toBe(200);
    await expect(auth2.api.sendVerificationEmail({ body: { email: "mailfail@example.test" } })).rejects.toThrow();
  });

  it("沒有寄信服務時不掛忘記密碼，註冊也不寄信", async () => {
    const auth2 = createAuth(db, { mailer: null });
    const signUp = await auth2.api.signUpEmail({ body: { email: "nomail@example.test", password: "password-123", name: "N" }, asResponse: true });
    expect(signUp.status).toBe(200);
    const res = await auth2.api.requestPasswordReset({ body: { email: "nomail@example.test" }, asResponse: true });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
