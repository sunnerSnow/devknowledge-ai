import { z } from "zod";
import { ok, readJson, withSession } from "@/lib/api/http";
import { issuesFromZod, validationFailed } from "@/lib/errors";
import { deleteSession, endSession, getSession } from "@/lib/services/practice";

/** GET /api/practice/[sessionId] 練習、題目與作答 */
export const GET = withSession<RouteContext<"/api/practice/[sessionId]">>(async ({ ctx, user, db }) => {
  const { sessionId } = await ctx.params;
  return ok(await getSession(db, user.id, sessionId));
});

const patchSchema = z.object({ status: z.literal("ended") });

/** PATCH /api/practice/[sessionId]  body: { status: "ended" } 結束練習 */
export const PATCH = withSession<RouteContext<"/api/practice/[sessionId]">>(async ({ request, ctx, user, db }) => {
  const { sessionId } = await ctx.params;
  const parsed = patchSchema.safeParse(await readJson(request, 4 * 1024));
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  await endSession(db, user.id, sessionId);
  return ok(await getSession(db, user.id, sessionId));
});

/** DELETE /api/practice/[sessionId] */
export const DELETE = withSession<RouteContext<"/api/practice/[sessionId]">>(async ({ ctx, user, db }) => {
  const { sessionId } = await ctx.params;
  await deleteSession(db, user.id, sessionId);
  return ok({ deleted: true });
});
