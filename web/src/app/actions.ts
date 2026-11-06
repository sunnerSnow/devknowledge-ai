"use server";

import { APIError } from "better-auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logError } from "@/lib/api/http";
import { getAuth } from "@/lib/auth/better-auth";
import { LOCAL_USERS } from "@/lib/auth/local-users";
import { getSessionUser } from "@/lib/auth/session";
import { isLocalMode } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { deleteJob, updateJob } from "@/lib/services/jobs";
import { markViewed, setProgress } from "@/lib/services/knowledge";
import { deletePlan, setPlanStatus, setTaskStatus } from "@/lib/services/plans";
import { updateProfile } from "@/lib/services/profiles";
import { deleteUserSkill, upsertUserSkill } from "@/lib/services/skills";
import { clientIp, consumeRateLimit } from "@/lib/services/rate-limit";
import { type Credentials, credentialsSchema } from "@/lib/validation/auth";

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
  try {
    if (intent === "signup") {
      const name = parsed.data.name?.trim() || parsed.data.email.split("@")[0];
      await auth.api.signUpEmail({ body: { email: parsed.data.email, password: parsed.data.password, name }, headers: requestHeaders });
    } else {
      await auth.api.signInEmail({ body: { email: parsed.data.email, password: parsed.data.password }, headers: requestHeaders });
    }
  } catch (error) {
    return { error: authErrorMessage(error, intent) };
  }
  redirect("/");
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
