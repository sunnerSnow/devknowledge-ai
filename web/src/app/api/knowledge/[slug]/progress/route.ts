import { ok, readJson, withSession } from "@/lib/api/http";
import { isUuid } from "@/lib/db/with-user";
import { getKnowledge, setProgress } from "@/lib/services/knowledge";

/** PATCH /api/knowledge/[slug]/progress  body: { status, confidence? } */
export const PATCH = withSession<RouteContext<"/api/knowledge/[slug]/progress">>(async ({ request, ctx, user, db }) => {
  const { slug } = await ctx.params;
  const body = await readJson(request, 4 * 1024);
  const nodeId = isUuid(slug) ? slug : (await getKnowledge(db, user.id, slug)).id;
  return ok(await setProgress(db, user.id, nodeId, body));
});
