import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  DIAGNOSIS_SYSTEM_PROMPT,
  diagnosisUserPrompt,
  ROUTE_PLAN_SYSTEM_PROMPT,
  ROUTE_PROMPT_VERSION,
  type RouteSkillInput,
  routePlanUserPrompt,
  routeRetryPrompt,
} from "@/lib/ai/prompts/route-v1";
import { AiOutputError, type AiProvider } from "@/lib/ai/provider";
import {
  DIAGNOSIS_MAX_QUESTIONS,
  ROUTE_MAX_DAYS,
  ROUTE_MAX_LESSONS,
  type RouteDiagnosisOutput,
  routeDiagnosisJsonSchema,
  routeDiagnosisSchema,
  type RoutePlanOutput,
  routePlanJsonSchema,
  routePlanSchema,
} from "@/lib/ai/schemas/route";
import { generateValidated, type StructuredOutcome } from "@/lib/ai/structured";
import { logError } from "@/lib/api/http";
import type { Db } from "@/lib/db/local";
import {
  type AiUsageKind,
  jobPostings,
  knowledgeNodes,
  knowledgeQuizAttempts,
  learningRouteLessons,
  learningRoutes,
  type RequirementType,
  type RouteStatus,
} from "@/lib/db/schema";
import { isUuid, withService, withUser } from "@/lib/db/with-user";
import { AppError, issuesFromZod, notFound, validationFailed } from "@/lib/errors";
import { normalizeSlug } from "@/lib/knowledge/slug";
import { getJob } from "@/lib/services/jobs";
import { findOrCreateStub } from "@/lib/services/knowledge";
import { gradeAnswers, QUIZ_ANSWER_MAX, type QuizAttemptItem } from "@/lib/services/knowledge-quiz";
import { assertNoInflight, assertUsageWithinLimit, finishUsage, startUsage } from "@/lib/services/usage";

/**
 * 學習路線（Day 制）：
 *   建立（快照職缺技能）→ 診斷題（可略過）→ 作答與批改 → 排課 → 逐課學習（知識頁小測驗全對才解鎖下一課）
 * 每一步各一次 AI 呼叫、各自一個 API 請求，避免單一請求超過路由的時間上限。
 * 診斷估出的程度只用來排課，不寫進 user_skills；課程的過關狀態由知識頁小測驗的作答算出，不另外存。
 */

// ---------------------------------------------------------------------------
// 型別
// ---------------------------------------------------------------------------

export interface RouteDeps {
  provider: AiProvider;
  hourlyLimit: number;
  dailyLimit?: number;
}

/** 建立路線當下的技能快照（之後排課用它，不受職缺變動影響） */
export interface RouteSkill {
  skill: string;
  slug: string;
  requirement: RequirementType;
  requiredLevel: number;
  currentLevel: number | null;
  priority: number | null;
}

export const DIAGNOSIS_ESTIMATES = ["none", "basic", "solid"] as const;
export type DiagnosisEstimate = (typeof DIAGNOSIS_ESTIMATES)[number];
export const DIAGNOSIS_ESTIMATE_LABELS: Record<DiagnosisEstimate, string> = {
  none: "尚未掌握",
  basic: "有初步概念",
  solid: "掌握基礎",
};

interface StoredDiagnosis {
  questions: RouteDiagnosisOutput["questions"];
  provider: string;
  model: string;
  promptVersion: string;
}

export interface DiagnosisItem extends QuizAttemptItem {
  skill: string;
}

export interface DiagnosisResult {
  summary: string;
  items: DiagnosisItem[];
  levels: { skill: string; estimate: DiagnosisEstimate }[];
}

interface DayFocus {
  day: number;
  focus: string;
}

export type RouteStage = "setup" | "diagnosis" | "diagnosed" | "learning" | "completed";
export const ROUTE_STAGE_LABELS: Record<RouteStage, string> = {
  setup: "待開始",
  diagnosis: "診斷中",
  diagnosed: "待排課",
  learning: "學習中",
  completed: "已完成",
};

/** AI 步驟失敗時的錯誤碼 → 頁面訊息（網址只帶錯誤碼，訊息由伺服器對照，不信任網址裡的文字） */
export const ROUTE_STEP_ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "AI 使用次數暫時到上限，請稍後再按一次。",
  ai_unavailable: "AI 服務暫時無法使用，請稍後再按一次。",
  ai_invalid_output: "AI 回傳的內容格式不正確，請再按一次。",
  in_progress: "上一個 AI 步驟還在進行中，請稍候再試。",
  internal_error: "這一步沒有完成，請再按一次。",
};
export type LessonState = "passed" | "available" | "locked";

