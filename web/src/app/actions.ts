"use server";

import { APIError } from "better-auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logError } from "@/lib/api/http";
import { getAuth } from "@/lib/auth/better-auth";
import { LOCAL_USERS } from "@/lib/auth/local-users";
import { getSessionUser } from "@/lib/auth/session";
import { isLocalMode, mailReady } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { deleteJob, updateJob } from "@/lib/services/jobs";
import { markViewed, setProgress } from "@/lib/services/knowledge";
import { deletePlan, setPlanStatus, setTaskStatus } from "@/lib/services/plans";
import { deleteSession, endSession, updateAttempt } from "@/lib/services/practice";
import { updateProfile } from "@/lib/services/profiles";
import { deleteRoute, setRouteArchived } from "@/lib/services/routes";
import { deleteUserSkill, upsertUserSkill } from "@/lib/services/skills";
import { clientIp, consumeRateLimit } from "@/lib/services/rate-limit";
import { type Credentials, credentialsSchema, type ForgotPasswordInput, forgotPasswordSchema, type ResetPasswordInput, resetPasswordSchema } from "@/lib/validation/auth";

/**
 * Server Actions 都是公開的 POST 端點：每一個都自己檢查登入，輸入一律交給服務層驗證。
 */
export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  done?: boolean;
}

function toActionState(error: unknown): ActionState {
  if (error instanceof AppError) {
    return { error: error.message, fieldErrors: Object.fromEntries(error.issues.map((i) => [i.field, i.message])) };
  }
  logError(error);
  return { error: "系統發生錯誤，請稍後再試" };
}

async function sessionOrRedirect() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

// ---------------------------------------------------------------------------
// 登入（Better Auth；nextCookies plugin 會把 session cookie 寫進回應）
// ---------------------------------------------------------------------------

/** Better Auth 的錯誤碼 → 使用者看得懂的訊息；不洩漏帳號是否存在 */
function authErrorMessage(error: unknown, intent: "signin" | "signup"): string {
  if (error instanceof APIError) {
    const code = error.body?.code ?? "";
    if (intent === "signup" && /ALREADY_EXISTS/.test(code)) return "這個 Email 已經註冊過，請直接登入";
    if (intent === "signin" && (/INVALID_EMAIL_OR_PASSWORD|USER_NOT_FOUND|INVALID_PASSWORD/.test(code) || error.status === "UNAUTHORIZED")) return "Email 或密碼不正確";
    if (/PASSWORD_TOO_SHORT|PASSWORD_TOO_LONG/.test(code)) return "密碼長度需為 8–72 個字元";
    if (/EMAIL_NOT_VERIFIED/.test(code)) return "這個 Email 還沒驗證。我們已重新寄出驗證信，請到信箱點連結後再登入";
    if (error.status === "TOO_MANY_REQUESTS") return "嘗試次數太多，請稍後再試";
    logError(error);
    return intent === "signup" ? "註冊失敗，請稍後再試" : "登入失敗，請稍後再試";
  }
  logError(error);
  return "系統發生錯誤，請稍後再試";
}

/** 限流：每個 IP 每 10 分鐘 30 次、每個 Email 每 15 分鐘 10 次（登入與註冊合計；失敗也算） */
async function allowLoginAttempt(requestHeaders: Headers, email: string): Promise<boolean> {
  const db = await getDb();
  const ipOk = await consumeRateLimit(db, `login:ip:${clientIp(requestHeaders)}`, 30, 600);
  const emailOk = await consumeRateLimit(db, `login:email:${email.toLowerCase()}`, 10, 900);
  return ipOk && emailOk;
}

export async function loginAction(intent: "signin" | "signup", input: Credentials): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  const requestHeaders = await headers();
  if (!(await allowLoginAttempt(requestHeaders, parsed.data.email))) return { error: "嘗試次數太多，請 10 分鐘後再試" };
  const auth = await getAuth();
  // redirect() 靠丟例外運作，不能放在 try 裡，否則會被 catch 當成錯誤
  let checkMail = false;
  try {
    if (intent === "signup") {
      const name = parsed.data.name?.trim() || parsed.data.email.split("@")[0];
      const result = await auth.api.signUpEmail({ body: { email: parsed.data.email, password: parsed.data.password, name }, headers: requestHeaders });
      // 要求驗證 Email 時，註冊成功但不會建立 session（token 為 null）；Email 已存在時 Better Auth 也回同樣的結果，不洩漏帳號是否存在
      checkMail = !result.token;
    } else {
      await auth.api.signInEmail({ body: { email: parsed.data.email, password: parsed.data.password }, headers: requestHeaders });
    }
  } catch (error) {
    return { error: authErrorMessage(error, intent) };
  }
  redirect(checkMail ? "/login?notice=check-mail" : "/");
}

