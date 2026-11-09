import { ok, readJson, withSession } from "@/lib/api/http";
import { updateAttempt } from "@/lib/services/practice";

/** PATCH /api/practice/attempts/[attemptId]  body: { reviewFlag?, confirmedLevel? } */
export const PATCH = withSession<RouteContext<"/api/practice/attempts/[attemptId]">>(async ({ request, ctx, user, db }) => {
  const { attemptId } = await ctx.params;
  return ok(await updateAttempt(db, user.id, attemptId, await readJson(request, 4 * 1024)));
});
