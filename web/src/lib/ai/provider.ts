import type { AiProviderName } from "@/lib/config";
import { AppError } from "@/lib/errors";

export interface StructuredRequest {
  system: string;
  user: string;
  /** JSON Schema（draft 2020-12 子集） */
  jsonSchema: Record<string, unknown>;
  maxOutputTokens: number;
  timeoutMs: number;
  /** 給 mock provider 用的主題提示；真正的 provider 不使用 */
  hint?: string;
  /** 給 mock provider 分辨要回哪種範例；真正的 provider 不使用 */
  kind?: "knowledge" | "knowledge_quiz" | "job" | "plan" | "practice_question" | "practice_evaluate";
}

export interface StructuredResult {
  /** 模型回傳的原始文字（應為 JSON） */
  text: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
}

export interface AiProvider {
  readonly name: AiProviderName;
  readonly model: string;
  generateStructured(request: StructuredRequest): Promise<StructuredResult>;
}

/** 失敗原因分類：provider 依此決定要不要重試或換模型，不靠 HTTP 狀態碼猜 */
export type AiFailureReason = "overloaded" | "quota" | "timeout" | "config" | "auth" | "empty" | "other";

/** 模型或供應商那邊出問題（額度、逾時、服務異常）；會記錄但不會把原始錯誤丟給使用者 */
export class AiUnavailableError extends AppError {
  constructor(
    message: string,
    readonly detail: string,
    readonly reason: AiFailureReason = "other",
    status = 503,
  ) {
    super("ai_unavailable", message, status);
    this.name = "AiUnavailableError";
  }
}

/** 模型回來的內容不合 schema（已經重試過一次） */
export class AiOutputError extends AppError {
  constructor(readonly detail: string) {
    super("ai_invalid_output", "AI 回傳的內容格式不正確，請稍後再試一次", 502);
    this.name = "AiOutputError";
  }
}
