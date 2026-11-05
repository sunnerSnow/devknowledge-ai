import { ok, withSession } from "@/lib/api/http";
import { searchKnowledge } from "@/lib/services/knowledge";

/** GET /api/knowledge?query= 搜尋知識 */
export const GET = withSession(async ({ request, user, db }) => {
  const query = new URL(request.url).searchParams.get("query") ?? "";
  return ok(await searchKnowledge(db, user.id, query));
});
