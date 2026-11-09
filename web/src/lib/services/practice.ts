import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  EVALUATION_SYSTEM_PROMPT,
  evaluationUserPrompt,
  PRACTICE_PROMPT_VERSION,
  practiceRetryPrompt,
  QUESTION_SYSTEM_PROMPT,
  questionUserPrompt,
} from "@/lib/ai/prompts/practice-v1";
import type { AiProvider } from "@/lib/ai/provider";
import { knowledgeContentSchema } from "@/lib/ai/schemas/knowledge";
import {
  averageScore,
  type PracticeEvaluationOutput,
  practiceEvaluationJsonSchema,
  practiceEvaluationSchema,
  practiceQuestionJsonSchema,
  practiceQuestionSchema,
} from "@/lib/ai/schemas/practice";
import { generateValidated } from "@/lib/ai/structured";
import { logError } from "@/lib/api/http";
import type { Db } from "@/lib/db/local";
import {
  type AiUsageKind,
  aiUsage,
  jobPostings,
  knowledgeContents,
  knowledgeNodes,
  PRACTICE_MODES,
  type PracticeMode,
  practiceAttempts,
  practiceQuestions,
  practiceSessions,
  type QuestionType,
  SESSION_QUESTION_TYPES,
  type SessionQuestionType,
  type SessionStatus,
} from "@/lib/db/schema";
import { isUuid, type Tx, withService, withUser } from "@/lib/db/with-user";
import {
  AppError,
  issuesFromZod,
  notFound,
  validationFailed,
} from "@/lib/errors";
import { cleanTopic, normalizeSlug } from "@/lib/knowledge/slug";
import { getJob } from "@/lib/services/jobs";
import { findNodeByTopic } from "@/lib/services/knowledge";
import { getUserSkillMap, upsertUserSkill } from "@/lib/services/skills";
import {
  assertUsageWithinLimit,
  finishUsage,
  startUsage,
} from "@/lib/services/usage";

// ---------------------------------------------------------------------------
// 型別
// ---------------------------------------------------------------------------

export interface PracticeDeps {
  provider: AiProvider;
  hourlyLimit: number;
  dailyLimit?: number;
}

/** 一次練習最多出幾題（AI 額度保險） */
export const MAX_QUESTIONS_PER_SESSION = 10;
/** 低於這個平均分就自動進複習清單 */
export const REVIEW_SCORE_THRESHOLD = 2.5;

export interface RelatedNode {
  name: string;
  slug: string | null;
  status: string | null;
}

/** 存在 practice_attempts.feedback 的內容：AI 的評估＋對到的知識頁 */
export interface PracticeFeedback extends PracticeEvaluationOutput {
  related_nodes: RelatedNode[];
}

export interface PracticeAttemptView {
  id: string;
  answer: string;
  score: number | null;
  feedback: PracticeFeedback | null;
  userConfirmedLevel: number | null;
  reviewFlag: boolean;
  createdAt: string;
}

export interface PracticeQuestionView {
  id: string;
  question: string;
  questionType: QuestionType;
  skillName: string | null;
  rubric: string[];
  referenceAnswer: string | null;
  sortOrder: number;
  knowledge: { id: string; slug: string; status: string } | null;
  attempt: PracticeAttemptView | null;
  createdAt: string;
}

export interface PracticeSessionSummary {
  id: string;
  topic: string;
  topicSlug: string | null;
  mode: PracticeMode;
  questionType: SessionQuestionType;
  targetLevel: number | null;
  status: SessionStatus;
  jobPostingId: string | null;
  jobTitle: string | null;
  knowledge: { id: string; slug: string; status: string } | null;
  createdAt: string;
  endedAt: string | null;
  questionCount: number;
  answeredCount: number;
  averageScore: number | null;
}

export interface PracticeSessionDetail extends PracticeSessionSummary {
  questions: PracticeQuestionView[];
  /** 還沒作答的最新一題 */
  currentQuestion: PracticeQuestionView | null;
  canAskMore: boolean;
}

export interface CreateSessionResult {
  session: PracticeSessionDetail;
  /** session 已建立但第一題出題失敗（限流、逾時、輸出不合格）時的訊息 */
  questionError: { code: string; message: string } | null;
}

