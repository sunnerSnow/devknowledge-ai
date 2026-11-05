import "server-only";
import type { AiProvider } from "@/lib/ai/provider";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createMockProvider } from "@/lib/ai/providers/mock";
import { aiEnv } from "@/lib/config";

const cache = globalThis as unknown as { __dkAi?: AiProvider };

/** 依環境變數選 provider；只在伺服器端建立，金鑰不會離開伺服器 */
export function getAiProvider(): AiProvider {
  if (cache.__dkAi) return cache.__dkAi;
  const env = aiEnv();
  cache.__dkAi = env.provider === "gemini" ? createGeminiProvider(env.apiKey!, env.model) : createMockProvider();
  return cache.__dkAi;
}
