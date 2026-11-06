import { and, eq, gt, sql } from "drizzle-orm";
import { type AiUsageKind, aiUsage } from "@/lib/db/schema";
import type { Tx } from "@/lib/db/with-user";
import { AppError } from "@/lib/errors";

/**
 * AI 呼叫次數上限（含失敗的）：
 * - 每位使用者每小時 limit 次，避免免費額度被單一使用者用完
 * - 全站每 24 小時 dailyLimit 次（0 表示不限），免費方案開放給別人用時的保險
 */
export async function assertUsageWithinLimit(tx: Tx, userId: string, limit: number, dailyLimit = 0): Promise<void> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gt(aiUsage.createdAt, sql`now() - interval '1 hour'`)));
  if ((row?.n ?? 0) >= limit) {
    throw new AppError("rate_limited", `每小時最多使用 AI ${limit} 次，請稍後再試`, 429);
  }
  if (dailyLimit > 0) {
    const [all] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(aiUsage)
      .where(gt(aiUsage.createdAt, sql`now() - interval '24 hours'`));
    if ((all?.n ?? 0) >= dailyLimit) {
      throw new AppError("rate_limited", "今天全站的 AI 額度已用完，請明天再試；已經建立過的知識頁仍可閱讀", 429);
    }
  }
}

export async function startUsage(tx: Tx, userId: string, kind: AiUsageKind, provider: string, modelName: string): Promise<string> {
  const [row] = await tx.insert(aiUsage).values({ userId, kind, provider, modelName }).returning({ id: aiUsage.id });
  return row.id;
}

export async function finishUsage(
  tx: Tx,
  userId: string,
  id: string,
  result: { status: "succeeded" | "failed"; modelName?: string; inputTokens?: number | null; outputTokens?: number | null },
): Promise<void> {
  await tx
    .update(aiUsage)
    .set({
      status: result.status,
      inputTokens: result.inputTokens ?? null,
      outputTokens: result.outputTokens ?? null,
      // 實際回應的模型可能是備用模型
      ...(result.modelName ? { modelName: result.modelName } : {}),
    })
    .where(and(eq(aiUsage.id, id), eq(aiUsage.userId, userId)));
}
