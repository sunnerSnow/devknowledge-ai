import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { appOrigin, authEnv, isLocalMode, mailReady, requireEmailVerification } from "@/lib/config";
import { authSchema } from "@/lib/db/auth-schema";
import { type Db, getDb } from "@/lib/db/client";
import { LOCAL_USERS } from "@/lib/auth/local-users";
import { createMailer, emailVerificationMail, type Mailer, passwordResetMail } from "@/lib/mail";
import { ensureProfile } from "@/lib/services/profiles";

/**
 * Better Auth：Email＋密碼。
 * - 使用者表在 Postgres 的 auth schema（db/migrations/20261104000000_auth.sql），id 是 uuid。
 * - session 存資料庫，cookie 只放 token（httpOnly、SameSite=Lax、正式環境 Secure）。
 * - 沒有對外的 HTTP handler：登入／註冊／登出全部經由 Server Action 呼叫 auth.api.*，
 *   限流由 Server Action 自己用資料庫計數（src/lib/services/rate-limit.ts），
 *   所以這裡關掉 Better Auth 內建、只作用在 handler 上的 rateLimit，避免誤以為有在擋。
 * - 忘記密碼與 Email 驗證要有寄信服務（src/lib/mail.ts）；沒有就不掛這兩個功能。
 *   信裡的連結自己組（appOrigin()/reset-password?token=…、/verify-email?token=…），
 *   不用 Better Auth 預設的 /api/auth/... 連結，因為沒有掛 HTTP handler；
 *   token 由頁面上的按鈕送進 Server Action 消耗，信箱的連結預覽不會把 token 用掉。
 * - 寄信在請求內等待完成（沒設 backgroundTasks），serverless 不會把寄到一半的信丟掉。
 * - requireEmailVerification 預設關閉，由 AUTH_REQUIRE_EMAIL_VERIFICATION=1 開啟（既有帳號不會被鎖在外面）。
 * - 本機示範模式啟動時會建立兩位示範使用者，登入頁可一鍵登入。
 */
export interface AuthDeps {
  /** 測試用：換掉寄信器（null 表示沒有寄信服務） */
  mailer?: Mailer | null;
  /** 測試用：覆寫是否要求驗證 Email */
  requireVerification?: boolean;
}

export function createAuth(db: Db, deps: AuthDeps = {}) {
  const env = authEnv();
  const mailer = deps.mailer === undefined ? (mailReady() ? createMailer() : null) : deps.mailer;
  const requireVerification = deps.requireVerification ?? (mailer ? requireEmailVerification() : false);
  return betterAuth({
    appName: "DevKnowledge AI",
    secret: env.secret,
    baseURL: env.baseURL,
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema, transaction: true }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 72,
      requireEmailVerification: requireVerification,
      autoSignIn: true,
      resetPasswordTokenExpiresIn: 60 * 30,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: mailer
        ? async ({ user, token }) => {
            await mailer.send(passwordResetMail(user.email, `${appOrigin()}/reset-password?token=${encodeURIComponent(token)}`));
          }
        : undefined,
    },
    emailVerification: mailer
      ? {
          sendOnSignUp: true,
          // 要求驗證時，未驗證的帳號登入會再寄一封（登入頁的錯誤訊息就是這樣說的）
          sendOnSignIn: true,
          autoSignInAfterVerification: true,
          expiresIn: 60 * 60 * 24,
          // 寄信失敗時：註冊／登入路徑由 Better Auth 自己接住並記錄（runInBackgroundOrAwait），帳號照常建立；
          // 設定頁手動重寄的路徑會把錯誤丟回來，使用者才看得到「寄送失敗」。所以這裡不要再包 try/catch。
          sendVerificationEmail: async ({ user, token }) => {
            await mailer.send(emailVerificationMail(user.email, `${appOrigin()}/verify-email?token=${encodeURIComponent(token)}`));
          },
        }
      : undefined,
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    rateLimit: { enabled: false },
    databaseHooks: {
      user: {
        create: {
          // 註冊成功就建 dk.profiles，之後每個請求不用再 upsert
          after: async (user) => {
            await ensureProfile(db, user.id, user.email ?? null, user.name ?? null);
          },
        },
      },
    },
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: process.env.NODE_ENV === "production" && !isLocalMode(),
    },
    // Server Action 裡呼叫 auth.api.* 時自動把 Set-Cookie 寫進回應（要放在 plugins 最後）
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const cache = globalThis as unknown as { __dkAuth?: Promise<Auth> };

export function getAuth(): Promise<Auth> {
  cache.__dkAuth ??= (async () => {
    const db = await getDb();
    const auth = createAuth(db);
    if (isLocalMode()) await ensureLocalUsers(auth);
    return auth;
  })().catch((error) => {
    cache.__dkAuth = undefined;
    throw error;
  });
  return cache.__dkAuth;
}

/** 本機示範模式：確保兩位示範使用者存在（密碼固定，只在本機用） */
export async function ensureLocalUsers(auth: Auth): Promise<void> {
  for (const u of LOCAL_USERS) {
    try {
      await auth.api.signUpEmail({ body: { email: u.email, password: u.password, name: u.label } });
    } catch (error) {
      // 已存在就略過（USER_ALREADY_EXISTS）；其他錯誤丟出
      const code = (error as { body?: { code?: string } })?.body?.code ?? "";
      if (!/ALREADY_EXISTS/.test(code)) throw error;
    }
  }
}