export interface RouteLessonView {
  id: string;
  /** 1 起算的課序 */
  index: number;
  dayNumber: number;
  topic: string;
  skillName: string | null;
  goal: string | null;
  estimatedMinutes: number;
  core: boolean;
  state: LessonState;
  knowledge: { id: string; slug: string; status: string } | null;
}

export interface RouteDayView {
  day: number;
  focus: string | null;
  minutes: number;
  done: boolean;
  lessons: RouteLessonView[];
}

export interface RouteSummary {
  id: string;
  title: string;
  status: RouteStatus;
  stage: RouteStage;
  jobPostingId: string | null;
  jobTitle: string | null;
  days: number;
  dailyMinutes: number;
  totalLessons: number;
  passedLessons: number;
  createdAt: string;
  updatedAt: string;
}

export interface RouteDetail extends RouteSummary {
  summary: string | null;
  notes: string[];
  skills: RouteSkill[];
  /** 診斷題（作答前只有題目，不含標準答案） */
  diagnosisQuestions: { skill: string; question: string }[];
  diagnosisResult: DiagnosisResult | null;
  dayViews: RouteDayView[];
  currentLesson: RouteLessonView | null;
  meta: { provider: string; model: string | null; promptVersion: string } | null;
}

export interface RouteStepResult {
  route: RouteDetail;
  /** 路線已建立，但這一步的 AI 呼叫失敗（限流、逾時、輸出不合格）時的訊息；頁面上可以再按一次 */
  stepError: { code: string; message: string } | null;
}

/** 進路線的技能上限（太多會讓診斷與排課都失焦） */
export const ROUTE_MAX_SKILLS = 12;

// ---------------------------------------------------------------------------
// 輸入驗證
// ---------------------------------------------------------------------------

export const createRouteInputSchema = z.object({
  days: z.number({ error: "請輸入天數" }).int("天數要是整數").min(1, "至少 1 天").max(ROUTE_MAX_DAYS, `最多 ${ROUTE_MAX_DAYS} 天`),
  dailyMinutes: z.number({ error: "請輸入每天分鐘數" }).int("分鐘數要是整數").min(15, "每天至少 15 分鐘").max(480, "每天最多 480 分鐘"),
  diagnose: z.boolean().default(true),
});

export const diagnosisAnswersSchema = z.object({
  answers: z
    .array(z.string({ error: "回答格式不正確" }).trim().max(QUIZ_ANSWER_MAX, `每題回答最多 ${QUIZ_ANSWER_MAX} 個字`))
    .min(1, "沒有回答")
    .max(DIAGNOSIS_MAX_QUESTIONS, "回答數量不正確"),
});

// ---------------------------------------------------------------------------
// 建立
// ---------------------------------------------------------------------------

/** 從職缺挑出要進路線的技能：排除已評估且沒有差距的；必要優先，再依優先分數、重要性 */
export function pickRouteSkills(
  skills: {
    skillName: string;
    skillSlug: string;
    requirementType: RequirementType;
    requiredLevel: number;
    importance: number;
    user: { level: number | null } | null;
    priority: { score: number | null; gap: number | null };
  }[],
): RouteSkill[] {
  const candidates = skills.filter((s) => !(s.user?.level !== null && s.user?.level !== undefined && s.priority.gap === 0));
  const rank = (s: (typeof candidates)[number]) => [s.requirementType === "required" ? 0 : 1, -(s.priority.score ?? -1), -s.importance] as const;
  return [...candidates]
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra[0] - rb[0] || ra[1] - rb[1] || ra[2] - rb[2];
    })
    .slice(0, ROUTE_MAX_SKILLS)
    .map((s) => ({
      skill: s.skillName,
      slug: s.skillSlug,
      requirement: s.requirementType,
      requiredLevel: s.requiredLevel,
      currentLevel: s.user?.level ?? null,
      priority: s.priority.score,
    }));
}

/**
 * 依職缺建立學習路線。diagnose＝true 先出診斷題；false 直接排課。
 * 路線先建立，AI 這一步失敗時回傳 stepError，頁面上可以再試，不用重填表單。
 */
