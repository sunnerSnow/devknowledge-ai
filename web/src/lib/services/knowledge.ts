import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import { KNOWLEDGE_PROMPT_VERSION, KNOWLEDGE_SYSTEM_PROMPT, knowledgeRetryPrompt, knowledgeUserPrompt } from "@/lib/ai/prompts/knowledge-v1";
import { type AiProvider, AiOutputError, AiUnavailableError } from "@/lib/ai/provider";
import { type KnowledgeContent, knowledgeContentSchema, knowledgeJsonSchema } from "@/lib/ai/schemas/knowledge";
import type { Db } from "@/lib/db/local";
import {
  knowledgeContents,
  knowledgeNodes,
  knowledgeRelations,
  type NodeStatus,
  PROGRESS_STATUSES,
  type ProgressStatus,
  profiles,
  type RelationType,
  userKnowledgeProgress,
} from "@/lib/db/schema";
import { isUuid, type Tx, withService, withUser } from "@/lib/db/with-user";
import { AppError, issuesFromZod, notFound, validationFailed } from "@/lib/errors";
import { cleanTopic, normalizeSlug, TOPIC_MAX_LENGTH } from "@/lib/knowledge/slug";
import { assertUsageWithinLimit, finishUsage, startUsage } from "@/lib/services/usage";

// ---------------------------------------------------------------------------
// 型別
// ---------------------------------------------------------------------------

export interface KnowledgeNodeSummary {
  id: string;
  slug: string;
  name: string;
  englishName: string | null;
  category: string | null;
  summary: string | null;
  status: NodeStatus;
  /** 正在生成（第一次或重新生成） */
  generating: boolean;
  updatedAt: string;
  progress: { status: ProgressStatus; confidence: number | null } | null;
}

export interface KnowledgeRelationItem {
  type: RelationType;
  reason: string | null;
  node: Pick<KnowledgeNodeSummary, "id" | "slug" | "name" | "category" | "status" | "progress">;
}

export interface KnowledgeDetail extends KnowledgeNodeSummary {
  aliases: string[];
  content: KnowledgeContent | null;
  contentMeta: { version: number; provider: string; modelName: string | null; promptVersion: string; createdAt: string } | null;
  relations: KnowledgeRelationItem[];
  /** 哪些知識頁把這一頁列為前置知識 */
  neededBy: KnowledgeRelationItem["node"][];
  lastViewedAt: string | null;
}

export interface GenerateDeps {
  provider: AiProvider;
  hourlyLimit: number;
}

const MAX_OUTPUT_TOKENS = 8192;
/**
 * 整個生成（含格式錯誤後的重試）的總預算；要低於 API 路由的 maxDuration（120 秒），平台才不會在 catch 之前砍掉請求。
 * 單次呼叫最多用掉剩餘預算；剩餘不足 MIN_RETRY_MS 就不再重試。
 */
const TOTAL_BUDGET_MS = 110_000;
const MIN_RETRY_MS = 25_000;
const MAX_ATTEMPTS = 2;
/**
 * 「生成中」佔位超過這個時間就視為逾時、可被接手。
 * 必須明顯大於最壞耗時（TOTAL_BUDGET_MS 加上資料庫往返），否則同一主題會被兩個請求同時生成。
 */
const STALE_MINUTES = 5;

// ---------------------------------------------------------------------------
// 輸入驗證
// ---------------------------------------------------------------------------

const topicSchema = z
  .string({ error: "請輸入技術名詞" })
  .transform(cleanTopic)
  .pipe(z.string().min(1, "請輸入技術名詞").max(TOPIC_MAX_LENGTH, `技術名詞最多 ${TOPIC_MAX_LENGTH} 個字`))
  .refine((t) => normalizeSlug(t).length > 0, "技術名詞需要包含字母或數字");

export const generateInputSchema = z.object({
  topic: topicSchema,
  regenerate: z.boolean().optional().default(false),
});

