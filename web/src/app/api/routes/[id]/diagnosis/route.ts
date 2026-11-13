import { getAiProvider } from "@/lib/ai/client";
import { ok, withSession } from "@/lib/api/http";
import { aiEnv } from "@/lib/config";
import { generateDiagnosis, getRoute } from "@/lib/services/routes";

export const maxDuration = 120;

/** POST /api/routes/[id]/diagnosis → 出（或換一組）診斷題；作答後就不能再換 */
export const POST = withSession<RouteContext<"/api/routes/[id]/diagnosis">>(async ({ ctx, user, db }) => {
  const { id } = await ctx.params;
  const env = aiEnv();
  await generateDiagnosis(db, user.id, id, { provider: getAiProvider(), hourlyLimit: env.hourlyLimit, dailyLimit: env.dailyLimit });
  return ok(await getRoute(db, user.id, id), { status: 201 });
});