/** 本機示範模式：一鍵以示範使用者登入 */
export async function loginLocalAction(formData: FormData): Promise<void> {
  if (!isLocalMode()) redirect("/login");
  const user = LOCAL_USERS.find((u) => u.key === formData.get("user"));
  if (!user) redirect("/login");
  const requestHeaders = await headers();
  if (!(await allowLoginAttempt(requestHeaders, user.email))) redirect("/login");
  const auth = await getAuth();
  await auth.api.signInEmail({ body: { email: user.email, password: user.password }, headers: requestHeaders });
  redirect("/");
}

// ---------------------------------------------------------------------------
// 忘記密碼／重設密碼／Email 驗證（都要有寄信服務；token 由這裡消耗，不走 Better Auth 的 HTTP handler）
// ---------------------------------------------------------------------------

const RESET_MIN_RESPONSE_MS = 1500;

/**
 * 寄重設密碼信。不論帳號存不存在都回同樣的結果。
 * 限流：每個 IP 每 10 分鐘 10 次、每個 Email 每 15 分鐘 3 次。Email 這層會被第三人拿來把某個信箱鎖 15 分鐘，
 * 但沒有它一個 IP 池就能對同一個信箱灌信；取捨之下保留，訊息裡說明等待時間。
 */
export async function requestPasswordResetAction(input: ForgotPasswordInput): Promise<ActionState> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message, fieldErrors: { email: parsed.error.issues[0].message } };
  if (!mailReady()) return { error: "這個站還沒有設定寄信服務，暫時無法重設密碼" };
  const requestHeaders = await headers();
  const db = await getDb();
  const email = parsed.data.email.toLowerCase();
  // IP 這層沒過就不扣 Email 的額度，免得被同一個來源拿來鎖別人的信箱
  if (!(await consumeRateLimit(db, `reset:ip:${clientIp(requestHeaders)}`, 10, 600))) return { error: "嘗試次數太多，請 15 分鐘後再試" };
  if (!(await consumeRateLimit(db, `reset:email:${email}`, 3, 900))) return { error: "嘗試次數太多，請 15 分鐘後再試" };
  const auth = await getAuth();
  const started = Date.now();
  try {
    await auth.api.requestPasswordReset({ body: { email }, headers: requestHeaders });
  } catch (error) {
    // 寄信失敗也不告訴使用者帳號是否存在；留在日誌
    logError(error);
  }
  // 帳號存在時要等寄信完成，不存在時立刻回來；補到固定的最短時間，縮小用回應時間猜帳號的空間
  await new Promise((r) => setTimeout(r, Math.max(0, RESET_MIN_RESPONSE_MS - (Date.now() - started))));
  return { done: true };
}

/** 用信裡的 token 設定新密碼；成功後所有舊 session 失效，回登入頁 */
export async function resetPasswordAction(input: ResetPasswordInput): Promise<ActionState> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  const requestHeaders = await headers();
  if (!(await consumeRateLimit(await getDb(), `reset:confirm:${clientIp(requestHeaders)}`, 10, 600))) return { error: "嘗試次數太多，請 10 分鐘後再試" };
  const auth = await getAuth();
  try {
    await auth.api.resetPassword({ body: { newPassword: parsed.data.password, token: parsed.data.token }, headers: requestHeaders });
  } catch (error) {
    if (error instanceof APIError) {
      const code = error.body?.code ?? "";
      if (/INVALID_TOKEN/.test(code)) return { error: "這個連結已失效或已經用過，請重新申請重設密碼" };
      if (/PASSWORD_TOO_SHORT|PASSWORD_TOO_LONG/.test(code)) return { error: "密碼長度需為 8–72 個字元" };
    }
    logError(error);
    return { error: "系統發生錯誤，請稍後再試" };
  }
  redirect("/login?notice=reset");
}