export const searchQuerySchema = z
  .string({ error: "請輸入要搜尋的技術名詞" })
  .transform(cleanTopic)
  .pipe(z.string().min(1, "請輸入要搜尋的技術名詞").max(TOPIC_MAX_LENGTH, `搜尋字最多 ${TOPIC_MAX_LENGTH} 個字`));

export const progressInputSchema = z.object({
  status: z.enum(PROGRESS_STATUSES, { error: "學習狀態不正確" }),
  confidence: z.number().int().min(0).max(4).nullable().optional(),
});

// ---------------------------------------------------------------------------
// 查詢
// ---------------------------------------------------------------------------

const nodeColumns = {
  id: knowledgeNodes.id,
  slug: knowledgeNodes.slug,
  name: knowledgeNodes.name,
  englishName: knowledgeNodes.englishName,
  category: knowledgeNodes.category,
  summary: knowledgeNodes.summary,
  status: knowledgeNodes.status,
  generationStartedAt: knowledgeNodes.generationStartedAt,
  updatedAt: knowledgeNodes.updatedAt,
  progressStatus: userKnowledgeProgress.status,
  progressConfidence: userKnowledgeProgress.confidence,
};

type NodeRow = {
  id: string;
  slug: string;
  name: string;
  englishName: string | null;
  category: string | null;
  summary: string | null;
  status: NodeStatus;
  generationStartedAt: string | null;
  updatedAt: string;
  progressStatus: ProgressStatus | null;
  progressConfidence: number | null;
};

function isGenerating(startedAt: string | null): boolean {
  if (!startedAt) return false;
  return Date.now() - new Date(startedAt).getTime() < STALE_MINUTES * 60_000;
}

function toSummary(row: NodeRow): KnowledgeNodeSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    englishName: row.englishName,
    category: row.category,
    summary: row.summary,
    status: row.status,
    generating: isGenerating(row.generationStartedAt),
    updatedAt: row.updatedAt,
    progress: row.progressStatus ? { status: row.progressStatus, confidence: row.progressConfidence } : null,
  };
}

/** 同一使用者的進度 join 條件（RLS 也會再擋一次） */
const progressJoin = (userId: string) => and(eq(userKnowledgeProgress.knowledgeNodeId, knowledgeNodes.id), eq(userKnowledgeProgress.userId, userId));

/**
 * 搜尋：slug／名稱完全相同 → 別名相同 → 全文檢索或模糊比對。
 * 失敗的節點（沒有任何內容）不顯示；stub 會顯示，讓使用者可以點進去生成。
 */
