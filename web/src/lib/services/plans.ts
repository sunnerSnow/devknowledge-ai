import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { PLAN_PROMPT_VERSION, PLAN_SYSTEM_PROMPT, type PlanGapInput, planRetryPrompt, planUserPrompt } from "@/lib/ai/prompts/plan-v1";
import type { AiProvider } from "@/lib/ai/provider";
import { storedKnowledgeContentSchema } from "@/lib/ai/schemas/knowledge";
import { type LearningPlanOutput, learningPlanSchema, planJsonSchema } from "@/lib/ai/schemas/plan";
import { generateValidated } from "@/lib/ai/structured";
import { logError } from "@/lib/api/http";
import type { Db } from "@/lib/db/local";
import {
  jobPostings,
  knowledgeContents,
  knowledgeNodes,
  learningPlans,
  learningTasks,
  type PlanStatus,
  profiles,
  type ProgressStatus,
  TASK_STATUSES,
  type TaskStatus,
  type TaskType,
  userKnowledgeProgress,
} from "@/lib/db/schema";
import { isUuid, type Tx, withService, withUser } from "@/lib/db/with-user";
import { AppError, issuesFromZod, notFound, validationFailed } from "@/lib/errors";
import { normalizeSlug } from "@/lib/knowledge/slug";
import { getJob } from "@/lib/services/jobs";
import { assertUsageWithinLimit, finishUsage, startUsage } from "@/lib/services/usage";

// ---------------------------------------------------------------------------
// 型別
// ---------------------------------------------------------------------------

export interface PlanTask {
  id: string;
  title: string;
  description: string | null;
  taskType: TaskType;
  estimatedMinutes: number;
  verification: string | null;
  weekNumber: number;
  sortOrder: number;
  status: TaskStatus;
  completedAt: string | null;
  skillName: string | null;
  knowledge: { id: string; slug: string; status: string; progress: ProgressStatus | null } | null;
}

export interface PlanSummary {
  id: string;
  title: string;
  goal: string | null;
  status: PlanStatus;
  weeklyMinutes: number;
  jobPostingId: string | null;
  jobTitle: string | null;
  createdAt: string;
  updatedAt: string;
  totalTasks: number;
  completedTasks: number;
  skippedTasks: number;
  totalMinutes: number;
  remainingMinutes: number;
  weekCount: number;
}

export interface PlanWeek {
  week: number;
  tasks: PlanTask[];
  minutes: number;
  done: boolean;
}

export interface PlanDetail extends PlanSummary {
  summary: string | null;
  meta: { provider: string; model: string | null; promptVersion: string } | null;
  weeks: PlanWeek[];
  /** 第一個還沒完成的週次（給頁面預設展開） */
  currentWeek: number;
}

export interface PlanDeps {
  provider: AiProvider;
  hourlyLimit: number;
  dailyLimit?: number;
}

export const createPlanInputSchema = z.object({
  /** 省略就用 profile 的每週時數 */
  weeklyMinutes: z.number().int().min(30, "每週至少 30 分鐘").max(10080).optional(),
});

// ---------------------------------------------------------------------------
// 產生（規格 7.3、Phase 3）
// ---------------------------------------------------------------------------

/**
 * 依職缺的差距（已評估且有差距的技能，依優先分數排序）產生週學習計畫。
 * 未評估的技能不會進計畫（不推定能力不足）。
 */