export interface ReviewItem {
  attemptId: string;
  sessionId: string;
  questionId: string;
  topic: string;
  question: string;
  questionType: QuestionType;
  score: number | null;
  reviewFlag: boolean;
  createdAt: string;
}

export interface PracticeStats {
  sessionCount: number;
  answeredCount: number;
  averageScore: number | null;
  reviewCount: number;
}

// ---------------------------------------------------------------------------
// 輸入驗證
// ---------------------------------------------------------------------------

export const createSessionInputSchema = z.object({
  jobId: z.string().uuid("職缺 id 格式不正確").nullable().optional(),
  topic: z
    .string({ error: "請選擇或輸入要練習的技能" })
    .transform(cleanTopic)
    .pipe(
      z
        .string()
        .min(1, "請選擇或輸入要練習的技能")
        .max(80, "技能名稱最多 80 個字"),
    )
    .refine((v) => normalizeSlug(v).length > 0, "技能名稱需要包含字母或數字"),
  mode: z.enum(PRACTICE_MODES).default("interview"),
  questionType: z.enum(SESSION_QUESTION_TYPES).default("mixed"),
});
export type CreateSessionInput = z.input<typeof createSessionInputSchema>;

export const answerInputSchema = z.object({
  questionId: z.string().uuid("題目 id 格式不正確"),
  answer: z
    .string({ error: "請輸入回答" })
    .trim()
    .min(1, "請輸入回答")
    .max(6000, "回答最多 6000 個字"),
});

export const attemptPatchSchema = z
  .object({
    reviewFlag: z.boolean().optional(),
    /** null＝取消確認 */
    confirmedLevel: z
      .number()
      .int()
      .min(0, "等級為 0–4")
      .max(4, "等級為 0–4")
      .nullable()
      .optional(),
  })
  .refine(
    (v) => v.reviewFlag !== undefined || v.confirmedLevel !== undefined,
    "沒有要更新的欄位",
  );

// ---------------------------------------------------------------------------
// 並發保護
// ---------------------------------------------------------------------------

/** 同一使用者同一種練習呼叫還在進行中（最近 2 分鐘內 started 未結束）就擋下，避免連點各自花一次 AI 額度 */
async function assertNoInflight(
  tx: Tx,
  userId: string,
  kind: AiUsageKind,
  message: string,
): Promise<void> {
  const [row] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(
      and(
        eq(aiUsage.userId, userId),
        eq(aiUsage.kind, kind),
        eq(aiUsage.status, "started"),
        gt(aiUsage.createdAt, sql`now() - interval '2 minutes'`),
      ),
    );
  if ((row?.n ?? 0) > 0) throw new AppError("in_progress", message, 409);
}

/** Postgres 唯一鍵衝突（23505） */
function isUniqueViolation(error: unknown): boolean {
  const code =
    (error as { cause?: { code?: string }; code?: string })?.cause?.code ??
    (error as { code?: string })?.code;
  return code === "23505";
}

// ---------------------------------------------------------------------------
// 建立練習（Flow C 1–3）
// ---------------------------------------------------------------------------

export async function createSession(
  db: Db,
  userId: string,
  input: unknown,
  deps: PracticeDeps,
): Promise<CreateSessionResult> {
  const parsed = createSessionInputSchema.safeParse(input ?? {});
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const data = parsed.data;
  const slug = normalizeSlug(data.topic);

  let topic = data.topic;
  let jobId: string | null = null;
  let targetLevel: number | null = null;
  let currentLevel: number | null = null;
  let nodeId: string | null = null;

  if (data.jobId) {
    // 職缺必須是自己的；技能若在職缺裡，用職缺要求的等級當目標
    const job = await getJob(db, userId, data.jobId);
    jobId = job.id;
    const row = job.skills.find((s) => s.skillSlug === slug);
    if (row) {
      topic = row.skillName;
      targetLevel = row.requiredLevel;
      currentLevel = row.user?.level ?? null;
      nodeId = row.knowledge?.id ?? null;
    }
  }
  if (!nodeId) {
    const node = await withService(db, (tx) =>
      findNodeByTopic(tx, slug, topic),
    );
    nodeId = node?.id ?? null;
  }
  if (currentLevel === null) {
    const map = await withUser(db, userId, (tx) =>
      getUserSkillMap(tx, userId, [slug]),
    );
    currentLevel = map.get(slug)?.level ?? null;
  }
  // 沒有職缺要求時：比目前程度高一級，至少 2（能解釋），最多 4
  if (targetLevel === null)
    targetLevel = Math.min(4, Math.max(2, (currentLevel ?? 1) + 1));

  // 額度用完就不要建立空的 session
  await withService(db, (tx) =>
    assertUsageWithinLimit(tx, userId, deps.hourlyLimit, deps.dailyLimit ?? 0),
  );

  const sessionId = await withUser(db, userId, async (tx) => {
    const [row] = await tx
      .insert(practiceSessions)
      .values({
        userId,
        jobPostingId: jobId,
        knowledgeNodeId: nodeId,
        mode: data.mode,
        topic,
        topicSlug: slug,
        questionType: data.questionType,
        targetLevel,
      })
      .returning({ id: practiceSessions.id });
    return row.id;
  });

  let questionError: CreateSessionResult["questionError"] = null;
  try {
    await generateQuestion(db, userId, sessionId, deps);
  } catch (error) {
    // session 留著，頁面上可以再按一次「出題」；不要讓使用者重送表單再建一個 session
    if (error instanceof AppError)
      questionError = { code: error.code, message: error.message };
    else {
      logError(error);
      questionError = {
        code: "internal_error",
        message: "出題時發生錯誤，請稍後再試",
      };
    }
  }
  return { session: await getSession(db, userId, sessionId), questionError };
}