export async function searchKnowledge(db: Db, userId: string, query: unknown): Promise<KnowledgeNodeSummary[]> {
  const parsed = searchQuerySchema.safeParse(query);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const q = parsed.data;
  const slug = normalizeSlug(q);
  const lower = q.toLowerCase();
  const like = `%${lower.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

  // 排序：完全相同（slug／名稱）→ 別名相同 → 全文檢索分數 → 名稱
  const rank = sql<number>`case
    when ${knowledgeNodes.slug} = ${slug} or lower(${knowledgeNodes.name}) = ${lower} then 0
    when exists (select 1 from unnest(${knowledgeNodes.aliases}) a where lower(a) = ${lower}) then 1
    else 2 end`;
  const score = sql<number>`ts_rank(${knowledgeNodes}.search_vector, plainto_tsquery('simple', ${q}))`;

  const rows = await withUser(db, userId, (tx) =>
    tx
      .select({ ...nodeColumns, rank, score })
      .from(knowledgeNodes)
      .leftJoin(userKnowledgeProgress, progressJoin(userId))
      .where(
        and(
          sql`${knowledgeNodes.status} <> 'failed'`,
          sql`(${knowledgeNodes.slug} = ${slug}
            or ${knowledgeNodes}.search_vector @@ plainto_tsquery('simple', ${q})
            or ${knowledgeNodes}.search_text ilike ${like} escape '\\')`,
        ),
      )
      .orderBy(asc(rank), desc(score), asc(knowledgeNodes.name))
      .limit(20),
  );
  return rows.map(toSummary);
}

/** 依 slug 或 UUID 取得知識頁、最新內容、關聯與個人進度；同時記下最後瀏覽時間 */
export async function getKnowledge(db: Db, userId: string, slugOrId: string): Promise<KnowledgeDetail> {
  const key = slugOrId.trim();
  if (!key) throw notFound("這個知識頁");
  const where = isUuid(key) ? eq(knowledgeNodes.id, key) : eq(knowledgeNodes.slug, normalizeSlug(key));

  return withUser(db, userId, async (tx) => {
    const [row] = await tx
      .select({ ...nodeColumns, aliases: knowledgeNodes.aliases, lastViewedAt: userKnowledgeProgress.lastViewedAt })
      .from(knowledgeNodes)
      .leftJoin(userKnowledgeProgress, progressJoin(userId))
      .where(where)
      .limit(1);
    if (!row) throw notFound("這個知識頁");

    const [latest] = await tx
      .select()
      .from(knowledgeContents)
      .where(eq(knowledgeContents.knowledgeNodeId, row.id))
      .orderBy(desc(knowledgeContents.version))
      .limit(1);

    const outgoing = await tx
      .select({
        type: knowledgeRelations.relationType,
        reason: knowledgeRelations.reason,
        id: knowledgeNodes.id,
        slug: knowledgeNodes.slug,
        name: knowledgeNodes.name,
        category: knowledgeNodes.category,
        status: knowledgeNodes.status,
        progressStatus: userKnowledgeProgress.status,
        progressConfidence: userKnowledgeProgress.confidence,
      })
      .from(knowledgeRelations)
      .innerJoin(knowledgeNodes, eq(knowledgeNodes.id, knowledgeRelations.toNodeId))
      .leftJoin(userKnowledgeProgress, progressJoin(userId))
      .where(eq(knowledgeRelations.fromNodeId, row.id))
      .orderBy(knowledgeRelations.relationType, knowledgeNodes.name);

    const neededBy = await tx
      .select({
        id: knowledgeNodes.id,
        slug: knowledgeNodes.slug,
        name: knowledgeNodes.name,
        category: knowledgeNodes.category,
        status: knowledgeNodes.status,
        progressStatus: userKnowledgeProgress.status,
        progressConfidence: userKnowledgeProgress.confidence,
      })
      .from(knowledgeRelations)
      .innerJoin(knowledgeNodes, eq(knowledgeNodes.id, knowledgeRelations.fromNodeId))
      .leftJoin(userKnowledgeProgress, progressJoin(userId))
      .where(and(eq(knowledgeRelations.toNodeId, row.id), eq(knowledgeRelations.relationType, "prerequisite")))
      .orderBy(knowledgeNodes.name);

    // 記最後瀏覽時間（沒有進度列就建一列 not_started）
    const now = new Date().toISOString();
    await tx
      .insert(userKnowledgeProgress)
      .values({ userId, knowledgeNodeId: row.id, status: "not_started", lastViewedAt: now })
      .onConflictDoUpdate({ target: [userKnowledgeProgress.userId, userKnowledgeProgress.knowledgeNodeId], set: { lastViewedAt: now } });

    const content = latest ? knowledgeContentSchema.safeParse(latest.content) : null;
    const relNode = (r: (typeof outgoing)[number] | (typeof neededBy)[number]) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      category: r.category,
      status: r.status,
      progress: r.progressStatus ? { status: r.progressStatus, confidence: r.progressConfidence } : null,
    });

    return {
      ...toSummary(row),
      // 上面已經建立進度列，所以第一次瀏覽也回 not_started
      progress: row.progressStatus ? { status: row.progressStatus, confidence: row.progressConfidence } : { status: "not_started", confidence: null },
      aliases: row.aliases,
      // 舊版內容若不符現在的 schema（prompt 版本演進），當成沒有內容，頁面不會崩潰
      content: content?.success ? content.data : null,
      contentMeta: latest
        ? { version: latest.version, provider: latest.provider, modelName: latest.modelName, promptVersion: latest.promptVersion, createdAt: latest.createdAt }
        : null,
      relations: outgoing.map((r) => ({ type: r.type, reason: r.reason, node: relNode(r) })),
      neededBy: neededBy.map(relNode),
      lastViewedAt: row.lastViewedAt ?? now,
    };
  });
}

/** Dashboard：最近瀏覽的知識頁 */
export async function listRecentKnowledge(db: Db, userId: string, limit = 6): Promise<KnowledgeNodeSummary[]> {
  const rows = await withUser(db, userId, (tx) =>
    tx
      .select(nodeColumns)
      .from(userKnowledgeProgress)
      .innerJoin(knowledgeNodes, eq(knowledgeNodes.id, userKnowledgeProgress.knowledgeNodeId))
      .where(and(eq(userKnowledgeProgress.userId, userId), isNotNull(userKnowledgeProgress.lastViewedAt), sql`${knowledgeNodes.status} <> 'failed'`))
      .orderBy(desc(userKnowledgeProgress.lastViewedAt))
      .limit(limit),
  );
  return rows.map(toSummary);
}

/** 個人進度統計（Dashboard 用） */
export async function getProgressStats(db: Db, userId: string): Promise<Record<ProgressStatus, number>> {
  const rows = await withUser(db, userId, (tx) =>
    tx
      .select({ status: userKnowledgeProgress.status, n: sql<number>`count(*)::int` })
      .from(userKnowledgeProgress)
      .where(eq(userKnowledgeProgress.userId, userId))
      .groupBy(userKnowledgeProgress.status),
  );
  const stats: Record<ProgressStatus, number> = { not_started: 0, learning: 0, understood: 0, implemented: 0 };
  for (const r of rows) stats[r.status] = r.n;
  return stats;
}

// ---------------------------------------------------------------------------
// 進度
// ---------------------------------------------------------------------------

export async function setProgress(db: Db, userId: string, nodeId: string, input: unknown): Promise<{ status: ProgressStatus; confidence: number | null }> {
  const parsed = progressInputSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  if (!isUuid(nodeId)) throw notFound("這個知識頁");
  const { status, confidence } = parsed.data;
  return withUser(db, userId, async (tx) => {
    const [node] = await tx.select({ id: knowledgeNodes.id }).from(knowledgeNodes).where(eq(knowledgeNodes.id, nodeId)).limit(1);
    if (!node) throw notFound("這個知識頁");
    const [row] = await tx
      .insert(userKnowledgeProgress)
      .values({ userId, knowledgeNodeId: nodeId, status, confidence: confidence ?? null })
      .onConflictDoUpdate({
        target: [userKnowledgeProgress.userId, userKnowledgeProgress.knowledgeNodeId],
        set: { status, ...(confidence !== undefined ? { confidence } : {}) },
      })
      .returning({ status: userKnowledgeProgress.status, confidence: userKnowledgeProgress.confidence });
    return row;
  });
}

// ---------------------------------------------------------------------------
// 生成
// ---------------------------------------------------------------------------

export interface GenerateResult {
  node: KnowledgeNodeSummary;
  /** true：沒有呼叫 AI，直接回既有頁面 */
  existing: boolean;
}

/**
 * 產生知識頁（Flow A）：
 * 1. 以 slug／名稱／別名找既有節點；已發布且不是重新生成 → 直接回。
 * 2. 佔位：新節點用 insert … on conflict do nothing；既有節點用條件式 update 接手。
 *    同一個 slug 同時只會有一個請求在生成，其他人拿到 409。
 * 3. 交易外呼叫 AI（可能要幾十秒），回來後驗證、存版本、更新節點、建立關聯與 stub。
 * 4. 失敗：釋放佔位；從沒成功過的節點標 failed（搜尋不顯示），stub 與已有內容的維持原狀。
 *    佔位超過 STALE_MINUTES 視為逾時可被接手；儲存與釋放都核對自己的佔位 token，被接手的一方不會寫入或清掉別人的佔位。
 */
export async function generateKnowledge(db: Db, userId: string, input: unknown, deps: GenerateDeps): Promise<GenerateResult> {
  const parsed = generateInputSchema.safeParse(input);
  if (!parsed.success) throw validationFailed(issuesFromZod(parsed.error));
  const { topic, regenerate } = parsed.data;
  const slug = normalizeSlug(topic);

  // --- 佔位（短交易）。token 是這次佔位寫入的 generation_started_at；之後儲存與釋放都要核對它，確保仍是自己持有佔位 ---
  type Claim = { kind: "existing"; id: string } | { kind: "claimed"; id: string; token: string; usageId: string };
  const claim = await withService(db, async (tx): Promise<Claim> => {
    const existing = await findNodeByTopic(tx, slug, topic);
    if (existing && existing.status === "published" && !regenerate) return { kind: "existing", id: existing.id };

    // 使用量：同一個使用者的請求先排隊（advisory lock），檢查與寫入在同一交易，並發送出也不能超過上限
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"ai_usage:" + userId}))`);
    await assertUsageWithinLimit(tx, userId, deps.hourlyLimit);

    let claimed: { id: string; token: string | null } | undefined;
    if (existing) {
      [claimed] = await tx
        .update(knowledgeNodes)
        .set({ generationStartedAt: claimToken() })
        .where(
          and(
            eq(knowledgeNodes.id, existing.id),
            sql`(${knowledgeNodes.generationStartedAt} is null or ${knowledgeNodes.generationStartedAt} < now() - make_interval(mins => ${STALE_MINUTES}))`,
          ),
        )
        .returning({ id: knowledgeNodes.id, token: knowledgeNodes.generationStartedAt });
    } else {
      [claimed] = await tx
        .insert(knowledgeNodes)
        .values({ slug, name: topic, status: "generating", generationStartedAt: claimToken(), createdBy: userId })
        .onConflictDoNothing({ target: knowledgeNodes.slug })
        .returning({ id: knowledgeNodes.id, token: knowledgeNodes.generationStartedAt });
    }
    if (!claimed?.token) throw generatingError();

    // 佔位成功才算一次使用（失敗也算，避免用失敗請求消耗免費額度）
    const usageId = await startUsage(tx, userId, "knowledge_generate", deps.provider.name, deps.provider.model);
    return { kind: "claimed", id: claimed.id, token: claimed.token, usageId };
  });

  if (claim.kind === "existing") {
    return { node: await loadSummary(db, userId, claim.id), existing: true };
  }

  // --- 呼叫 AI（交易外）並儲存；任何一步失敗都釋放佔位、把 usage 結成 failed ---
  try {
    const profile = await withService(db, (tx) => tx.query.profiles.findFirst({ where: eq(profiles.id, userId) }));
    const { content, tokens, model } = await generateValidated(deps.provider, topic, profile?.targetRole ?? null);
    await withService(db, async (tx) => {
      // model 是實際回應的模型（可能是備用模型），不是設定裡的主要模型
      await saveGenerated(tx, { nodeId: claim.id, token: claim.token, slug, topic, userId, content, providerName: deps.provider.name, modelName: model });
      await finishUsage(tx, userId, claim.usageId, { status: "succeeded", modelName: model, ...tokens });
    });
  } catch (error) {
    await withService(db, async (tx) => {
      await finishUsage(tx, userId, claim.usageId, { status: "failed" });
      await releaseClaim(tx, claim.id, claim.token);
    }).catch(() => {
      // 釋放失敗就留給逾時機制接手；原本的錯誤比較重要
    });
    throw error;
  }

  return { node: await loadSummary(db, userId, claim.id), existing: false };
}

