import { getAiProvider } from "@/lib/ai/client";
import { ok, readJson, withSession } from "@/lib/api/http";
import { aiEnv } from "@/lib/config";
import { createSession, listSessions } from "@/lib/services/practice";

export const maxDuration = 120;

/** GET /api/practice/sessions?jobId= 練習紀錄 */
export const GET = withSession(async ({ request, user, db }) => {
  const jobId = new URL(request.url).searchParams.get("jobId") ?? undefined;
  return ok(await listSessions(db, user.id, { jobId }));
});

/** POST /api/practice/sessions  body: { jobId?, topic, mode?, questionType? } → 建立練習並出第一題 */
export const POST = withSession(async ({ request, user, db }) => {
  const env = aiEnv();
  const result = await createSession(db, user.id, await readJson(request, 8 * 1024), { provider: getAiProvider(), hourlyLimit: env.hourlyLimit, dailyLimit: env.dailyLimit });
  return ok(result, { status: 201 });
});