/** 題型輪替：mixed 依題序輪流；quiz 模式不出程式題；coding 模式只出程式題 */
export function pickQuestionType(
  session: { questionType: SessionQuestionType; mode: PracticeMode },
  index: number,
): QuestionType {
  if (session.questionType !== "mixed") return session.questionType;
  if (session.mode === "coding") return "coding";
  const rotation: QuestionType[] =
    session.mode === "quiz"
      ? ["concept", "scenario", "architecture"]
      : ["concept", "scenario", "architecture", "coding"];
  return rotation[index % rotation.length];
}

/** 出下一題：一次一題；到達上限或 session 已結束就拒絕 */
export async function generateQuestion(
  db: Db,
  userId: string,
  sessionId: string,
  deps: PracticeDeps,
): Promise<PracticeQuestionView> {
  if (!isUuid(sessionId)) throw notFound("這次練習");
  const state = await withUser(db, userId, async (tx) => {
    const session = await tx.query.practiceSessions.findFirst({
      where: and(
        eq(practiceSessions.id, sessionId),
        eq(practiceSessions.userId, userId),
      ),
    });
    if (!session) throw notFound("這次練習");
    const questions = await tx
      .select({
        id: practiceQuestions.id,
        question: practiceQuestions.question,
      })
      .from(practiceQuestions)
      .where(
        and(
          eq(practiceQuestions.sessionId, sessionId),
          eq(practiceQuestions.userId, userId),
        ),
      )
      .orderBy(asc(practiceQuestions.sortOrder));
    const unanswered = questions.length
      ? await tx
          .select({ questionId: practiceAttempts.questionId })
          .from(practiceAttempts)
          .where(
            inArray(
              practiceAttempts.questionId,
              questions.map((q) => q.id),
            ),
          )
      : [];
    const job = session.jobPostingId
      ? await tx.query.jobPostings.findFirst({
          where: and(
            eq(jobPostings.id, session.jobPostingId),
            eq(jobPostings.userId, userId),
          ),
          columns: { title: true },
        })
      : null;
    const currentLevel = session.topicSlug
      ? ((await getUserSkillMap(tx, userId, [session.topicSlug])).get(
          session.topicSlug,
        )?.level ?? null)
      : null;
    return {
      session,
      questions,
      answeredIds: new Set(unanswered.map((a) => a.questionId)),
      jobTitle: job?.title ?? null,
      currentLevel,
    };
  });

  if (state.session.status === "ended")
    throw new AppError(
      "session_ended",
      "這次練習已經結束，請開始新的練習",
      400,
    );
  if (state.questions.length >= MAX_QUESTIONS_PER_SESSION) {
    throw new AppError(
      "question_limit",
      `一次練習最多 ${MAX_QUESTIONS_PER_SESSION} 題，請結束後開始新的練習`,
      400,
    );
  }
  const pending = state.questions.find((q) => !state.answeredIds.has(q.id));
  if (pending)
    throw new AppError(
      "question_pending",
      "還有一題沒作答，先回答它再出下一題",
      400,
    );

  const index = state.questions.length;
  const questionType = pickQuestionType(state.session, index);
  const interviewTopics = state.session.knowledgeNodeId
    ? await loadInterviewTopics(db, state.session.knowledgeNodeId)
    : [];

  const usageId = await withService(db, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${"ai_usage:" + userId}))`,
    );
    // 鎖內再看一次：另一個請求可能剛插入了一題
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(practiceQuestions)
      .where(
        and(
          eq(practiceQuestions.sessionId, sessionId),
          eq(practiceQuestions.userId, userId),
        ),
      );
    if ((count?.n ?? 0) !== index)
      throw new AppError(
        "question_pending",
        "題目已經更新，請重新整理頁面",
        409,
      );
    await assertNoInflight(
      tx,
      userId,
      "practice_question",
      "正在出題中，請稍候再試",
    );
    await assertUsageWithinLimit(
      tx,
      userId,
      deps.hourlyLimit,
      deps.dailyLimit ?? 0,
    );
    return startUsage(
      tx,
      userId,
      "practice_question",
      deps.provider.name,
      deps.provider.model,
    );
  });

  let outcome: Awaited<
    ReturnType<typeof generateValidated<z.infer<typeof practiceQuestionSchema>>>
  >;
  try {
    outcome = await generateValidated(deps.provider, {
      system: QUESTION_SYSTEM_PROMPT,
      user: questionUserPrompt({
        skill: state.session.topic,
        questionType,
        jobTitle: state.jobTitle,
        targetLevel: state.session.targetLevel ?? 2,
        currentLevel: state.currentLevel,
        previousQuestions: state.questions.map((q) => q.question),
        knowledgeInterviewTopics: interviewTopics,
      }),
      schema: practiceQuestionSchema,
      jsonSchema: practiceQuestionJsonSchema(),
      retryPrompt: practiceRetryPrompt,
      maxOutputTokens: 4096,
      kind: "practice_question",
      hint: state.session.topic,
    });
  } catch (error) {
    await withService(db, (tx) =>
      finishUsage(tx, userId, usageId, { status: "failed" }),
    ).catch(() => {});
    throw error;
  }

  let questionId: string;
  try {
    questionId = await withUser(db, userId, async (tx) => {
      const [row] = await tx
        .insert(practiceQuestions)
        .values({
          sessionId,
          userId,
          knowledgeNodeId: state.session.knowledgeNodeId,
          skillName: state.session.topic,
          question: outcome.data.question,
          // 題型以我們指定的為準，AI 若回別的題型不採用
          questionType,
          rubric: outcome.data.rubric,
          referenceAnswer: outcome.data.reference_answer,
          sortOrder: index,
          provider: deps.provider.name,
          modelName: outcome.model,
          promptVersion: PRACTICE_PROMPT_VERSION,
        })
        .returning({ id: practiceQuestions.id });
      return row.id;
    });
  } catch (error) {
    await withService(db, (tx) =>
      finishUsage(tx, userId, usageId, { status: "failed" }),
    ).catch(() => {});
    // 同一題序已被另一個並發請求插入（unique (session_id, sort_order)）
    if (isUniqueViolation(error))
      throw new AppError(
        "question_pending",
        "題目已經更新，請重新整理頁面",
        409,
      );
    throw error;
  }
  await withService(db, (tx) =>
    finishUsage(tx, userId, usageId, {
      status: "succeeded",
      modelName: outcome.model,
      ...outcome.tokens,
    }),
  );
  const view = (await loadQuestions(db, userId, sessionId)).find(
    (q) => q.id === questionId,
  );
  if (!view) throw notFound("這個題目");
  return view;
}

/** 知識頁最新版的面試重點（出題時當方向參考） */
async function loadInterviewTopics(db: Db, nodeId: string): Promise<string[]> {
  const [row] = await withService(db, (tx) =>
    tx
      .select({ content: knowledgeContents.content })
      .from(knowledgeContents)
      .where(eq(knowledgeContents.knowledgeNodeId, nodeId))
      .orderBy(desc(knowledgeContents.version))
      .limit(1),
  );
  if (!row) return [];
  const parsed = knowledgeContentSchema.safeParse(row.content);
  return parsed.success
    ? parsed.data.interview_topics.map((t) => t.question).slice(0, 6)
    : [];
}

// ---------------------------------------------------------------------------
// 作答與評估（Flow C 4–5）
// ---------------------------------------------------------------------------

export async function answerQuestion(
  db: Db,
  userId: string,
  sessionId: string,
  input: unknown,
  deps: PracticeDeps,
): Promise<PracticeQuestionView> {
  const parsed = answerInputSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  if (!isUuid(sessionId)) throw notFound("這次練習");
  const { questionId, answer } = parsed.data;

  const state = await withUser(db, userId, async (tx) => {
    const [row] = await tx
      .select({
        question: practiceQuestions,
        sessionStatus: practiceSessions.status,
        topic: practiceSessions.topic,
        attemptId: practiceAttempts.id,
      })
      .from(practiceQuestions)
      .innerJoin(
        practiceSessions,
        eq(practiceSessions.id, practiceQuestions.sessionId),
      )
      .leftJoin(
        practiceAttempts,
        eq(practiceAttempts.questionId, practiceQuestions.id),
      )
      .where(
        and(
          eq(practiceQuestions.id, questionId),
          eq(practiceQuestions.sessionId, sessionId),
          eq(practiceQuestions.userId, userId),
        ),
      )
      .limit(1);
    if (!row) throw notFound("這個題目");
    return row;
  });
  if (state.sessionStatus === "ended")
    throw new AppError(
      "session_ended",
      "這次練習已經結束，請開始新的練習",
      400,
    );
  if (state.attemptId)
    throw new AppError(
      "already_answered",
      "這題已經作答過了，請按「下一題」",
      409,
    );

  const usageId = await withService(db, async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${"ai_usage:" + userId}))`,
    );
    const [existing] = await tx
      .select({ id: practiceAttempts.id })
      .from(practiceAttempts)
      .where(eq(practiceAttempts.questionId, questionId))
      .limit(1);
    if (existing)
      throw new AppError(
        "already_answered",
        "這題已經作答過了，請按「下一題」",
        409,
      );
    await assertNoInflight(
      tx,
      userId,
      "practice_evaluate",
      "上一個回答還在評估中，請稍候",
    );
    await assertUsageWithinLimit(
      tx,
      userId,
      deps.hourlyLimit,
      deps.dailyLimit ?? 0,
    );
    return startUsage(
      tx,
      userId,
      "practice_evaluate",
      deps.provider.name,
      deps.provider.model,
    );
  });

  let outcome: Awaited<
    ReturnType<typeof generateValidated<PracticeEvaluationOutput>>
  >;
  try {
    outcome = await generateValidated(deps.provider, {
      system: EVALUATION_SYSTEM_PROMPT,
      user: evaluationUserPrompt({
        skill: state.topic,
        questionType: state.question.questionType,
        question: state.question.question,
        rubric: state.question.rubric,
        referenceAnswer: state.question.referenceAnswer,
        answer,
      }),
      schema: practiceEvaluationSchema,
      jsonSchema: practiceEvaluationJsonSchema(),
      retryPrompt: practiceRetryPrompt,
      maxOutputTokens: 4096,
      kind: "practice_evaluate",
      hint: state.topic,
    });
  } catch (error) {
    await withService(db, (tx) =>
      finishUsage(tx, userId, usageId, { status: "failed" }),
    ).catch(() => {});
    throw error;
  }

  const relatedNodes = await withService(db, (tx) =>
    resolveTopics(tx, outcome.data.related_topics),
  );
  const feedback: PracticeFeedback = {
    ...outcome.data,
    related_nodes: relatedNodes,
  };
  const score = averageScore(outcome.data);

  try {
    await withUser(db, userId, async (tx) => {
      // 評估期間若 session 被結束，就不寫入
      const [live] = await tx
        .select({ status: practiceSessions.status })
        .from(practiceSessions)
        .where(
          and(
            eq(practiceSessions.id, sessionId),
            eq(practiceSessions.userId, userId),
          ),
        )
        .limit(1);
      if (!live || live.status === "ended")
        throw new AppError(
          "session_ended",
          "這次練習已經結束，這題的評估沒有儲存",
          400,
        );
      await tx.insert(practiceAttempts).values({
        questionId,
        userId,
        answer,
        score: String(score),
        feedback,
        provider: deps.provider.name,
        modelName: outcome.model,
        promptVersion: PRACTICE_PROMPT_VERSION,
      });
    });
  } catch (error) {
    await withService(db, (tx) =>
      finishUsage(tx, userId, usageId, { status: "failed" }),
    ).catch(() => {});
    // unique (question_id)：另一個並發請求已先寫入
    if (isUniqueViolation(error))
      throw new AppError(
        "already_answered",
        "這題已經作答過了，請按「下一題」",
        409,
      );
    throw error;
  }
  await withService(db, (tx) =>
    finishUsage(tx, userId, usageId, {
      status: "succeeded",
      modelName: outcome.model,
      ...outcome.tokens,
    }),
  );

  const view = (await loadQuestions(db, userId, sessionId)).find(
    (q) => q.id === questionId,
  );
  if (!view) throw notFound("這個題目");
  return view;
}

