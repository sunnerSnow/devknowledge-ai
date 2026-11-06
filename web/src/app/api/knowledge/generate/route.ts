import { getAiProvider } from "@/lib/ai/client";
import { ok, readJson, withSession } from "@/lib/api/http";
import { aiEnv } from "@/lib/config";
import { generateKnowledge } from "@/lib/services/knowledge";

// 生成可能要幾十秒
export const maxDuration = 120;

/** POST /api/knowledge/generate  body: { topic, regenerate? } */
export const POST = withSession(async ({ request, user, db }) => {
  const body = await readJson(request, 4 * 1024);
  const env = aiEnv();
  const result = await generateKnowledge(db, user.id, body, { provider: getAiProvider(), hourlyLimit: env.hourlyLimit, dailyLimit: env.dailyLimit });
  return ok(result, { status: result.existing ? 200 : 201 });
});
