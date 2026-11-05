/**
 * 執行模式：
 * - Supabase 模式：NEXT_PUBLIC_SUPABASE_URL ＋ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY（或舊版 ANON_KEY）＋ DATABASE_URL 都有設
 * - 本機示範模式：三者都沒設；資料存在本機 PGlite，登入改成選示範使用者
 * 只設一半視為設定錯誤，避免「以為連到正式資料庫，其實寫進本機」。
 */
export function supabaseEnv(): { url: string; key: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && key ? { url, key } : null;
}

export function isLocalMode(): boolean {
  const hasSupabase = supabaseEnv() !== null;
  const hasDb = Boolean(process.env.DATABASE_URL);
  const hasAnySupabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  if (hasSupabase && hasDb) return false;
  if (hasAnySupabase || hasDb) {
    throw new Error("設定不完整：Supabase 金鑰與 DATABASE_URL 必須一起設定（或都不設，使用本機示範模式）");
  }
  if (process.env.NODE_ENV === "production" && process.env.DK_LOCAL_MODE !== "1") {
    throw new Error("正式環境必須設定 Supabase 與 DATABASE_URL；本機用 next start 示範時請設 DK_LOCAL_MODE=1");
  }
  return true;
}

export type AiProviderName = "mock" | "gemini";

/** AI 設定：預設 mock；選 gemini 卻沒給金鑰會直接報錯，不會默默改用 mock */
export function aiEnv(): { provider: AiProviderName; apiKey: string | null; model: string; hourlyLimit: number } {
  const provider = (process.env.AI_PROVIDER || "mock").trim();
  if (provider !== "mock" && provider !== "gemini") {
    throw new Error(`不支援的 AI_PROVIDER：${provider}（可用：mock、gemini）`);
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim() || null;
  if (provider === "gemini" && !apiKey) {
    throw new Error("AI_PROVIDER=gemini 需要設定 GEMINI_API_KEY（https://aistudio.google.com）");
  }
  const hourlyLimit = Number(process.env.AI_HOURLY_LIMIT ?? 20);
  return {
    provider,
    apiKey,
    model: process.env.GEMINI_MODEL?.trim() || "gemini-3.8-flash",
    hourlyLimit: Number.isFinite(hourlyLimit) && hourlyLimit > 0 ? Math.floor(hourlyLimit) : 20,
  };
}
