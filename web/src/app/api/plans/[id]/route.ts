import { z } from "zod";
import { ok, readJson, withSession } from "@/lib/api/http";
import { PLAN_STATUSES } from "@/lib/db/schema";
import { issuesFromZod, validationFailed } from "@/lib/errors";
import { deletePlan, getPlan, setPlanStatus } from "@/lib/services/plans";

/** GET /api/plans/[id] 計畫、週次與任務 */
export const GET = withSession<RouteContext<"/api/plans/[id]">>(async ({ ctx, user, db }) => {
  const { id } = await ctx.params;
  return ok(await getPlan(db, user.id, id));
});

const patchSchema = z.object({ status: z.enum(PLAN_STATUSES) });

/** PATCH /api/plans/[id]  body: { status: active | completed | archived } */
export const PATCH = withSession<RouteContext<"/api/plans/[id]">>(async ({ request, ctx, user, db }) => {
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await readJson(request, 4 * 1024));
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  await setPlanStatus(db, user.id, id, parsed.data.status);
  return ok(await getPlan(db, user.id, id));
});

/** DELETE /api/plans/[id] */
export const DELETE = withSession<RouteContext<"/api/plans/[id]">>(async ({ ctx, user, db }) => {
  const { id } = await ctx.params;
  await deletePlan(db, user.id, id);
  return ok({ deleted: true });
});