export async function createRouteForJob(db: Db, userId: string, jobId: string, input: unknown, deps: RouteDeps): Promise<RouteStepResult> {
  const parsed = createRouteInputSchema.safeParse(input ?? {});
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const { days, dailyMinutes, diagnose } = parsed.data;

  const job = await getJob(db, userId, jobId);
  const skills = pickRouteSkills(job.skills);
  if (!skills.length) {
    throw new AppError("no_gaps", job.skills.length ? "已評估的技能都達到要求，沒有需要排進學習路線的技能" : "這份職缺還沒有分析出技能，先重新分析", 400);
  }

  // 額度用完就不要建立空的路線
  await withService(db, (tx) => assertUsageWithinLimit(tx, userId, deps.hourlyLimit, deps.dailyLimit ?? 0));

  const routeId = await withUser(db, userId, async (tx) => {
    const [row] = await tx
      .insert(learningRoutes)
      .values({ userId, jobPostingId: job.id, title: `${job.title} 學習路線`.slice(0, 120), days, dailyMinutes, skills })
      .returning({ id: learningRoutes.id });
    return row.id;
  });

  const stepError = await captureStepError(() => (diagnose ? generateDiagnosis(db, userId, routeId, deps) : planLessons(db, userId, routeId, deps)));
  return { route: await getRoute(db, userId, routeId), stepError };
}

async function captureStepError(step: () => Promise<unknown>): Promise<RouteStepResult["stepError"]> {
  try {
    await step();
    return null;
  } catch (error) {
    // 路線已經建立：不論是可預期的失敗還是其他錯誤，都回給使用者讓他在路線頁再按一次；
    // 丟 500 的話使用者看不到已建好的路線，重送表單會再建一條重複的
    if (error instanceof AppError) return { code: error.code, message: error.message };
    logError(error);
    return { code: "internal_error", message: ROUTE_STEP_ERROR_MESSAGES.internal_error };
  }
}

// ---------------------------------------------------------------------------
// AI 呼叫的共用流程：鎖、並發檢查、額度、記錄使用量
// ---------------------------------------------------------------------------

