import { getAiProvider } from "@/lib/ai/client";
import { ok, readJson, withSession } from "@/lib/api/http";
import { aiEnv } from "@/lib/config";
import { answerQuestion } from "@/lib/services/practice";

export const maxDuration = 120;

/** POST /api/practice/[sessionId]/answer  body: { questionId, answer } → AI 評估並儲存作答 */
export const POST = withSession<RouteContext<"/api/practice/[sessionId]/answer">>(async ({ request, ctx, user, db }) => {
  const { sessionId } = await ctx.params;
  const env = aiEnv();
  const question = await answerQuestion(db, user.id, sessionId, await readJson(request, 32 * 1024), { provider: getAiProvider(), hourlyLimit: env.hourlyLimit, dailyLimit: env.dailyLimit });
  return ok(question, { status: 201 });
});
