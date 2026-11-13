import { getAiProvider } from "@/lib/ai/client";
import { ok, withSession } from "@/lib/api/http";
import { aiEnv } from "@/lib/config";
import { getRoute, planLessons } from "@/lib/services/routes";

export const maxDuration = 120;

/** POST /api/routes/[id]/lessons → 排課（有診斷結果就依結果，沒有就依自評差距）；已排過就回 409 */
export const POST = withSession<RouteContext<"/api/routes/[id]/lessons">>(async ({ ctx, user, db }) => {
  const { id } = await ctx.params;
  const env = aiEnv();
  await planLessons(db, user.id, id, { provider: getAiProvider(), hourlyLimit: env.hourlyLimit, dailyLimit: env.dailyLimit });
  return ok(await getRoute(db, user.id, id), { status: 201 });
});
