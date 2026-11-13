import { getAiProvider } from "@/lib/ai/client";
import { ok, readJson, withSession } from "@/lib/api/http";
import { aiEnv } from "@/lib/config";
import { createRouteForJob } from "@/lib/services/routes";

export const maxDuration = 120;

/**
 * POST /api/jobs/[id]/learning-routes  body: { days, dailyMinutes, diagnose? }
 * 建立學習路線；diagnose（預設 true）先出診斷題，否則直接排課。
 * 回傳 { route, stepError }：路線已建立但 AI 這一步失敗時 stepError 有訊息，頁面上可以再試。
 */
export const POST = withSession<RouteContext<"/api/jobs/[id]/learning-routes">>(async ({ request, ctx, user, db }) => {
  const { id } = await ctx.params;
  const env = aiEnv();
  const result = await createRouteForJob(db, user.id, id, await readJson(request, 4 * 1024), { provider: getAiProvider(), hourlyLimit: env.hourlyLimit, dailyLimit: env.dailyLimit });
  return ok(result, { status: 201 });
});
