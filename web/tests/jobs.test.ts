import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockProvider } from "@/lib/ai/providers/mock";
import type { Db } from "@/lib/db/local";
import { withUser } from "@/lib/db/with-user";
import { AppError } from "@/lib/errors";
import { analyzeJob, createJob, deleteJob, getJob, listJobs, listTopGaps, updateJob } from "@/lib/services/jobs";
import { generateKnowledge, getKnowledge } from "@/lib/services/knowledge";
import { deleteUserSkill, listUserSkills, updateUserSkillById, upsertUserSkill } from "@/lib/services/skills";
import { computePriority } from "@/lib/skills/levels";
import { createTestDb, createUser, expectDbRejects, rowsOf } from "./helpers/db";

const mock = createMockProvider({ delayMs: 0 });
const deps = { provider: mock, hourlyLimit: 20 };
/** 建立並回傳職缺詳情（大部分測試不關心 analysisError） */
const create = async (...args: Parameters<typeof createJob>) => (await createJob(...args)).job;

/** 規格 14 節的 demo 職缺 */
const DEMO_JOB = {
  title: "Junior Full-Stack Engineer",
  company: "範例公司",
  sourceUrl: "https://www.104.com.tw/job/example",
  rawDescription: ["使用 React / Next.js 開發前端", "使用 Node.js 建立 API", "操作 PostgreSQL", "使用 Git 進行版本控制", "了解 Docker 與雲端部署"].join("\n"),
  preferredSkillsRaw: "AWS 經驗、單元測試",
};

let db: Db;
let alice: string;
let bob: string;

