import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { AiProvider, StructuredRequest, StructuredResult } from "@/lib/ai/provider";
import { createMockProvider, genericContent } from "@/lib/ai/providers/mock";
import type { Db } from "@/lib/db/local";
import { AppError } from "@/lib/errors";
import {
  AiOutputError,
  generateKnowledge,
  getKnowledge,
  getProgressStats,
  listRecentKnowledge,
  markViewed,
  searchKnowledge,
  setProgress,
} from "@/lib/services/knowledge";
import { createTestDb, createUser, rowsOf } from "./helpers/db";

let db: Db;
let alice: string;
let bob: string;
const mock = createMockProvider({ delayMs: 0 });
const deps = { provider: mock, hourlyLimit: 20 };

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

/** 可控制何時回應、回什麼的 provider */
function controlledProvider(responses: (() => Promise<string>)[]): AiProvider & { calls: StructuredRequest[] } {
  const calls: StructuredRequest[] = [];
  return {
    name: "mock",
    model: "controlled",
    calls,
    async generateStructured(request): Promise<StructuredResult> {
      calls.push(request);
      const next = responses.shift();
      if (!next) throw new Error("沒有預先準備的回應");
      return { text: await next(), model: "controlled", inputTokens: 10, outputTokens: 20 };
    },
  };
}

