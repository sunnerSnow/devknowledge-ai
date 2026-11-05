import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AiProvider, StructuredRequest, StructuredResult } from "@/lib/ai/provider";
import type { KnowledgeContent } from "@/lib/ai/schemas/knowledge";
import { normalizeSlug } from "@/lib/knowledge/slug";

/**
 * 沒有 API 金鑰時的示範 provider：固定回傳 fixtures 裡的內容（RAG、LLM、AWS、Docker），
 * 其他主題回傳一份標明「示範內容」的範本。畫面與資料庫都會記錄 provider=mock，不會假裝是真的 AI。
 * 回傳的是 JSON 文字，讓解析與驗證的路徑跟真的 provider 一樣。
 */
const FIXTURES: Record<string, string> = {
  rag: "rag",
  "retrieval-augmented-generation": "rag",
  檢索增強生成: "rag",
  llm: "llm",
  "large-language-model": "llm",
  大型語言模型: "llm",
  aws: "aws",
  "amazon-web-services": "aws",
  docker: "docker",
  容器: "docker",
};

const FIXTURE_DIR = path.join(process.cwd(), "src", "lib", "ai", "fixtures", "knowledge");

export function createMockProvider(options: { delayMs?: number } = {}): AiProvider {
  const delayMs = options.delayMs ?? (process.env.NODE_ENV === "test" ? 0 : 600);
  return {
    name: "mock",
    model: "mock-fixtures",
    async generateStructured(request: StructuredRequest): Promise<StructuredResult> {
      const topic = (request.hint ?? "").trim() || "未命名技術";
      const key = FIXTURES[normalizeSlug(topic)];
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      const text = key ? await readFile(path.join(FIXTURE_DIR, `${key}.json`), "utf8") : JSON.stringify(genericContent(topic));
      return { text, model: "mock-fixtures", inputTokens: null, outputTokens: null };
    },
  };
}

/** 不在 fixtures 裡的主題：給一份合法但內容是佔位說明的知識頁 */
export function genericContent(topic: string): KnowledgeContent {
  return {
    name: topic,
    english_name: null,
    category: "General",
    aliases: [],
    summary: `${topic} 的示範知識頁：目前使用 mock provider，內容為佔位範本，不是 AI 產生的真實內容。`,
    why_it_matters:
      "設定 AI_PROVIDER=gemini 與 GEMINI_API_KEY 後重新生成，才會得到真正的知識內容。這份範本用來確認儲存、顯示、進度與關聯的流程都能運作。",
    prerequisites: [{ name: "HTTP", reason: "示範用的前置知識，實際內容會由 AI 依主題產生。" }],
    sections: [
      {
        title: "核心原理",
        content_md: `這裡會是 **${topic}** 的核心原理說明。\n\n- mock provider 不會呼叫任何外部服務\n- 內容僅供流程驗證`,
        key_points: ["示範內容", "請設定真正的 AI provider"],
      },
      {
        title: "實際使用場景",
        content_md: "實際使用場景會在這裡以 Markdown 呈現。",
        key_points: ["場景一", "場景二"],
      },
    ],
    architecture: {
      mermaid: "flowchart LR\n  A[輸入技術名詞] --> B[呼叫 AI] --> C[驗證 JSON] --> D[儲存知識頁]",
      description: "知識頁生成的流程：輸入、呼叫、驗證、儲存。",
    },
    code_examples: [
      {
        language: "bash",
        title: "切換到真正的 AI provider",
        description: "在 web/.env.local 設定後重新啟動 dev server。",
        code: "AI_PROVIDER=gemini\nGEMINI_API_KEY=你的金鑰",
      },
    ],
    comparisons: [],
    common_misconceptions: ["這份範本不是 AI 產生的內容。"],
    interview_topics: [{ question: `請用一句話說明 ${topic} 是什麼。`, evaluation_points: ["定義是否正確", "是否能說出用途"] }],
    related_topics: [],
    learning_tasks: [{ title: "設定 Gemini 金鑰並重新生成", description: "到 aistudio.google.com 建立金鑰，設定環境變數後按「重新生成」。", estimated_minutes: 10 }],
    caveats: ["mock provider 的內容是固定範本。"],
  };
}
