import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AiProvider, StructuredRequest, StructuredResult } from "@/lib/ai/provider";
import type { PlanGapInput } from "@/lib/ai/prompts/plan-v1";
import type { RouteSkillInput } from "@/lib/ai/prompts/route-v1";
import type { RouteDiagnosisOutput, RoutePlanOutput } from "@/lib/ai/schemas/route";
import type { JobAnalysis } from "@/lib/ai/schemas/job";
import type { GeneratedKnowledgeContent } from "@/lib/ai/schemas/knowledge";
import type { QuizGradeOutput, QuizVerdict } from "@/lib/ai/schemas/knowledge-quiz";
import type { LearningPlanOutput } from "@/lib/ai/schemas/plan";
import type { PracticeEvaluationOutput, PracticeQuestionOutput } from "@/lib/ai/schemas/practice";
import type { QuestionType } from "@/lib/db/schema";
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
      if (request.kind === "practice_question") {
        return { text: JSON.stringify(mockPracticeQuestion(request.user)), model: "mock-rules", inputTokens: null, outputTokens: null };
      }
      if (request.kind === "practice_evaluate") {
        return { text: JSON.stringify(mockPracticeEvaluation(request.user)), model: "mock-rules", inputTokens: null, outputTokens: null };
      }
      if (request.kind === "knowledge_quiz") {
        return { text: JSON.stringify(mockQuizGrade(request.user)), model: "mock-rules", inputTokens: null, outputTokens: null };
      }
      if (request.kind === "route_diagnose") {
        return { text: JSON.stringify(mockRouteDiagnosis(request.user)), model: "mock-rules", inputTokens: null, outputTokens: null };
      }
      if (request.kind === "route_plan") {
        return { text: JSON.stringify(mockRoutePlan(request.user)), model: "mock-rules", inputTokens: null, outputTokens: null };
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

// ---------------------------------------------------------------------------
// 面試練習的 mock
// ---------------------------------------------------------------------------

const block = (prompt: string, label: string) => new RegExp(`<${label}>([\\s\\S]*?)</${label}>`).exec(prompt)?.[1]?.trim() ?? "";

const QUESTION_TEMPLATES: Record<QuestionType, (skill: string, n: number) => Pick<PracticeQuestionOutput, "question" | "rubric">> = {
  concept: (skill, n) => ({
    question: n === 0 ? `請說明 ${skill} 解決了什麼問題，以及它的核心運作方式。` : `承上題，${skill} 常見的誤解有哪些？為什麼會有這些誤解？`,
    rubric: [`有說明 ${skill} 要解決的問題`, "有描述核心運作方式或流程", "有舉出一個實際使用情境", "有提到一個限制或取捨"],
  }),
  scenario: (skill) => ({
    question: `團隊的服務在上線後出現與 ${skill} 相關的效能問題：尖峰時段回應變慢、偶爾逾時。你會怎麼找出原因並處理？`,
    rubric: ["有先確認症狀與量測指標，再推論原因", `有提出至少兩個與 ${skill} 相關的可能原因`, "有說明處理步驟與驗證方式", "有考慮到風險或回滾方案"],
  }),
  architecture: (skill) => ({
    question: `要為一個中型產品導入 ${skill}，使用者約十萬、團隊五人。請說明你的架構設計、元件之間怎麼互動，以及你做了哪些取捨。`,
    rubric: ["有畫出或描述主要元件與互動", `有說明 ${skill} 在架構裡的角色`, "有針對規模與團隊人數做取捨", "有提到監控、部署或維運的考量"],
  }),
  coding: (skill) => ({
    question: `請描述你會怎麼用 ${skill} 實作一個最小可行範例：輸入、輸出、關鍵步驟與你會先寫哪段程式。`,
    rubric: ["有定義清楚的輸入與輸出", "有列出關鍵步驟的順序", `有提到 ${skill} 的關鍵 API 或設定`, "有說明怎麼驗證結果正確"],
  }),
};

/** 出題的 mock：依 <技能> 與 <題型> 套模板；已出過的題數決定用哪個變化 */
export function mockPracticeQuestion(userPrompt: string): PracticeQuestionOutput {
  const skill = block(userPrompt, "技能") || "這個技術";
  const typeRaw = block(userPrompt, "題型").split("（")[0] as QuestionType;
  const type: QuestionType = (["concept", "scenario", "architecture", "coding"] as const).includes(typeRaw) ? typeRaw : "concept";
  let previous = 0;
  try {
    previous = (JSON.parse(block(userPrompt, "已出過的題目") || "[]") as unknown[]).length;
  } catch {
    previous = 0;
  }
  const t = QUESTION_TEMPLATES[type](skill, previous);
  return {
    question: t.question,
    question_type: type,
    skill,
    rubric: t.rubric,
    reference_answer: `（mock 參考回答）先說結論：${skill} 的目的與適用情境；再依評分重點逐點說明：${t.rubric.join("；")}。設定 AI_PROVIDER=gemini 會得到真正的題目與參考回答。`,
    knowledge_topics: [skill],
  };
}

/**
 * 評估的 mock：真正的評估規則是「不以長短判斷」，但 mock 沒有理解能力，
 * 只能依回答長度與是否提到技能名稱給分，並在 summary 明說這是示範評估。
 */
export function mockPracticeEvaluation(userPrompt: string): PracticeEvaluationOutput {
  const skill = block(userPrompt, "技能") || "這個技術";
  const answer = block(userPrompt, "使用者回答");
  let rubric: string[] = [];
  try {
    rubric = JSON.parse(block(userPrompt, "評分重點") || "[]") as string[];
  } catch {
    rubric = [];
  }
  const length = answer.replace(/\s+/g, "").length;
  const mentions = answer.toLowerCase().includes(skill.toLowerCase());
  const base = length < 40 ? 1 : length < 150 ? 2 : 3;
  const clamp = (n: number) => Math.max(0, Math.min(4, n));
  const correctness = clamp(base + (mentions ? 1 : 0));
  const completeness = clamp(base);
  const reasoning = clamp(base - (length < 40 ? 1 : 0));
  const clarity = clamp(length < 40 ? 1 : 3);
  const covered = Math.min(rubric.length, Math.round((completeness / 4) * rubric.length));
  const reason = (what: string) => `（mock）${what}：回答約 ${length} 字${mentions ? `，有提到 ${skill}` : `，沒有提到 ${skill}`}。`;
  return {
    scores: {
      correctness: { score: correctness, reason: reason("技術正確性只依是否提到技能名稱與篇幅估計") },
      completeness: { score: completeness, reason: reason("完整度依篇幅估計") },
      reasoning: { score: reasoning, reason: reason("推理與取捨依篇幅估計") },
      clarity: { score: clarity, reason: reason("表達清晰度依篇幅估計") },
    },
    correct_points: rubric.slice(0, covered),
    missing_points: rubric.slice(covered),
    follow_up_questions: [`如果 ${skill} 在正式環境出問題，你會先看哪些指標？`],
    reference_answer: `（mock 參考回答）依評分重點逐點說明：${rubric.join("；") || "（無）"}。`,
    related_topics: [skill],
    summary: "這是 mock provider 的示範評估，只依回答長度與是否提到技能名稱給分，不代表真實能力；設定 AI_PROVIDER=gemini 後會依評分規準實際評估。",
  };
}

// ---------------------------------------------------------------------------
// 知識頁小測驗批改的 mock
// ---------------------------------------------------------------------------

const UNKNOWN_ANSWER_RE = /^(不知道|不會|不清楚|不確定|沒概念|idk|i\s*don'?t\s*know)?[。.!！?？]*$/i;

/**
 * 批改的 mock：沒有理解能力，只看回答裡有沒有出現批改重點的關鍵詞。
 * 過半重點有命中算答對、有命中算部分正確、都沒有算答錯；空白或「不知道」算沒作答。
 */
export function mockQuizGrade(userPrompt: string): QuizGradeOutput {
  let items: { question: string; standard_answer: string; key_points: string[]; user_answer: string }[] = [];
  try {
    items = JSON.parse(block(userPrompt, "題目與回答") || "[]");
  } catch {
    items = [];
  }
  const results = items.map((it) => {
    const answer = (it.user_answer ?? "").trim().toLowerCase();
    let verdict: QuizVerdict;
    if (UNKNOWN_ANSWER_RE.test(answer)) verdict = "unanswered";
    else {
      const hits = it.key_points.filter((p) =>
        p
          .toLowerCase()
          .split(/[\s,，、。；;：:（）()「」/+*=×\-]+/)
          .some((token) => token.length >= 2 && answer.includes(token)),
      ).length;
      verdict = hits * 2 >= it.key_points.length ? "correct" : hits > 0 ? "partial" : "incorrect";
    }
    const correct = verdict === "correct";
    return {
      verdict,
      reason: `（mock）依關鍵詞比對：${correct ? "回答涵蓋了過半的批改重點" : verdict === "unanswered" ? "沒有作答" : "沒有涵蓋足夠的批改重點"}。`,
      correction: correct ? null : `（mock）正確觀念：${it.standard_answer}`.slice(0, 400),
      analogy: correct ? null : "（mock）設定 AI_PROVIDER=gemini 後會給真正的比喻。",
    };
  });
  const passed = results.filter((r) => r.verdict === "correct").length;
  return {
    results,
    summary: `（mock）${results.length} 題答對 ${passed} 題。這是 mock provider 依關鍵詞比對的示範批改，不代表真實理解程度；設定 AI_PROVIDER=gemini 後會逐題理解你的回答。`,
  };
}

// ---------------------------------------------------------------------------
// 學習路線的 mock
// ---------------------------------------------------------------------------

function parseRouteSkills(userPrompt: string): RouteSkillInput[] {
  try {
    return JSON.parse(block(userPrompt, "技能清單") || "[]") as RouteSkillInput[];
  } catch {
    return [];
  }
}

/** 診斷題的 mock：前 5 個技能各一題「說明它是什麼」，批改重點就是技能名稱；技能少於 3 個就重複出深一點的題目 */
export function mockRouteDiagnosis(userPrompt: string): RouteDiagnosisOutput {
  const skills = parseRouteSkills(userPrompt).map((s) => s.skill);
  const names = skills.length ? skills : ["這個職缺的核心技術"];
  const count = Math.min(5, Math.max(3, names.length));
  return {
    questions: Array.from({ length: count }, (_, i) => {
      const skill = names[i % names.length];
      const deeper = i >= names.length;
      return {
        skill,
        question: deeper ? `（mock）${skill} 在正式環境最常遇到什麼問題？你會怎麼處理？` : `（mock）用一兩句話說明 ${skill} 是什麼、解決什麼問題。`,
        answer: `（mock 標準答案）${skill} 的定義、要解決的問題與一個使用情境。設定 AI_PROVIDER=gemini 會得到真正的診斷題。`,
        key_points: [skill],
      };
    }),
  };
}

/**
 * 排課的 mock：每個技能一課、主題就是技能名稱（mock fixtures 有 RAG／LLM／AWS／Docker 的範例頁），
 * 診斷「掌握基礎」的技能略過；每課 45 分鐘（每天時數更少就用每天時數），依天數裝箱，裝不下的省略。
 */
export function mockRoutePlan(userPrompt: string): RoutePlanOutput {
  const days = Number(/可用天數：(\d+)/.exec(userPrompt)?.[1] ?? 7);
  const daily = Number(/每天可投入：(\d+)/.exec(userPrompt)?.[1] ?? 90);
  const jobTitle = block(userPrompt, "職缺") || "職缺";
  const skills = parseRouteSkills(userPrompt);
  const todo = skills.filter((s) => s.diagnosis !== "掌握基礎");
  const minutes = Math.max(10, Math.min(45, daily));
  const plan: RoutePlanOutput["days"] = [];
  let skipped = 0;
  for (const s of todo) {
    let day = plan[plan.length - 1];
    const used = day ? day.lessons.reduce((n, l) => n + l.estimated_minutes, 0) : Infinity;
    if (!day || used + minutes > daily || day.lessons.length >= 4) {
      if (plan.length >= days) {
        skipped++;
        continue;
      }
      day = { day: plan.length + 1, focus: "", lessons: [] };
      plan.push(day);
    }
    day.lessons.push({
      topic: s.skill,
      skill: s.skill,
      goal: `（mock）能用自己的話說明 ${s.skill} 並通過小測驗。`,
      estimated_minutes: minutes,
      core: s.requirement === "required",
    });
  }
  for (const d of plan) d.focus = d.lessons.map((l) => l.topic).join("、");
  if (!plan.length) {
    plan.push({ day: 1, focus: "複習", lessons: [{ topic: skills[0]?.skill ?? "Git", skill: skills[0]?.skill ?? "Git", goal: "（mock）複習已掌握的技能。", estimated_minutes: minutes, core: true }] });
  }
  const notes = ["mock provider 依規則排課：每個技能一課、主題就是技能名稱；設定 AI_PROVIDER=gemini 會把技能拆成更細的主題。"];
  if (skipped) notes.push(`天數不夠，省略了 ${skipped} 個技能。`);
  return {
    title: `${jobTitle} 學習路線`,
    summary: `（mock）依技能順序每天排 ${Math.max(1, Math.floor(daily / minutes))} 課以內，診斷已掌握基礎的技能先略過。`,
    days: plan,
    notes,
  };
}

/** 不在 fixtures 裡的主題：給一份合法但內容是佔位說明的知識頁 */
export function genericContent(topic: string): GeneratedKnowledgeContent {
  return {
    name: topic,
    english_name: null,
    category: "General",
    aliases: [],
    summary: `${topic} 的示範知識頁：目前使用 mock provider，內容為佔位範本，不是 AI 產生的真實內容。`,
    quick_take: {
      core: `${topic} 的示範內容：設定真正的 AI provider 後，這裡會是一句話結論。`,
      analogy: "mock provider 就像樣品屋：格局都在，但家具是展示用的。",
      key_numbers: null,
      interview_answer: "（示範）面試 30 秒口語版會出現在這裡：先講結論，再補一個原因與一個實務做法。",
      in_practice: "（示範）設定 AI_PROVIDER=gemini 與 GEMINI_API_KEY，再按「重新生成」。",
    },
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
    quiz: [
      { question: `用自己的話說明：為什麼這一頁 ${topic} 的內容不是真的 AI 產生的？`, answer: "因為目前使用 mock provider，只會回傳固定範本，沒有呼叫任何外部 AI 服務。", key_points: ["mock provider", "固定範本"] },
      { question: "要得到真正的知識內容，需要設定哪兩個環境變數？", answer: "AI_PROVIDER=gemini 與 GEMINI_API_KEY。", key_points: ["AI_PROVIDER", "GEMINI_API_KEY"] },
      { question: "設定好之後，要在知識頁按哪個按鈕更新內容？", answer: "按「重新生成」，會產生新版本的內容，舊版本仍保留。", key_points: ["重新生成", "新版本"] },
    ],
  };
}
