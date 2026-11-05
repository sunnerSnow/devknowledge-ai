import { describe, expect, it } from "vitest";
import { cleanTopic, normalizeSlug } from "@/lib/knowledge/slug";

describe("normalizeSlug", () => {
  it("英文大小寫與空白", () => {
    expect(normalizeSlug("RAG")).toBe("rag");
    expect(normalizeSlug("  Retrieval Augmented   Generation ")).toBe("retrieval-augmented-generation");
    expect(normalizeSlug("CI/CD")).toBe("ci-cd");
  });

  it("保留 . + # 與中文", () => {
    expect(normalizeSlug("Node.js")).toBe("node.js");
    expect(normalizeSlug("C++")).toBe("c++");
    expect(normalizeSlug("C#")).toBe("c#");
    expect(normalizeSlug("向量資料庫")).toBe("向量資料庫");
    expect(normalizeSlug("ＡＷＳ")).toBe("aws");
  });

  it("去掉其他符號與多餘的連字號", () => {
    expect(normalizeSlug("What is (RAG)?")).toBe("what-is-rag");
    expect(normalizeSlug("--a--b--")).toBe("a-b");
    expect(normalizeSlug("!!!")).toBe("");
  });

  it("cleanTopic 去掉控制字元並壓縮空白", () => {
    expect(cleanTopic("  RAG\u0000\n  架構 ")).toBe("RAG 架構");
    expect(cleanTopic("a​b")).toBe("ab");
  });
});
