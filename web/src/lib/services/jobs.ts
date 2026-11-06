import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { JOB_PROMPT_VERSION, JOB_SYSTEM_PROMPT, jobRetryPrompt, jobUserPrompt } from "@/lib/ai/prompts/job-v1";
import type { AiProvider } from "@/lib/ai/provider";
import { type JobAnalysis, jobAnalysisSchema, jobJsonSchema } from "@/lib/ai/schemas/job";
import { generateValidated } from "@/lib/ai/structured";
import type { Db } from "@/lib/db/local";
import { type EvidenceType, jobPostings, jobSkills, knowledgeNodes, type RequirementType, userKnowledgeProgress } from "@/lib/db/schema";
import { isUuid, type Tx, withService, withUser } from "@/lib/db/with-user";
import { logError } from "@/lib/api/http";
import { AppError, issuesFromZod, notFound, validationFailed } from "@/lib/errors";
import { normalizeSlug } from "@/lib/knowledge/slug";
import { findOrCreateStub } from "@/lib/services/knowledge";
import { getUserSkillMap } from "@/lib/services/skills";
import { assertUsageWithinLimit, finishUsage, startUsage } from "@/lib/services/usage";
import { computePriority, type PriorityResult } from "@/lib/skills/levels";

// ---------------------------------------------------------------------------
// 型別
// ---------------------------------------------------------------------------

export interface JobSummary {
  id: string;
  title: string;
  company: string | null;
  sourceUrl: string | null;
  status: "active" | "archived";
  analyzedAt: string | null;
  createdAt: string;
  updatedAt: string;
  roleSummary: string | null;
  seniority: string | null;
  skillCount: number;
  requiredCount: number;
}

export interface JobSkillRow {
  id: string;
  skillName: string;
  skillSlug: string;
  category: string | null;
  requirementType: RequirementType;
  requiredLevel: number;
  importance: number;
  originalPhrase: string | null;
  reason: string | null;
  knowledge: { id: string; slug: string; status: string; progress: string | null } | null;
  /** 使用者自己的程度；null＝未評估 */
  user: { skillId: string; level: number | null; goalWeight: number; evidenceType: EvidenceType } | null;
  priority: PriorityResult;
}

export interface JobDetail extends JobSummary {
  rawDescription: string;
  requiredSkillsRaw: string | null;
  preferredSkillsRaw: string | null;
  notes: string | null;
  analysis: JobAnalysis | null;
  analysisMeta: { provider: string; model: string | null; promptVersion: string } | null;
  skills: JobSkillRow[];
  /** 建議學習順序：已評估且有差距的技能，依優先分數排序 */
  learningOrder: JobSkillRow[];
  unassessedCount: number;
}

export interface JobDeps {
  provider: AiProvider;
  hourlyLimit: number;
  dailyLimit?: number;
}