export async function createPlanForJob(db: Db, userId: string, jobId: string, input: unknown, deps: PlanDeps): Promise<PlanDetail> {
  const parsed = createPlanInputSchema.safeParse(input ?? {});
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const job = await getJob(db, userId, jobId);
  if (!job.learningOrder.length) {
    throw new AppError(
      "no_gaps",
      job.unassessedCount === job.skills.length ? "請先在差距表逐項自評，才能依差距產生學習計畫" : "已評估的技能都達到要求，沒有需要排進計畫的差距",
      400,
    );
  }

  const profile = await withService(db, (tx) => tx.query.profiles.findFirst({ where: eq(profiles.id, userId) }));
  // profile 的每週時數允許 0；計畫至少 30 分鐘（與 learning_plans.weekly_minutes 的 check 一致），在呼叫 AI 之前就夾住
  const weeklyMinutes = Math.max(30, parsed.data.weeklyMinutes ?? profile?.weeklyLearningMinutes ?? 120);

  // 既有知識頁的實作任務，讓 AI 優先採用
  const nodeIds = job.learningOrder.map((s) => s.knowledge?.id).filter((v): v is string => Boolean(v));
  const knowledgeTasks = await loadKnowledgeTasks(db, nodeIds);

  const gaps: PlanGapInput[] = job.learningOrder.map((s) => ({
    skill: s.skillName,
    requirement: s.requirementType,
    requiredLevel: s.requiredLevel,
    currentLevel: s.user?.level ?? 0,
    gap: s.priority.gap ?? 0,
    priority: s.priority.score ?? 0,
    knowledgeTasks: s.knowledge ? (knowledgeTasks.get(s.knowledge.id) ?? []) : [],
    hasKnowledgePage: s.knowledge?.status === "published",
  }));

  const usageId = await withService(db, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"ai_usage:" + userId}))`);
    await assertUsageWithinLimit(tx, userId, deps.hourlyLimit, deps.dailyLimit ?? 0);
    return startUsage(tx, userId, "learning_plan", deps.provider.name, deps.provider.model);
  });

  let output: LearningPlanOutput;
  let model: string;
  let tokens: { inputTokens: number | null; outputTokens: number | null };
  try {
    const outcome = await generateValidated(deps.provider, {
      system: PLAN_SYSTEM_PROMPT,
      user: planUserPrompt({ jobTitle: job.title, targetRole: profile?.targetRole ?? null, weeklyMinutes, gaps }),
      schema: learningPlanSchema,
      jsonSchema: planJsonSchema(),
      retryPrompt: planRetryPrompt,
      maxOutputTokens: 8192,
      kind: "plan",
      hint: job.title,
    });
    output = outcome.data;
    model = outcome.model;
    tokens = outcome.tokens;
  } catch (error) {
    await withService(db, (tx) => finishUsage(tx, userId, usageId, { status: "failed" })).catch(() => {});
    throw error;
  }

  let planId: string;
  try {
    planId = await savePlan(db, userId, job.id, weeklyMinutes, output, deps.provider.name, model, job.learningOrder);
  } catch (error) {
    await withService(db, (tx) => finishUsage(tx, userId, usageId, { status: "failed" })).catch(() => {});
    throw error;
  }
  await withService(db, (tx) => finishUsage(tx, userId, usageId, { status: "succeeded", modelName: model, ...tokens }));
  return getPlan(db, userId, planId);
}

async function loadKnowledgeTasks(db: Db, nodeIds: string[]): Promise<Map<string, string[]>> {
  if (!nodeIds.length) return new Map();
  const rows = await withService(db, (tx) =>
    tx
      .select({ nodeId: knowledgeContents.knowledgeNodeId, content: knowledgeContents.content, version: knowledgeContents.version })
      .from(knowledgeContents)
      .where(inArray(knowledgeContents.knowledgeNodeId, nodeIds))
      .orderBy(desc(knowledgeContents.version)),
  );
  const map = new Map<string, string[]>();
  for (const r of rows) {
    if (map.has(r.nodeId)) continue; // 只取最新版
    const parsed = storedKnowledgeContentSchema.safeParse(r.content);
    map.set(r.nodeId, parsed.success ? parsed.data.learning_tasks.map((t) => t.title) : []);
  }
  return map;
}

async function savePlan(
  db: Db,
  userId: string,
  jobId: string,
  weeklyMinutes: number,
  output: LearningPlanOutput,
  providerName: string,
  model: string,
  gapSkills: { skillName: string; skillSlug: string; knowledge: { id: string } | null }[],
): Promise<string> {
  // 技能名稱 → 知識節點：只連結差距清單裡的技能（完成任務會回寫該知識頁的進度，
  // 清單外的技能名稱來自 AI 輸出，不能讓它連到任意知識頁）；對不上的任務保留名稱但不連結。
  const bySlug = new Map(gapSkills.map((s) => [s.skillSlug, s]));
  const resolve = (skill: string): { name: string | null; slug: string | null; nodeId: string | null } => {
    const slug = normalizeSlug(skill);
    if (!slug) return { name: null, slug: null, nodeId: null };
    const known = bySlug.get(slug);
    if (known) return { name: known.skillName, slug, nodeId: known.knowledge?.id ?? null };
    return { name: skill, slug, nodeId: null };
  };
  const resolved = new Map<string, ReturnType<typeof resolve>>();
  for (const w of output.weeks) for (const t of w.tasks) if (!resolved.has(t.skill)) resolved.set(t.skill, resolve(t.skill));

  return withUser(db, userId, async (tx) => {
    const [plan] = await tx
      .insert(learningPlans)
      .values({
        userId,
        jobPostingId: jobId,
        title: output.title,
        goal: output.goal,
        // 摘要＋備註合併後不能超過資料表的 1500 字上限（超過就捨去尾端，不讓 AI 花完配額才寫入失敗）
        summary: (output.summary + (output.notes.length ? `\n\n${output.notes.map((n) => `— ${n}`).join("\n")}` : "")).slice(0, 1500),
        weeklyMinutes,
        provider: providerName,
        modelName: model,
        promptVersion: PLAN_PROMPT_VERSION,
      })
      .returning({ id: learningPlans.id });
    const weeks = [...output.weeks].sort((a, b) => a.week - b.week);
    const rows = weeks.flatMap((w, wi) =>
      w.tasks.map((t, ti) => {
        const r = resolved.get(t.skill) ?? { name: null, slug: null, nodeId: null };
        return {
          learningPlanId: plan.id,
          userId,
          knowledgeNodeId: r.nodeId,
          skillName: r.name,
          skillSlug: r.slug,
          title: t.title,
          description: t.description,
          taskType: t.task_type,
          estimatedMinutes: t.estimated_minutes,
          verification: t.verification,
          weekNumber: wi + 1,
          sortOrder: ti,
        };
      }),
    );
    if (rows.length) await tx.insert(learningTasks).values(rows);
    return plan.id;
  });
}

// ---------------------------------------------------------------------------
// 讀取
// ---------------------------------------------------------------------------

export async function listPlans(db: Db, userId: string, filter: { jobId?: string } = {}): Promise<PlanSummary[]> {
  if (filter.jobId && !isUuid(filter.jobId)) return [];
  return withUser(db, userId, async (tx) => {
    const conditions = [eq(learningPlans.userId, userId)];
    if (filter.jobId) conditions.push(eq(learningPlans.jobPostingId, filter.jobId));
    const rows = await tx
      .select({
        id: learningPlans.id,
        title: learningPlans.title,
        goal: learningPlans.goal,
        status: learningPlans.status,
        weeklyMinutes: learningPlans.weeklyMinutes,
        jobPostingId: learningPlans.jobPostingId,
        jobTitle: jobPostings.title,
        createdAt: learningPlans.createdAt,
        updatedAt: learningPlans.updatedAt,
      })
      .from(learningPlans)
      .leftJoin(jobPostings, eq(jobPostings.id, learningPlans.jobPostingId))
      .where(and(...conditions))
      .orderBy(desc(learningPlans.createdAt));
    if (!rows.length) return [];
    const stats = await tx
      .select({
        planId: learningTasks.learningPlanId,
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where ${learningTasks.status} = 'completed')::int`,
        skipped: sql<number>`count(*) filter (where ${learningTasks.status} = 'skipped')::int`,
        totalMinutes: sql<number>`coalesce(sum(${learningTasks.estimatedMinutes}), 0)::int`,
        remainingMinutes: sql<number>`coalesce(sum(${learningTasks.estimatedMinutes}) filter (where ${learningTasks.status} in ('todo', 'in_progress')), 0)::int`,
        weekCount: sql<number>`coalesce(max(${learningTasks.weekNumber}), 0)::int`,
      })
      .from(learningTasks)
      .where(
        and(
          eq(learningTasks.userId, userId),
          inArray(
            learningTasks.learningPlanId,
            rows.map((r) => r.id),
          ),
        ),
      )
      .groupBy(learningTasks.learningPlanId);
    const byPlan = new Map(stats.map((s) => [s.planId, s]));
    return rows.map((r) => {
      const s = byPlan.get(r.id);
      return {
        ...r,
        totalTasks: s?.total ?? 0,
        completedTasks: s?.completed ?? 0,
        skippedTasks: s?.skipped ?? 0,
        totalMinutes: s?.totalMinutes ?? 0,
        remainingMinutes: s?.remainingMinutes ?? 0,
        weekCount: s?.weekCount ?? 0,
      };
    });
  });
}