async function runWithUsage<T>(
  db: Db,
  userId: string,
  deps: RouteDeps,
  kind: AiUsageKind,
  inflightMessage: string,
  call: () => Promise<StructuredOutcome<T>>,
  save: (data: T, model: string) => Promise<void>,
): Promise<void> {
  const usageId = await withService(db, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"ai_usage:" + userId}))`);
    await assertNoInflight(tx, userId, kind, inflightMessage);
    await assertUsageWithinLimit(tx, userId, deps.hourlyLimit, deps.dailyLimit ?? 0);
    return startUsage(tx, userId, kind, deps.provider.name, deps.provider.model);
  });
  let outcome: StructuredOutcome<T>;
  try {
    outcome = await call();
    await save(outcome.data, outcome.model);
  } catch (error) {
    await withService(db, (tx) => finishUsage(tx, userId, usageId, { status: "failed" })).catch(() => {});
    throw error;
  }
  await withService(db, (tx) => finishUsage(tx, userId, usageId, { status: "succeeded", modelName: outcome.model, ...outcome.tokens }));
}

interface RouteRow {
  route: typeof learningRoutes.$inferSelect;
  jobTitle: string | null;
  lessonCount: number;
}

async function loadRouteRow(db: Db, userId: string, routeId: string): Promise<RouteRow> {
  if (!isUuid(routeId)) throw notFound("這條學習路線");
  return withUser(db, userId, async (tx) => {
    const [row] = await tx
      .select({ route: learningRoutes, jobTitle: jobPostings.title })
      .from(learningRoutes)
      .leftJoin(jobPostings, and(eq(jobPostings.id, learningRoutes.jobPostingId), eq(jobPostings.userId, userId)))
      .where(and(eq(learningRoutes.id, routeId), eq(learningRoutes.userId, userId)))
      .limit(1);
    if (!row) throw notFound("這條學習路線");
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(learningRouteLessons)
      .where(and(eq(learningRouteLessons.routeId, routeId), eq(learningRouteLessons.userId, userId)));
    return { route: row.route, jobTitle: row.jobTitle, lessonCount: count?.n ?? 0 };
  });
}

function assertBeforeLessons(row: RouteRow): void {
  if (row.route.status === "archived") throw new AppError("route_archived", "這條學習路線已封存，先恢復再繼續", 400);
  if (row.lessonCount > 0) throw new AppError("route_planned", "這條學習路線已經排好課了，請重新整理頁面", 409);
}

const jobTitleOf = (row: RouteRow) => row.jobTitle ?? row.route.title;
const skillsOf = (row: RouteRow) => (Array.isArray(row.route.skills) ? (row.route.skills as RouteSkill[]) : []);

// ---------------------------------------------------------------------------
// 診斷
// ---------------------------------------------------------------------------

/** 出（或換一組）診斷題；已經作答過就不能再換 */
export async function generateDiagnosis(db: Db, userId: string, routeId: string, deps: RouteDeps): Promise<void> {
  const row = await loadRouteRow(db, userId, routeId);
  assertBeforeLessons(row);
  if (row.route.diagnosisResult) throw new AppError("diagnosis_done", "已經完成診斷，接下來依診斷結果排課", 409);
  const skills = skillsOf(row);

  await runWithUsage<RouteDiagnosisOutput>(
    db,
    userId,
    deps,
    "route_diagnose",
    "正在出診斷題，請稍候",
    () =>
      generateValidated(deps.provider, {
        system: DIAGNOSIS_SYSTEM_PROMPT,
        user: diagnosisUserPrompt({ jobTitle: jobTitleOf(row), skills: skills.map((s) => toSkillInput(s, null)) }),
        schema: routeDiagnosisSchema,
        jsonSchema: routeDiagnosisJsonSchema(),
        retryPrompt: routeRetryPrompt,
        maxOutputTokens: 4096,
        kind: "route_diagnose",
        hint: jobTitleOf(row),
      }),
    async (data, model) => {
      // 技能名稱對回快照（AI 若改寫了名稱，用 slug 對；對不上的保留原文，只是不會算進該技能的程度）
      const bySlug = new Map(skills.map((s) => [s.slug, s.skill]));
      const questions = data.questions.map((q) => ({ ...q, skill: bySlug.get(normalizeSlug(q.skill)) ?? q.skill }));
      const diagnosis: StoredDiagnosis = { questions, provider: deps.provider.name, model, promptVersion: ROUTE_PROMPT_VERSION };
      const updated = await withUser(db, userId, (tx) =>
        tx
          .update(learningRoutes)
          .set({ diagnosis })
          .where(and(eq(learningRoutes.id, routeId), eq(learningRoutes.userId, userId), isNull(learningRoutes.diagnosisResult)))
          .returning({ id: learningRoutes.id }),
      );
      if (!updated.length) throw new AppError("diagnosis_done", "已經完成診斷，請重新整理頁面", 409);
    },
  );
}

/** 交出診斷題的回答：批改（沿用小測驗批改）並估出各技能的初步程度 */
export async function answerDiagnosis(db: Db, userId: string, routeId: string, input: unknown, deps: RouteDeps): Promise<RouteDetail> {
  const parsed = diagnosisAnswersSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const { answers } = parsed.data;

  const row = await loadRouteRow(db, userId, routeId);
  assertBeforeLessons(row);
  if (row.route.diagnosisResult) throw new AppError("diagnosis_done", "已經完成診斷，請重新整理頁面", 409);
  const diagnosis = row.route.diagnosis as StoredDiagnosis | null;
  if (!diagnosis?.questions?.length) throw new AppError("diagnosis_missing", "還沒有診斷題，請先出題", 400);
  const questions = diagnosis.questions;
  if (answers.length !== questions.length) throw validationFailed([{ field: "answers", message: `請回答全部 ${questions.length} 題（不會的寫「不知道」）` }]);
  if (answers.every((a) => a.trim() === "")) throw validationFailed([{ field: "answers", message: "至少回答一題；不會的寫「不知道」" }]);

  await runWithUsage(
    db,
    userId,
    deps,
    "route_grade",
    "上一份診斷還在批改中，請稍候",
    async () => {
      const graded = await gradeAnswers(deps.provider, jobTitleOf(row), questions, answers);
      return { data: graded, model: graded.model, tokens: graded.tokens };
    },
    async (graded) => {
      const items: DiagnosisItem[] = graded.items.map((it, i) => ({ ...it, skill: questions[i].skill }));
      const result: DiagnosisResult = { summary: graded.summary, items, levels: estimateLevels(skillsOf(row), items) };
      const updated = await withUser(db, userId, (tx) =>
        tx
          .update(learningRoutes)
          .set({ diagnosisResult: result })
          .where(and(eq(learningRoutes.id, routeId), eq(learningRoutes.userId, userId), isNull(learningRoutes.diagnosisResult)))
          .returning({ id: learningRoutes.id }),
      );
      if (!updated.length) throw new AppError("diagnosis_done", "已經完成診斷，請重新整理頁面", 409);
    },
  );
  return getRoute(db, userId, routeId);
}

/** 每個技能的初步程度：答對 2、部分正確 1、其他 0，平均 ≥1.5 掌握基礎、≥0.5 有初步概念，否則尚未掌握 */
export function estimateLevels(skills: RouteSkill[], items: DiagnosisItem[]): DiagnosisResult["levels"] {
  const score = { correct: 2, partial: 1, incorrect: 0, unanswered: 0 } as const;
  const levels: DiagnosisResult["levels"] = [];
  for (const s of skills) {
    const mine = items.filter((it) => normalizeSlug(it.skill) === s.slug);
    if (!mine.length) continue;
    const avg = mine.reduce((n, it) => n + score[it.verdict], 0) / mine.length;
    levels.push({ skill: s.skill, estimate: avg >= 1.5 ? "solid" : avg >= 0.5 ? "basic" : "none" });
  }
  return levels;
}

// ---------------------------------------------------------------------------
// 排課
// ---------------------------------------------------------------------------

function toSkillInput(s: RouteSkill, result: DiagnosisResult | null): RouteSkillInput {
  const level = result?.levels.find((l) => normalizeSlug(l.skill) === s.slug);
  const misconceptions = (result?.items ?? [])
    .filter((it) => normalizeSlug(it.skill) === s.slug && it.verdict !== "correct" && it.correction)
    .map((it) => it.correction!.slice(0, 200))
    .slice(0, 2);
  return {
    skill: s.skill,
    requirement: s.requirement,
    requiredLevel: s.requiredLevel,
    currentLevel: s.currentLevel,
    priority: s.priority,
    diagnosis: level ? DIAGNOSIS_ESTIMATE_LABELS[level.estimate] : null,
    misconceptions,
  };
}

interface PlannedLesson {
  day: number;
  topic: string;
  slug: string;
  skill: string | null;
  goal: string;
  minutes: number;
  core: boolean;
}

/**
 * 整理 AI 的排課：依天排序並從 1 連續編號、不超過可用天數、同一主題只留第一次、總課數有上限。
 * 技能名稱只接受快照裡的技能（對不上的設 null），避免 AI 輸出任意文字當技能。
 */
export function normalizePlan(output: RoutePlanOutput, maxDays: number, skills: RouteSkill[]): { lessons: PlannedLesson[]; dayFocus: DayFocus[]; dropped: number } {
  const bySlug = new Map(skills.map((s) => [s.slug, s.skill]));
  const seen = new Set<string>();
  const lessons: PlannedLesson[] = [];
  const dayFocus: DayFocus[] = [];
  let dropped = 0;
  const days = [...output.days].sort((a, b) => a.day - b.day);
  days.forEach((d, i) => {
    const day = i + 1;
    if (day > maxDays) {
      dropped += d.lessons.length;
      return;
    }
    let kept = 0;
    for (const l of d.lessons) {
      const slug = normalizeSlug(l.topic);
      if (!slug || seen.has(slug) || lessons.length >= ROUTE_MAX_LESSONS) {
        if (slug && !seen.has(slug)) dropped++;
        continue;
      }
      seen.add(slug);
      lessons.push({ day, topic: l.topic.trim(), slug, skill: bySlug.get(normalizeSlug(l.skill)) ?? null, goal: l.goal, minutes: Math.min(240, Math.max(5, l.estimated_minutes)), core: l.core });
      kept++;
    }
    if (kept) dayFocus.push({ day, focus: d.focus });
  });
  // 去重後某些天可能變空：重新連續編號
  const remap = new Map(dayFocus.map((f, i) => [f.day, i + 1]));
  for (const l of lessons) l.day = remap.get(l.day) ?? l.day;
  return { lessons, dayFocus: dayFocus.map((f, i) => ({ day: i + 1, focus: f.focus })), dropped };
}

/** 排課：有診斷結果就依結果排；沒有（或略過診斷）就依自評差距 */
export async function planLessons(db: Db, userId: string, routeId: string, deps: RouteDeps): Promise<void> {
  const row = await loadRouteRow(db, userId, routeId);
  assertBeforeLessons(row);
  const skills = skillsOf(row);
  const result = (row.route.diagnosisResult as DiagnosisResult | null) ?? null;

  await runWithUsage<RoutePlanOutput>(
    db,
    userId,
    deps,
    "learning_route",
    "正在排課，請稍候",
    () =>
      generateValidated(deps.provider, {
        system: ROUTE_PLAN_SYSTEM_PROMPT,
        user: routePlanUserPrompt({ jobTitle: jobTitleOf(row), days: row.route.days, dailyMinutes: row.route.dailyMinutes, skills: skills.map((s) => toSkillInput(s, result)) }),
        schema: routePlanSchema,
        jsonSchema: routePlanJsonSchema(),
        retryPrompt: routeRetryPrompt,
        maxOutputTokens: 8192,
        kind: "route_plan",
        hint: jobTitleOf(row),
      }),
    async (output, model) => {
      const plan = normalizePlan(output, row.route.days, skills);
      if (!plan.lessons.length) throw new AiOutputError("排課結果沒有任何可用的課程");

      // 主題 → 知識節點（共用資料，由伺服器寫入；不存在就建 stub，學習者打開時再生成）
      const nodeIds = await withService(db, async (tx) => {
        const map = new Map<string, string | null>();
        for (const l of plan.lessons) map.set(l.slug, await findOrCreateStub(tx, l.slug, l.topic, userId));
        return map;
      });

      const notes = [...output.notes];
      if (plan.dropped) notes.push(`超出可用天數或課數上限（${ROUTE_MAX_LESSONS} 課）的 ${plan.dropped} 個主題沒有排進來。`);
      await withUser(db, userId, async (tx) => {
        // 鎖住路線再確認還沒排過課：兩個並發的排課請求只有一個會寫入
        const [locked] = await tx
          .select({ status: learningRoutes.status })
          .from(learningRoutes)
          .where(and(eq(learningRoutes.id, routeId), eq(learningRoutes.userId, userId)))
          .for("update");
        if (!locked) throw notFound("這條學習路線");
        const [existing] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(learningRouteLessons)
          .where(and(eq(learningRouteLessons.routeId, routeId), eq(learningRouteLessons.userId, userId)));
        if ((existing?.n ?? 0) > 0) throw new AppError("route_planned", "這條學習路線已經排好課了，請重新整理頁面", 409);

        await tx.insert(learningRouteLessons).values(
          plan.lessons.map((l, i) => ({
            routeId,
            userId,
            knowledgeNodeId: nodeIds.get(l.slug) ?? null,
            dayNumber: l.day,
            sortOrder: i,
            topic: l.topic,
            skillName: l.skill,
            goal: l.goal,
            estimatedMinutes: l.minutes,
            core: l.core,
          })),
        );
        await tx
          .update(learningRoutes)
          .set({
            status: locked.status === "archived" ? "archived" : "active",
            title: output.title,
            summary: output.summary,
            dayFocus: plan.dayFocus,
            notes: notes.slice(0, 6),
            provider: deps.provider.name,
            modelName: model,
            promptVersion: ROUTE_PROMPT_VERSION,
          })
          .where(and(eq(learningRoutes.id, routeId), eq(learningRoutes.userId, userId)));
      });
    },
  );
}

// ---------------------------------------------------------------------------
// 讀取
// ---------------------------------------------------------------------------

function stageOf(route: typeof learningRoutes.$inferSelect, total: number, passed: number): RouteStage {
  if (total > 0) return passed >= total ? "completed" : "learning";
  if (route.diagnosisResult) return "diagnosed";
  if ((route.diagnosis as StoredDiagnosis | null)?.questions?.length) return "diagnosis";
  return "setup";
}

export async function getRoute(db: Db, userId: string, routeId: string): Promise<RouteDetail> {
  const row = await loadRouteRow(db, userId, routeId);
  const lessons = await withUser(db, userId, async (tx) => {
    const rows = await tx
      .select({ lesson: learningRouteLessons, nodeSlug: knowledgeNodes.slug, nodeStatus: knowledgeNodes.status })
      .from(learningRouteLessons)
      .leftJoin(knowledgeNodes, eq(knowledgeNodes.id, learningRouteLessons.knowledgeNodeId))
      .where(and(eq(learningRouteLessons.routeId, routeId), eq(learningRouteLessons.userId, userId)))
      .orderBy(asc(learningRouteLessons.sortOrder));
    const nodeIds = [...new Set(rows.map((r) => r.lesson.knowledgeNodeId).filter((v): v is string => Boolean(v)))];
    const passed = nodeIds.length
      ? await tx
          .selectDistinct({ nodeId: knowledgeQuizAttempts.knowledgeNodeId })
          .from(knowledgeQuizAttempts)
          .where(and(eq(knowledgeQuizAttempts.userId, userId), eq(knowledgeQuizAttempts.passed, true), inArray(knowledgeQuizAttempts.knowledgeNodeId, nodeIds)))
      : [];
    return { rows, passed: new Set(passed.map((p) => p.nodeId)) };
  });

  // 狀態：通過的課；第一個沒通過的是目前這課；之後都鎖住
  let blocked = false;
  const views: RouteLessonView[] = lessons.rows.map((r, i) => {
    const node = r.lesson.knowledgeNodeId && r.nodeSlug ? { id: r.lesson.knowledgeNodeId, slug: r.nodeSlug, status: r.nodeStatus ?? "stub" } : null;
    const isPassed = Boolean(node && lessons.passed.has(node.id));
    let state: LessonState;
    if (isPassed && !blocked) state = "passed";
    else if (!blocked) {
      state = "available";
      blocked = true;
    } else state = isPassed ? "passed" : "locked";
    return {
      id: r.lesson.id,
      index: i + 1,
      dayNumber: r.lesson.dayNumber,
      topic: r.lesson.topic,
      skillName: r.lesson.skillName,
      goal: r.lesson.goal,
      estimatedMinutes: r.lesson.estimatedMinutes,
      core: r.lesson.core,
      state,
      knowledge: node,
    };
  });
  const passedCount = views.filter((v) => v.state === "passed").length;

  const focus = new Map(((row.route.dayFocus as DayFocus[]) ?? []).map((f) => [f.day, f.focus]));
  const dayNumbers = [...new Set(views.map((v) => v.dayNumber))].sort((a, b) => a - b);
  const dayViews: RouteDayView[] = dayNumbers.map((day) => {
    const ls = views.filter((v) => v.dayNumber === day);
    return { day, focus: focus.get(day) ?? null, minutes: ls.reduce((n, l) => n + l.estimatedMinutes, 0), done: ls.every((l) => l.state === "passed"), lessons: ls };
  });

  const diagnosis = row.route.diagnosis as StoredDiagnosis | null;
  return {
    id: row.route.id,
    title: row.route.title,
    status: row.route.status,
    stage: stageOf(row.route, views.length, passedCount),
    jobPostingId: row.route.jobPostingId,
    jobTitle: row.jobTitle,
    days: row.route.days,
    dailyMinutes: row.route.dailyMinutes,
    totalLessons: views.length,
    passedLessons: passedCount,
    createdAt: row.route.createdAt,
    updatedAt: row.route.updatedAt,
    summary: row.route.summary,
    notes: row.route.notes ?? [],
    skills: skillsOf(row),
    // 標準答案與批改重點留在伺服器，作答前不送到頁面
    diagnosisQuestions: (diagnosis?.questions ?? []).map((q) => ({ skill: q.skill, question: q.question })),
    diagnosisResult: (row.route.diagnosisResult as DiagnosisResult | null) ?? null,
    dayViews,
    currentLesson: views.find((v) => v.state === "available") ?? null,
    meta: row.route.provider && row.route.promptVersion ? { provider: row.route.provider, model: row.route.modelName, promptVersion: row.route.promptVersion } : null,
  };
}

export async function listRoutes(db: Db, userId: string, filter: { jobId?: string } = {}): Promise<RouteSummary[]> {
  if (filter.jobId && !isUuid(filter.jobId)) return [];
  return withUser(db, userId, async (tx) => {
    const conditions = [eq(learningRoutes.userId, userId)];
    if (filter.jobId) conditions.push(eq(learningRoutes.jobPostingId, filter.jobId));
    const rows = await tx
      .select({ route: learningRoutes, jobTitle: jobPostings.title })
      .from(learningRoutes)
      .leftJoin(jobPostings, and(eq(jobPostings.id, learningRoutes.jobPostingId), eq(jobPostings.userId, userId)))
      .where(and(...conditions))
      .orderBy(desc(learningRoutes.createdAt))
      .limit(100);
    if (!rows.length) return [];
    const ids = rows.map((r) => r.route.id);
    const lessons = await tx
      .select({ routeId: learningRouteLessons.routeId, nodeId: learningRouteLessons.knowledgeNodeId, sortOrder: learningRouteLessons.sortOrder })
      .from(learningRouteLessons)
      .where(and(eq(learningRouteLessons.userId, userId), inArray(learningRouteLessons.routeId, ids)))
      .orderBy(asc(learningRouteLessons.sortOrder));
    const nodeIds = [...new Set(lessons.map((l) => l.nodeId).filter((v): v is string => Boolean(v)))];
    const passed = nodeIds.length
      ? new Set(
          (
            await tx
              .selectDistinct({ nodeId: knowledgeQuizAttempts.knowledgeNodeId })
              .from(knowledgeQuizAttempts)
              .where(and(eq(knowledgeQuizAttempts.userId, userId), eq(knowledgeQuizAttempts.passed, true), inArray(knowledgeQuizAttempts.knowledgeNodeId, nodeIds)))
          ).map((p) => p.nodeId),
        )
      : new Set<string>();
    return rows.map((r) => {
      const mine = lessons.filter((l) => l.routeId === r.route.id);
      // 跟詳細頁一致：小測驗全對過的課都算通過（之前就學過的也算）
      const passedLessons = mine.filter((l) => l.nodeId && passed.has(l.nodeId)).length;
      return {
        id: r.route.id,
        title: r.route.title,
        status: r.route.status,
        stage: stageOf(r.route, mine.length, passedLessons),
        jobPostingId: r.route.jobPostingId,
        jobTitle: r.jobTitle,
        days: r.route.days,
        dailyMinutes: r.route.dailyMinutes,
        totalLessons: mine.length,
        passedLessons,
        createdAt: r.route.createdAt,
        updatedAt: r.route.updatedAt,
      };
    });
  });
}

/** 知識頁上的路線提示：這一頁是路線的第幾課、下一課是什麼 */
export interface RouteLessonContext {
  routeId: string;
  title: string;
  lesson: RouteLessonView;
  total: number;
  next: RouteLessonView | null;
}

export async function getRouteContextForNode(db: Db, userId: string, routeId: string, nodeId: string): Promise<RouteLessonContext | null> {
  if (!isUuid(routeId) || !isUuid(nodeId)) return null;
  let route: RouteDetail;
  try {
    route = await getRoute(db, userId, routeId);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) return null;
    throw error;
  }
  const all = route.dayViews.flatMap((d) => d.lessons);
  const i = all.findIndex((l) => l.knowledge?.id === nodeId);
  if (i < 0) return null;
  return { routeId: route.id, title: route.title, lesson: all[i], total: all.length, next: all[i + 1] ?? null };
}

// ---------------------------------------------------------------------------
// 封存與刪除
// ---------------------------------------------------------------------------

/** 封存或恢復；恢復時依有沒有課程回到 active／draft */
export async function setRouteArchived(db: Db, userId: string, routeId: string, archived: boolean): Promise<void> {
  const row = await loadRouteRow(db, userId, routeId);
  const status: RouteStatus = archived ? "archived" : row.lessonCount > 0 ? "active" : "draft";
  await withUser(db, userId, (tx) =>
    tx
      .update(learningRoutes)
      .set({ status })
      .where(and(eq(learningRoutes.id, routeId), eq(learningRoutes.userId, userId))),
  );
}

export async function deleteRoute(db: Db, userId: string, routeId: string): Promise<void> {
  if (!isUuid(routeId)) throw notFound("這條學習路線");
  const deleted = await withUser(db, userId, (tx) =>
    tx
      .delete(learningRoutes)
      .where(and(eq(learningRoutes.id, routeId), eq(learningRoutes.userId, userId)))
      .returning({ id: learningRoutes.id }),
  );
  if (!deleted.length) throw notFound("這條學習路線");
}
