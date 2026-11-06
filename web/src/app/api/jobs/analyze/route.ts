import { getAiProvider } from "@/lib/ai/client";
import { ok, readJson, withSession } from "@/lib/api/http";
import { aiEnv } from "@/lib/config";
import { createJob } from "@/lib/services/jobs";

// AI 分析可能要幾十秒
export const maxDuration = 120;

/**
 * POST /api/jobs/analyze  body: 規格 4.5 的表單欄位 → 建立職缺並分析。
 * 分析失敗（限流、逾時）時仍回 201 與已建立的職缺，data.analysisError 帶原因，前端導到職缺頁按「重新分析」。
 */
export const POST = withSession(async ({ request, user, db }) => {
  const body = await readJson(request, 32 * 1024);
  const env = aiEnv();
  const result = await createJob(db, user.id, body, { provider: getAiProvider(), hourlyLimit: env.hourlyLimit, dailyLimit: env.dailyLimit });
  return ok({ ...result.job, analysisError: result.analysisError }, { status: 201 });
});