/** 把 AI 給的主題名稱對到既有知識頁（只比對 slug；對不到的保留名稱、slug 為 null） */
async function resolveTopics(tx: Tx, names: string[]): Promise<RelatedNode[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(
    0,
    5,
  );
  if (!unique.length) return [];
  const slugs = unique.map((n) => normalizeSlug(n)).filter(Boolean);
  const rows = slugs.length
    ? await tx
        .select({ slug: knowledgeNodes.slug, status: knowledgeNodes.status })
        .from(knowledgeNodes)
        .where(inArray(knowledgeNodes.slug, slugs))
    : [];
  const bySlug = new Map(rows.map((r) => [r.slug, r]));
  return unique.map((name) => {
    const hit = bySlug.get(normalizeSlug(name));
    return { name, slug: hit?.slug ?? null, status: hit?.status ?? null };
  });
}

// ---------------------------------------------------------------------------
// 讀取
// ---------------------------------------------------------------------------

function toAttemptView(
  a: typeof practiceAttempts.$inferSelect,
): PracticeAttemptView {
  return {
    id: a.id,
    answer: a.answer,
    score: a.score === null ? null : Number(a.score),
    feedback: (a.feedback as PracticeFeedback | null) ?? null,
    userConfirmedLevel: a.userConfirmedLevel,
    reviewFlag: a.reviewFlag,
    createdAt: a.createdAt,
  };
}