// ---------------------------------------------------------------------------
// 輸入驗證（規格 4.5 的表單）
// ---------------------------------------------------------------------------

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}最多 ${max} 個字`)
    .transform((v) => (v ? v : null))
    .nullable()
    .optional();

export const jobInputSchema = z.object({
  title: z.string({ error: "請輸入職缺名稱" }).trim().min(1, "請輸入職缺名稱").max(120, "職缺名稱最多 120 個字"),
  company: optionalText(120, "公司名稱"),
  sourceUrl: z
    .string()
    .trim()
    .max(500, "網址最多 500 個字")
    .refine((v) => !v || /^https?:\/\//i.test(v), "網址需以 http:// 或 https:// 開頭")
    .transform((v) => (v ? v : null))
    .nullable()
    .optional(),
  rawDescription: z.string({ error: "請貼上工作內容" }).trim().min(20, "工作內容至少 20 個字，建議直接貼整份職缺").max(12000, "工作內容最多 12000 個字"),
  requiredSkillsRaw: optionalText(4000, "必要技能"),
  preferredSkillsRaw: optionalText(4000, "加分技能"),
  notes: optionalText(2000, "備註"),
});
export type JobInput = z.input<typeof jobInputSchema>;

// ---------------------------------------------------------------------------
// 建立與分析（Flow B）
// ---------------------------------------------------------------------------

export interface CreateJobResult {
  job: JobDetail;
  /**
   * 職缺已建立但 AI 分析失敗（限流、逾時、輸出不合格）時的訊息；
   * 呼叫端應帶使用者到職缺頁按「重新分析」，而不是重送表單再建一筆。
   */
  analysisError: { code: string; message: string } | null;
}

/** 貼上職缺 → 存檔 → AI 拆解技能 → 連到知識節點（沒有就建 stub） */
export async function createJob(db: Db, userId: string, input: unknown, deps: JobDeps): Promise<CreateJobResult> {
  const parsed = jobInputSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const data = parsed.data;
  const id = await withUser(db, userId, async (tx) => {
    const [row] = await tx
      .insert(jobPostings)
      .values({
        userId,
        title: data.title,
        company: data.company ?? null,
        sourceUrl: data.sourceUrl ?? null,
        rawDescription: data.rawDescription,
        requiredSkillsRaw: data.requiredSkillsRaw ?? null,
        preferredSkillsRaw: data.preferredSkillsRaw ?? null,
        notes: data.notes ?? null,
      })
      .returning({ id: jobPostings.id });
    return row.id;
  });
  let analysisError: CreateJobResult["analysisError"] = null;
  try {
    await analyzeJob(db, userId, id, deps);
  } catch (error) {
    // 職缺已經建立：不論是可預期的失敗（限流、AI 逾時或輸出不合格）還是其他錯誤，都回給使用者並讓他在職缺頁重新分析，
    // 不能丟 500，否則表單重送會再建一筆重複的職缺
    if (error instanceof AppError) {
      analysisError = { code: error.code, message: error.message };
    } else {
      logError(error);
      analysisError = { code: "internal_error", message: "分析沒有完成，請在職缺頁按「重新分析」" };
    }
  }
  return { job: await getJob(db, userId, id), analysisError };
}

/** 錯誤碼 → 使用者看得懂的說明（職缺頁用 query string 只帶碼，不帶訊息） */
export const ANALYSIS_ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "AI 使用次數已達上限，請稍後再重新分析。",
  ai_unavailable: "AI 服務暫時無法使用或逾時，請稍後再重新分析。",
  ai_invalid_output: "AI 回傳的內容格式不正確，請再分析一次。",
  internal_error: "分析沒有完成，請再分析一次。",
};

/** 重新分析：覆寫 analysis 與 job_skills（使用者自評在 user_skills，不受影響） */
export async function analyzeJob(db: Db, userId: string, jobId: string, deps: JobDeps): Promise<void> {
  if (!isUuid(jobId)) throw notFound("這份職缺");
  const job = await withUser(db, userId, (tx) => tx.query.jobPostings.findFirst({ where: and(eq(jobPostings.id, jobId), eq(jobPostings.userId, userId)) }));
  if (!job) throw notFound("這份職缺");

  const usageId = await withService(db, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"ai_usage:" + userId}))`);
    await assertUsageWithinLimit(tx, userId, deps.hourlyLimit, deps.dailyLimit ?? 0);
    return startUsage(tx, userId, "job_analyze", deps.provider.name, deps.provider.model);
  });

  let analysis: JobAnalysis;
  let model: string;
  let tokens: { inputTokens: number | null; outputTokens: number | null };
  try {
    const outcome = await generateValidated(deps.provider, {
      system: JOB_SYSTEM_PROMPT,
      user: jobUserPrompt({
        title: job.title,
        company: job.company,
        description: job.rawDescription,
        requiredSkillsRaw: job.requiredSkillsRaw,
        preferredSkillsRaw: job.preferredSkillsRaw,
        notes: job.notes,
      }),
      schema: jobAnalysisSchema,
      jsonSchema: jobJsonSchema(),
      retryPrompt: jobRetryPrompt,
      maxOutputTokens: 6144,
      kind: "job",
      hint: job.title,
    });
    analysis = outcome.data;
    model = outcome.model;
    tokens = outcome.tokens;
  } catch (error) {
    await withService(db, (tx) => finishUsage(tx, userId, usageId, { status: "failed" })).catch(() => {});
    throw error;
  }

  try {
    await saveAnalysis(db, userId, jobId, job.company, analysis, deps.provider.name, model);
  } catch (error) {
    await withService(db, (tx) => finishUsage(tx, userId, usageId, { status: "failed" })).catch(() => {});
    throw error;
  }
  await withService(db, (tx) => finishUsage(tx, userId, usageId, { status: "succeeded", modelName: model, ...tokens }));
}

