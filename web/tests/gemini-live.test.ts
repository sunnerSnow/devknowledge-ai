import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KNOWLEDGE_SYSTEM_PROMPT, knowledgeUserPrompt } from "@/lib/ai/prompts/knowledge-v2";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { knowledgeContentSchema, knowledgeJsonSchema } from "@/lib/ai/schemas/knowledge";
import { isGeminiThinking } from "@/lib/ai/thinking";

/**
 * 真的呼叫 Gemini（會用額度）。只在 GEMINI_LIVE=1 時執行：
 *   GEMINI_LIVE=1 npx vitest run tests/gemini-live.test.ts
 * 金鑰從環境變數或 web/.env.local 讀。
 */
function readKey(): string | null {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const env = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    return /^\s*GEMINI_API_KEY\s*=\s*(.+?)\s*$/m.exec(env)?.[1] ?? null;
  } catch {
    return null;
  }
}

const key = process.env.GEMINI_LIVE === "1" ? readKey() : null;

describe.skipIf(!key)("Gemini live", () => {
  it("用專案的 prompt 與 schema 生成一頁，回來的 JSON 通過 zod", async () => {
    const thinking = process.env.GEMINI_THINKING || "low";
    if (!isGeminiThinking(thinking)) throw new Error("GEMINI_THINKING 不合法");
    const provider = createGeminiProvider(key!, process.env.GEMINI_MODEL || "gemini-3.6-flash", { thinking });
    const started = Date.now();
    let result;
    try {
      result = await provider.generateStructured({
        system: KNOWLEDGE_SYSTEM_PROMPT,
        user: knowledgeUserPrompt({ topic: "Kubernetes", level: "初學到中級", targetRole: "全端工程師" }),
        jsonSchema: knowledgeJsonSchema(),
        maxOutputTokens: 12_288,
        timeoutMs: 100_000,
      });
    } catch (e) {
      const err = e as { message?: string; detail?: string };
      throw new Error(`provider 失敗：${err.message} | ${err.detail ?? ""}`);
    }
    console.log(`model=${result.model} took ${Date.now() - started} ms; tokens in=${result.inputTokens} out=${result.outputTokens}`);
    const parsed = knowledgeContentSchema.safeParse(JSON.parse(result.text));
    if (!parsed.success) console.log(JSON.stringify(parsed.error.issues.slice(0, 10), null, 1));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      console.log(parsed.data.name, "|", parsed.data.english_name, "|", parsed.data.category, "| sections:", parsed.data.sections.map((s) => s.title).join("、"));
      console.log("prereq:", parsed.data.prerequisites.map((p) => p.name).join("、"), "| related:", parsed.data.related_topics.map((r) => r.name).join("、"));
      console.log("mermaid:", parsed.data.architecture?.mermaid.slice(0, 160));
      console.log("quick_take:", JSON.stringify(parsed.data.quick_take, null, 1));
      console.log("quiz:", parsed.data.quiz.map((q) => q.question).join(" / "));
    }
  }, 120_000);
});
