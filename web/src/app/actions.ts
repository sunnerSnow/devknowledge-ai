"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logError } from "@/lib/api/http";
import { LOCAL_SESSION_COOKIE, LOCAL_USERS } from "@/lib/auth/local-users";
import { getSessionUser } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/auth/supabase";
import { isLocalMode } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { setProgress } from "@/lib/services/knowledge";
import { updateProfile } from "@/lib/services/profiles";
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
// 登入
// ---------------------------------------------------------------------------

export async function loginLocalAction(formData: FormData): Promise<void> {
  if (!isLocalMode()) redirect("/login");
  const key = formData.get("user");
  const user = LOCAL_USERS.find((u) => u.key === key);
  if (!user) redirect("/login");
  (await cookies()).set(LOCAL_SESSION_COOKIE, user.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  redirect("/");
}

export async function loginSupabaseAction(intent: "signin" | "signup", input: Credentials): Promise<ActionState> {
  if (isLocalMode()) return { error: "本機示範模式請選擇示範使用者登入" };
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message, fieldErrors: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])) };
  }
  const supabase = await createSupabaseServerClient();
  if (intent === "signup") {
    const origin = (await headers()).get("origin") ?? "";
    const { data, error } = await supabase.auth.signUp({ ...parsed.data, options: { emailRedirectTo: `${origin}/auth/callback` } });
    if (error) return { error: `註冊失敗：${error.message}` };
    if (!data.session) return { done: true };
  } else {
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) return { error: "Email 或密碼不正確" };
  }
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  if (isLocalMode()) {
    (await cookies()).delete(LOCAL_SESSION_COOKIE);
  } else {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

// ---------------------------------------------------------------------------
// 知識進度
// ---------------------------------------------------------------------------

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