async function loadQuestions(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<PracticeQuestionView[]> {
  return withUser(db, userId, async (tx) => {
    const rows = await tx
      .select({
        question: practiceQuestions,
        attempt: practiceAttempts,
        nodeId: knowledgeNodes.id,
        nodeSlug: knowledgeNodes.slug,
        nodeStatus: knowledgeNodes.status,
      })
      .from(practiceQuestions)
      .leftJoin(
        practiceAttempts,
        eq(practiceAttempts.questionId, practiceQuestions.id),
      )
      .leftJoin(
        knowledgeNodes,
        eq(knowledgeNodes.id, practiceQuestions.knowledgeNodeId),
      )
      .where(
        and(
          eq(practiceQuestions.sessionId, sessionId),
          eq(practiceQuestions.userId, userId),
        ),
      )
      .orderBy(asc(practiceQuestions.sortOrder));
    return rows.map((r) => ({
      id: r.question.id,
      question: r.question.question,
      questionType: r.question.questionType,
      skillName: r.question.skillName,
      rubric: r.question.rubric ?? [],
      referenceAnswer: r.question.referenceAnswer,
      sortOrder: r.question.sortOrder,
      knowledge:
        r.nodeId && r.nodeSlug
          ? { id: r.nodeId, slug: r.nodeSlug, status: r.nodeStatus ?? "stub" }
          : null,
      attempt: r.attempt ? toAttemptView(r.attempt) : null,
      createdAt: r.question.createdAt,
    }));
  });
}

export async function listSessions(
  db: Db,
  userId: string,
  filter: { jobId?: string; id?: string; limit?: number } = {},
): Promise<PracticeSessionSummary[]> {
  if (filter.jobId && !isUuid(filter.jobId)) return [];
  if (filter.id && !isUuid(filter.id)) return [];
  return withUser(db, userId, async (tx) => {
    const conditions = [eq(practiceSessions.userId, userId)];
    if (filter.jobId)
      conditions.push(eq(practiceSessions.jobPostingId, filter.jobId));
    if (filter.id) conditions.push(eq(practiceSessions.id, filter.id));
    const rows = await tx
      .select({
        session: practiceSessions,
        jobTitle: jobPostings.title,
        nodeId: knowledgeNodes.id,
        nodeSlug: knowledgeNodes.slug,
        nodeStatus: knowledgeNodes.status,
      })
      .from(practiceSessions)
      .leftJoin(jobPostings, eq(jobPostings.id, practiceSessions.jobPostingId))
      .leftJoin(
        knowledgeNodes,
        eq(knowledgeNodes.id, practiceSessions.knowledgeNodeId),
      )
      .where(and(...conditions))
      .orderBy(desc(practiceSessions.createdAt))
      .limit(filter.limit ?? 100);
    if (!rows.length) return [];
    const stats = await tx
      .select({
        sessionId: practiceQuestions.sessionId,
        questions: sql<number>`count(distinct ${practiceQuestions.id})::int`,
        answered: sql<number>`count(${practiceAttempts.id})::int`,
        avg: sql<string | null>`avg(${practiceAttempts.score})`,
      })
      .from(practiceQuestions)
      .leftJoin(
        practiceAttempts,
        eq(practiceAttempts.questionId, practiceQuestions.id),
      )
      .where(
        inArray(
          practiceQuestions.sessionId,
          rows.map((r) => r.session.id),
        ),
      )
      .groupBy(practiceQuestions.sessionId);
    const bySession = new Map(stats.map((s) => [s.sessionId, s]));
    return rows.map((r) => {
      const s = bySession.get(r.session.id);
      return {
        id: r.session.id,
        topic: r.session.topic,
        topicSlug: r.session.topicSlug,
        mode: r.session.mode,
        questionType: r.session.questionType,
        targetLevel: r.session.targetLevel,
        status: r.session.status,
        jobPostingId: r.session.jobPostingId,
        jobTitle: r.jobTitle,
        knowledge:
          r.nodeId && r.nodeSlug
            ? { id: r.nodeId, slug: r.nodeSlug, status: r.nodeStatus ?? "stub" }
            : null,
        createdAt: r.session.createdAt,
        endedAt: r.session.endedAt,
        questionCount: s?.questions ?? 0,
        answeredCount: s?.answered ?? 0,
        averageScore:
          s?.avg === null || s?.avg === undefined
            ? null
            : Math.round(Number(s.avg) * 10) / 10,
      };
    });
  });
}

export async function getSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<PracticeSessionDetail> {
  if (!isUuid(sessionId)) throw notFound("這次練習");
  const [summary] = await listSessions(db, userId, { id: sessionId, limit: 1 });
  if (!summary) throw notFound("這次練習");
  const questions = await loadQuestions(db, userId, sessionId);
  const currentQuestion =
    [...questions].reverse().find((q) => !q.attempt) ?? null;
  return {
    ...summary,
    questions,
    currentQuestion,
    canAskMore:
      summary.status === "active" &&
      !currentQuestion &&
      questions.length < MAX_QUESTIONS_PER_SESSION,
  };
}

// ---------------------------------------------------------------------------
// 結束、刪除、複習與確認程度（Flow C 6–7）
// ---------------------------------------------------------------------------

export async function endSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<void> {
  if (!isUuid(sessionId)) throw notFound("這次練習");
  const updated = await withUser(db, userId, (tx) =>
    tx
      .update(practiceSessions)
      .set({ status: "ended", endedAt: sql`now()` })
      .where(
        and(
          eq(practiceSessions.id, sessionId),
          eq(practiceSessions.userId, userId),
        ),
      )
      .returning({ id: practiceSessions.id }),
  );
  if (!updated.length) throw notFound("這次練習");
}

export async function deleteSession(
  db: Db,
  userId: string,
  sessionId: string,
): Promise<void> {
  if (!isUuid(sessionId)) throw notFound("這次練習");
  const deleted = await withUser(db, userId, (tx) =>
    tx
      .delete(practiceSessions)
      .where(
        and(
          eq(practiceSessions.id, sessionId),
          eq(practiceSessions.userId, userId),
        ),
      )
      .returning({ id: practiceSessions.id }),
  );
  if (!deleted.length) throw notFound("這次練習");
}

/**
 * 更新作答紀錄：加入／移出複習、或使用者看完評估後自己確認程度。
 * 只有「確認程度」會寫到 user_skills（evidence_type = interview_practice）；AI 的分數本身不會改技能等級。
 */
export async function updateAttempt(
  db: Db,
  userId: string,
  attemptId: string,
  input: unknown,
): Promise<PracticeAttemptView> {
  const parsed = attemptPatchSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  if (!isUuid(attemptId)) throw notFound("這筆作答");
  const data = parsed.data;

  const ctx = await withUser(db, userId, async (tx) => {
    const [row] = await tx
      .select({
        attempt: practiceAttempts,
        question: practiceQuestions.question,
        topic: practiceSessions.topic,
      })
      .from(practiceAttempts)
      .innerJoin(
        practiceQuestions,
        eq(practiceQuestions.id, practiceAttempts.questionId),
      )
      .innerJoin(
        practiceSessions,
        eq(practiceSessions.id, practiceQuestions.sessionId),
      )
      .where(
        and(
          eq(practiceAttempts.id, attemptId),
          eq(practiceAttempts.userId, userId),
        ),
      )
      .limit(1);
    if (!row) throw notFound("這筆作答");
    const [updated] = await tx
      .update(practiceAttempts)
      .set({
        ...(data.reviewFlag !== undefined
          ? { reviewFlag: data.reviewFlag }
          : {}),
        ...(data.confirmedLevel !== undefined
          ? { userConfirmedLevel: data.confirmedLevel }
          : {}),
      })
      .where(
        and(
          eq(practiceAttempts.id, attemptId),
          eq(practiceAttempts.userId, userId),
        ),
      )
      .returning();
    return { updated, question: row.question, topic: row.topic };
  });

  if (data.confirmedLevel !== undefined && data.confirmedLevel !== null) {
    await upsertUserSkill(db, userId, {
      skillName: ctx.topic,
      level: data.confirmedLevel,
      evidenceType: "interview_practice",
      evidenceNote: `面試練習後自評：${ctx.question.slice(0, 80)}`,
    });
  }
  return toAttemptView(ctx.updated);
}

/** 複習清單：使用者標記的，加上平均分低於門檻的作答 */
export async function listReviewItems(
  db: Db,
  userId: string,
  limit = 20,
): Promise<ReviewItem[]> {
  return withUser(db, userId, async (tx) => {
    const rows = await tx
      .select({
        attemptId: practiceAttempts.id,
        sessionId: practiceSessions.id,
        questionId: practiceQuestions.id,
        topic: practiceSessions.topic,
        question: practiceQuestions.question,
        questionType: practiceQuestions.questionType,
        score: practiceAttempts.score,
        reviewFlag: practiceAttempts.reviewFlag,
        createdAt: practiceAttempts.createdAt,
      })
      .from(practiceAttempts)
      .innerJoin(
        practiceQuestions,
        eq(practiceQuestions.id, practiceAttempts.questionId),
      )
      .innerJoin(
        practiceSessions,
        eq(practiceSessions.id, practiceQuestions.sessionId),
      )
      .where(
        and(
          eq(practiceAttempts.userId, userId),
          sql`(${practiceAttempts.reviewFlag} or ${practiceAttempts.score} < ${REVIEW_SCORE_THRESHOLD})`,
        ),
      )
      .orderBy(desc(practiceAttempts.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      ...r,
      score: r.score === null ? null : Number(r.score),
    }));
  });
}

/** Dashboard 用的統計 */
export async function getPracticeStats(
  db: Db,
  userId: string,
): Promise<PracticeStats> {
  return withUser(db, userId, async (tx) => {
    const [sessions] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(practiceSessions)
      .where(eq(practiceSessions.userId, userId));
    const [attempts] = await tx
      .select({
        n: sql<number>`count(*)::int`,
        avg: sql<string | null>`avg(${practiceAttempts.score})`,
        review: sql<number>`count(*) filter (where ${practiceAttempts.reviewFlag} or ${practiceAttempts.score} < ${REVIEW_SCORE_THRESHOLD})::int`,
      })
      .from(practiceAttempts)
      .where(eq(practiceAttempts.userId, userId));
    return {
      sessionCount: sessions?.n ?? 0,
      answeredCount: attempts?.n ?? 0,
      averageScore:
        attempts?.avg === null || attempts?.avg === undefined
          ? null
          : Math.round(Number(attempts.avg) * 10) / 10,
      reviewCount: attempts?.review ?? 0,
    };
  });
}