/** 佔位時間戳：截到毫秒，驅動程式讀回再送回資料庫比對時才不會因為微秒被捨掉而對不上 */
function claimToken() {
  return sql`date_trunc('milliseconds', clock_timestamp())`;
}

function generatingError(): AppError {
  return new AppError("generating", "這個主題正在生成中，請稍候再重新整理", 409);
}

async function loadSummary(db: Db, userId: string, id: string): Promise<KnowledgeNodeSummary> {
  const [row] = await withUser(db, userId, (tx) =>
    tx.select(nodeColumns).from(knowledgeNodes).leftJoin(userKnowledgeProgress, progressJoin(userId)).where(eq(knowledgeNodes.id, id)).limit(1),
  );
  if (!row) throw notFound("這個知識頁");
  return toSummary(row);
}

/** slug 完全相同 → 名稱／別名不分大小寫相同 */
async function findNodeByTopic(tx: Tx, slug: string, topic: string): Promise<{ id: string; status: NodeStatus } | null> {
  const lower = topic.toLowerCase();
  const [row] = await tx
    .select({ id: knowledgeNodes.id, status: knowledgeNodes.status })
    .from(knowledgeNodes)
    .where(
      sql`${knowledgeNodes.slug} = ${slug}
        or lower(${knowledgeNodes.name}) = ${lower}
        or exists (select 1 from unnest(${knowledgeNodes.aliases}) a where lower(a) = ${lower})`,
    )
    .orderBy(sql`case when ${knowledgeNodes.slug} = ${slug} then 0 else 1 end`)
    .limit(1);
  return row ?? null;
}

