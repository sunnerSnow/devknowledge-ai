import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockProvider } from "@/lib/ai/providers/mock";
import type { RoutePlanOutput } from "@/lib/ai/schemas/route";
import type { Db } from "@/lib/db/local";
import { withUser } from "@/lib/db/with-user";
import { AppError } from "@/lib/errors";
import { createJob } from "@/lib/services/jobs";
import { generateKnowledge, getKnowledge } from "@/lib/services/knowledge";
import { gradeQuiz } from "@/lib/services/knowledge-quiz";
import {
  answerDiagnosis,
  createRouteForJob,
  deleteRoute,
  generateDiagnosis,
  getRoute,
  getRouteContextForNode,
  listRoutes,
  normalizePlan,
  pickRouteSkills,
  planLessons,
  type RouteSkill,
  setRouteArchived,
} from "@/lib/services/routes";
import { upsertUserSkill } from "@/lib/services/skills";
import { createTestDb, createUser, rowsOf } from "./helpers/db";

const mock = createMockProvider({ delayMs: 0 });
const deps = { provider: mock, hourlyLimit: 100 };
/** mock 職缺分析只會挑出 Docker 與 AWS（都是必要技能、都有 mock 範例知識頁） */
const INFRA_JOB = { title: "AI Infrastructure Engineer", rawDescription: ["使用 Docker 封裝推論服務", "在 AWS 上部署"].join("\n") };

let db: Db;
let alice: string;
let bob: string;
let jobId: string;

