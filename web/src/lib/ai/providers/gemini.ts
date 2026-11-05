import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { type AiProvider, AiUnavailableError, type StructuredRequest, type StructuredResult } from "@/lib/ai/provider";
import type { GeminiThinking } from "@/lib/ai/thinking";

const THINKING_MAP: Record<GeminiThinking, ThinkingLevel> = {
  minimal: ThinkingLevel.MINIMAL,
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

export interface GeminiOptions {
  /** 主要模型過載時改用的模型；null 表示不換 */
  fallbackModel?: string | null;
  /** 思考量：越高越慢但品質較好；免費方案建議 low */
  thinking?: GeminiThinking;
  /** 退避等待（測試時可縮短） */
  backoffMs?: number;
}

/** 剩餘時間少於這個值就不再重試或換模型，直接回報錯誤 */
const MIN_ATTEMPT_MS = 15_000;

/**
 * Google Gemini（AI Studio 免費方案）。
 * 結構化輸出：responseMimeType=application/json ＋ responseJsonSchema。
 * 免費方案常見錯誤：
 * - 503「model high demand」：退避後重試一次，仍 503 就換備用模型。
 * - 429（額度）：重試沒用，直接換備用模型（額度依模型計算）。
 * 整段流程共用 request.timeoutMs 這一個預算：每次呼叫只用剩餘時間，剩餘不足就不再嘗試，
 * 所以呼叫端給的逾時就是這個函式的最長耗時。
 * 注意：免費方案的資料會被 Google 用來改善產品，所以不要把個人聯絡資料放進 prompt。
 */
export function createGeminiProvider(apiKey: string, model: string, options: GeminiOptions = {}): AiProvider {
  const ai = new GoogleGenAI({ apiKey });
  const fallbackModel = options.fallbackModel === undefined ? "gemini-3.5-flash-lite" : options.fallbackModel;
  const thinkingLevel = THINKING_MAP[options.thinking ?? "low"];
  const backoffMs = options.backoffMs ?? 2500;

  async function callOnce(useModel: string, request: StructuredRequest, timeoutMs: number): Promise<StructuredResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await ai.models.generateContent({
        model: useModel,
        contents: request.user,
        config: {
          systemInstruction: request.system,
          responseMimeType: "application/json",
          responseJsonSchema: request.jsonSchema,
          maxOutputTokens: request.maxOutputTokens,
          temperature: 0.4,
          thinkingConfig: { thinkingLevel },
          abortSignal: controller.signal,
        },
      });
      const text = response.text;
      if (!text) {
        throw new AiUnavailableError("AI 沒有回傳內容，請稍後再試", `empty response; model=${useModel}; finishReason=${response.candidates?.[0]?.finishReason ?? "?"}`, "empty");
      }
      return {
        text,
        model: useModel,
        inputTokens: response.usageMetadata?.promptTokenCount ?? null,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
      };
    } catch (error) {
      if (error instanceof AiUnavailableError) throw error;
      throw toUnavailable(error, useModel, controller.signal.aborted);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    name: "gemini",
    model,
    async generateStructured(request: StructuredRequest): Promise<StructuredResult> {
      const deadline = Date.now() + request.timeoutMs;
      const remaining = () => deadline - Date.now();
      const canTryAgain = () => remaining() >= MIN_ATTEMPT_MS;
      const canFallback = Boolean(fallbackModel) && fallbackModel !== model;

      const reasonOf = (e: unknown) => (e instanceof AiUnavailableError ? e.reason : null);

      try {
        return await callOnce(model, request, Math.max(remaining(), 1));
      } catch (first) {
        const reason = reasonOf(first);
        // 過載：等一下再試同一個模型
        if (reason === "overloaded" && canTryAgain()) {
          await new Promise((r) => setTimeout(r, Math.min(backoffMs, Math.max(remaining() - MIN_ATTEMPT_MS, 0))));
          try {
            return await callOnce(model, request, Math.max(remaining(), 1));
          } catch (second) {
            const again = reasonOf(second);
            if (!(again === "overloaded" || again === "quota") || !canFallback || !canTryAgain()) throw second;
            return callOnce(fallbackModel!, request, Math.max(remaining(), 1));
          }
        }
        // 額度：重試沒用，直接換備用模型（額度依模型計算）
        if (reason === "quota" && canFallback && canTryAgain()) {
          return callOnce(fallbackModel!, request, Math.max(remaining(), 1));
        }
        throw first;
      }
    },
  };
}

function toUnavailable(error: unknown, model: string, aborted: boolean): AiUnavailableError {
  if (aborted) return new AiUnavailableError("AI 回應逾時，請稍後再試", `timeout model=${model}`, "timeout", 504);
  const e = error as { status?: number; message?: string; name?: string };
  const detail = `model=${model} ${e?.name ?? "Error"} ${e?.status ?? ""} ${(e?.message ?? String(error)).split("\n")[0]}`.slice(0, 400);
  if (e?.status === 429) return new AiUnavailableError("AI 額度暫時用完（免費方案有每分鐘與每日上限），請稍後再試", detail, "quota", 429);
  if (e?.status === 401 || e?.status === 403) return new AiUnavailableError("AI 金鑰無效或沒有權限，請檢查 GEMINI_API_KEY", detail, "auth", 503);
  if (e?.status === 400 || e?.status === 404) return new AiUnavailableError("AI 設定有誤（模型名稱或請求格式），請檢查 GEMINI_MODEL 與伺服器日誌", detail, "config", 503);
  if (e?.status === 503) return new AiUnavailableError("AI 模型目前需求量大（免費方案常見），請過幾分鐘再試", detail, "overloaded", 503);
  return new AiUnavailableError("AI 服務暫時無法使用，請稍後再試", detail, "other", 503);
}
