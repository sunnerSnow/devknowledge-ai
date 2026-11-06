import { ok, withSession } from "@/lib/api/http";
import { listJobs } from "@/lib/services/jobs";

/** GET /api/jobs 取得使用者的職缺 */
export const GET = withSession(async ({ user, db }) => ok(await listJobs(db, user.id)));