beforeEach(async () => {
  db = await createTestDb();
  alice = await createUser(db);
  bob = await createUser(db);
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

describe("優先分數（規格 5 節）", () => {
  it("必要 3 × 差距 × 目標權重；未評估不算分", () => {
    expect(computePriority({ requirementType: "required", requiredLevel: 3, currentLevel: 1, goalWeight: 1 })).toMatchObject({ score: 6, gap: 2 });
    expect(computePriority({ requirementType: "preferred", requiredLevel: 3, currentLevel: 1, goalWeight: 1 })).toMatchObject({ score: 2, gap: 2 });
    expect(computePriority({ requirementType: "required", requiredLevel: 3, currentLevel: 1, goalWeight: 1.5 })).toMatchObject({ score: 9, gap: 2 });
    expect(computePriority({ requirementType: "required", requiredLevel: 2, currentLevel: 4, goalWeight: 1 })).toMatchObject({ score: 0, gap: 0 });
    const unassessed = computePriority({ requirementType: "required", requiredLevel: 3, currentLevel: null, goalWeight: 1 });
    expect(unassessed.score).toBeNull();
    expect(unassessed.reasons.join(" ")).toContain("尚未自評");
  });
});

describe("職缺分析（Flow B）", () => {
  it("貼上職缺 → 拆出必要／加分技能、連到知識節點（沒有就建 stub）", async () => {
    await generateKnowledge(db, alice, { topic: "Docker" }, deps); // 既有知識頁
    const job = await create(db, alice, DEMO_JOB, deps);
    expect(job.title).toBe("Junior Full-Stack Engineer");
    expect(job.analysis?.seniority).toBe("junior");
    expect(job.analysisMeta?.provider).toBe("mock");

    const names = job.skills.map((s) => s.skillName);
    expect(names).toEqual(expect.arrayContaining(["React", "Next.js", "Node.js", "PostgreSQL", "Git", "Docker", "AWS", "單元測試"]));
    const required = job.skills.filter((s) => s.requirementType === "required").map((s) => s.skillName);
    const preferred = job.skills.filter((s) => s.requirementType === "preferred").map((s) => s.skillName);
    expect(required).toEqual(expect.arrayContaining(["React", "Node.js", "PostgreSQL", "Git", "Docker"]));
    expect(preferred).toEqual(expect.arrayContaining(["AWS", "單元測試"]));

    // Docker 連到既有的 published 節點；React 建成 stub
    expect(job.skills.find((s) => s.skillName === "Docker")?.knowledge?.status).toBe("published");
    expect(job.skills.find((s) => s.skillName === "React")?.knowledge?.status).toBe("stub");
    expect((await getKnowledge(db, alice, "react")).status).toBe("stub");

    // 全部未評估：不推定為 0
    expect(job.unassessedCount).toBe(job.skills.length);
    expect(job.skills.every((s) => s.user === null && s.priority.score === null)).toBe(true);
    expect(job.learningOrder).toEqual([]);

    const list = await listJobs(db, alice);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: "Junior Full-Stack Engineer", skillCount: job.skills.length, requiredCount: required.length });
  });

  it("自評後出現差距、優先順序與理由；目標權重可調", async () => {
    const job = await create(db, alice, DEMO_JOB, deps);
    const react = job.skills.find((s) => s.skillName === "React")!;
    const aws = job.skills.find((s) => s.skillName === "AWS")!;
    await upsertUserSkill(db, alice, { skillName: "React", level: 1 });
    await upsertUserSkill(db, alice, { skillName: "AWS", level: 0 });
    await upsertUserSkill(db, alice, { skillName: "Git", level: 4 });

    const after = await getJob(db, alice, job.id);
    const r = after.skills.find((s) => s.id === react.id)!;
    expect(r.user?.level).toBe(1);
    expect(r.priority).toMatchObject({ score: 3 * (react.requiredLevel - 1), gap: react.requiredLevel - 1 });
    expect(r.priority.reasons[0]).toContain("必要技能");
    const a = after.skills.find((s) => s.id === aws.id)!;
    expect(a.priority.score).toBe(1 * aws.requiredLevel);
    expect(after.skills.find((s) => s.skillName === "Git")!.priority).toMatchObject({ score: 0, gap: 0 });
    expect(after.unassessedCount).toBe(job.skills.length - 3);
    // 建議順序：只含已評估且有差距，React（必要）排在 AWS（加分）前
    expect(after.learningOrder.map((s) => s.skillName)).toEqual(["React", "AWS"]);

    await upsertUserSkill(db, alice, { skillName: "AWS", goalWeight: 3 });
    const weighted = await getJob(db, alice, job.id);
    expect(weighted.skills.find((s) => s.id === aws.id)!.priority.score).toBe(1 * aws.requiredLevel * 3);
    expect(weighted.skills.find((s) => s.id === aws.id)!.priority.reasons.join(" ")).toContain("目標權重 3");

    // Dashboard 待補強：React 必要 3×2＝6 高於 AWS 加分 1×1×3＝3
    const gaps = await listTopGaps(db, alice);
    expect(gaps.map((g) => g.skillName)).toEqual(["React", "AWS"]);
    expect(gaps[0]).toMatchObject({ score: 6, gap: 2, knowledgeSlug: "react" });
    expect(await listTopGaps(db, bob)).toEqual([]);
  });

  it("重新分析會覆寫技能但保留使用者自評；編輯欄位；封存", async () => {
    const job = await create(db, alice, DEMO_JOB, deps);
    await upsertUserSkill(db, alice, { skillName: "React", level: 2 });
    await updateJob(db, alice, job.id, { rawDescription: "使用 Vue 開發前端，操作 MySQL 資料庫，需要 Git 版本控制與 CI/CD 經驗", preferredSkillsRaw: null });
    await analyzeJob(db, alice, job.id, deps);
    const after = await getJob(db, alice, job.id);
    const names = after.skills.map((s) => s.skillName);
    expect(names).toEqual(expect.arrayContaining(["Vue", "MySQL", "Git", "CI/CD"]));
    expect(names).not.toContain("React");
    expect((await listUserSkills(db, alice)).find((s) => s.skillName === "React")?.level).toBe(2);

    await updateJob(db, alice, job.id, { status: "archived", company: "新公司" });
    const archived = await getJob(db, alice, job.id);
    expect(archived).toMatchObject({ status: "archived", company: "新公司" });
    await expectAppError(updateJob(db, alice, job.id, {}), 400, "no_change");
    await expectAppError(updateJob(db, alice, job.id, { sourceUrl: "ftp://x" }), 400, "validation_failed");
  });

  it("刪除職缺會連動刪除技能需求，不動使用者自評", async () => {
    const job = await create(db, alice, DEMO_JOB, deps);
    await upsertUserSkill(db, alice, { skillName: "React", level: 2 });
    await deleteJob(db, alice, job.id);
    await expectAppError(getJob(db, alice, job.id), 404);
    const n = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from dk.job_skills`));
    expect(n[0].n).toBe(0);
    expect((await listUserSkills(db, alice)).map((s) => s.skillName)).toEqual(["React"]);
  });

  it("輸入驗證", async () => {
    await expectAppError(createJob(db, alice, { title: "", rawDescription: DEMO_JOB.rawDescription }, deps), 400, "validation_failed");
    await expectAppError(createJob(db, alice, { title: "x", rawDescription: "太短" }, deps), 400, "validation_failed");
    await expectAppError(createJob(db, alice, { ...DEMO_JOB, sourceUrl: "javascript:alert(1)" }, deps), 400, "validation_failed");
    // 資料庫層也擋非 http(s) 的網址
    const msg = await expectDbRejects(
      withUser(db, alice, (tx) => tx.execute(sql`insert into dk.job_postings (user_id, title, source_url, raw_description) values (${alice}, 'x', 'javascript:alert(1)', 'yyyyyyyyyyyyyyyyyyyyyyyyy')`)),
    );
    expect(msg).toMatch(/check constraint/i);
  });

  it("AI 分析失敗（限流）：職缺仍建立、回傳 analysisError、沒有半成品技能，之後可重新分析", async () => {
    await create(db, alice, DEMO_JOB, { provider: mock, hourlyLimit: 1 });
    const second = await createJob(db, alice, { ...DEMO_JOB, title: "第二份" }, { provider: mock, hourlyLimit: 1 });
    expect(second.analysisError).toMatchObject({ code: "rate_limited" });
    expect(second.job.analysis).toBeNull();
    expect(second.job.skills).toEqual([]);
    expect((await listJobs(db, alice)).map((j) => j.title)).toEqual(["第二份", "Junior Full-Stack Engineer"]);
    // 額度恢復後重新分析同一筆，不需要再建一筆
    await analyzeJob(db, alice, second.job.id, deps);
    expect((await getJob(db, alice, second.job.id)).skills.length).toBeGreaterThan(0);
    const usage = rowsOf<{ status: string }>(await db.execute(sql`select status from dk.ai_usage order by created_at`));
    expect(usage.map((u) => u.status)).toEqual(["succeeded", "succeeded"]);
  });

  it("建立時遇到非預期錯誤（例如資料庫斷線）也不丟 500：職缺保留、回 internal_error", async () => {
    const boom = { name: "mock" as const, model: "boom", generateStructured: async (): Promise<never> => { throw new TypeError("connection reset"); } };
    const result = await createJob(db, alice, DEMO_JOB, { provider: boom, hourlyLimit: 20 });
    expect(result.analysisError).toMatchObject({ code: "internal_error" });
    expect(result.job.analysis).toBeNull();
    expect((await listJobs(db, alice)).length).toBe(1);
  });

  it("AI 輸出不合格：重試後失敗、usage 標 failed、原有技能保持不變", async () => {
    const job = await create(db, alice, DEMO_JOB, deps);
    const before = job.skills.map((s) => s.skillName);
    const bad = { name: "mock" as const, model: "bad", generateStructured: async () => ({ text: "not json", model: "bad", inputTokens: null, outputTokens: null }) };
    await expectAppError(analyzeJob(db, alice, job.id, { provider: bad, hourlyLimit: 20 }), 502, "ai_invalid_output");
    expect((await getJob(db, alice, job.id)).skills.map((s) => s.skillName)).toEqual(before);
    const usage = rowsOf<{ status: string }>(await db.execute(sql`select status from dk.ai_usage order by created_at`));
    expect(usage.map((u) => u.status)).toEqual(["succeeded", "failed"]);
  });

  it("RLS：看不到、改不了、刪不了別人的職缺", async () => {
    const job = await create(db, alice, DEMO_JOB, deps);
    expect(await listJobs(db, bob)).toEqual([]);
    await expectAppError(getJob(db, bob, job.id), 404);
    await expectAppError(updateJob(db, bob, job.id, { title: "偷改" }), 404);
    await expectAppError(deleteJob(db, bob, job.id), 404);
    await expectAppError(analyzeJob(db, bob, job.id, deps), 404);
    const seen = rowsOf<{ n: number }>(await withUser(db, bob, (tx) => tx.execute(sql`select count(*)::int n from dk.job_skills`)));
    expect(seen[0].n).toBe(0);
    const msg = await expectDbRejects(
      withUser(db, bob, (tx) =>
        tx.execute(sql`insert into dk.job_skills (job_posting_id, user_id, skill_name, skill_slug, requirement_type, required_level)
                       values (${job.id}, ${bob}, 'X', 'x', 'required', 1)`),
      ),
    );
    expect(msg).toMatch(/foreign key|row-level security/i);
  });
});

describe("使用者技能（My Skills）", () => {
  it("建立、更新、清除評估、刪除；連到知識節點", async () => {
    await generateKnowledge(db, alice, { topic: "Docker" }, deps);
    const created = await upsertUserSkill(db, alice, { skillName: "docker", level: 3, evidenceNote: "做過 compose" });
    expect(created).toMatchObject({ skillName: "docker", skillSlug: "docker", level: 3, evidenceType: "self_assessment", goalWeight: 1, jobCount: 0 });
    expect(created.knowledge?.slug).toBe("docker");

    const updated = await updateUserSkillById(db, alice, created.id, { level: 4, evidenceType: "project" });
    expect(updated).toMatchObject({ level: 4, evidenceType: "project", evidenceNote: "做過 compose" });
    const cleared = await upsertUserSkill(db, alice, { skillName: "Docker", level: null });
    expect(cleared.level).toBeNull();
    expect((await listUserSkills(db, alice)).length).toBe(1); // 大小寫不同仍是同一技能

    await expectAppError(upsertUserSkill(db, alice, { skillName: "Docker", level: 5 }), 400);
    await expectAppError(upsertUserSkill(db, alice, { skillName: "???" }), 400);
    await expectAppError(updateUserSkillById(db, bob, created.id, { level: 1 }), 404);

    await deleteUserSkill(db, alice, created.id);
    expect(await listUserSkills(db, alice)).toEqual([]);
    await expectAppError(deleteUserSkill(db, alice, created.id), 404);
  });

  it("依分類篩選；職缺數會算進來", async () => {
    await create(db, alice, DEMO_JOB, deps);
    await upsertUserSkill(db, alice, { skillName: "React", level: 2, category: "Frontend" });
    await upsertUserSkill(db, alice, { skillName: "PostgreSQL", level: 1, category: "Database" });
    expect((await listUserSkills(db, alice, { category: "Frontend" })).map((s) => s.skillName)).toEqual(["React"]);
    expect((await listUserSkills(db, alice)).find((s) => s.skillName === "React")?.jobCount).toBe(1);
    expect(await listUserSkills(db, bob)).toEqual([]);
  });
});
