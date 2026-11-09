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
  /** 每位使用者每小時 */
  hourlyLimit: number;
  /** 全站每 24 小時（免費方案的保險；0 表示不限制） */
  dailyLimit: number;
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
  const dailyLimit = Number(process.env.AI_DAILY_LIMIT ?? 200);
  return {
    provider,
    apiKey,
    // 2026-11-05 實測：3.8-flash 在免費方案常過載或超過 100 秒；3.6-flash 約 12 秒完成
    model: process.env.GEMINI_MODEL?.trim() || "gemini-3.6-flash",
    fallbackModel: fallbackRaw === undefined ? "gemini-3.5-flash-lite" : fallbackRaw.trim() || null,
    thinking: isGeminiThinking(thinking) ? thinking : "low",
    hourlyLimit: Number.isFinite(hourlyLimit) && hourlyLimit > 0 ? Math.floor(hourlyLimit) : 20,
    dailyLimit: Number.isFinite(dailyLimit) && dailyLimit >= 0 ? Math.floor(dailyLimit) : 200,
  };
}

/**
 * 網站對外的網址（寄信裡的連結用）。只看設定，不看請求標頭：
 * 重設密碼連結若依 Host 標頭組出來，攻擊者偽造 Host 就能把別人的 token 導到自己的網域。
 * 順序：BETTER_AUTH_URL → Vercel 正式部署的正式網域、預覽部署的該次網址（預覽與正式是不同資料庫，連結指錯站會驗不過）→ 本機 dev。
 */
export function appOrigin(): string {
  const configured = process.env.BETTER_AUTH_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      throw new Error(`BETTER_AUTH_URL 不是合法網址：${configured}`);
    }
  }
  const vercelHost = process.env.VERCEL_ENV === "production" ? process.env.VERCEL_PROJECT_PRODUCTION_URL : process.env.VERCEL_URL;
  if (vercelHost?.trim()) return `https://${vercelHost.trim()}`;
  return `http://localhost:${process.env.PORT || 3000}`;
}

export type MailProviderName = "resend" | "log" | "none";

export interface MailEnv {
  provider: MailProviderName;
  /** 寄件者，例如 "DevKnowledge AI <noreply@example.com>" */
  from: string;
  apiKey: string | null;
}

/**
 * 寄信設定（忘記密碼、Email 驗證）：
 * - resend：用 Resend 的 HTTP API（免費方案；未驗證自己的網域時，寄件者只能是 onboarding@resend.dev，且只能寄給帳號本人的信箱）
 * - log：不寄信，把信件內容印在伺服器日誌（連結含 token，只給本機開發與測試用）
 * - none：沒有寄信服務；忘記密碼與 Email 驗證不開放
 * 沒設 MAIL_PROVIDER 時：開發模式預設 log，正式環境預設 none（避免 token 進日誌）。
 */
export function mailEnv(): MailEnv {
  const raw = (process.env.MAIL_PROVIDER || (process.env.NODE_ENV === "production" ? "none" : "log")).trim();
  if (raw !== "resend" && raw !== "log" && raw !== "none") {
    throw new Error(`不支援的 MAIL_PROVIDER：${raw}（可用：resend、log、none）`);
  }
  const apiKey = process.env.RESEND_API_KEY?.trim() || null;
  if (raw === "resend" && !apiKey) throw new Error("MAIL_PROVIDER=resend 需要設定 RESEND_API_KEY");
  return { provider: raw, from: process.env.MAIL_FROM?.trim() || "DevKnowledge AI <onboarding@resend.dev>", apiKey };
}

/**
 * 頁面與 Server Action 用：有沒有寄信服務。設定錯誤（例如選了 resend 卻沒給 key）只記錄一次並視為沒有，
 * 不讓登入頁因為寄信設定壞掉整頁 500；真正建立寄信器時（createMailer）仍會丟出清楚的錯誤。
 */
let mailConfigWarned = false;
export function mailReady(): boolean {
  try {
    return mailEnv().provider !== "none";
  } catch (error) {
    if (!mailConfigWarned) {
      mailConfigWarned = true;
      console.error(`[dk] 寄信設定錯誤，忘記密碼與 Email 驗證暫時關閉：${(error as Error).message}`);
    }
    return false;
  }
}

/**
 * 是否要求註冊後驗證 Email 才能登入（需要有寄信服務；預設關閉，既有帳號不會被鎖在外面）。
 * 本機示範模式不強制：示範帳號不會去驗證。
 */
export function requireEmailVerification(): boolean {
  return process.env.AUTH_REQUIRE_EMAIL_VERIFICATION === "1" && !isLocalMode() && mailReady();
}