describe("生成知識頁（Flow A）", () => {
  it("輸入 RAG、LLM、AWS、Docker 都能生成並保存；再搜尋找得到既有頁面", async () => {
    for (const topic of ["RAG", "LLM", "AWS", "Docker"]) {
      const { node, existing } = await generateKnowledge(db, alice, { topic }, deps);
      expect(existing).toBe(false);
      expect(node.status).toBe("published");
      expect(node.generating).toBe(false);
    }
    const again = await generateKnowledge(db, alice, { topic: "rag" }, deps);
    expect(again.existing).toBe(true);
    expect(again.node.slug).toBe("rag");

    const found = await searchKnowledge(db, bob, "RAG");
    expect(found[0]?.slug).toBe("rag");
    expect(found[0]?.summary).toContain("檢索");
  });

  it("知識頁含前置知識、延伸知識、程式碼與面試題；前置知識建成 stub 並有關聯", async () => {
    await generateKnowledge(db, alice, { topic: "RAG" }, deps);
    const detail = await getKnowledge(db, alice, "rag");
    expect(detail.content?.prerequisites.map((p) => p.name)).toEqual(["LLM", "Embedding", "Vector Database"]);
    expect(detail.content?.code_examples.length).toBeGreaterThan(0);
    expect(detail.content?.interview_topics.length).toBe(3);
    expect(detail.contentMeta).toMatchObject({ version: 1, provider: "mock", promptVersion: "knowledge-v1" });

    const prereqs = detail.relations.filter((r) => r.type === "prerequisite").map((r) => r.node);
    expect(prereqs.map((n) => n.slug).sort()).toEqual(["embedding", "llm", "vector-database"]);
    expect(prereqs.every((n) => n.status === "stub")).toBe(true);
    expect(detail.relations.find((r) => r.node.slug === "fine-tuning")?.type).toBe("alternative");

    // 之後生成 LLM：stub 升級成 published，RAG 出現在 LLM 的「被誰需要」
    await generateKnowledge(db, bob, { topic: "LLM" }, deps);
    const llm = await getKnowledge(db, bob, "llm");
    expect(llm.status).toBe("published");
    expect(llm.neededBy.map((n) => n.slug)).toEqual(["rag"]);
    // LLM 的 related_topics 含 RAG（extension），不會自連、也不會重複建節點
    expect(llm.relations.find((r) => r.node.slug === "rag")?.type).toBe("extension");
  });

  it("別名與中文都搜得到；原本輸入的字會變成別名", async () => {
    await generateKnowledge(db, alice, { topic: "Retrieval Augmented Generation" }, deps);
    const detail = await getKnowledge(db, alice, "retrieval-augmented-generation");
    expect(detail.name).toBe("RAG");
    expect(detail.aliases).toContain("Retrieval Augmented Generation");
    expect(detail.aliases).toContain("檢索增強生成");

    expect((await searchKnowledge(db, alice, "檢索增強")).map((n) => n.name)).toEqual(["RAG"]);
    expect((await searchKnowledge(db, alice, "RAG")).map((n) => n.name)).toEqual(["RAG"]);
    // 以別名再生成：找到既有頁，不重複建立
    const again = await generateKnowledge(db, bob, { topic: "RAG" }, deps);
    expect(again.existing).toBe(true);
    expect(again.node.id).toBe(detail.id);
  });

  it("重新生成會新增版本，不覆寫舊版", async () => {
    await generateKnowledge(db, alice, { topic: "Docker" }, deps);
    const { node, existing } = await generateKnowledge(db, alice, { topic: "Docker", regenerate: true }, deps);
    expect(existing).toBe(false);
    const detail = await getKnowledge(db, alice, node.id);
    expect(detail.contentMeta?.version).toBe(2);
    const versions = rowsOf<{ n: number }>(await db.execute(sql`select count(*)::int n from dk.knowledge_contents`));
    expect(versions[0].n).toBe(2);
  });

  it("同一主題同時只會生成一次：第二個請求拿到 409", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow = controlledProvider([() => gate.then(() => JSON.stringify(genericContent("Kubernetes")))]);
    const first = generateKnowledge(db, alice, { topic: "Kubernetes" }, { provider: slow, hourlyLimit: 20 });
    // 等第一個請求完成佔位
    await new Promise((r) => setTimeout(r, 50));
    await expectAppError(generateKnowledge(db, bob, { topic: "kubernetes" }, deps), 409, "generating");
    const search = await searchKnowledge(db, bob, "Kubernetes");
    expect(search[0]).toMatchObject({ status: "generating", generating: true });

    release();
    const done = await first;
    expect(done.node.status).toBe("published");
  });

  it("搜尋排序：完全相同的名稱排最前面，不受字母順序影響", async () => {
    await generateKnowledge(db, alice, { topic: "RAG" }, deps);
    // 「Advanced RAG」字母順序在 RAG 前面，但只是全文檢索命中
    await generateKnowledge(db, alice, { topic: "Advanced RAG" }, deps);
    expect((await searchKnowledge(db, alice, "RAG")).map((n) => n.name)).toEqual(["RAG", "Advanced RAG"]);
    // 別名相同排在全文檢索命中前面
    await db.execute(sql`update dk.knowledge_nodes set aliases = array['zzz'] where slug = 'advanced-rag'`);
    await db.execute(sql`insert into dk.knowledge_nodes (slug, name, summary) values ('aaa', 'AAA', 'zzz 相關')`);
    expect((await searchKnowledge(db, alice, "zzz")).map((n) => n.name)).toEqual(["Advanced RAG", "AAA"]);
  });

  it("佔位逾時被接手後，原請求不會寫入也不會清掉別人的佔位", async () => {
    let releaseFirst!: () => void;
    const gate = new Promise<void>((r) => (releaseFirst = r));
    const slow = controlledProvider([() => gate.then(() => JSON.stringify({ ...genericContent("Terraform"), summary: "第一個請求的內容" }))]);
    const first = generateKnowledge(db, alice, { topic: "Terraform" }, { provider: slow, hourlyLimit: 20 });
    await new Promise((r) => setTimeout(r, 50));
    // 模擬逾時：把佔位時間往前撥
    await db.execute(sql`update dk.knowledge_nodes set generation_started_at = generation_started_at - interval '10 minutes' where slug = 'terraform'`);

    const second = await generateKnowledge(db, bob, { topic: "Terraform" }, deps);
    expect(second.node.status).toBe("published");
    const afterSecond = await getKnowledge(db, bob, "terraform");
    expect(afterSecond.contentMeta?.version).toBe(1);

    releaseFirst();
    await expectAppError(first, 409, "claim_lost");
    const final = await getKnowledge(db, alice, "terraform");
    expect(final.contentMeta?.version).toBe(1);
    expect(final.content?.summary).not.toBe("第一個請求的內容");
    expect(final.generating).toBe(false);
    expect(final.status).toBe("published");
    const usage = rowsOf<{ status: string }>(await db.execute(sql`select status from dk.ai_usage order by created_at`));
    expect(usage.map((u) => u.status).sort()).toEqual(["failed", "succeeded"]);
  });

  it("stub 生成失敗仍維持 stub，使用者可再試", async () => {
    await generateKnowledge(db, alice, { topic: "RAG" }, deps); // 建出 LLM 等 stub
    const bad = controlledProvider([async () => "x", async () => "y"]);
    await expectAppError(generateKnowledge(db, alice, { topic: "LLM" }, { provider: bad, hourlyLimit: 20 }), 502);
    const llm = await getKnowledge(db, alice, "llm");
    expect(llm.status).toBe("stub");
    expect(llm.generating).toBe(false);
    expect((await searchKnowledge(db, alice, "LLM")).map((n) => n.slug)).toContain("llm");
  });

  it("AI 輸出不合 schema：重試一次後失敗、節點標 failed、搜尋不顯示、可再試", async () => {
    const bad = controlledProvider([async () => "not json", async () => JSON.stringify({ name: "x" })]);
    const error = await expectAppError(generateKnowledge(db, alice, { topic: "GraphQL" }, { provider: bad, hourlyLimit: 20 }), 502, "ai_invalid_output");
    expect(error).toBeInstanceOf(AiOutputError);
    expect(bad.calls).toHaveLength(2);
    expect(bad.calls[1].user).toContain("不符合 JSON Schema");

    expect(await searchKnowledge(db, alice, "GraphQL")).toEqual([]);
    const usage = rowsOf<{ status: string }>(await db.execute(sql`select status from dk.ai_usage`));
    expect(usage.map((u) => u.status)).toEqual(["failed"]);

    // 佔位已釋放：再生成一次會成功
    const ok = await generateKnowledge(db, alice, { topic: "GraphQL" }, deps);
    expect(ok.node.status).toBe("published");
  });

  it("第一次輸出帶 code fence 也能解析", async () => {
    const fenced = controlledProvider([async () => "```json\n" + JSON.stringify(genericContent("Redis")) + "\n```"]);
    const { node } = await generateKnowledge(db, alice, { topic: "Redis" }, { provider: fenced, hourlyLimit: 20 });
    expect(node.status).toBe("published");
    const usage = rowsOf<{ status: string; input_tokens: number }>(await db.execute(sql`select status, input_tokens from dk.ai_usage`));
    expect(usage[0]).toEqual({ status: "succeeded", input_tokens: 10 });
  });

  it("全站每日上限：別人的用量也會算進去；既有頁面不受影響", async () => {
    await generateKnowledge(db, alice, { topic: "RAG" }, { provider: mock, hourlyLimit: 20, dailyLimit: 1 });
    const error = await expectAppError(generateKnowledge(db, bob, { topic: "Docker" }, { provider: mock, hourlyLimit: 20, dailyLimit: 1 }), 429, "rate_limited");
    expect(error.message).toContain("全站");
    expect((await generateKnowledge(db, bob, { topic: "RAG" }, { provider: mock, hourlyLimit: 20, dailyLimit: 1 })).existing).toBe(true);
    // 0 表示不限
    expect((await generateKnowledge(db, bob, { topic: "Docker" }, { provider: mock, hourlyLimit: 20, dailyLimit: 0 })).node.status).toBe("published");
  });

  it("每小時使用量上限", async () => {
    await generateKnowledge(db, alice, { topic: "RAG" }, { provider: mock, hourlyLimit: 1 });
    await expectAppError(generateKnowledge(db, alice, { topic: "Docker" }, { provider: mock, hourlyLimit: 1 }), 429, "rate_limited");
    // 既有頁面不算使用量
    expect((await generateKnowledge(db, alice, { topic: "RAG" }, { provider: mock, hourlyLimit: 1 })).existing).toBe(true);
    // 別人的額度不受影響
    expect((await generateKnowledge(db, bob, { topic: "Docker" }, { provider: mock, hourlyLimit: 1 })).node.status).toBe("published");
  });

  it("輸入驗證", async () => {
    await expectAppError(generateKnowledge(db, alice, { topic: "" }, deps), 400, "validation_failed");
    await expectAppError(generateKnowledge(db, alice, { topic: "???" }, deps), 400, "validation_failed");
    await expectAppError(generateKnowledge(db, alice, { topic: "x".repeat(65) }, deps), 400, "validation_failed");
    await expectAppError(generateKnowledge(db, alice, {}, deps), 400, "validation_failed");
    await expectAppError(searchKnowledge(db, alice, ""), 400, "validation_failed");
  });
});

