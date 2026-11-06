import { z } from "zod";
import { KNOWLEDGE_CATEGORIES, toProviderJsonSchema } from "@/lib/ai/schemas/knowledge";

/**
 * AI 職缺分析的結構化輸出（規格 7.2）。
 * 只分析職缺需求，不推定使用者具備或缺少什麼。
 */
export const SENIORITIES = ["intern", "junior", "mid", "senior", "lead", "unknown"] as const;
export type Seniority = (typeof SENIORITIES)[number];

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const jobAnalysisSchema = z.object({
  role_summary: shortText(600).describe("一兩句話描述這個職務"),
  seniority: z.enum(SENIORITIES),
  company: z.string().trim().max(120).nullable().describe("從內文看得出的公司名稱；看不出就 null"),
  skills: z
    .array(
      z.object({
        name: shortText(80).describe("標準化技術名稱，例如 React、PostgreSQL、Docker"),
        category: z.enum(KNOWLEDGE_CATEGORIES),
        requirement_type: z.enum(["required", "preferred"]),
        required_level: z.number().int().min(0).max(4).describe("0 未接觸、1 知道概念、2 能解釋、3 能實作、4 能獨立應用"),
        importance: z.number().int().min(1).max(3),
        original_phrase: z.string().trim().max(300).nullable().describe("職缺原文中的用語"),
        reason: shortText(500),
      }),
    )
    .min(1)
    .max(30),
  responsibilities: z.array(shortText(200)).max(12),
  interview_focus: z.array(shortText(200)).max(10),
  assumptions: z.array(shortText(300)).max(8).describe("職缺資訊不足時的假設"),
});

export type JobAnalysis = z.infer<typeof jobAnalysisSchema>;

export function jobJsonSchema(): Record<string, unknown> {
  return toProviderJsonSchema(z.toJSONSchema(jobAnalysisSchema, { target: "draft-2020-12" }));
}
