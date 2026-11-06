import { getAiProvider } from "@/lib/ai/client";
import { ok, readJson, withSession } from "@/lib/api/http";
import { aiEnv } from "@/lib/config";
import { analyzeJob, deleteJob, getJob, updateJob } from "@/lib/services/jobs";

export const maxDuration = 120;

/** GET /api/jobs/[id] 職缺、技能需求、差距與優先順序 */
export const GET = withSession<RouteContext<"/api/jobs/[id]">>(async ({ ctx, user, db }) => {
  const { id } = await ctx.params;
  return ok(await getJob(db, user.id, id));
});

/** PATCH /api/jobs/[id] 編輯欄位；body 帶 reanalyze: true 會重新分析 */
export const PATCH = withSession<RouteContext<"/api/jobs/[id]">>(async ({ request, ctx, user, db }) => {
  const { id } = await ctx.params;
  const body = (await readJson(request, 32 * 1024)) as Record<string, unknown> | null;
  const { reanalyze, ...patch } = body && typeof body === "object" ? body : {};
  let job = Object.keys(patch).length ? await updateJob(db, user.id, id, patch) : await getJob(db, user.id, id);
  if (reanalyze === true) {
    const env = aiEnv();
    await analyzeJob(db, user.id, id, { provider: getAiProvider(), hourlyLimit: env.hourlyLimit, dailyLimit: env.dailyLimit });
    job = await getJob(db, user.id, id);
  }
  return ok(job);
});

/** DELETE /api/jobs/[id] */
export const DELETE = withSession<RouteContext<"/api/jobs/[id]">>(async ({ ctx, user, db }) => {
  const { id } = await ctx.params;
  await deleteJob(db, user.id, id);
  return ok({ deleted: true });
});
