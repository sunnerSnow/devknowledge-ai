import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/local";
import { EVIDENCE_TYPES, type EvidenceType, jobPostings, jobSkills, knowledgeNodes, userKnowledgeProgress, userSkills } from "@/lib/db/schema";
import { isUuid, type Tx, withService, withUser } from "@/lib/db/with-user";
import { issuesFromZod, notFound, validationFailed } from "@/lib/errors";
import { cleanTopic, normalizeSlug } from "@/lib/knowledge/slug";
import { findNodeByTopic } from "@/lib/services/knowledge";

/**
 * 使用者技能（規格 4.8、5 節）。
 * 沒有列＝未評估；level 可為 null（例如只調整了目標權重）。
 * 每個技能盡量連到知識節點（slug／名稱／別名相同），讓技能地圖可以點進知識頁。
 */
export interface UserSkill {
  id: string;
  skillName: string;
  skillSlug: string;
  category: string | null;
  level: number | null;
  evidenceType: EvidenceType;
  evidenceNote: string | null;
  confirmedByUser: boolean;
  goalWeight: number;
  updatedAt: string;
  knowledge: { id: string; slug: string; status: string; progress: string | null } | null;
  /** 有幾份職缺要求這個技能 */
  jobCount: number;
}

export const skillInputSchema = z.object({
  skillName: z
    .string({ error: "請輸入技能名稱" })
    .transform(cleanTopic)
    .pipe(z.string().min(1, "請輸入技能名稱").max(80, "技能名稱最多 80 個字"))
    .refine((v) => normalizeSlug(v).length > 0, "技能名稱需要包含字母或數字"),
  category: z.string().trim().max(40).nullable().optional(),
  /** null＝清掉評估（回到未評估） */
  level: z.number().int().min(0, "等級為 0–4").max(4, "等級為 0–4").nullable().optional(),
  evidenceType: z.enum(EVIDENCE_TYPES).optional(),
  evidenceNote: z.string().trim().max(500, "備註最多 500 個字").nullable().optional(),
  goalWeight: z.number().min(0, "目標權重 0–3").max(3, "目標權重 0–3").optional(),
});
export type SkillInput = z.input<typeof skillInputSchema>;

/** 建立或更新一個技能（以 slug 為準）；只有使用者自己能寫，AI 建議不會直接進來 */
export async function upsertUserSkill(db: Db, userId: string, input: unknown): Promise<UserSkill> {
  const parsed = skillInputSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const data = parsed.data;
  const slug = normalizeSlug(data.skillName);

  // 連知識節點用伺服器身分（知識表是共用的）
  const node = await withService(db, (tx) => findNodeByTopic(tx, slug, data.skillName));

  const id = await withUser(db, userId, async (tx) => {
    // 只更新有給的欄位；同名技能同時寫入時由 on conflict 處理，不會撞唯一鍵
    const patch = {
      ...(data.level !== undefined ? { level: data.level, confirmedByUser: true } : {}),
      ...(data.evidenceType !== undefined ? { evidenceType: data.evidenceType } : {}),
      ...(data.evidenceNote !== undefined ? { evidenceNote: data.evidenceNote } : {}),
      ...(data.goalWeight !== undefined ? { goalWeight: String(data.goalWeight) } : {}),
      ...(data.category !== undefined && data.category !== null ? { category: data.category } : {}),
      ...(node ? { knowledgeNodeId: node.id } : {}),
    };
    const [row] = await tx
      .insert(userSkills)
      .values({ userId, skillName: data.skillName, skillSlug: slug, category: data.category ?? null, knowledgeNodeId: node?.id ?? null, ...patch })
      .onConflictDoUpdate({ target: [userSkills.userId, userSkills.skillSlug], set: Object.keys(patch).length ? patch : { updatedAt: sql`now()` } })
      .returning({ id: userSkills.id });
    return row.id;
  });
  const skill = (await listUserSkills(db, userId, { ids: [id] }))[0];
  if (!skill) throw notFound("這個技能");
  return skill;
}

/** 依 user_skills 的 id 更新（規格的 PATCH /api/skills/[id]） */
export async function updateUserSkillById(db: Db, userId: string, id: string, input: unknown): Promise<UserSkill> {
  if (!isUuid(id)) throw notFound("這個技能");
  const [row] = await withUser(db, userId, (tx) => tx.select({ skillName: userSkills.skillName }).from(userSkills).where(and(eq(userSkills.id, id), eq(userSkills.userId, userId))).limit(1));
  if (!row) throw notFound("這個技能");
  const patch = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return upsertUserSkill(db, userId, { ...patch, skillName: row.skillName });
}