beforeEach(async () => {
  db = await createTestDb();
  alice = await createUser(db);
  bob = await createUser(db);
  jobId = (await createJob(db, alice, INFRA_JOB, deps)).job.id;
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

/** 用知識頁自己的批改重點當回答（mock 批改看關鍵詞）→ 全對 */
async function passKnowledgeQuiz(userId: string, slug: string) {
  await generateKnowledge(db, userId, { topic: slug }, deps);
  const detail = await getKnowledge(db, userId, slug);
  const answers = detail.content!.quiz.map((q) => q.key_points.join("，"));
  const attempt = await gradeQuiz(db, userId, slug, { version: detail.contentMeta!.version, answers }, deps);
  expect(attempt.passed).toBe(true);
}

describe("學習路線：建立與診斷", () => {
  it("先出診斷題：路線在診斷階段，頁面拿到的題目不含標準答案", async () => {
    const { route, stepError } = await createRouteForJob(db, alice, jobId, { days: 3, dailyMinutes: 90 }, deps);
    expect(stepError).toBeNull();
    expect(route.stage).toBe("diagnosis");
    expect(route.status).toBe("draft");
    expect(route.skills.map((s) => s.skill)).toEqual(["Docker", "AWS"]);
    expect(route.diagnosisQuestions.length).toBe(3);
    expect(route.diagnosisQuestions.map((q) => q.skill)).toEqual(["Docker", "AWS", "Docker"]);
    expect(JSON.stringify(route.diagnosisQuestions)).not.toMatch(/標準答案|key_points/);

    const usage = rowsOf<{ kind: string; status: string }>(await db.execute(sql`select kind, status from dk.ai_usage where kind like 'route%'`));
    expect(usage).toEqual([{ kind: "route_diagnose", status: "succeeded" }]);
  });

  it("作答後估出各技能的初步程度；不能再作答或換題", async () => {
    const { route } = await createRouteForJob(db, alice, jobId, { days: 3, dailyMinutes: 90 }, deps);
    // Docker 兩題都答到關鍵詞 → 掌握基礎；AWS 不知道 → 尚未掌握
    const diagnosed = await answerDiagnosis(db, alice, route.id, { answers: ["Docker 是容器", "不知道", "Docker 映像檔要固定版本"] }, deps);
    expect(diagnosed.stage).toBe("diagnosed");
    expect(diagnosed.diagnosisResult?.levels).toEqual([
      { skill: "Docker", estimate: "solid" },
      { skill: "AWS", estimate: "none" },
    ]);
    expect(diagnosed.diagnosisResult?.items[1]).toMatchObject({ skill: "AWS", verdict: "unanswered" });
    expect(diagnosed.diagnosisResult?.items[1].correction).toBeTruthy();

    await expectAppError(answerDiagnosis(db, alice, route.id, { answers: ["a", "b", "c"] }, deps), 409, "diagnosis_done");
    await expectAppError(generateDiagnosis(db, alice, route.id, deps), 409, "diagnosis_done");
  });

  it("依診斷排課：掌握基礎的技能略過；第一課可學、之後鎖住；課程連到知識節點", async () => {
    const { route } = await createRouteForJob(db, alice, jobId, { days: 3, dailyMinutes: 90 }, deps);
    await answerDiagnosis(db, alice, route.id, { answers: ["Docker 是容器", "不知道", "Docker 映像檔要固定版本"] }, deps);
    await planLessons(db, alice, route.id, deps);
    const planned = await getRoute(db, alice, route.id);
    expect(planned.status).toBe("active");
    expect(planned.stage).toBe("learning");
    expect(planned.dayViews.flatMap((d) => d.lessons.map((l) => l.topic))).toEqual(["AWS"]);
    expect(planned.currentLesson?.topic).toBe("AWS");
    expect(planned.currentLesson?.knowledge?.slug).toBe("aws");
    expect(planned.meta?.promptVersion).toBe("route-v1");
    // 再排一次 → 擋下
    await expectAppError(planLessons(db, alice, route.id, deps), 409, "route_planned");
  });

  it("略過診斷：建立時直接排課；也可以在診斷階段略過", async () => {
    const direct = await createRouteForJob(db, alice, jobId, { days: 3, dailyMinutes: 90, diagnose: false }, deps);
    expect(direct.route.stage).toBe("learning");
    expect(direct.route.totalLessons).toBe(2);

    const { route } = await createRouteForJob(db, alice, jobId, { days: 3, dailyMinutes: 90 }, deps);
    await planLessons(db, alice, route.id, deps);
    expect((await getRoute(db, alice, route.id)).totalLessons).toBe(2);
  });

  it("沒有可排的技能（都達標）就不建立；輸入不合法擋下", async () => {
    await upsertUserSkill(db, alice, { skillName: "Docker", level: 4 });
    await upsertUserSkill(db, alice, { skillName: "AWS", level: 4 });
    await expectAppError(createRouteForJob(db, alice, jobId, { days: 3, dailyMinutes: 90 }, deps), 400, "no_gaps");
    expect(await listRoutes(db, alice)).toEqual([]);

    await expectAppError(createRouteForJob(db, alice, jobId, { days: 0, dailyMinutes: 90 }, deps), 400, "validation_failed");
    await expectAppError(createRouteForJob(db, alice, jobId, { days: 31, dailyMinutes: 90 }, deps), 400, "validation_failed");
    await expectAppError(createRouteForJob(db, alice, jobId, { days: 3, dailyMinutes: 10 }, deps), 400, "validation_failed");
  });

  it("診斷作答：題數不符、全部空白擋下，且不花 AI 額度", async () => {
    const { route } = await createRouteForJob(db, alice, jobId, { days: 3, dailyMinutes: 90 }, deps);
    await expectAppError(answerDiagnosis(db, alice, route.id, { answers: ["a"] }, deps), 400, "validation_failed");
    await expectAppError(answerDiagnosis(db, alice, route.id, { answers: ["", " ", ""] }, deps), 400, "validation_failed");
    const graded = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from dk.ai_usage where kind = 'route_grade'`));
    expect(graded[0].n).toBe(0);
  });
});

describe("學習路線：逐課解鎖", () => {
  it("小測驗全對才解鎖下一課；全部通過算完成；知識頁拿得到路線脈絡", async () => {
    const { route } = await createRouteForJob(db, alice, jobId, { days: 3, dailyMinutes: 90, diagnose: false }, deps);
    const [first, second] = route.dayViews.flatMap((d) => d.lessons);
    expect([first.topic, second.topic]).toEqual(["Docker", "AWS"]);
    expect([first.state, second.state]).toEqual(["available", "locked"]);
    expect(second.knowledge?.status).toBe("stub");

    await passKnowledgeQuiz(alice, "docker");
    let now = await getRoute(db, alice, route.id);
    expect(now.dayViews.flatMap((d) => d.lessons.map((l) => l.state))).toEqual(["passed", "available"]);
    expect(now.currentLesson?.topic).toBe("AWS");

    const ctx = await getRouteContextForNode(db, alice, route.id, first.knowledge!.id);
    expect(ctx).toMatchObject({ routeId: route.id, total: 2, lesson: { index: 1, state: "passed" }, next: { topic: "AWS", state: "available" } });

    await passKnowledgeQuiz(alice, "aws");
    now = await getRoute(db, alice, route.id);
    expect(now.stage).toBe("completed");
    expect(now.passedLessons).toBe(2);
    expect(now.currentLesson).toBeNull();
    expect((await listRoutes(db, alice))[0]).toMatchObject({ stage: "completed", passedLessons: 2, totalLessons: 2 });
  });

  it("後面的課若之前就通過過，也算通過；目前這課是第一個沒通過的", async () => {
    await passKnowledgeQuiz(alice, "aws");
    const { route } = await createRouteForJob(db, alice, jobId, { days: 3, dailyMinutes: 90, diagnose: false }, deps);
    const states = route.dayViews.flatMap((d) => d.lessons.map((l) => [l.topic, l.state]));
    expect(states).toEqual([
      ["Docker", "available"],
      ["AWS", "passed"],
    ]);
  });
});

describe("學習路線：權限、封存與刪除", () => {
  it("別人看不到、也動不了我的路線", async () => {
    const { route } = await createRouteForJob(db, alice, jobId, { days: 3, dailyMinutes: 90 }, deps);
    await expectAppError(getRoute(db, bob, route.id), 404, "not_found");
    await expectAppError(answerDiagnosis(db, bob, route.id, { answers: ["a", "b", "c"] }, deps), 404, "not_found");
    await expectAppError(planLessons(db, bob, route.id, deps), 404, "not_found");
    await expectAppError(deleteRoute(db, bob, route.id), 404, "not_found");
    expect(await listRoutes(db, bob)).toEqual([]);
    expect(await getRouteContextForNode(db, bob, route.id, route.id)).toBeNull();
    const bobSees = rowsOf<{ n: number }>(await withUser(db, bob, (tx) => tx.execute(sql`select count(*)::int n from dk.learning_routes`)));
    expect(bobSees[0].n).toBe(0);
    // 用別人的職缺建立路線
    await expectAppError(createRouteForJob(db, bob, jobId, { days: 3, dailyMinutes: 90 }, deps), 404, "not_found");
  });

  it("封存後不能診斷或排課；恢復後回到草稿；刪除會一起刪掉課程", async () => {
    const { route } = await createRouteForJob(db, alice, jobId, { days: 3, dailyMinutes: 90 }, deps);
    await setRouteArchived(db, alice, route.id, true);
    await expectAppError(planLessons(db, alice, route.id, deps), 400, "route_archived");
    await setRouteArchived(db, alice, route.id, false);
    expect((await getRoute(db, alice, route.id)).status).toBe("draft");

    await planLessons(db, alice, route.id, deps);
    await deleteRoute(db, alice, route.id);
    await expectAppError(getRoute(db, alice, route.id), 404);
    const lessons = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from dk.learning_route_lessons`));
    expect(lessons[0].n).toBe(0);
  });
});

