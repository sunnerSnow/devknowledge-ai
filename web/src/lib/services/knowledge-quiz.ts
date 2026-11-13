import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { KNOWLEDGE_QUIZ_PROMPT_VERSION, QUIZ_GRADE_SYSTEM_PROMPT, quizGradeRetryPrompt, quizGradeUserPrompt } from "@/lib/ai/prompts/knowledge-quiz-v1";
import type { AiProvider } from "@/lib/ai/provider";
import { QUIZ_MAX_QUESTIONS, type QuizQuestion, storedKnowledgeContentSchema } from "@/lib/ai/schemas/knowledge";
import { type QuizVerdict, quizGradeJsonSchema, quizGradeSchema } from "@/lib/ai/schemas/knowledge-quiz";
import { generateValidated } from "@/lib/ai/structured";
import type { Db } from "@/lib/db/local";
import { knowledgeContents, knowledgeNodes, knowledgeQuizAttempts } from "@/lib/db/schema";
import { isUuid, withService, withUser } from "@/lib/db/with-user";
import { AppError, issuesFromZod, notFound, validationFailed } from "@/lib/errors";
import { normalizeSlug } from "@/lib/knowledge/slug";
import { assertNoInflight, assertUsageWithinLimit, finishUsage, startUsage } from "@/lib/services/usage";

/**
 * 知識頁小測驗：使用者一次交出全部回答，AI 逐題批改並糾正誤解（一次 AI 呼叫）。
 * - 作答綁定內容版本：送出時帶的版本不是最新版就拒絕（題目可能已經換了）。
 * - 標準答案只在批改後隨作答紀錄回傳；頁面在作答前只拿得到題目。
 * - 全部答對（passed）只是提示，不會自動改學習進度或技能等級。
 */

export interface QuizDeps {
  provider: AiProvider;
  hourlyLimit: number;
  dailyLimit?: number;
}

export const QUIZ_ANSWER_MAX = 2000;

export const quizInputSchema = z.object({
  version: z.number({ error: "缺少內容版本" }).int().min(1),
  answers: z
    .array(z.string({ error: "回答格式不正確" }).trim().max(QUIZ_ANSWER_MAX, `每題回答最多 ${QUIZ_ANSWER_MAX} 個字`))
    .min(1, "沒有回答")
    .max(QUIZ_MAX_QUESTIONS, "回答數量不正確"),
});

/** 一題的批改結果（存進 result.items，自帶題目與標準答案，不依賴之後的內容版本） */
export interface QuizAttemptItem {
  question: string;
  userAnswer: string;
  verdict: QuizVerdict;
  reason: string;
  correction: string | null;
  analogy: string | null;
  answer: string;
  keyPoints: string[];
}

interface StoredQuizResult {
  summary: string;
  items: QuizAttemptItem[];
}

export interface QuizAttemptView {
  id: string;
  contentVersion: number;
  passed: boolean;
  correctCount: number;
  totalCount: number;
  summary: string;
  items: QuizAttemptItem[];
  createdAt: string;
}

