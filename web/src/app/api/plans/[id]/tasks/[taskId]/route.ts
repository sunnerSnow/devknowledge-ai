import { ok, readJson, withSession } from "@/lib/api/http";
import { setTaskStatus } from "@/lib/services/plans";

/** PATCH /api/plans/[id]/tasks/[taskId]  body: { status: todo | in_progress | completed | skipped } */
export const PATCH = withSession<RouteContext<"/api/plans/[id]/tasks/[taskId]">>(async ({ request, ctx, user, db }) => {
  const { id, taskId } = await ctx.params;
  return ok(await setTaskStatus(db, user.id, id, taskId, await readJson(request, 4 * 1024)));
});