/**
 * 釋放佔位（只在自己仍持有時）：
 * 第一次生成失敗的節點標 failed（搜尋不顯示、可再試）；stub 維持 stub（使用者仍看得到、可再試）；已發布的維持 published。
 */
async function releaseClaim(tx: Tx, nodeId: string, token: string): Promise<void> {
  await tx
    .update(knowledgeNodes)
    .set({
      generationStartedAt: null,
      status: sql`case when ${knowledgeNodes.status} = 'generating' then 'failed' else ${knowledgeNodes.status} end`,
    })
    .where(and(eq(knowledgeNodes.id, nodeId), eq(knowledgeNodes.generationStartedAt, token)));
}

/** 呼叫 provider；JSON 解析或 schema 驗證失敗就附上錯誤再試一次 */
async function generateValidated(
  provider: AiProvider,
  topic: string,
  targetRole: string | null,
): Promise<{ content: KnowledgeContent; model: string; tokens: { inputTokens: number | null; outputTokens: number | null } }> {
  const base = knowledgeUserPrompt({ topic, level: "初學到中級", targetRole: targetRole || "全端工程師" });
  const jsonSchema = knowledgeJsonSchema();
  let user = base;
  let lastIssue = "";
  const tokens = { inputTokens: 0, outputTokens: 0 };
  let sawTokens = false;
  const deadline = Date.now() + TOTAL_BUDGET_MS;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const remaining = deadline - Date.now();
    if (attempt > 0 && remaining < MIN_RETRY_MS) break;
    const result = await provider.generateStructured({
      system: KNOWLEDGE_SYSTEM_PROMPT,
      user,
      jsonSchema,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      timeoutMs: Math.max(remaining, 1),
      hint: topic,
    });
    if (result.inputTokens !== null || result.outputTokens !== null) {
      sawTokens = true;
      tokens.inputTokens += result.inputTokens ?? 0;
      tokens.outputTokens += result.outputTokens ?? 0;
    }
    const outcome = parseContent(result.text);
    if (outcome.ok) {
      return { content: outcome.content, model: result.model, tokens: sawTokens ? tokens : { inputTokens: null, outputTokens: null } };
    }
    lastIssue = outcome.issue;
    user = knowledgeRetryPrompt(base, lastIssue);
  }
  throw new AiOutputError(lastIssue);
}

