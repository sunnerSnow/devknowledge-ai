import { and, eq, gt, sql } from "drizzle-orm";
import { type AiUsageKind, aiUsage } from "@/lib/db/schema";
import type { Tx } from "@/lib/db/with-user";
import { AppError } from "@/lib/errors";

/** 每位使用者每小時的 AI 呼叫次數（含失敗的）；超過就拒絕，避免免費額度被單一使用者用完 */
export async function assertUsageWithinLimit(tx: Tx, userId: string, limit: number): Promise<void> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, userId), gt(aiUsage.createdAt, sql`now() - interval '1 hour'`)));
  if ((row?.n ?? 0) >= limit) {
    throw new AppError("rate_limited", `每小時最多使用 AI ${limit} 次，請稍後再試`, 429);
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
