import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { AiProvider } from "@/lib/ai/provider";
import { createMockProvider, genericContent, mockQuizGrade } from "@/lib/ai/providers/mock";
import { quizGradeUserPrompt } from "@/lib/ai/prompts/knowledge-quiz-v1";
import type { Db } from "@/lib/db/local";
import { withUser } from "@/lib/db/with-user";
import { AppError } from "@/lib/errors";
import { generateKnowledge, getKnowledge } from "@/lib/services/knowledge";
import { getLatestQuizAttempt, gradeQuiz, isUnanswered } from "@/lib/services/knowledge-quiz";
import { createTestDb, createUser, rowsOf } from "./helpers/db";

const mock = createMockProvider({ delayMs: 0 });
const deps = { provider: mock, hourlyLimit: 60 };

/** Docker fixture 的四題，命中 mock 批改的關鍵詞 → 全對 */
const GOOD_ANSWERS = [
  "解決環境不一致的問題；它不是虛擬機，容器共用主機核心。",
  "容器是執行實例，比映像檔多一層可寫層。",
  "資料要放在 volume 才能持久化。",
  "用多階段建置，再加上 .dockerignore。",
];

let db: Db;
let alice: string;
let bob: string;
let nodeId: string;

beforeEach(async () => {
  db = await createTestDb();
  alice = await createUser(db);
  bob = await createUser(db);
  nodeId = (await generateKnowledge(db, alice, { topic: "Docker" }, deps)).node.id;
});

async function expectAppError(p: Promise<unknown>, status: number, code?: string) {
  const error = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).status).toBe(status);
  if (code) expect((error as AppError).code).toBe(code);
  return error as AppError;
}

