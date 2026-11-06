import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockProvider } from "@/lib/ai/providers/mock";
import type { Db } from "@/lib/db/local";
import { AppError } from "@/lib/errors";
import { createJob } from "@/lib/services/jobs";
import { generateKnowledge, getKnowledge } from "@/lib/services/knowledge";
import { createPlanForJob, deletePlan, getPlan, listPlans, listWeekProgress, setPlanStatus, setTaskStatus } from "@/lib/services/plans";
import { updateProfile } from "@/lib/services/profiles";
import { upsertUserSkill } from "@/lib/services/skills";
import { createTestDb, createUser, rowsOf } from "./helpers/db";

const mock = createMockProvider({ delayMs: 0 });
const deps = { provider: mock, hourlyLimit: 20 };
const DEMO_JOB = {
  title: "Junior Full-Stack Engineer",
  rawDescription: ["使用 React / Next.js 開發前端", "使用 Node.js 建立 API", "操作 PostgreSQL", "使用 Git 進行版本控制", "了解 Docker 與雲端部署"].join("\n"),
  preferredSkillsRaw: "AWS 經驗",
};

let db: Db;
let alice: string;
let bob: string;
let jobId: string;

beforeEach(async () => {
  db = await createTestDb();
  alice = await createUser(db);
  bob = await createUser(db);
  jobId = (await createJob(db, alice, DEMO_JOB, deps)).job.id;
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

describe("學習計畫（Phase 3）", () => {
  it("沒有自評或沒有差距時不能產生計畫", async () => {
    const e = await expectAppError(createPlanForJob(db, alice, jobId, {}, deps), 400, "no_gaps");
    expect(e.message).toContain("先");
    for (const s of ["React", "Next.js", "Node.js", "RESTful API", "PostgreSQL", "Git", "Docker", "AWS"]) await upsertUserSkill(db, alice, { skillName: s, level: 4 });
    await expectAppError(createPlanForJob(db, alice, jobId, {}, deps), 400, "no_gaps");
  });

  it("依差距產生週計畫：差距大的先排、每週不超過時數、任務連到知識節點並採用知識頁的實作任務", async () => {
    await generateKnowledge(db, alice, { topic: "Docker" }, deps); // 有知識頁、有實作任務
    await upsertUserSkill(db, alice, { skillName: "Docker", level: 0 }); // 差距 2
    await upsertUserSkill(db, alice, { skillName: "React", level: 2 }); // 差距 1
    await upsertUserSkill(db, alice, { skillName: "AWS", level: 0 }); // 加分，差距 1
    await updateProfile(db, alice, { weeklyLearningMinutes: 180 });

    const plan = await createPlanForJob(db, alice, jobId, {}, deps);
    expect(plan.weeklyMinutes).toBe(180);
    expect(plan.jobPostingId).toBe(jobId);
    expect(plan.meta).toMatchObject({ provider: "mock", promptVersion: "plan-v1" });
    expect(plan.weeks.length).toBeGreaterThan(1);
    expect(plan.weeks.every((w) => w.minutes <= 180 || w.tasks.length === 1)).toBe(true);
    // Docker 優先分數 6 最高，第一週第一個任務是 Docker
    expect(plan.weeks[0].tasks[0].skillName).toBe("Docker");
    expect(plan.weeks[0].tasks[0].knowledge?.status).toBe("published");
    // 知識頁的實作任務被採用
    const titles = plan.weeks.flatMap((w) => w.tasks.map((t) => t.title));
    expect(titles).toContain("把一個 Node.js API 容器化並用 compose 接資料庫");
    // 未評估的技能不在計畫裡
    expect(plan.weeks.flatMap((w) => w.tasks.map((t) => t.skillName))).not.toContain("PostgreSQL");
    expect(plan.totalTasks).toBe(plan.weeks.reduce((n, w) => n + w.tasks.length, 0));
    expect(plan.currentWeek).toBe(1);

    const usage = rowsOf<{ kind: string; status: string }>(await db.execute(sql`select kind, status from dk.ai_usage where kind = 'learning_plan'`));
    expect(usage).toEqual([{ kind: "learning_plan", status: "succeeded" }]);
    expect((await listPlans(db, alice, { jobId })).map((p) => p.id)).toEqual([plan.id]);
  });

  it("任務開始／完成／略過；完成閱讀 → 已理解、完成實作 → 已實作，不往下降；全部完成 → 計畫完成", async () => {
    await generateKnowledge(db, alice, { topic: "Docker" }, deps);
    await upsertUserSkill(db, alice, { skillName: "Docker", level: 0 });
    const plan = await createPlanForJob(db, alice, jobId, { weeklyMinutes: 600 }, deps);
    const tasks = plan.weeks.flatMap((w) => w.tasks);
    const read = tasks.find((t) => t.taskType === "read")!;
    const code = tasks.find((t) => t.taskType === "code" || t.taskType === "project")!;

    expect((await setTaskStatus(db, alice, plan.id, read.id, { status: "in_progress" })).task.status).toBe("in_progress");
    const afterRead = await setTaskStatus(db, alice, plan.id, read.id, { status: "completed" });
    expect(afterRead.task.completedAt).not.toBeNull();
    expect((await getKnowledge(db, alice, "docker")).progress?.status).toBe("understood");

    await setTaskStatus(db, alice, plan.id, code.id, { status: "completed" });
    expect((await getKnowledge(db, alice, "docker")).progress?.status).toBe("implemented");
    // 再完成一個閱讀任務不會把 implemented 降回 understood
    await setTaskStatus(db, alice, plan.id, read.id, { status: "todo" });
    await setTaskStatus(db, alice, plan.id, read.id, { status: "completed" });
    expect((await getKnowledge(db, alice, "docker")).progress?.status).toBe("implemented");

    for (const t of tasks) if (t.id !== read.id && t.id !== code.id) await setTaskStatus(db, alice, plan.id, t.id, { status: "skipped" });
    const done = await getPlan(db, alice, plan.id);
    expect(done.status).toBe("completed");
    expect(done.weeks.every((w) => w.done)).toBe(true);
    // 把一個任務改回 todo → 計畫回到 active
    expect((await setTaskStatus(db, alice, plan.id, read.id, { status: "todo" })).planStatus).toBe("active");

    await expectAppError(setTaskStatus(db, alice, plan.id, read.id, { status: "done" }), 400);
    await expectAppError(setTaskStatus(db, bob, plan.id, read.id, { status: "completed" }), 404);
    // 任務不屬於路徑上的計畫 → 404
    await expectAppError(setTaskStatus(db, alice, randomUUID(), read.id, { status: "completed" }), 404);
  });

  it("profile 每週時數低於 30 時，計畫仍以 30 分鐘為下限產生（不會在 AI 呼叫後才寫入失敗）", async () => {
    await upsertUserSkill(db, alice, { skillName: "React", level: 1 });
    await updateProfile(db, alice, { weeklyLearningMinutes: 0 });
    const plan = await createPlanForJob(db, alice, jobId, {}, deps);
    expect(plan.weeklyMinutes).toBe(30);
    // 清單外的技能不會連到知識節點
    expect(plan.weeks.flatMap((w) => w.tasks).every((t) => t.knowledge === null || t.skillName === "React")).toBe(true);
  });

  it("Dashboard 本週進度、封存與刪除、RLS", async () => {
    await upsertUserSkill(db, alice, { skillName: "React", level: 1 });
    const plan = await createPlanForJob(db, alice, jobId, { weeklyMinutes: 60 }, deps);
    const week = await listWeekProgress(db, alice);
    expect(week).toHaveLength(1);
    expect(week[0]).toMatchObject({ planId: plan.id, week: 1, completed: 0 });
    expect(week[0].nextTask?.title).toContain("React");
    expect(await listWeekProgress(db, bob)).toEqual([]);

    await expectAppError(getPlan(db, bob, plan.id), 404);
    await expectAppError(deletePlan(db, bob, plan.id), 404);
    await setPlanStatus(db, alice, plan.id, "archived");
    expect((await getPlan(db, alice, plan.id)).status).toBe("archived");
    expect(await listWeekProgress(db, alice)).toEqual([]);

    await deletePlan(db, alice, plan.id);
    await expectAppError(getPlan(db, alice, plan.id), 404);
    const n = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from dk.learning_tasks`));
    expect(n[0].n).toBe(0);
  });

  it("刪除職缺後計畫保留，只是沒有職缺連結", async () => {
    await upsertUserSkill(db, alice, { skillName: "React", level: 1 });
    const plan = await createPlanForJob(db, alice, jobId, {}, deps);
    await db.execute(sql`delete from dk.job_postings where id = ${jobId}`);
    const after = await getPlan(db, alice, plan.id);
    expect(after.jobPostingId).toBeNull();
    expect(after.jobTitle).toBeNull();
    expect(after.totalTasks).toBeGreaterThan(0);
  });
});
