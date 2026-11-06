import { ok, withSession } from "@/lib/api/http";
import { listPlans } from "@/lib/services/plans";

/** GET /api/plans?jobId= 學習計畫清單 */
export const GET = withSession(async ({ request, user, db }) => {
  const jobId = new URL(request.url).searchParams.get("jobId") ?? undefined;
  return ok(await listPlans(db, user.id, { jobId }));
});
