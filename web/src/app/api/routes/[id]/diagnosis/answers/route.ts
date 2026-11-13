import { getAiProvider } from "@/lib/ai/client";
import { ok, readJson, withSession } from "@/lib/api/http";
import { aiEnv } from "@/lib/config";
import { answerDiagnosis } from "@/lib/services/routes";

export const maxDuration = 120;

/** POST /api/routes/[id]/diagnosis/answers  body: { answers: string[] } → AI 批改並估出各技能的初步程度 */
export const POST = withSession<RouteContext<"/api/routes/[id]/diagnosis/answers">>(async ({ request, ctx, user, db }) => {
  const { id } = await ctx.params;
  const env = aiEnv();
  const route = await answerDiagnosis(db, user.id, id, await readJson(request, 32 * 1024), { provider: getAiProvider(), hourlyLimit: env.hourlyLimit, dailyLimit: env.dailyLimit });
  return ok(route, { status: 201 });
});
