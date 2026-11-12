import { describe, expect, it } from "vitest";
import { jobJsonSchema } from "@/lib/ai/schemas/job";
import { knowledgeJsonSchema } from "@/lib/ai/schemas/knowledge";
import { quizGradeJsonSchema } from "@/lib/ai/schemas/knowledge-quiz";
import { planJsonSchema } from "@/lib/ai/schemas/plan";
import { practiceEvaluationJsonSchema, practiceQuestionJsonSchema } from "@/lib/ai/schemas/practice";

/** 遞迴收集 schema 裡出現過的關鍵字 */
function keywords(node: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(node)) node.forEach((n) => keywords(n, acc));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k !== "properties") acc.add(k);
      keywords(v, acc);
    }
  }
  return acc;
}

describe("給 provider 的 JSON Schema", () => {
  it("沒有 Gemini 會拒絕的關鍵字（maxItems、$schema、anyOf 的 null 寫法）", () => {
    for (const schema of [knowledgeJsonSchema(), quizGradeJsonSchema(4), jobJsonSchema(), planJsonSchema(), practiceQuestionJsonSchema(), practiceEvaluationJsonSchema()]) {
      const keys = keywords(schema);
      expect(keys.has("maxItems")).toBe(false);
      expect(keys.has("$schema")).toBe(false);
      expect(keys.has("anyOf")).toBe(false);
      expect(keys.has("$ref")).toBe(false);
    }
  });
});