describe("進度", () => {
  it("使用者可更新自己的學習狀態；別人看不到", async () => {
    const { node } = await generateKnowledge(db, alice, { topic: "Docker" }, deps);
    expect(await setProgress(db, alice, node.id, { status: "learning" })).toEqual({ status: "learning", confidence: null });
    expect(await setProgress(db, alice, node.id, { status: "understood", confidence: 2 })).toEqual({ status: "understood", confidence: 2 });

    expect((await getKnowledge(db, alice, "docker")).progress).toEqual({ status: "understood", confidence: 2 });
    expect((await getKnowledge(db, bob, "docker")).progress).toEqual({ status: "not_started", confidence: null });
    expect(await getProgressStats(db, alice)).toEqual({ not_started: 0, learning: 0, understood: 1, implemented: 0 });

    await expectAppError(setProgress(db, alice, node.id, { status: "done" }), 400);
    await expectAppError(setProgress(db, alice, "00000000-0000-4000-8000-000000000099", { status: "learning" }), 404);
    await expectAppError(setProgress(db, alice, "not-a-uuid", { status: "learning" }), 404);
  });

  it("最近瀏覽依本人瀏覽時間排序；單純查詢不算瀏覽", async () => {
    const rag = await generateKnowledge(db, alice, { topic: "RAG" }, deps);
    const docker = await generateKnowledge(db, alice, { topic: "Docker" }, deps);
    await getKnowledge(db, bob, "docker");
    expect(await listRecentKnowledge(db, bob)).toEqual([]);
    await markViewed(db, bob, docker.node.id);
    await new Promise((r) => setTimeout(r, 5));
    await markViewed(db, bob, rag.node.id);
    expect((await listRecentKnowledge(db, bob)).map((n) => n.slug)).toEqual(["rag", "docker"]);
    // 再看一次 docker 會排到前面；狀態不變
    await markViewed(db, bob, docker.node.id);
    expect((await listRecentKnowledge(db, bob)).map((n) => n.slug)).toEqual(["docker", "rag"]);
    expect((await getKnowledge(db, bob, "docker")).progress).toEqual({ status: "not_started", confidence: null });
    await expectAppError(markViewed(db, bob, "00000000-0000-4000-8000-000000000099"), 404);
  });

  it("找不到的知識頁回 404", async () => {
    await expectAppError(getKnowledge(db, alice, "nope"), 404);
    await expectAppError(getKnowledge(db, alice, "00000000-0000-4000-8000-000000000099"), 404);
  });
});
