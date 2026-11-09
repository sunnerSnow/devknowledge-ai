import { getAiProvider } from "@/lib/ai/client";
import { ok, withSession } from "@/lib/api/http";
import { aiEnv } from "@/lib/config";
import { generateQuestion } from "@/lib/services/practice";

export const maxDuration = 120;

/** POST /api/practice/[sessionId]/questions → 出下一題（一次一題） */
export const POST = withSession<RouteContext<"/api/practice/[sessionId]/questions">>(async ({ ctx, user, db }) => {
  const { sessionId } = await ctx.params;
  const env = aiEnv();
  const question = await generateQuestion(db, user.id, sessionId, { provider: getAiProvider(), hourlyLimit: env.hourlyLimit, dailyLimit: env.dailyLimit });
  return ok(question, { status: 201 });
});
