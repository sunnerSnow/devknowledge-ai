import { getAiProvider } from "@/lib/ai/client";
import { ok, readJson, withSession } from "@/lib/api/http";
import { aiEnv } from "@/lib/config";
import { gradeQuiz } from "@/lib/services/knowledge-quiz";

export const maxDuration = 120;

/** POST /api/knowledge/[slug]/quiz  body: { version, answers: string[] } → AI 逐題批改並儲存作答（slug 也可以是節點 UUID） */
export const POST = withSession<RouteContext<"/api/knowledge/[slug]/quiz">>(async ({ request, ctx, user, db }) => {
  const { slug } = await ctx.params;
  const env = aiEnv();
  const attempt = await gradeQuiz(db, user.id, slug, await readJson(request, 32 * 1024), {
    provider: getAiProvider(),
    hourlyLimit: env.hourlyLimit,
    dailyLimit: env.dailyLimit,
  });
  return ok(attempt, { status: 201 });
});
