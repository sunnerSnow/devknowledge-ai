import { z } from "zod";

/**
 * AI 知識頁的結構化輸出（規格 7.1）。
 * 給 Gemini 的 JSON Schema 由這份 zod 產生；Gemini 會忽略 minLength／maxLength，所以回來後一定再用 zod 驗一次。
 * 可省略的欄位一律用 nullable（不是 optional）：結構化輸出要求每個屬性都出現。
 */
export const KNOWLEDGE_CATEGORIES = ["Frontend", "Backend", "Database", "Cloud", "AI", "Testing", "DevOps", "Security", "General"] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

/** 只允許這幾種圖；render 時仍用 mermaid 的 strict 模式 */
export const MERMAID_RE = /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(-v2)?|erDiagram)\b/;

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const knowledgeContentSchema = z.object({
  name: shortText(120).describe("技術名稱（常用簡稱，例如 RAG、Docker）"),
  english_name: z.string().trim().max(160).nullable().describe("英文全名；沒有就 null"),
  category: z.enum(KNOWLEDGE_CATEGORIES),
  aliases: z.array(shortText(60)).max(10).describe("別名與中文譯名，方便搜尋"),
  summary: shortText(500).describe("一句話理解"),
  why_it_matters: shortText(1500).describe("為什麼需要它"),
  prerequisites: z.array(z.object({ name: shortText(80), reason: shortText(300) })).max(8),
  sections: z
    .array(
      z.object({
        title: shortText(80),
        content_md: shortText(6000).describe("Markdown 內容，不含 HTML"),
        key_points: z.array(shortText(120)).max(8),
      }),
    )
    .min(1)
    .max(8)
    .describe("核心原理、實際使用場景等章節"),
  architecture: z
    .object({
      mermaid: z.string().trim().max(3000).regex(MERMAID_RE, "只支援 flowchart／graph／sequenceDiagram／classDiagram／stateDiagram／erDiagram"),
      description: shortText(600),
    })
    .nullable(),
  code_examples: z
    .array(
      z.object({
        language: shortText(30),
        title: shortText(120),
        description: z.string().trim().max(600).nullable().describe("執行前提與說明"),
        code: shortText(6000),
      }),
    )
    .max(4),
  comparisons: z.array(z.object({ name: shortText(80), difference: shortText(600) })).max(5),
  common_misconceptions: z.array(shortText(300)).max(6),
  interview_topics: z.array(z.object({ question: shortText(300), evaluation_points: z.array(shortText(120)).min(1).max(6) })).max(6),
  related_topics: z.array(z.object({ name: shortText(80), relation: z.enum(["related", "extension", "alternative"]) })).max(10),
  learning_tasks: z.array(z.object({ title: shortText(120), description: shortText(600), estimated_minutes: z.number().int().min(5).max(600) })).max(4),
  caveats: z.array(shortText(300)).max(6).describe("可能隨版本變動或不確定的內容"),
});

export type KnowledgeContent = z.infer<typeof knowledgeContentSchema>;

/** 給 provider 的 JSON Schema（去掉 $schema；nullable 的 anyOf 改成 type 陣列，Gemini 比較穩） */
export function knowledgeJsonSchema(): Record<string, unknown> {
  return toProviderJsonSchema(z.toJSONSchema(knowledgeContentSchema, { target: "draft-2020-12" }));
}

/**
 * 把 zod 產生的 JSON Schema 整理成 provider 接受的樣子：
 * - 去掉 $schema
 * - nullable 的 anyOf [X, null] 改成 type: [X, "null"]
 * - 去掉 maxItems：Gemini 的 responseJsonSchema 對較大的 maxItems（實測 16、30）回 400 INVALID_ARGUMENT，
 *   10 以下沒事；陣列長度一律交給 zod 在回來後驗證（超過會附錯誤重試一次）。
 */
export function toProviderJsonSchema(schema: unknown): Record<string, unknown> {
  const out = simplifyNullable(dropKey(schema, "maxItems")) as Record<string, unknown>;
  delete out.$schema;
  return out;
}

function dropKey(node: unknown, key: string): unknown {
  if (Array.isArray(node)) return node.map((n) => dropKey(n, key));
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    // properties 底下的鍵是欄位名稱，不是關鍵字
    if (k === key) continue;
    out[k] = k === "properties" && v && typeof v === "object" ? Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, dropKey(pv, key)])) : dropKey(v, key);
  }
  return out;
}

function simplifyNullable(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(simplifyNullable);
  if (!node || typeof node !== "object") return node;
  const obj = { ...(node as Record<string, unknown>) };
  const anyOf = obj.anyOf;
  if (Array.isArray(anyOf) && anyOf.length === 2) {
    const nullIdx = anyOf.findIndex((v) => v && typeof v === "object" && (v as { type?: unknown }).type === "null");
    const other = anyOf[nullIdx === 0 ? 1 : 0];
    if (nullIdx >= 0 && other && typeof other === "object" && typeof (other as { type?: unknown }).type === "string") {
      const merged = simplifyNullable(other) as Record<string, unknown>;
      delete obj.anyOf;
      return { ...obj, ...merged, type: [merged.type, "null"] };
    }
  }
  for (const key of Object.keys(obj)) obj[key] = simplifyNullable(obj[key]);
  return obj;
}
