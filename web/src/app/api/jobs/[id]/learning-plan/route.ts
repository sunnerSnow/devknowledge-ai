import { getAiProvider } from "@/lib/ai/client";
import { ok, readJson, withSession } from "@/lib/api/http";
import { aiEnv } from "@/lib/config";
import { createPlanForJob } from "@/lib/services/plans";

export const maxDuration = 120;

/** POST /api/jobs/[id]/learning-plan  body: { weeklyMinutes? } → 依差距產生週學習計畫 */
export const POST = withSession<RouteContext<"/api/jobs/[id]/learning-plan">>(async ({ request, ctx, user, db }) => {
  const { id } = await ctx.params;
  const body = request.headers.get("content-length") === "0" || !request.headers.get("content-type") ? {} : await readJson(request, 4 * 1024);
  const env = aiEnv();
  const plan = await createPlanForJob(db, user.id, id, body, { provider: getAiProvider(), hourlyLimit: env.hourlyLimit, dailyLimit: env.dailyLimit });
  return ok(plan, { status: 201 });
});
