import { ok, withSession } from "@/lib/api/http";
import { getKnowledge } from "@/lib/services/knowledge";

/** GET /api/knowledge/[slug]  slug 或 UUID 都可以 */
export const GET = withSession<RouteContext<"/api/knowledge/[slug]">>(async ({ ctx, user, db }) => {
  const { slug } = await ctx.params;
  return ok(await getKnowledge(db, user.id, slug));
});