export async function getPlan(db: Db, userId: string, planId: string): Promise<PlanDetail> {
  if (!isUuid(planId)) throw notFound("這份學習計畫");
  const [summary] = await listPlans(db, userId).then((all) => all.filter((p) => p.id === planId));
  if (!summary) throw notFound("這份學習計畫");
  return withUser(db, userId, async (tx) => {
    const plan = await tx.query.learningPlans.findFirst({ where: and(eq(learningPlans.id, planId), eq(learningPlans.userId, userId)) });
    if (!plan) throw notFound("這份學習計畫");
    const rows = await tx
      .select({
        id: learningTasks.id,
        title: learningTasks.title,
        description: learningTasks.description,
        taskType: learningTasks.taskType,
        estimatedMinutes: learningTasks.estimatedMinutes,
        verification: learningTasks.verification,
        weekNumber: learningTasks.weekNumber,
        sortOrder: learningTasks.sortOrder,
        status: learningTasks.status,
        completedAt: learningTasks.completedAt,
        skillName: learningTasks.skillName,
        nodeId: knowledgeNodes.id,
        nodeSlug: knowledgeNodes.slug,
        nodeStatus: knowledgeNodes.status,
        progress: userKnowledgeProgress.status,
      })
      .from(learningTasks)
      .leftJoin(knowledgeNodes, eq(knowledgeNodes.id, learningTasks.knowledgeNodeId))
      .leftJoin(userKnowledgeProgress, and(eq(userKnowledgeProgress.knowledgeNodeId, knowledgeNodes.id), eq(userKnowledgeProgress.userId, userId)))
      .where(and(eq(learningTasks.learningPlanId, planId), eq(learningTasks.userId, userId)))
      .orderBy(asc(learningTasks.weekNumber), asc(learningTasks.sortOrder));
    const weeksMap = new Map<number, PlanTask[]>();
    for (const r of rows) {
      const task: PlanTask = {
        id: r.id,
        title: r.title,
        description: r.description,
        taskType: r.taskType,
        estimatedMinutes: r.estimatedMinutes,
        verification: r.verification,
        weekNumber: r.weekNumber,
        sortOrder: r.sortOrder,
        status: r.status,
        completedAt: r.completedAt,
        skillName: r.skillName,
        knowledge: r.nodeId && r.nodeSlug ? { id: r.nodeId, slug: r.nodeSlug, status: r.nodeStatus ?? "stub", progress: r.progress } : null,
      };
      weeksMap.set(r.weekNumber, [...(weeksMap.get(r.weekNumber) ?? []), task]);
    }
    const weeks: PlanWeek[] = [...weeksMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([week, tasks]) => ({
        week,
        tasks,
        minutes: tasks.reduce((n, t) => n + t.estimatedMinutes, 0),
        done: tasks.every((t) => t.status === "completed" || t.status === "skipped"),
      }));
    return {
      ...summary,
      summary: plan.summary,
      meta: plan.provider && plan.promptVersion ? { provider: plan.provider, model: plan.modelName, promptVersion: plan.promptVersion } : null,
      weeks,
      currentWeek: weeks.find((w) => !w.done)?.week ?? weeks.at(-1)?.week ?? 1,
    };
  });
}