function parseContent(text: string): { ok: true; content: KnowledgeContent } | { ok: false; issue: string } {
  let json: unknown;
  try {
    json = JSON.parse(stripCodeFence(text));
  } catch {
    return { ok: false, issue: "不是合法的 JSON" };
  }
  const parsed = knowledgeContentSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      issue: issuesFromZod(parsed.error)
        .slice(0, 8)
        .map((i) => `${i.field}: ${i.message}`)
        .join("\n"),
    };
  }
  return { ok: true, content: parsed.data };
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return match ? match[1] : trimmed;
}

async function saveGenerated(
  tx: Tx,
  args: { nodeId: string; token: string; slug: string; topic: string; userId: string; content: KnowledgeContent; providerName: string; modelName: string },
): Promise<void> {
  const { nodeId, token, slug, topic, userId, content, providerName, modelName } = args;

  // 鎖住節點並確認佔位還是自己的；被接手（逾時後別人重新生成）就放棄，不寫入
  const [current] = await tx
    .select({ aliases: knowledgeNodes.aliases, name: knowledgeNodes.name, token: knowledgeNodes.generationStartedAt })
    .from(knowledgeNodes)
    .where(eq(knowledgeNodes.id, nodeId))
    .for("update");
  if (!current || current.token !== token) throw new AppError("claim_lost", "這個主題的生成已被另一個請求接手，請重新整理查看結果", 409);

  const [latest] = await tx
    .select({ version: knowledgeContents.version })
    .from(knowledgeContents)
    .where(eq(knowledgeContents.knowledgeNodeId, nodeId))
    .orderBy(desc(knowledgeContents.version))
    .limit(1);

  await tx.insert(knowledgeContents).values({
    knowledgeNodeId: nodeId,
    version: (latest?.version ?? 0) + 1,
    content,
    provider: providerName,
    modelName,
    promptVersion: KNOWLEDGE_PROMPT_VERSION,
    createdBy: userId,
  });

  // 別名：舊別名＋AI 給的＋使用者原本輸入的字（跟名稱不同時），搜尋才找得到
  const aliasSet = new Map<string, string>();
  for (const a of [...current.aliases, ...content.aliases, topic, current.name]) {
    const v = a.trim();
    if (v && v.toLowerCase() !== content.name.toLowerCase() && !aliasSet.has(v.toLowerCase())) aliasSet.set(v.toLowerCase(), v);
  }

  await tx
    .update(knowledgeNodes)
    .set({
      name: content.name,
      englishName: content.english_name,
      category: content.category,
      summary: content.summary,
      aliases: [...aliasSet.values()].slice(0, 20),
      status: "published",
      generationStartedAt: null,
    })
    .where(eq(knowledgeNodes.id, nodeId));

  // 關聯：前置知識與相關主題；對方不存在就建 stub
  const targets: { name: string; type: RelationType; reason: string | null }[] = [
    ...content.prerequisites.map((p) => ({ name: p.name, type: "prerequisite" as const, reason: p.reason })),
    ...content.related_topics.map((r) => ({ name: r.name, type: r.relation, reason: null })),
  ];
  for (const t of targets) {
    const targetSlug = normalizeSlug(t.name);
    if (!targetSlug || targetSlug === slug) continue;
    const targetId = await findOrCreateStub(tx, targetSlug, t.name, userId);
    if (!targetId || targetId === nodeId) continue;
    await tx
      .insert(knowledgeRelations)
      .values({ fromNodeId: nodeId, toNodeId: targetId, relationType: t.type, reason: t.reason })
      .onConflictDoNothing();
  }
}

async function findOrCreateStub(tx: Tx, slug: string, name: string, userId: string): Promise<string | null> {
  const existing = await findNodeByTopic(tx, slug, name);
  if (existing) return existing.id;
  const [inserted] = await tx
    .insert(knowledgeNodes)
    .values({ slug, name: name.trim(), status: "stub", createdBy: userId })
    .onConflictDoNothing({ target: knowledgeNodes.slug })
    .returning({ id: knowledgeNodes.id });
  if (inserted) return inserted.id;
  const [raced] = await tx.select({ id: knowledgeNodes.id }).from(knowledgeNodes).where(eq(knowledgeNodes.slug, slug)).limit(1);
  return raced?.id ?? null;
}

export { AiOutputError, AiUnavailableError };
