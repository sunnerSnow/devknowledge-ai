import { GEMINI_THINKING_LEVELS, type GeminiThinking, isGeminiThinking } from "@/lib/ai/thinking";

/**
 * 執行模式：
 * - Postgres 模式：有 DATABASE_URL（正式環境用 Neon；也可以是任何 Postgres）
 * - 本機示範模式：沒有 DATABASE_URL；資料存在本機 PGlite，登入頁多了一鍵登入的示範使用者
 * 正式環境（NODE_ENV=production）沒設 DATABASE_URL 會直接報錯，不會默默改用本機資料庫。
 */
export function isLocalMode(): boolean {
  if (process.env.DATABASE_URL) return false;
  if (process.env.NODE_ENV === "production" && process.env.DK_LOCAL_MODE !== "1") {
    throw new Error("正式環境必須設定 DATABASE_URL；本機用 next start 示範時請設 DK_LOCAL_MODE=1");
  }
  return true;
}

/** Better Auth 的密鑰與網址；只有開發模式的本機示範允許省略（用固定的開發用密鑰），production 一律要設 */
export function authEnv(): { secret: string; baseURL: string | undefined } {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (secret && secret.length < 32) throw new Error("BETTER_AUTH_SECRET 至少 32 個字元（可用 openssl rand -base64 32 產生）");
  if (!secret && (!isLocalMode() || process.env.NODE_ENV === "production")) {
    throw new Error("必須設定 BETTER_AUTH_SECRET（至少 32 個字元）；只有 next dev 的本機示範模式可以省略");
  }
  return {
    secret: secret ?? "dk-local-demo-secret-not-for-production-0000000000",
    baseURL: process.env.BETTER_AUTH_URL?.trim() || undefined,
  };
}

export type AiProviderName = "mock" | "gemini";

export interface AiEnv {
  provider: AiProviderName;
  apiKey: string | null;
  model: string;
  /** 主要模型過載時改用；空字串表示不換 */
  fallbackModel: string | null;
  thinking: GeminiThinking;
  hourlyLimit: number;
}

/** AI 設定：預設 mock；選 gemini 卻沒給金鑰會直接報錯，不會默默改用 mock */
export function aiEnv(): AiEnv {
  const provider = (process.env.AI_PROVIDER || "mock").trim();
  if (provider !== "mock" && provider !== "gemini") {
    throw new Error(`不支援的 AI_PROVIDER：${provider}（可用：mock、gemini）`);
  }
  const apiKey = process.env.GEMINI_API_KEY?.trim() || null;
  if (provider === "gemini" && !apiKey) {
    throw new Error("AI_PROVIDER=gemini 需要設定 GEMINI_API_KEY（https://aistudio.google.com）");
  }
  const thinking = (process.env.GEMINI_THINKING || "low").trim();
  if (provider === "gemini" && !isGeminiThinking(thinking)) {
    throw new Error(`GEMINI_THINKING 只能是 ${GEMINI_THINKING_LEVELS.join("、")}（目前：${thinking}）`);
  }
  const fallbackRaw = process.env.GEMINI_FALLBACK_MODEL;
  const hourlyLimit = Number(process.env.AI_HOURLY_LIMIT ?? 20);
  return {
    provider,
    apiKey,
    // 2026-11-05 實測：3.8-flash 在免費方案常過載或超過 100 秒；3.6-flash 約 12 秒完成
    model: process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash",
    fallbackModel: fallbackRaw === undefined ? "gemini-3.5-flash-lite" : fallbackRaw.trim() || null,
    thinking: isGeminiThinking(thinking) ? thinking : "low",
    hourlyLimit: Number.isFinite(hourlyLimit) && hourlyLimit > 0 ? Math.floor(hourlyLimit) : 20,
  };
}