// ---------------------------------------------------------------------------
// 任務狀態（開始／完成／略過）與知識進度回寫
// ---------------------------------------------------------------------------

export const taskStatusInputSchema = z.object({ status: z.enum(TASK_STATUSES, { error: "任務狀態不正確" }) });

const PROGRESS_RANK: Record<ProgressStatus, number> = { not_started: 0, learning: 1, understood: 2, implemented: 3 };

/** 完成任務時知識進度至少要到的狀態 */
function progressFor(taskType: TaskType): ProgressStatus {
  if (taskType === "code" || taskType === "project") return "implemented";
  return "understood";
}

/** 更新任務狀態；任務必須屬於 planId 這份計畫（路徑與資源一致） */
export async function setTaskStatus(db: Db, userId: string, planId: string, taskId: string, input: unknown): Promise<{ task: PlanTask; planStatus: PlanStatus }> {
  const parsed = taskStatusInputSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  if (!isUuid(planId) || !isUuid(taskId)) throw notFound("這個任務");
  const status = parsed.data.status;

  return withUser(db, userId, async (tx) => {
    const [task] = await tx
      .select({ id: learningTasks.id, planId: learningTasks.learningPlanId, taskType: learningTasks.taskType, nodeId: learningTasks.knowledgeNodeId })
      .from(learningTasks)
      .where(and(eq(learningTasks.id, taskId), eq(learningTasks.learningPlanId, planId), eq(learningTasks.userId, userId)))
      .limit(1);
    if (!task) throw notFound("這個任務");

    await tx
      .update(learningTasks)
      .set({ status, completedAt: status === "completed" ? sql`now()` : null })
      .where(eq(learningTasks.id, taskId));

    // 完成任務 → 回寫知識進度（只往上升，不往下降）
    if (status === "completed" && task.nodeId) {
      const target = progressFor(task.taskType);
      const [existing] = await tx
        .select({ status: userKnowledgeProgress.status })
        .from(userKnowledgeProgress)
        .where(and(eq(userKnowledgeProgress.userId, userId), eq(userKnowledgeProgress.knowledgeNodeId, task.nodeId)))
        .limit(1);
      if (!existing || PROGRESS_RANK[existing.status] < PROGRESS_RANK[target]) {
        await tx
          .insert(userKnowledgeProgress)
          .values({ userId, knowledgeNodeId: task.nodeId, status: target })
          .onConflictDoUpdate({ target: [userKnowledgeProgress.userId, userKnowledgeProgress.knowledgeNodeId], set: { status: target } });
      }
    }

    // 全部完成／略過 → 計畫完成；有任務回到 todo／進行中 → 計畫回到 active
    const [agg] = await tx
      .select({ open: sql<number>`count(*) filter (where ${learningTasks.status} in ('todo', 'in_progress'))::int` })
      .from(learningTasks)
      .where(eq(learningTasks.learningPlanId, task.planId));
    const planStatus: PlanStatus = (agg?.open ?? 0) === 0 ? "completed" : "active";
    await tx
      .update(learningPlans)
      .set({ status: planStatus })
      .where(and(eq(learningPlans.id, task.planId), eq(learningPlans.userId, userId), sql`${learningPlans.status} <> 'archived'`));

    const detail = await getPlanTask(tx, userId, taskId);
    return { task: detail, planStatus };
  });
}

