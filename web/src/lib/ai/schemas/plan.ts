import { z } from "zod";
import { toProviderJsonSchema } from "@/lib/ai/schemas/knowledge";
import { TASK_TYPES } from "@/lib/db/schema";

/**
 * AI 學習計畫的結構化輸出（規格 7.3）：每週的任務、依賴順序、可驗證成果。
 * 任務的 skill 必須是輸入差距清單裡的技能名稱；程式會以 slug 對回去，對不上的任務仍保留但不連技能。
 */
const shortText = (max: number) => z.string().trim().min(1).max(max);

export const planTaskSchema = z.object({
  skill: shortText(80).describe("對應差距清單裡的技能名稱"),
  title: shortText(160),
  description: shortText(1500).describe("具體要做什麼；可引用知識頁"),
  task_type: z.enum(TASK_TYPES).describe("read 閱讀、quiz 測驗、code 練習、project 專案、review 複習"),
  estimated_minutes: z.number().int().min(5).max(1200),
  verification: shortText(500).describe("怎麼驗證自己做到了（可檢查的成果）"),
});

export const learningPlanSchema = z.object({
  title: shortText(120),
  goal: shortText(600).describe("這份計畫要達成的目標，對應職缺"),
  summary: shortText(1500).describe("整體策略：先學什麼、為什麼"),
  weeks: z
    .array(
      z.object({
        week: z.number().int().min(1).max(52),
        focus: shortText(200).describe("本週重點"),
        tasks: z.array(planTaskSchema).min(1).max(8),
      }),
    )
    .min(1)
    .max(16),
  notes: z.array(shortText(300)).max(6).describe("假設、提醒（例如時數不夠時的取捨）"),
});

export type LearningPlanOutput = z.infer<typeof learningPlanSchema>;

export function planJsonSchema(): Record<string, unknown> {
  return toProviderJsonSchema(z.toJSONSchema(learningPlanSchema, { target: "draft-2020-12" }));
}
