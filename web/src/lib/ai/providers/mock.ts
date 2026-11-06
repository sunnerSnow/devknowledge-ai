import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AiProvider, StructuredRequest, StructuredResult } from "@/lib/ai/provider";
import type { PlanGapInput } from "@/lib/ai/prompts/plan-v1";
import type { JobAnalysis } from "@/lib/ai/schemas/job";
import type { KnowledgeContent } from "@/lib/ai/schemas/knowledge";
import type { LearningPlanOutput } from "@/lib/ai/schemas/plan";
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
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      if (request.kind === "job") {
        return { text: JSON.stringify(mockJobAnalysis(request.user)), model: "mock-keywords", inputTokens: null, outputTokens: null };
      }
      if (request.kind === "plan") {
        return { text: JSON.stringify(mockLearningPlan(request.user)), model: "mock-rules", inputTokens: null, outputTokens: null };
      }
      const topic = (request.hint ?? "").trim() || "未命名技術";
      const key = FIXTURES[normalizeSlug(topic)];
      const text = key ? await readFile(path.join(FIXTURE_DIR, `${key}.json`), "utf8") : JSON.stringify(genericContent(topic));
      return { text, model: "mock-fixtures", inputTokens: null, outputTokens: null };
    },
  };
}

/** 職缺分析的 mock：用關鍵字表從職缺文字挑出技能；「加分」區塊裡出現的算 preferred */
const SKILL_KEYWORDS: { name: string; category: JobAnalysis["skills"][number]["category"]; pattern: RegExp; level: number }[] = [
  { name: "React", category: "Frontend", pattern: /\breact(\.js)?\b/i, level: 3 },
  { name: "Next.js", category: "Frontend", pattern: /\bnext(\.js)?\b/i, level: 3 },
  { name: "Vue", category: "Frontend", pattern: /\bvue(\.js)?\b/i, level: 3 },
  { name: "TypeScript", category: "Frontend", pattern: /\btypescript\b/i, level: 3 },
  { name: "JavaScript", category: "Frontend", pattern: /\bjavascript\b|\bES6\b/i, level: 3 },
  { name: "Tailwind CSS", category: "Frontend", pattern: /\btailwind\b/i, level: 2 },
  { name: "Node.js", category: "Backend", pattern: /\bnode(\.js)?\b/i, level: 3 },
  { name: "Python", category: "Backend", pattern: /\bpython\b/i, level: 3 },
  { name: "Java", category: "Backend", pattern: /\bjava\b(?!script)/i, level: 3 },
  { name: "Go", category: "Backend", pattern: /\bgolang\b|\bgo\b(?= 語言| language)/i, level: 3 },
  { name: "RESTful API", category: "Backend", pattern: /\brest(ful)?\b|\bapi\b/i, level: 3 },
  { name: "GraphQL", category: "Backend", pattern: /\bgraphql\b/i, level: 2 },
  { name: "PostgreSQL", category: "Database", pattern: /\bpostgres(ql)?\b/i, level: 3 },
  { name: "MySQL", category: "Database", pattern: /\bmysql\b/i, level: 3 },
  { name: "MongoDB", category: "Database", pattern: /\bmongo(db)?\b/i, level: 2 },
  { name: "Redis", category: "Database", pattern: /\bredis\b/i, level: 2 },
  { name: "SQL", category: "Database", pattern: /\bsql\b/i, level: 3 },
  { name: "Git", category: "DevOps", pattern: /\bgit(hub|lab)?\b/i, level: 3 },
  { name: "Docker", category: "DevOps", pattern: /\bdocker\b|容器/i, level: 2 },
  { name: "Kubernetes", category: "DevOps", pattern: /\bkubernetes\b|\bk8s\b/i, level: 2 },
  { name: "CI/CD", category: "DevOps", pattern: /\bci\s*\/?\s*cd\b/i, level: 2 },
  { name: "AWS", category: "Cloud", pattern: /\baws\b|amazon web services/i, level: 2 },
  { name: "GCP", category: "Cloud", pattern: /\bgcp\b|google cloud/i, level: 2 },
  { name: "Azure", category: "Cloud", pattern: /\bazure\b/i, level: 2 },
  { name: "Linux", category: "DevOps", pattern: /\blinux\b/i, level: 2 },
  { name: "單元測試", category: "Testing", pattern: /單元測試|unit test|\bjest\b|\bvitest\b/i, level: 2 },
  { name: "Playwright", category: "Testing", pattern: /\bplaywright\b|\bcypress\b|e2e/i, level: 2 },
  { name: "LLM", category: "AI", pattern: /\bllm\b|大型語言模型|\bopenai\b|\bgemini\b/i, level: 2 },
  { name: "RAG", category: "AI", pattern: /\brag\b|檢索增強/i, level: 2 },
  { name: "Machine Learning", category: "AI", pattern: /機器學習|machine learning|\bml\b/i, level: 2 },
];