describe("排課整理與技能挑選", () => {
  const skills: RouteSkill[] = [
    { skill: "Docker", slug: "docker", requirement: "required", requiredLevel: 2, currentLevel: null, priority: null },
    { skill: "AWS", slug: "aws", requirement: "required", requiredLevel: 2, currentLevel: null, priority: null },
  ];
  const lesson = (topic: string, skill = "Docker") => ({ topic, skill, goal: "g", estimated_minutes: 30, core: true });

  it("超過天數的課捨去、重複主題只留第一次、天數重新連續編號、技能名稱只接受清單裡的", () => {
    const output: RoutePlanOutput = {
      title: "t",
      summary: "s",
      days: [
        { day: 3, focus: "第三天", lessons: [lesson("KV Cache", "不存在的技能")] },
        { day: 1, focus: "第一天", lessons: [lesson("Docker"), lesson("docker")] },
        { day: 2, focus: "第二天", lessons: [lesson("Docker")] },
      ],
      notes: [],
    };
    // 可用 2 天：第 3 天的課超出天數被捨去（算進 dropped）；第 2 天只有重複的主題，整天消失
    const plan = normalizePlan(output, 2, skills);
    expect(plan.lessons.map((l) => [l.day, l.topic, l.skill])).toEqual([[1, "Docker", "Docker"]]);
    expect(plan.dayFocus).toEqual([{ day: 1, focus: "第一天" }]);
    expect(plan.dropped).toBe(1);

    // 可用 3 天：第 2 天消失後，第 3 天重新編號成第 2 天；不在清單裡的技能名稱設成 null
    const wide = normalizePlan(output, 3, skills);
    expect(wide.lessons.map((l) => [l.day, l.topic, l.skill])).toEqual([
      [1, "Docker", "Docker"],
      [2, "KV Cache", null],
    ]);
  });

  it("挑技能：排除已評估且達標的，必要優先、再依優先分數", () => {
    const base = { importance: 3, user: null, priority: { score: null, gap: null } };
    const picked = pickRouteSkills([
      { ...base, skillName: "加分項", skillSlug: "x", requirementType: "preferred", requiredLevel: 1 },
      { ...base, skillName: "已達標", skillSlug: "done", requirementType: "required", requiredLevel: 2, user: { level: 3 }, priority: { score: 0, gap: 0 } },
      { ...base, skillName: "未自評", skillSlug: "u", requirementType: "required", requiredLevel: 2 },
      { ...base, skillName: "差距大", skillSlug: "g", requirementType: "required", requiredLevel: 3, user: { level: 0 }, priority: { score: 9, gap: 3 } },
    ]);
    expect(picked.map((s) => s.skill)).toEqual(["差距大", "未自評", "加分項"]);
  });
});
