import { z } from "zod";
import { ok, readJson, withSession } from "@/lib/api/http";
import { issuesFromZod, validationFailed } from "@/lib/errors";
import { deleteRoute, getRoute, setRouteArchived } from "@/lib/services/routes";

/** GET /api/routes/[id] 學習路線、診斷與每天的課程 */
export const GET = withSession<RouteContext<"/api/routes/[id]">>(async ({ ctx, user, db }) => {
  const { id } = await ctx.params;
  return ok(await getRoute(db, user.id, id));
});

const patchSchema = z.object({ archived: z.boolean() });

/** PATCH /api/routes/[id]  body: { archived: boolean } 封存或恢復 */
export const PATCH = withSession<RouteContext<"/api/routes/[id]">>(async ({ request, ctx, user, db }) => {
  const { id } = await ctx.params;
  const parsed = patchSchema.safeParse(await readJson(request, 4 * 1024));
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  await setRouteArchived(db, user.id, id, parsed.data.archived);
  return ok(await getRoute(db, user.id, id));
});

/** DELETE /api/routes/[id] */
export const DELETE = withSession<RouteContext<"/api/routes/[id]">>(async ({ ctx, user, db }) => {
  const { id } = await ctx.params;
  await deleteRoute(db, user.id, id);
  return ok({ deleted: true });
});