/** 已登入但尚未驗證的使用者重寄驗證信（設定頁）；每位使用者每小時 3 次 */
export async function resendVerificationAction(): Promise<ActionState> {
  const user = await sessionOrRedirect();
  if (!user.email) return { error: "這個帳號沒有 Email" };
  if (user.emailVerified) return { done: true };
  if (!mailReady()) return { error: "這個站還沒有設定寄信服務" };
  const requestHeaders = await headers();
  if (!(await consumeRateLimit(await getDb(), `verify:resend:${user.id}`, 3, 3600))) return { error: "已經寄過幾封了，請一小時後再試" };
  const auth = await getAuth();
  try {
    await auth.api.sendVerificationEmail({ body: { email: user.email }, headers: requestHeaders });
  } catch (error) {
    logError(error);
    return { error: "寄送失敗，請稍後再試" };
  }
  return { done: true };
}

/** 用信裡的 token 完成 Email 驗證；成功後直接登入（autoSignInAfterVerification） */
export async function verifyEmailAction(token: string): Promise<ActionState> {
  if (typeof token !== "string" || !token || token.length > 4000) return { error: "這個連結無效" };
  const requestHeaders = await headers();
  if (!(await consumeRateLimit(await getDb(), `verify:ip:${clientIp(requestHeaders)}`, 20, 600))) return { error: "嘗試次數太多，請 10 分鐘後再試" };
  const auth = await getAuth();
  try {
    await auth.api.verifyEmail({ query: { token }, headers: requestHeaders });
  } catch (error) {
    if (error instanceof APIError) return { error: "這個連結已失效或已經用過。登入時系統會再寄一封驗證信" };
    logError(error);
    return { error: "系統發生錯誤，請稍後再試" };
  }
  // autoSignInAfterVerification 已把 session cookie 寫進回應；這裡的 getSessionUser 只看得到請求帶來的舊 cookie，不能拿來判斷
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const auth = await getAuth();
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch (error) {
    // 沒有 session 也算登出成功
    if (!(error instanceof APIError)) logError(error);
  }
  redirect("/login");
}

// ---------------------------------------------------------------------------
// 知識進度
// ---------------------------------------------------------------------------

/** 知識頁掛載後記錄瀏覽（Dashboard 的「最近瀏覽」用） */
export async function markViewedAction(nodeId: string): Promise<void> {
  const user = await getSessionUser();
  if (!user) return;
  try {
    await markViewed(await getDb(), user.id, nodeId);
  } catch (error) {
    logError(error);
  }
}