export async function deleteUserSkill(db: Db, userId: string, id: string): Promise<void> {
  if (!isUuid(id)) throw notFound("這個技能");
  const deleted = await withUser(db, userId, (tx) => tx.delete(userSkills).where(and(eq(userSkills.id, id), eq(userSkills.userId, userId))).returning({ id: userSkills.id }));
  if (!deleted.length) throw notFound("這個技能");
}

/** 技能清單（可依分類篩選），附知識節點與職缺數 */
export async function listUserSkills(db: Db, userId: string, filter: { category?: string | null; ids?: string[] } = {}): Promise<UserSkill[]> {
  return withUser(db, userId, async (tx) => {
    const conditions = [eq(userSkills.userId, userId)];
    if (filter.category) conditions.push(eq(userSkills.category, filter.category));
    if (filter.ids?.length) conditions.push(inArray(userSkills.id, filter.ids));
    const rows = await tx
      .select({
        id: userSkills.id,
        skillName: userSkills.skillName,
        skillSlug: userSkills.skillSlug,
        category: userSkills.category,
        level: userSkills.level,
        evidenceType: userSkills.evidenceType,
        evidenceNote: userSkills.evidenceNote,
        confirmedByUser: userSkills.confirmedByUser,
        goalWeight: userSkills.goalWeight,
        updatedAt: userSkills.updatedAt,
        nodeId: knowledgeNodes.id,
        nodeSlug: knowledgeNodes.slug,
        nodeStatus: knowledgeNodes.status,
        progress: userKnowledgeProgress.status,
        jobCount: sql<number>`(select count(distinct js.job_posting_id)::int from dk.job_skills js
          join dk.job_postings jp on jp.id = js.job_posting_id and jp.status = 'active'
          where js.user_id = ${userId} and js.skill_slug = ${userSkills.skillSlug})`,
      })
      .from(userSkills)
      .leftJoin(knowledgeNodes, eq(knowledgeNodes.id, userSkills.knowledgeNodeId))
      .leftJoin(userKnowledgeProgress, and(eq(userKnowledgeProgress.knowledgeNodeId, knowledgeNodes.id), eq(userKnowledgeProgress.userId, userId)))
      .where(and(...conditions))
      .orderBy(userSkills.category, desc(userSkills.updatedAt));
    return rows.map((r) => ({
      id: r.id,
      skillName: r.skillName,
      skillSlug: r.skillSlug,
      category: r.category,
      level: r.level,
      evidenceType: r.evidenceType,
      evidenceNote: r.evidenceNote,
      confirmedByUser: r.confirmedByUser,
      goalWeight: Number(r.goalWeight),
      updatedAt: r.updatedAt,
      knowledge: r.nodeId && r.nodeSlug ? { id: r.nodeId, slug: r.nodeSlug, status: r.nodeStatus ?? "stub", progress: r.progress } : null,
      jobCount: r.jobCount,
    }));
  });
}

/** 取某些 slug 的使用者程度（職缺差距表用） */
export async function getUserSkillMap(tx: Tx, userId: string, slugs: string[]): Promise<Map<string, { id: string; level: number | null; goalWeight: number; evidenceType: EvidenceType }>> {
  if (!slugs.length) return new Map();
  const rows = await tx
    .select({ id: userSkills.id, slug: userSkills.skillSlug, level: userSkills.level, goalWeight: userSkills.goalWeight, evidenceType: userSkills.evidenceType })
    .from(userSkills)
    .where(and(eq(userSkills.userId, userId), inArray(userSkills.skillSlug, slugs)));
  return new Map(rows.map((r) => [r.slug, { id: r.id, level: r.level, goalWeight: Number(r.goalWeight), evidenceType: r.evidenceType }]));
}

/** 技能分類（規格 4.8 的篩選） */
export const SKILL_CATEGORIES = ["Frontend", "Backend", "Database", "Cloud", "AI", "Testing", "DevOps", "Security", "General"] as const;

// 讓 jobs.ts 可以用同一張表的型別
export { jobPostings, jobSkills };