async function getPlanTask(tx: Tx, userId: string, taskId: string): Promise<PlanTask> {
  const [r] = await tx
    .select({
      id: learningTasks.id,
      title: learningTasks.title,
      description: learningTasks.description,
      taskType: learningTasks.taskType,
      estimatedMinutes: learningTasks.estimatedMinutes,
      verification: learningTasks.verification,
      weekNumber: learningTasks.weekNumber,
      sortOrder: learningTasks.sortOrder,
      status: learningTasks.status,
      completedAt: learningTasks.completedAt,
      skillName: learningTasks.skillName,
      nodeId: knowledgeNodes.id,
      nodeSlug: knowledgeNodes.slug,
      nodeStatus: knowledgeNodes.status,
      progress: userKnowledgeProgress.status,
    })
    .from(learningTasks)
    .leftJoin(knowledgeNodes, eq(knowledgeNodes.id, learningTasks.knowledgeNodeId))
    .leftJoin(userKnowledgeProgress, and(eq(userKnowledgeProgress.knowledgeNodeId, knowledgeNodes.id), eq(userKnowledgeProgress.userId, userId)))
    .where(and(eq(learningTasks.id, taskId), eq(learningTasks.userId, userId)))
    .limit(1);
  if (!r) throw notFound("這個任務");
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    taskType: r.taskType,
    estimatedMinutes: r.estimatedMinutes,
    verification: r.verification,
    weekNumber: r.weekNumber,
    sortOrder: r.sortOrder,
    status: r.status,
    completedAt: r.completedAt,
    skillName: r.skillName,
    knowledge: r.nodeId && r.nodeSlug ? { id: r.nodeId, slug: r.nodeSlug, status: r.nodeStatus ?? "stub", progress: r.progress } : null,
  };
}