export async function setProgressAction(nodeId: string, slug: string, status: string): Promise<ActionState> {
  const user = await sessionOrRedirect();
  try {
    await setProgress(await getDb(), user.id, nodeId, { status });
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath(`/knowledge/${slug}`);
  revalidatePath("/");
  return { done: true };
}

// ---------------------------------------------------------------------------
// 職缺與技能（AI 分析走 API 路由，這裡只有不需要 AI 的操作）
// ---------------------------------------------------------------------------

/** 自評一個技能（job 頁與 My Skills 共用）；level null＝回到未評估 */
export async function setSkillLevelAction(skillName: string, level: number | null, extra: { category?: string | null; goalWeight?: number } = {}): Promise<ActionState> {
  const user = await sessionOrRedirect();
  try {
    await upsertUserSkill(await getDb(), user.id, { skillName, level, ...extra });
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath("/jobs", "layout");
  revalidatePath("/skills");
  revalidatePath("/");
  return { done: true };
}

export async function deleteSkillAction(id: string): Promise<ActionState> {
  const user = await sessionOrRedirect();
  try {
    await deleteUserSkill(await getDb(), user.id, id);
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath("/skills");
  revalidatePath("/jobs", "layout");
  return { done: true };
}

export async function updateJobAction(jobId: string, input: Record<string, unknown>): Promise<ActionState> {
  const user = await sessionOrRedirect();
  try {
    await updateJob(await getDb(), user.id, jobId, input);
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/jobs");
  return { done: true };
}

export async function deleteJobAction(jobId: string): Promise<void> {
  const user = await sessionOrRedirect();
  try {
    await deleteJob(await getDb(), user.id, jobId);
  } catch (error) {
    if (!(error instanceof AppError)) logError(error);
  }
  revalidatePath("/jobs");
  revalidatePath("/");
  redirect("/jobs");
}

// ---------------------------------------------------------------------------
// 學習計畫（產生走 API 路由；這裡是狀態操作）
// ---------------------------------------------------------------------------

export async function setTaskStatusAction(planId: string, taskId: string, status: string): Promise<ActionState> {
  const user = await sessionOrRedirect();
  try {
    await setTaskStatus(await getDb(), user.id, planId, taskId, { status });
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath(`/plans/${planId}`);
  revalidatePath("/plans");
  revalidatePath("/");
  return { done: true };
}

export async function setPlanStatusAction(planId: string, status: "active" | "completed" | "archived"): Promise<ActionState> {
  const user = await sessionOrRedirect();
  try {
    await setPlanStatus(await getDb(), user.id, planId, status);
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath(`/plans/${planId}`);
  revalidatePath("/plans");
  revalidatePath("/");
  return { done: true };
}

export async function deletePlanAction(planId: string): Promise<void> {
  const user = await sessionOrRedirect();
  try {
    await deletePlan(await getDb(), user.id, planId);
  } catch (error) {
    if (!(error instanceof AppError)) logError(error);
  }
  revalidatePath("/plans");
  revalidatePath("/");
  redirect("/plans");
}

// ---------------------------------------------------------------------------
// 學習路線（AI 的步驟走 API 路由，這裡只有封存與刪除）
// ---------------------------------------------------------------------------

export async function setRouteArchivedAction(routeId: string, archived: boolean): Promise<ActionState> {
  const user = await sessionOrRedirect();
  try {
    await setRouteArchived(await getDb(), user.id, routeId, archived === true);
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath(`/routes/${routeId}`);
  revalidatePath("/routes");
  return { done: true };
}

export async function deleteRouteAction(routeId: string): Promise<void> {
  const user = await sessionOrRedirect();
  try {
    await deleteRoute(await getDb(), user.id, routeId);
  } catch (error) {
    if (!(error instanceof AppError)) logError(error);
  }
  revalidatePath("/routes");
  redirect("/routes");
}

// ---------------------------------------------------------------------------
// 面試練習（出題與評估走 API 路由；這裡是狀態操作）
// ---------------------------------------------------------------------------

export async function endSessionAction(sessionId: string): Promise<ActionState> {
  const user = await sessionOrRedirect();
  try {
    await endSession(await getDb(), user.id, sessionId);
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath(`/practice/${sessionId}`);
  revalidatePath("/practice");
  revalidatePath("/");
  return { done: true };
}

export async function deleteSessionAction(sessionId: string): Promise<void> {
  const user = await sessionOrRedirect();
  try {
    await deleteSession(await getDb(), user.id, sessionId);
  } catch (error) {
    if (!(error instanceof AppError)) logError(error);
  }
  revalidatePath("/practice");
  revalidatePath("/");
  redirect("/practice");
}

/** 加入／移出複習清單 */
export async function setReviewFlagAction(sessionId: string, attemptId: string, reviewFlag: boolean): Promise<ActionState> {
  const user = await sessionOrRedirect();
  try {
    await updateAttempt(await getDb(), user.id, attemptId, { reviewFlag });
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath(`/practice/${sessionId}`);
  revalidatePath("/practice");
  return { done: true };
}

/** 使用者看完評估後自己確認程度（才會寫進 My Skills） */
export async function confirmLevelAction(sessionId: string, attemptId: string, level: number | null): Promise<ActionState> {
  const user = await sessionOrRedirect();
  try {
    await updateAttempt(await getDb(), user.id, attemptId, { confirmedLevel: level });
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath(`/practice/${sessionId}`);
  revalidatePath("/skills");
  revalidatePath("/");
  return { done: true };
}

// ---------------------------------------------------------------------------
// 個人資料
// ---------------------------------------------------------------------------

export async function updateProfileAction(input: { displayName?: string; targetRole?: string; weeklyLearningMinutes?: number }): Promise<ActionState> {
  const user = await sessionOrRedirect();
  try {
    await updateProfile(await getDb(), user.id, input);
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath("/settings");
  return { done: true };
}