export function mockJobAnalysis(userPrompt: string): JobAnalysis {
  const section = (label: string) => new RegExp(`<${label}>([\\s\\S]*?)</${label}>`).exec(userPrompt)?.[1] ?? "";
  const preferredText = section("加分技能");
  const mainText = section("工作內容") + "\n" + section("必要技能");
  const title = /職缺名稱：(.*)/.exec(userPrompt)?.[1]?.trim() ?? "職缺";
  const skills: JobAnalysis["skills"] = [];
  for (const k of SKILL_KEYWORDS) {
    const inPreferred = k.pattern.test(preferredText);
    const inMain = k.pattern.test(mainText);
    if (!inPreferred && !inMain) continue;
    const required = inMain;
    skills.push({
      name: k.name,
      category: k.category,
      requirement_type: required ? "required" : "preferred",
      required_level: required ? k.level : Math.max(1, k.level - 1),
      importance: required ? 3 : 1,
      original_phrase: (k.pattern.exec(required ? mainText : preferredText)?.[0] ?? null)?.slice(0, 300) ?? null,
      reason: required ? `工作內容提到 ${k.name}，屬於日常會用到的技術。` : `列在加分條件，熟悉會更好但不是門檻。`,
    });
  }
  if (!skills.length) {
    skills.push({ name: "Git", category: "DevOps", requirement_type: "required", required_level: 2, importance: 2, original_phrase: null, reason: "mock provider 在內文找不到可辨識的技術關鍵字，先以版本控制為基本要求。" });
  }
  const seniority: JobAnalysis["seniority"] = /senior|資深/i.test(title) ? "senior" : /junior|初階|新人/i.test(title) ? "junior" : /intern|實習/i.test(title) ? "intern" : "unknown";
  return {
    role_summary: `${title}：mock provider 依關鍵字整理出 ${skills.length} 項技能（設定 AI_PROVIDER=gemini 會得到真正的分析）。`,
    seniority,
    company: null,
    skills,
    responsibilities: ["（mock）依職缺內文執行開發工作"],
    interview_focus: skills.slice(0, 3).map((s) => `${s.name} 的實作經驗`),
    assumptions: ["mock provider 只以關鍵字比對，沒有理解上下文。"],
  };
}

/**
 * 學習計畫的 mock：從 prompt 的 <差距清單> 還原輸入，依優先分數排序，
 * 每個技能排 read（＋差距 ≥2 時 code）＋ review，依每週時數裝箱成週次。
 */
export function mockLearningPlan(userPrompt: string): LearningPlanOutput {
  const weekly = Number(/每週可投入時間：(\d+)/.exec(userPrompt)?.[1] ?? 120);
  const jobTitle = /<職缺>(.*?)<\/職缺>/.exec(userPrompt)?.[1]?.trim() ?? "職缺";
  let gaps: PlanGapInput[] = [];
  try {
    gaps = JSON.parse(/<差距清單>([\s\S]*?)<\/差距清單>/.exec(userPrompt)?.[1] ?? "[]") as PlanGapInput[];
  } catch {
    gaps = [];
  }
  const sorted = [...gaps].sort((a, b) => b.priority - a.priority);
  const tasks: LearningPlanOutput["weeks"][number]["tasks"][] = sorted.map((g) => {
    const list: LearningPlanOutput["weeks"][number]["tasks"] = [
      {
        skill: g.skill,
        title: g.hasKnowledgePage ? `閱讀 ${g.skill} 知識頁` : `建立並閱讀 ${g.skill} 知識頁`,
        description: g.hasKnowledgePage ? `讀完知識頁的核心原理與使用場景，整理成自己的筆記。` : `先用 AI 建立 ${g.skill} 的知識頁，再讀核心原理與使用場景。`,
        task_type: "read",
        estimated_minutes: 60,
        verification: `能用自己的話說明 ${g.skill} 解決什麼問題，並舉出兩個使用情境。`,
      },
    ];
    if (g.gap >= 2) {
      list.push({
        skill: g.skill,
        title: g.knowledgeTasks[0] ?? `${g.skill} 最小實作`,
        description: g.knowledgeTasks[0] ? `依知識頁的實作任務「${g.knowledgeTasks[0]}」完成一個能跑的版本。` : `做一個 ${g.skill} 的最小可行範例，記錄遇到的問題。`,
        task_type: g.gap >= 3 ? "project" : "code",
        estimated_minutes: g.gap >= 3 ? 150 : 90,
        verification: "程式能執行，並寫下三個踩到的坑與解法。",
      });
    }
    list.push({
      skill: g.skill,
      title: `${g.skill} 自我測驗`,
      description: `回答知識頁的面試題，對照評量重點檢查遺漏。`,
      task_type: "quiz",
      estimated_minutes: 30,
      verification: "每題都能講出評量重點裡至少兩項。",
    });
    return list;
  });

  // 依每週時數裝箱（同一技能的任務盡量連續）
  const weeks: LearningPlanOutput["weeks"] = [];
  let current: LearningPlanOutput["weeks"][number] = { week: 1, focus: "", tasks: [] };
  let used = 0;
  for (const group of tasks) {
    for (const t of group) {
      if (used + t.estimated_minutes > weekly && current.tasks.length) {
        weeks.push(current);
        current = { week: weeks.length + 1, focus: "", tasks: [] };
        used = 0;
      }
      current.tasks.push(t);
      used += t.estimated_minutes;
    }
  }
  if (current.tasks.length) weeks.push(current);
  for (const w of weeks) w.focus = [...new Set(w.tasks.map((t) => t.skill))].join("、");
  if (!weeks.length) weeks.push({ week: 1, focus: "沒有差距", tasks: [{ skill: "複習", title: "複習已達標的技能", description: "差距清單是空的。", task_type: "review", estimated_minutes: 30, verification: "整理一頁筆記。" }] });

  return {
    title: `${jobTitle} 學習計畫`,
    goal: `補足 ${jobTitle} 的技能差距（mock provider 依規則排程；設定 AI_PROVIDER=gemini 會得到真正的計畫）。`,
    summary: `依優先分數排序，差距大的技能先排實作；每週控制在 ${weekly} 分鐘內。`,
    weeks,
    notes: ["mock provider 只依規則排程，沒有考慮技能之間的依賴。"],
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