/** 空白或「不知道」一類的回答（不送 AI 也知道是沒作答，但仍交給 AI 一起講解正確觀念） */
const UNKNOWN_RE = /^(不知道|不會|不清楚|不確定|沒概念|idk|i\s*don'?t\s*know)[。.!！?？]*$/i;

export function isUnanswered(answer: string): boolean {
  const a = answer.trim();
  return a === "" || UNKNOWN_RE.test(a);
}

export interface GradeOutcome {
  items: QuizAttemptItem[];
  summary: string;
  model: string;
  tokens: { inputTokens: number | null; outputTokens: number | null };
}

/**
 * 批改一組題目（一次 AI 呼叫）：知識頁小測驗與學習路線的診斷共用。
 * 使用量的記錄由呼叫端負責；空白或「不知道」一律算沒作答，不論模型怎麼判。
 */
export async function gradeAnswers(provider: AiProvider, topic: string, questions: QuizQuestion[], answers: string[]): Promise<GradeOutcome> {
  const outcome = await generateValidated(provider, {
    system: QUIZ_GRADE_SYSTEM_PROMPT,
    user: quizGradeUserPrompt(
      topic,
      questions.map((q, i) => ({ question: q.question, answer: q.answer, keyPoints: q.key_points, userAnswer: answers[i].trim() || "不知道" })),
    ),
    schema: quizGradeSchema(questions.length),
    jsonSchema: quizGradeJsonSchema(questions.length),
    retryPrompt: quizGradeRetryPrompt,
    maxOutputTokens: 4096,
    kind: "knowledge_quiz",
    hint: topic,
  });
  const items: QuizAttemptItem[] = questions.map((q, i) => {
    const r = outcome.data.results[i];
    const verdict: QuizVerdict = isUnanswered(answers[i]) ? "unanswered" : r.verdict;
    const correct = verdict === "correct";
    return {
      question: q.question,
      userAnswer: answers[i].trim(),
      verdict,
      reason: r.reason,
      correction: correct ? null : r.correction || null,
      analogy: correct ? null : r.analogy || null,
      answer: q.answer,
      keyPoints: q.key_points,
    };
  });
  return { items, summary: outcome.data.summary, model: outcome.model, tokens: outcome.tokens };
}

/** 依 slug 或 UUID 找節點與最新內容的小測驗 */
async function loadQuiz(db: Db, userId: string, slugOrId: string): Promise<{ nodeId: string; name: string; version: number; quiz: QuizQuestion[] }> {
  const key = slugOrId.trim();
  if (!key) throw notFound("這個知識頁");
  const where = isUuid(key) ? eq(knowledgeNodes.id, key) : eq(knowledgeNodes.slug, normalizeSlug(key));
  return withUser(db, userId, async (tx) => {
    const [node] = await tx.select({ id: knowledgeNodes.id, name: knowledgeNodes.name }).from(knowledgeNodes).where(where).limit(1);
    if (!node) throw notFound("這個知識頁");
    const [latest] = await tx
      .select({ version: knowledgeContents.version, content: knowledgeContents.content })
      .from(knowledgeContents)
      .where(eq(knowledgeContents.knowledgeNodeId, node.id))
      .orderBy(desc(knowledgeContents.version))
      .limit(1);
    const parsed = latest ? storedKnowledgeContentSchema.safeParse(latest.content) : null;
    if (!latest || !parsed?.success || !parsed.data.quiz.length) {
      throw new AppError("quiz_unavailable", "這一頁還沒有小測驗；按「重新生成」更新成新版內容後就會有", 400);
    }
    return { nodeId: node.id, name: node.name, version: latest.version, quiz: parsed.data.quiz };
  });
}

export async function gradeQuiz(db: Db, userId: string, slugOrId: string, input: unknown, deps: QuizDeps): Promise<QuizAttemptView> {
  const parsed = quizInputSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const { version, answers } = parsed.data;

  const quiz = await loadQuiz(db, userId, slugOrId);
  if (version !== quiz.version) throw new AppError("content_changed", "知識頁內容已經更新，請重新整理後再作答", 409);
  if (answers.length !== quiz.quiz.length) throw validationFailed([{ field: "answers", message: `請回答全部 ${quiz.quiz.length} 題（不會的寫「不知道」）` }]);
  // 全部空白就不花 AI 額度
  if (answers.every((a) => a.trim() === "")) throw validationFailed([{ field: "answers", message: "至少回答一題；不會的寫「不知道」" }]);

  const usageId = await withService(db, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"ai_usage:" + userId}))`);
    await assertNoInflight(tx, userId, "knowledge_quiz", "上一份測驗還在批改中，請稍候");
    await assertUsageWithinLimit(tx, userId, deps.hourlyLimit, deps.dailyLimit ?? 0);
    return startUsage(tx, userId, "knowledge_quiz", deps.provider.name, deps.provider.model);
  });

  let graded: GradeOutcome;
  try {
    graded = await gradeAnswers(deps.provider, quiz.name, quiz.quiz, answers);
  } catch (error) {
    await withService(db, (tx) => finishUsage(tx, userId, usageId, { status: "failed" })).catch(() => {});
    throw error;
  }

  const { items } = graded;
  const correctCount = items.filter((it) => it.verdict === "correct").length;
  const result: StoredQuizResult = { summary: graded.summary, items };

  let row: typeof knowledgeQuizAttempts.$inferSelect;
  try {
    row = await withUser(db, userId, async (tx) => {
      const [inserted] = await tx
        .insert(knowledgeQuizAttempts)
        .values({
          userId,
          knowledgeNodeId: quiz.nodeId,
          contentVersion: quiz.version,
          answers: answers.map((a) => a.trim()),
          result,
          correctCount,
          totalCount: items.length,
          passed: correctCount === items.length,
          provider: deps.provider.name,
          modelName: graded.model,
          promptVersion: KNOWLEDGE_QUIZ_PROMPT_VERSION,
        })
        .returning();
      return inserted;
    });
  } catch (error) {
    await withService(db, (tx) => finishUsage(tx, userId, usageId, { status: "failed" })).catch(() => {});
    throw error;
  }
  await withService(db, (tx) => finishUsage(tx, userId, usageId, { status: "succeeded", modelName: graded.model, ...graded.tokens }));
  return toView(row);
}

/** 這位使用者在指定內容版本的最近一次作答 */
export async function getLatestQuizAttempt(db: Db, userId: string, nodeId: string, contentVersion: number): Promise<QuizAttemptView | null> {
  if (!isUuid(nodeId)) return null;
  const [row] = await withUser(db, userId, (tx) =>
    tx
      .select()
      .from(knowledgeQuizAttempts)
      .where(
        and(
          eq(knowledgeQuizAttempts.userId, userId),
          eq(knowledgeQuizAttempts.knowledgeNodeId, nodeId),
          eq(knowledgeQuizAttempts.contentVersion, contentVersion),
        ),
      )
      .orderBy(desc(knowledgeQuizAttempts.createdAt))
      .limit(1),
  );
  return row ? toView(row) : null;
}

function toView(row: typeof knowledgeQuizAttempts.$inferSelect): QuizAttemptView {
  const result = row.result as StoredQuizResult;
  return {
    id: row.id,
    contentVersion: row.contentVersion,
    passed: row.passed,
    correctCount: row.correctCount,
    totalCount: row.totalCount,
    summary: result.summary,
    items: result.items,
    createdAt: row.createdAt,
  };
}
