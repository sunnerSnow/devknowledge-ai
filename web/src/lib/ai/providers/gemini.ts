import { GoogleGenAI } from "@google/genai";
import { type AiProvider, AiUnavailableError, type StructuredRequest, type StructuredResult } from "@/lib/ai/provider";

/**
 * Google Gemini（AI Studio 免費方案）。
 * 結構化輸出：responseMimeType=application/json ＋ responseJsonSchema。
 * 注意：免費方案的資料會被 Google 用來改善產品，所以不要把個人聯絡資料放進 prompt。
 */
export function createGeminiProvider(apiKey: string, model: string): AiProvider {
  const ai = new GoogleGenAI({ apiKey });
  return {
    name: "gemini",
    model,
    async generateStructured(request: StructuredRequest): Promise<StructuredResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), request.timeoutMs);
      try {
        const response = await ai.models.generateContent({
          model,
          contents: request.user,
          config: {
            systemInstruction: request.system,
            responseMimeType: "application/json",
            responseJsonSchema: request.jsonSchema,
            maxOutputTokens: request.maxOutputTokens,
            temperature: 0.4,
            abortSignal: controller.signal,
          },
        });
        const text = response.text;
        if (!text) throw new AiUnavailableError("AI 沒有回傳內容，請稍後再試", `empty response; finishReason=${response.candidates?.[0]?.finishReason ?? "?"}`);
        return {
          text,
          model,
          inputTokens: response.usageMetadata?.promptTokenCount ?? null,
          outputTokens: response.usageMetadata?.candidatesTokenCount ?? null,
        };
      } catch (error) {
        if (error instanceof AiUnavailableError) throw error;
        throw toUnavailable(error, controller.signal.aborted);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function toUnavailable(error: unknown, aborted: boolean): AiUnavailableError {
  if (aborted) return new AiUnavailableError("AI 回應逾時，請稍後再試", "timeout", 504);
  const e = error as { status?: number; message?: string; name?: string };
  const detail = `${e?.name ?? "Error"} ${e?.status ?? ""} ${(e?.message ?? String(error)).split("\n")[0]}`.slice(0, 300);
  if (e?.status === 429) return new AiUnavailableError("AI 額度暫時用完（免費方案有每分鐘與每日上限），請稍後再試", detail, 429);
  if (e?.status === 401 || e?.status === 403) return new AiUnavailableError("AI 金鑰無效或沒有權限，請檢查 GEMINI_API_KEY", detail, 503);
  return new AiUnavailableError("AI 服務暫時無法使用，請稍後再試", detail, 503);
}