/** 把分析結果寫進 job_postings 與 job_skills（技能先連到知識節點，沒有就建 stub） */
async function saveAnalysis(db: Db, userId: string, jobId: string, currentCompany: string | null, analysis: JobAnalysis, providerName: string, model: string): Promise<void> {
  // 技能 → 知識節點（共用資料，伺服器身分）；同一份職缺內 slug 重複的只留第一個
  const seen = new Set<string>();
  const skills = analysis.skills
    .map((s) => ({ ...s, slug: normalizeSlug(s.name) }))
    .filter((s) => s.slug && !seen.has(s.slug) && seen.add(s.slug));
  const nodeIds = await withService(db, async (tx) => {
    const map = new Map<string, string | null>();
    for (const s of skills) map.set(s.slug, await findOrCreateStub(tx, s.slug, s.name, userId));
    return map;
  });

  await withUser(db, userId, async (tx) => {
    // 同一份職缺同時重新分析（雙擊、API 與 UI 同時送）時排隊，避免兩邊的「刪除再插入」互撞唯一鍵
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"job_skills:" + jobId}))`);
    await tx.delete(jobSkills).where(and(eq(jobSkills.jobPostingId, jobId), eq(jobSkills.userId, userId)));
    if (skills.length) {
      await tx.insert(jobSkills).values(
        skills.map((s, i) => ({
          jobPostingId: jobId,
          userId,
          knowledgeNodeId: nodeIds.get(s.slug) ?? null,
          skillName: s.name,
          skillSlug: s.slug,
          category: s.category,
          requirementType: s.requirement_type,
          requiredLevel: s.required_level,
          importance: s.importance,
          originalPhrase: s.original_phrase,
          reason: s.reason,
          sortOrder: i,
        })),
      );
    }
    await tx
      .update(jobPostings)
      .set({
        analysis,
        analysisProvider: providerName,
        analysisModel: model,
        analysisPromptVersion: JOB_PROMPT_VERSION,
        analyzedAt: sql`now()`,
        // AI 從內文看出公司名稱、使用者沒填時才補上
        ...(currentCompany === null && analysis.company ? { company: analysis.company } : {}),
      })
      .where(and(eq(jobPostings.id, jobId), eq(jobPostings.userId, userId)));
  });
}

// ---------------------------------------------------------------------------
// 讀取
// ---------------------------------------------------------------------------

export async function listJobs(db: Db, userId: string): Promise<JobSummary[]> {
  return withUser(db, userId, async (tx) => {
    const rows = await tx
      .select({
        id: jobPostings.id,
        title: jobPostings.title,
        company: jobPostings.company,
        sourceUrl: jobPostings.sourceUrl,
        status: jobPostings.status,
        analyzedAt: jobPostings.analyzedAt,
        createdAt: jobPostings.createdAt,
        updatedAt: jobPostings.updatedAt,
        analysis: jobPostings.analysis,
      })
      .from(jobPostings)
      .where(eq(jobPostings.userId, userId))
      .orderBy(desc(jobPostings.createdAt));
    const counts = await tx
      .select({
        jobId: jobSkills.jobPostingId,
        total: sql<number>`count(*)::int`,
        required: sql<number>`count(*) filter (where ${jobSkills.requirementType} = 'required')::int`,
      })
      .from(jobSkills)
      .where(eq(jobSkills.userId, userId))
      .groupBy(jobSkills.jobPostingId);
    const byJob = new Map(counts.map((c) => [c.jobId, c]));
    return rows.map((r) => toSummary({ ...r, skillCount: byJob.get(r.id)?.total ?? 0, requiredCount: byJob.get(r.id)?.required ?? 0 }));
  });
}

type SummaryRow = {
  id: string;
  title: string;
  company: string | null;
  sourceUrl: string | null;
  status: "active" | "archived";
  analyzedAt: string | null;
  createdAt: string;
  updatedAt: string;
  analysis: unknown;
  skillCount: number;
  requiredCount: number;
};

function toSummary(r: SummaryRow): JobSummary {
  const analysis = jobAnalysisSchema.safeParse(r.analysis);
  return {
    id: r.id,
    title: r.title,
    company: r.company,
    sourceUrl: r.sourceUrl,
    status: r.status,
    analyzedAt: r.analyzedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    roleSummary: analysis.success ? analysis.data.role_summary : null,
    seniority: analysis.success ? analysis.data.seniority : null,
    skillCount: r.skillCount,
    requiredCount: r.requiredCount,
  };
}

/** 職缺＋技能＋使用者程度＋差距與優先分數（規格 4.6、5 節） */
export async function getJob(db: Db, userId: string, jobId: string): Promise<JobDetail> {
  if (!isUuid(jobId)) throw notFound("這份職缺");
  return withUser(db, userId, async (tx) => {
    const job = await tx.query.jobPostings.findFirst({ where: and(eq(jobPostings.id, jobId), eq(jobPostings.userId, userId)) });
    if (!job) throw notFound("這份職缺");
    const skills = await loadSkills(tx, userId, jobId);
    const analysis = jobAnalysisSchema.safeParse(job.analysis);
    const skillCount = skills.length;
    const requiredCount = skills.filter((s) => s.requirementType === "required").length;
    return {
      ...toSummary({ ...job, skillCount, requiredCount }),
      rawDescription: job.rawDescription,
      requiredSkillsRaw: job.requiredSkillsRaw,
      preferredSkillsRaw: job.preferredSkillsRaw,
      notes: job.notes,
      analysis: analysis.success ? analysis.data : null,
      analysisMeta: job.analysisProvider && job.analysisPromptVersion ? { provider: job.analysisProvider, model: job.analysisModel, promptVersion: job.analysisPromptVersion } : null,
      skills,
      learningOrder: skills
        .filter((s) => s.priority.score !== null && (s.priority.gap ?? 0) > 0)
        .sort((a, b) => (b.priority.score ?? 0) - (a.priority.score ?? 0) || b.importance - a.importance || a.skillName.localeCompare(b.skillName)),
      unassessedCount: skills.filter((s) => s.user === null || s.user.level === null).length,
    };
  });
}

async function loadSkills(tx: Tx, userId: string, jobId: string): Promise<JobSkillRow[]> {
  const rows = await tx
    .select({
      id: jobSkills.id,
      skillName: jobSkills.skillName,
      skillSlug: jobSkills.skillSlug,
      category: jobSkills.category,
      requirementType: jobSkills.requirementType,
      requiredLevel: jobSkills.requiredLevel,
      importance: jobSkills.importance,
      originalPhrase: jobSkills.originalPhrase,
      reason: jobSkills.reason,
      nodeId: knowledgeNodes.id,
      nodeSlug: knowledgeNodes.slug,
      nodeStatus: knowledgeNodes.status,
      progress: userKnowledgeProgress.status,
    })
    .from(jobSkills)
    .leftJoin(knowledgeNodes, eq(knowledgeNodes.id, jobSkills.knowledgeNodeId))
    .leftJoin(userKnowledgeProgress, and(eq(userKnowledgeProgress.knowledgeNodeId, knowledgeNodes.id), eq(userKnowledgeProgress.userId, userId)))
    .where(and(eq(jobSkills.jobPostingId, jobId), eq(jobSkills.userId, userId)))
    .orderBy(asc(jobSkills.sortOrder));
  const levels = await getUserSkillMap(
    tx,
    userId,
    rows.map((r) => r.skillSlug),
  );
  return rows.map((r) => {
    const u = levels.get(r.skillSlug) ?? null;
    return {
      id: r.id,
      skillName: r.skillName,
      skillSlug: r.skillSlug,
      category: r.category,
      requirementType: r.requirementType,
      requiredLevel: r.requiredLevel,
      importance: r.importance,
      originalPhrase: r.originalPhrase,
      reason: r.reason,
      knowledge: r.nodeId && r.nodeSlug ? { id: r.nodeId, slug: r.nodeSlug, status: r.nodeStatus ?? "stub", progress: r.progress } : null,
      user: u ? { skillId: u.id, level: u.level, goalWeight: u.goalWeight, evidenceType: u.evidenceType } : null,
      priority: computePriority({
        requirementType: r.requirementType,
        requiredLevel: r.requiredLevel,
        currentLevel: u?.level ?? null,
        goalWeight: u?.goalWeight ?? 1,
      }),
    };
  });
}

// ---------------------------------------------------------------------------
// 編輯、封存、刪除
// ---------------------------------------------------------------------------

export const jobPatchSchema = jobInputSchema.partial().extend({
  status: z.enum(["active", "archived"]).optional(),
});

/** 編輯職缺欄位；內容改了之後呼叫端可選擇重新分析 */
export async function updateJob(db: Db, userId: string, jobId: string, input: unknown): Promise<JobDetail> {
  if (!isUuid(jobId)) throw notFound("這份職缺");
  const parsed = jobPatchSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const d = parsed.data;
  const set = {
    ...(d.title !== undefined ? { title: d.title } : {}),
    ...(d.company !== undefined ? { company: d.company } : {}),
    ...(d.sourceUrl !== undefined ? { sourceUrl: d.sourceUrl } : {}),
    ...(d.rawDescription !== undefined ? { rawDescription: d.rawDescription } : {}),
    ...(d.requiredSkillsRaw !== undefined ? { requiredSkillsRaw: d.requiredSkillsRaw } : {}),
    ...(d.preferredSkillsRaw !== undefined ? { preferredSkillsRaw: d.preferredSkillsRaw } : {}),
    ...(d.notes !== undefined ? { notes: d.notes } : {}),
    ...(d.status !== undefined ? { status: d.status } : {}),
  };
  if (!Object.keys(set).length) throw new AppError("no_change", "沒有要修改的欄位", 400);
  const updated = await withUser(db, userId, (tx) =>
    tx
      .update(jobPostings)
      .set(set)
      .where(and(eq(jobPostings.id, jobId), eq(jobPostings.userId, userId)))
      .returning({ id: jobPostings.id }),
  );
  if (!updated.length) throw notFound("這份職缺");
  return getJob(db, userId, jobId);
}

export async function deleteJob(db: Db, userId: string, jobId: string): Promise<void> {
  if (!isUuid(jobId)) throw notFound("這份職缺");
  const deleted = await withUser(db, userId, (tx) => tx.delete(jobPostings).where(and(eq(jobPostings.id, jobId), eq(jobPostings.userId, userId))).returning({ id: jobPostings.id }));
  if (!deleted.length) throw notFound("這份職缺");
}

// ---------------------------------------------------------------------------
// Dashboard：待補強技能（跨所有 active 職缺，已評估且有差距，取優先分數最高的）
// ---------------------------------------------------------------------------

export interface GapHighlight {
  skillName: string;
  skillSlug: string;
  knowledgeSlug: string | null;
  jobTitle: string;
  jobId: string;
  score: number;
  gap: number;
}

export async function listTopGaps(db: Db, userId: string, limit = 5): Promise<GapHighlight[]> {
  return withUser(db, userId, async (tx) => {
    const rows = await tx
      .select({
        jobId: jobPostings.id,
        jobTitle: jobPostings.title,
        skillName: jobSkills.skillName,
        skillSlug: jobSkills.skillSlug,
        requirementType: jobSkills.requirementType,
        requiredLevel: jobSkills.requiredLevel,
        knowledgeSlug: knowledgeNodes.slug,
      })
      .from(jobSkills)
      .innerJoin(jobPostings, and(eq(jobPostings.id, jobSkills.jobPostingId), eq(jobPostings.status, "active")))
      .leftJoin(knowledgeNodes, eq(knowledgeNodes.id, jobSkills.knowledgeNodeId))
      .where(eq(jobSkills.userId, userId));
    const levels = await getUserSkillMap(
      tx,
      userId,
      rows.map((r) => r.skillSlug),
    );
    const out: GapHighlight[] = [];
    for (const r of rows) {
      const u = levels.get(r.skillSlug);
      if (!u || u.level === null) continue;
      const p = computePriority({ requirementType: r.requirementType, requiredLevel: r.requiredLevel, currentLevel: u.level, goalWeight: u.goalWeight });
      if (p.score === null || (p.gap ?? 0) <= 0) continue;
      out.push({ skillName: r.skillName, skillSlug: r.skillSlug, knowledgeSlug: r.knowledgeSlug, jobTitle: r.jobTitle, jobId: r.jobId, score: p.score, gap: p.gap ?? 0 });
    }
    // 同一技能出現在多份職缺只留分數最高的
    const best = new Map<string, GapHighlight>();
    for (const g of out) if (!best.has(g.skillSlug) || best.get(g.skillSlug)!.score < g.score) best.set(g.skillSlug, g);
    return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  });
}