// ---------------------------------------------------------------------------
// 封存、刪除
// ---------------------------------------------------------------------------

export async function setPlanStatus(db: Db, userId: string, planId: string, status: PlanStatus): Promise<void> {
  if (!isUuid(planId)) throw notFound("這份學習計畫");
  const updated = await withUser(db, userId, (tx) =>
    tx
      .update(learningPlans)
      .set({ status })
      .where(and(eq(learningPlans.id, planId), eq(learningPlans.userId, userId)))
      .returning({ id: learningPlans.id }),
  );
  if (!updated.length) throw notFound("這份學習計畫");
}

export async function deletePlan(db: Db, userId: string, planId: string): Promise<void> {
  if (!isUuid(planId)) throw notFound("這份學習計畫");
  const deleted = await withUser(db, userId, (tx) => tx.delete(learningPlans).where(and(eq(learningPlans.id, planId), eq(learningPlans.userId, userId))).returning({ id: learningPlans.id }));
  if (!deleted.length) throw notFound("這份學習計畫");
}

// ---------------------------------------------------------------------------
// Dashboard：本週學習進度（所有 active 計畫的「目前週次」任務）
// ---------------------------------------------------------------------------

export interface WeekProgress {
  planId: string;
  planTitle: string;
  week: number;
  total: number;
  completed: number;
  minutes: number;
  nextTask: { id: string; title: string } | null;
}

export async function listWeekProgress(db: Db, userId: string): Promise<WeekProgress[]> {
  const plans = (await listPlans(db, userId)).filter((p) => p.status === "active");
  const out: WeekProgress[] = [];
  for (const p of plans.slice(0, 3)) {
    try {
      const detail = await getPlan(db, userId, p.id);
      const w = detail.weeks.find((x) => x.week === detail.currentWeek);
      if (!w) continue;
      out.push({
        planId: p.id,
        planTitle: p.title,
        week: w.week,
        total: w.tasks.length,
        completed: w.tasks.filter((t) => t.status === "completed").length,
        minutes: w.tasks.filter((t) => t.status === "todo" || t.status === "in_progress").reduce((n, t) => n + t.estimatedMinutes, 0),
        nextTask: w.tasks.find((t) => t.status === "todo" || t.status === "in_progress") ?? null,
      });
    } catch (error) {
      logError(error);
    }
  }
  return out;
}
