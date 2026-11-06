import type { ZodType } from "zod";
import { type AiProvider, AiOutputError, type StructuredRequest } from "@/lib/ai/provider";
import { issuesFromZod } from "@/lib/errors";

/**
 * 呼叫 provider 取得結構化輸出並用 zod 驗證；JSON 解析或 schema 驗證失敗就附上錯誤再試一次。
 * 整段共用一個時間預算（要低於 API 路由的 maxDuration），剩餘不足就不重試。
 */
export const AI_TOTAL_BUDGET_MS = 110_000;
const MIN_RETRY_MS = 25_000;
const MAX_ATTEMPTS = 2;

export interface StructuredCall<T> {
  system: string;
  user: string;
  schema: ZodType<T>;
  jsonSchema: Record<string, unknown>;
  retryPrompt: (base: string, issues: string) => string;
  maxOutputTokens?: number;
  budgetMs?: number;
  hint?: string;
  kind?: StructuredRequest["kind"];
}

export interface StructuredOutcome<T> {
  data: T;
  /** 實際回應的模型（可能是備用模型） */
  model: string;
  tokens: { inputTokens: number | null; outputTokens: number | null };
}

export async function generateValidated<T>(provider: AiProvider, call: StructuredCall<T>): Promise<StructuredOutcome<T>> {
  let user = call.user;
  let lastIssue = "";
  const tokens = { inputTokens: 0, outputTokens: 0 };
  let sawTokens = false;
  const deadline = Date.now() + (call.budgetMs ?? AI_TOTAL_BUDGET_MS);

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();
    if (attempt > 0 && remaining < MIN_RETRY_MS) break;
    const result = await provider.generateStructured({
      system: call.system,
      user,
      jsonSchema: call.jsonSchema,
      maxOutputTokens: call.maxOutputTokens ?? 8192,
      timeoutMs: Math.max(remaining, 1),
      hint: call.hint,
      kind: call.kind,
    });
    if (result.inputTokens !== null || result.outputTokens !== null) {
      sawTokens = true;
      tokens.inputTokens += result.inputTokens ?? 0;
      tokens.outputTokens += result.outputTokens ?? 0;
    }
    const outcome = parseStructured(result.text, call.schema);
    if (outcome.ok) {
      return { data: outcome.data, model: result.model, tokens: sawTokens ? tokens : { inputTokens: null, outputTokens: null } };
    }
    lastIssue = outcome.issue;
    user = call.retryPrompt(call.user, lastIssue);
  }
  throw new AiOutputError(lastIssue);
}

export function parseStructured<T>(text: string, schema: ZodType<T>): { ok: true; data: T } | { ok: false; issue: string } {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(text));
  } catch {
    return { ok: false, issue: "不是合法的 JSON" };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      issue: issuesFromZod(parsed.error)
        .slice(0, 8)
        .map((i) => `${i.field}: ${i.message}`)
        .join("\n"),
    };
  }
  return { ok: true, data: parsed.data };
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match ? match[1] : trimmed;
}
