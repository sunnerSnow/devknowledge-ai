import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { knowledgeContentSchema, knowledgeJsonSchema, storedKnowledgeContentSchema } from "@/lib/ai/schemas/knowledge";
import { genericContent } from "@/lib/ai/providers/mock";

const FIXTURE_DIR = path.join(process.cwd(), "src", "lib", "ai", "fixtures", "knowledge");

describe("知識頁 schema", () => {
  it("所有 fixtures 都符合 schema", async () => {
    const files = (await readdir(FIXTURE_DIR)).filter((f) => f.endsWith(".json"));
    expect(files.sort()).toEqual(["aws.json", "docker.json", "llm.json", "rag.json"]);
    for (const file of files) {
      const json: unknown = JSON.parse(await readFile(path.join(FIXTURE_DIR, file), "utf8"));
      const parsed = knowledgeContentSchema.safeParse(json);
      expect(parsed.success, `${file}: ${parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3))}`).toBe(true);
    }
  });

  it("mock 的通用範本也符合 schema", () => {
    expect(knowledgeContentSchema.safeParse(genericContent("Kubernetes")).success).toBe(true);
  });

  it("拒絕不支援的 mermaid 圖與超長內容", () => {
    const base = genericContent("x");
    expect(knowledgeContentSchema.safeParse({ ...base, architecture: { mermaid: "pie title x", description: "d" } }).success).toBe(false);
    expect(knowledgeContentSchema.safeParse({ ...base, summary: "a".repeat(501) }).success).toBe(false);
    expect(knowledgeContentSchema.safeParse({ ...base, sections: [] }).success).toBe(false);
  });

  it("生成時快速理解與小測驗必填，小測驗 3～5 題", () => {
    const base = genericContent("x");
    const noQuickTake: Record<string, unknown> = { ...base };
    delete noQuickTake.quick_take;
    expect(knowledgeContentSchema.safeParse(noQuickTake).success).toBe(false);
    expect(knowledgeContentSchema.safeParse({ ...base, quiz: base.quiz.slice(0, 2) }).success).toBe(false);
    expect(knowledgeContentSchema.safeParse({ ...base, quiz: [...base.quiz, ...base.quiz] }).success).toBe(false);
    expect(knowledgeContentSchema.safeParse({ ...base, quick_take: { ...base.quick_take, core: "a".repeat(121) } }).success).toBe(false);
  });

  it("讀取舊版（knowledge-v1）內容：沒有快速理解與小測驗也能解析，補成 null 與空陣列", () => {
    const v1: Record<string, unknown> = { ...genericContent("x") };
    delete v1.quick_take;
    delete v1.quiz;
    const parsed = storedKnowledgeContentSchema.safeParse(v1);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.quick_take).toBeNull();
    expect(parsed.data?.quiz).toEqual([]);
    // 新版內容照樣解析
    const v2 = storedKnowledgeContentSchema.safeParse(genericContent("x"));
    expect(v2.success && v2.data.quiz.length).toBe(3);
  });

  it("給 provider 的 JSON Schema：沒有 $schema，nullable 用 type 陣列而不是 anyOf", () => {
    const schema = knowledgeJsonSchema();
    expect(schema.$schema).toBeUndefined();
    expect(JSON.stringify(schema)).not.toContain('"anyOf"');
    const props = schema.properties as Record<string, { type?: unknown; properties?: Record<string, { type?: unknown }> }>;
    expect(props.english_name.type).toEqual(["string", "null"]);
    expect(props.architecture.type).toEqual(["object", "null"]);
    expect(props.quick_take.type).toBe("object");
    expect(props.quick_take.properties?.key_numbers.type).toEqual(["string", "null"]);
    expect(props.quiz.type).toBe("array");
    expect((schema.required as string[]).length).toBe(Object.keys(props).length);
  });
});
