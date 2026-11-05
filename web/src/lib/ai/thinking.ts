/** Gemini 思考量的合法值（config 與 provider 共用；這個檔案不依賴 SDK，proxy 也能安全引用 config） */
export const GEMINI_THINKING_LEVELS = ["minimal", "low", "medium", "high"] as const;
export type GeminiThinking = (typeof GEMINI_THINKING_LEVELS)[number];

export function isGeminiThinking(value: string): value is GeminiThinking {
  return (GEMINI_THINKING_LEVELS as readonly string[]).includes(value);
}
