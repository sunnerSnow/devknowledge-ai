import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createMockProvider } from "@/lib/ai/providers/mock";
import type { Db } from "@/lib/db/local";
import { AppError } from "@/lib/errors";
import { createJob, deleteJob } from "@/lib/services/jobs";
import { generateKnowledge } from "@/lib/services/knowledge";
import {
  answerQuestion,
  createSession,
  deleteSession,
  endSession,
  generateQuestion,
  getPracticeStats,
  getSession,
  listReviewItems,
  listSessions,
  MAX_QUESTIONS_PER_SESSION,
  pickQuestionType,
  updateAttempt,
} from "@/lib/services/practice";
import { listUserSkills, upsertUserSkill } from "@/lib/services/skills";
import { createTestDb, createUser, rowsOf } from "./helpers/db";

const mock = createMockProvider({ delayMs: 0 });
const deps = { provider: mock, hourlyLimit: 60 };
const DEMO_JOB = {
  title: "Junior Full-Stack Engineer",
  rawDescription: ["使用 React / Next.js 開發前端", "使用 Node.js 建立 API", "操作 PostgreSQL", "了解 Docker 與雲端部署"].join("\n"),
};
const LONG_ANSWER =
  "Docker 把應用程式和它需要的執行環境打包成映像檔，用隔離的容器執行，解決「在我電腦上可以跑」的環境差異問題。核心是 image 分層與 container 的隔離；實際情境像是把 Node.js API 連同相依套件打包，在 CI 跟正式環境用同一個映像檔部署。限制是容器共用主機核心，隔離不如虛擬機，且有狀態的服務要另外處理資料持久化。";

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