describe("知識頁小測驗", () => {
  it("新版知識頁有快速理解與小測驗；頁面拿到的題目可以作答", async () => {
    const detail = await getKnowledge(db, alice, "docker");
    expect(detail.content?.quick_take?.core).toMatch(/Docker/);
    expect(detail.content?.quiz).toHaveLength(4);
    expect(detail.contentMeta?.promptVersion).toBe("knowledge-v2");
  });

  it("逐題批改：答對、不知道、答錯、部分正確分開判定；結果存下來，標準答案在批改後才回傳", async () => {
    const attempt = await gradeQuiz(db, alice, "docker", { version: 1, answers: [GOOD_ANSWERS[0], "不知道", "放在記憶體裡", "多階段建置"] }, deps);
    expect(attempt.items.map((it) => it.verdict)).toEqual(["correct", "unanswered", "incorrect", "partial"]);
    expect(attempt.correctCount).toBe(1);
    expect(attempt.totalCount).toBe(4);
    expect(attempt.passed).toBe(false);
    // 答對的不給觀念修正；其他題有修正與標準答案
    expect(attempt.items[0].correction).toBeNull();
    expect(attempt.items[1].correction).toBeTruthy();
    expect(attempt.items[2].answer).toMatch(/volume/);
    expect(attempt.items[2].keyPoints.length).toBeGreaterThan(0);

    const usage = rowsOf<{ kind: string; status: string }>(await db.execute(sql`select kind, status from dk.ai_usage where kind = 'knowledge_quiz'`));
    expect(usage).toEqual([{ kind: "knowledge_quiz", status: "succeeded" }]);

    const latest = await getLatestQuizAttempt(db, alice, nodeId, 1);
    expect(latest?.id).toBe(attempt.id);
    expect(latest?.items[1].verdict).toBe("unanswered");
  });

  it("全部答對才算通過；通過不會自動改學習進度", async () => {
    const attempt = await gradeQuiz(db, alice, nodeId, { version: 1, answers: GOOD_ANSWERS }, deps);
    expect(attempt.passed).toBe(true);
    expect(attempt.correctCount).toBe(4);
    const detail = await getKnowledge(db, alice, "docker");
    expect(detail.progress?.status).toBe("not_started");
  });

  it("模型把「不知道」判成答對時，一律改成沒作答", async () => {
    const lenient: AiProvider = {
      name: "mock",
      model: "lenient",
      async generateStructured() {
        return {
          text: JSON.stringify({ results: Array.from({ length: 4 }, () => ({ verdict: "correct", reason: "好", correction: null, analogy: null })), summary: "都對" }),
          model: "lenient",
          inputTokens: null,
          outputTokens: null,
        };
      },
    };
    const attempt = await gradeQuiz(db, alice, nodeId, { version: 1, answers: [GOOD_ANSWERS[0], "不知道。", " ", GOOD_ANSWERS[3]] }, { provider: lenient, hourlyLimit: 60 });
    expect(attempt.items.map((it) => it.verdict)).toEqual(["correct", "unanswered", "unanswered", "correct"]);
    expect(attempt.passed).toBe(false);
  });

  it("內容重新生成後：舊版本的作答被拒絕，也不會顯示在新版本", async () => {
    await gradeQuiz(db, alice, nodeId, { version: 1, answers: GOOD_ANSWERS }, deps);
    await generateKnowledge(db, alice, { topic: "Docker", regenerate: true }, deps);
    await expectAppError(gradeQuiz(db, alice, nodeId, { version: 1, answers: GOOD_ANSWERS }, deps), 409, "content_changed");
    expect(await getLatestQuizAttempt(db, alice, nodeId, 2)).toBeNull();
    expect(await getLatestQuizAttempt(db, alice, nodeId, 1)).not.toBeNull();
  });

  it("題數不符、全部空白、回答過長都擋下，且不花 AI 額度", async () => {
    await expectAppError(gradeQuiz(db, alice, nodeId, { version: 1, answers: GOOD_ANSWERS.slice(0, 3) }, deps), 400, "validation_failed");
    await expectAppError(gradeQuiz(db, alice, nodeId, { version: 1, answers: ["", " ", "", ""] }, deps), 400, "validation_failed");
    await expectAppError(gradeQuiz(db, alice, nodeId, { version: 1, answers: ["a".repeat(2001), "", "", ""] }, deps), 400, "validation_failed");
    await expectAppError(gradeQuiz(db, alice, nodeId, { answers: GOOD_ANSWERS }, deps), 400, "validation_failed");
    const usage = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from dk.ai_usage where kind = 'knowledge_quiz'`));
    expect(usage[0].n).toBe(0);
  });

  it("舊版（沒有小測驗）的知識頁不能作答；頁面照常顯示", async () => {
    const v1: Record<string, unknown> = { ...genericContent("Legacy") };
    delete v1.quick_take;
    delete v1.quiz;
    await db.execute(sql`insert into dk.knowledge_nodes (slug, name, status) values ('legacy', 'Legacy', 'published')`);
    await db.execute(sql`insert into dk.knowledge_contents (knowledge_node_id, version, content, provider, prompt_version)
                         select id, 1, ${JSON.stringify(v1)}::jsonb, 'mock', 'knowledge-v1' from dk.knowledge_nodes where slug = 'legacy'`);
    const detail = await getKnowledge(db, alice, "legacy");
    expect(detail.content?.quick_take).toBeNull();
    expect(detail.content?.quiz).toEqual([]);
    await expectAppError(gradeQuiz(db, alice, "legacy", { version: 1, answers: ["x"] }, deps), 400, "quiz_unavailable");
  });

  it("作答是個人資料：別人看不到", async () => {
    await gradeQuiz(db, alice, nodeId, { version: 1, answers: GOOD_ANSWERS }, deps);
    expect(await getLatestQuizAttempt(db, bob, nodeId, 1)).toBeNull();
    const bobSees = rowsOf<{ n: number }>(await withUser(db, bob, (tx) => tx.execute(sql`select count(*)::int n from dk.knowledge_quiz_attempts`)));
    expect(bobSees[0].n).toBe(0);
    // 不存在的頁面
    await expectAppError(gradeQuiz(db, alice, "no-such-page", { version: 1, answers: ["x"] }, deps), 404, "not_found");
  });

  it("mock 批改從 prompt 還原題目；「不知道」與空白判定", () => {
    const prompt = quizGradeUserPrompt("X", [
      { question: "Q", answer: "A", keyPoints: ["volume"], userAnswer: "用 volume" },
      { question: "Q", answer: "A", keyPoints: ["volume"], userAnswer: "不知道" },
    ]);
    expect(mockQuizGrade(prompt).results.map((r) => r.verdict)).toEqual(["correct", "unanswered"]);
    expect(isUnanswered("不知道。")).toBe(true);
    expect(isUnanswered("I don't know")).toBe(true);
    expect(isUnanswered("我不知道為什麼，但應該是 volume")).toBe(false);
  });
});