describe("面試練習（Phase 4）", () => {
  it("依職缺技能建立練習：目標等級取職缺要求、連到知識頁、第一題已出；題型依模式輪流", async () => {
    await generateKnowledge(db, alice, { topic: "Docker" }, deps);
    const { session, questionError } = await createSession(db, alice, { jobId, topic: "docker", mode: "interview", questionType: "mixed" }, deps);
    expect(questionError).toBeNull();
    expect(session.topic).toBe("Docker"); // 用職缺裡的技能名稱
    expect(session.targetLevel).toBe(2); // mock 職缺分析給 Docker 要求等級 2
    expect(session.jobTitle).toBe("Junior Full-Stack Engineer");
    expect(session.knowledge?.status).toBe("published");
    expect(session.questions).toHaveLength(1);
    expect(session.currentQuestion?.questionType).toBe("concept");
    expect(session.currentQuestion?.rubric.length).toBeGreaterThanOrEqual(2);
    expect(session.canAskMore).toBe(false); // 還有一題沒答

    const usage = rowsOf<{ kind: string; status: string }>(await db.execute(sql`select kind, status from dk.ai_usage where kind like 'practice%'`));
    expect(usage).toEqual([{ kind: "practice_question", status: "succeeded" }]);

    expect(pickQuestionType({ questionType: "mixed", mode: "interview" }, 3)).toBe("coding");
    expect(pickQuestionType({ questionType: "mixed", mode: "quiz" }, 3)).toBe("concept");
    expect(pickQuestionType({ questionType: "mixed", mode: "coding" }, 1)).toBe("coding");
    expect(pickQuestionType({ questionType: "architecture", mode: "interview" }, 0)).toBe("architecture");
  });

  it("沒有職缺時：目標等級比目前自評高一級（至少 2）；知識頁不存在也能練", async () => {
    await upsertUserSkill(db, alice, { skillName: "Redis", level: 3 });
    const { session } = await createSession(db, alice, { topic: "Redis" }, deps);
    expect(session.targetLevel).toBe(4);
    expect(session.knowledge).toBeNull();
    const { session: fresh } = await createSession(db, alice, { topic: "Kafka" }, deps);
    expect(fresh.targetLevel).toBe(2);
    await expectAppError(createSession(db, alice, { topic: "   " }, deps), 400, "validation_failed");
    await expectAppError(createSession(db, alice, { jobId, topic: "Docker" }, deps).then(() => createSession(db, bob, { jobId, topic: "Docker" }, deps)), 404);
  });

  it("作答 → 四個維度的評估、平均分、遺漏重點；同一題不能答兩次；答完才能出下一題", async () => {
    const { session } = await createSession(db, alice, { jobId, topic: "Docker" }, deps);
    const q1 = session.currentQuestion!;
    await expectAppError(generateQuestion(db, alice, session.id, deps), 400, "question_pending");

    const answered = await answerQuestion(db, alice, session.id, { questionId: q1.id, answer: LONG_ANSWER }, deps);
    expect(answered.attempt).not.toBeNull();
    const f = answered.attempt!.feedback!;
    expect(Object.keys(f.scores).sort()).toEqual(["clarity", "completeness", "correctness", "reasoning"]);
    expect(answered.attempt!.score).toBeGreaterThanOrEqual(2.5); // 長回答且提到 Docker
    expect(f.related_nodes[0]).toMatchObject({ name: "Docker" });
    expect(f.summary).toContain("mock");

    await expectAppError(answerQuestion(db, alice, session.id, { questionId: q1.id, answer: "再答一次" }, deps), 409, "already_answered");
    await expectAppError(answerQuestion(db, alice, session.id, { questionId: q1.id, answer: "" }, deps), 400, "validation_failed");

    const q2 = await generateQuestion(db, alice, session.id, deps);
    expect(q2.sortOrder).toBe(1);
    expect(q2.questionType).toBe("scenario");
    expect(q2.question).not.toBe(q1.question);
    const detail = await getSession(db, alice, session.id);
    expect(detail.questionCount).toBe(2);
    expect(detail.answeredCount).toBe(1);
    expect(detail.currentQuestion?.id).toBe(q2.id);

    const usage = rowsOf<{ kind: string; n: number }>(await db.execute(sql`select kind, count(*)::int n from dk.ai_usage where kind like 'practice%' group by kind order by kind`));
    expect(usage).toEqual([
      { kind: "practice_evaluate", n: 1 },
      { kind: "practice_question", n: 2 },
    ]);
  });

  it("AI 分數不會改技能等級；使用者確認程度才寫進 My Skills（來源：面試練習）；複習清單", async () => {
    const { session } = await createSession(db, alice, { jobId, topic: "Docker" }, deps);
    const q = session.currentQuestion!;
    const answered = await answerQuestion(db, alice, session.id, { questionId: q.id, answer: "不知道。" }, deps);
    expect(answered.attempt!.score).toBeLessThan(2.5); // 短回答

    // 自評仍是未評估
    let skills = await listUserSkills(db, alice);
    expect(skills.find((s) => s.skillSlug === "docker")?.level ?? null).toBeNull();

    // 低分自動進複習清單；手動標記也會
    let review = await listReviewItems(db, alice);
    expect(review.map((r) => r.questionId)).toEqual([q.id]);
    expect(review[0].reviewFlag).toBe(false);
    const flagged = await updateAttempt(db, alice, answered.attempt!.id, { reviewFlag: true });
    expect(flagged.reviewFlag).toBe(true);

    // 使用者確認程度 → user_skills
    const confirmed = await updateAttempt(db, alice, answered.attempt!.id, { confirmedLevel: 1 });
    expect(confirmed.userConfirmedLevel).toBe(1);
    skills = await listUserSkills(db, alice);
    const docker = skills.find((s) => s.skillSlug === "docker");
    expect(docker?.level).toBe(1);
    expect(docker?.evidenceType).toBe("interview_practice");
    expect(docker?.evidenceNote).toContain("面試練習");

    await expectAppError(updateAttempt(db, alice, answered.attempt!.id, {}), 400, "validation_failed");
    await expectAppError(updateAttempt(db, bob, answered.attempt!.id, { reviewFlag: true }), 404);

    const stats = await getPracticeStats(db, alice);
    expect(stats).toEqual({ sessionCount: 1, answeredCount: 1, averageScore: answered.attempt!.score, reviewCount: 1 });
    review = await listReviewItems(db, bob);
    expect(review).toEqual([]);
  });

  it("並發：同時送兩個回答只有一個成功、同時出兩題只有一題；舊的 session 不受列表筆數限制；額度用完不建空 session", async () => {
    const { session } = await createSession(db, alice, { jobId, topic: "Docker" }, deps);
    const q = session.currentQuestion!;
    const settled = await Promise.allSettled([
      answerQuestion(db, alice, session.id, { questionId: q.id, answer: LONG_ANSWER }, deps),
      answerQuestion(db, alice, session.id, { questionId: q.id, answer: "不知道。" }, deps),
    ]);
    expect(settled.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = settled.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(AppError);
    expect((rejected.reason as AppError).status).toBe(409);

    const asked = await Promise.allSettled([generateQuestion(db, alice, session.id, deps), generateQuestion(db, alice, session.id, deps)]);
    expect(asked.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await getSession(db, alice, session.id)).questionCount).toBe(2);
    // 失敗的那次用量記成 failed，不會卡在 started
    const started = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from dk.ai_usage where status = 'started'`));
    expect(started[0].n).toBe(0);

    // 列表有筆數上限，但單一 session 仍找得到
    const { session: newer } = await createSession(db, alice, { topic: "Redis" }, deps);
    expect((await listSessions(db, alice, { limit: 1 })).map((s) => s.id)).toEqual([newer.id]);
    expect((await getSession(db, alice, session.id)).id).toBe(session.id);

    // 額度用完：不建立 session
    const before = (await listSessions(db, alice)).length;
    await expectAppError(createSession(db, alice, { topic: "Kafka" }, { ...deps, hourlyLimit: 1 }), 429, "rate_limited");
    expect((await listSessions(db, alice)).length).toBe(before);
  });

  it("結束後不能作答或出題；題數上限；RLS；刪除職缺後練習保留；刪除練習連同題目與作答", async () => {
    const { session } = await createSession(db, alice, { jobId, topic: "Docker", mode: "quiz" }, deps);
    // 答完再出，直到上限
    for (let i = 0; i < MAX_QUESTIONS_PER_SESSION; i++) {
      const detail = await getSession(db, alice, session.id);
      await answerQuestion(db, alice, session.id, { questionId: detail.currentQuestion!.id, answer: LONG_ANSWER }, deps);
      if (i < MAX_QUESTIONS_PER_SESSION - 1) await generateQuestion(db, alice, session.id, deps);
    }
    await expectAppError(generateQuestion(db, alice, session.id, deps), 400, "question_limit");
    const full = await getSession(db, alice, session.id);
    expect(full.questionCount).toBe(MAX_QUESTIONS_PER_SESSION);
    expect(full.questions.map((q) => q.questionType)).not.toContain("coding"); // quiz 模式
    expect(full.canAskMore).toBe(false);

    // 別人看不到也改不了
    await expectAppError(getSession(db, bob, session.id), 404);
    await expectAppError(endSession(db, bob, session.id), 404);
    expect(await listSessions(db, bob)).toEqual([]);

    await endSession(db, alice, session.id);
    const ended = await getSession(db, alice, session.id);
    expect(ended.status).toBe("ended");
    expect(ended.endedAt).not.toBeNull();
    await expectAppError(generateQuestion(db, alice, session.id, deps), 400, "session_ended");

    // 刪除職缺：練習保留，只是沒有職缺連結
    await deleteJob(db, alice, jobId);
    const kept = await getSession(db, alice, session.id);
    expect(kept.jobPostingId).toBeNull();
    expect(kept.jobTitle).toBeNull();

    await deleteSession(db, alice, session.id);
    await expectAppError(getSession(db, alice, session.id), 404);
    const left = rowsOf<{ n: number }>(await db.execute(sql`select (select count(*) from dk.practice_questions) + (select count(*) from dk.practice_attempts) as n`));
    expect(Number(left[0].n)).toBe(0);
  });
});
