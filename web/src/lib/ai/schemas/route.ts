import { z } from "zod";
import { toProviderJsonSchema } from "@/lib/ai/schemas/knowledge";

/**
 * 學習路線的兩種結構化輸出：
 * - 診斷題：排課前的極短題，每題對應一個技能；批改沿用知識頁小測驗的批改（見 services/knowledge-quiz.ts）。
 * - 排課：依天數把技能拆成一課一個主題，每課之後會對應一頁知識頁。
 */
const shortText = (max: number) => z.string().trim().min(1).max(max);

export const DIAGNOSIS_MIN_QUESTIONS = 3;
export const DIAGNOSIS_MAX_QUESTIONS = 6;
export const ROUTE_MAX_DAYS = 30;
export const ROUTE_MAX_LESSONS_PER_DAY = 4;
export const ROUTE_MAX_LESSONS = 40;

export const routeDiagnosisSchema = z.object({
  questions: z
    .array(
      z.object({
        skill: shortText(80).describe("這題診斷的技能，原樣使用技能清單裡的名稱"),
        question: shortText(240).describe("極短題：只考一個核心觀念，1～3 句就能回答"),
        answer: shortText(500).describe("精簡的標準答案；計算題寫出過程"),
        key_points: z.array(shortText(120)).min(1).max(3).describe("批改時對照的重點"),
      }),
    )
    .min(DIAGNOSIS_MIN_QUESTIONS)
    .max(DIAGNOSIS_MAX_QUESTIONS),
});
export type RouteDiagnosisOutput = z.infer<typeof routeDiagnosisSchema>;

export const routePlanSchema = z.object({
  title: shortText(120),
  summary: shortText(800).describe("整體策略：先學什麼、為什麼；時間不夠時省略了什麼"),
  days: z
    .array(
      z.object({
        day: z.number().int().min(1).max(ROUTE_MAX_DAYS),
        focus: shortText(120).describe("這一天的重點"),
        lessons: z
          .array(
            z.object({
              topic: shortText(80).describe("一課一個主題：可以獨立成一頁知識頁的技術名詞，例如「VRAM 計算」「KV Cache」「vLLM」"),
              skill: shortText(80).describe("對應技能清單裡的技能名稱"),
              goal: shortText(300).describe("這一課的可檢查成果，例如「能算出 70B 模型 FP16 需要的 VRAM」"),
              estimated_minutes: z.number().int().min(10).max(240).describe("讀快速理解＋做小測驗的時間"),
              core: z.boolean().describe("true＝面試必備；false＝加分內容"),
            }),
          )
          .min(1)
          .max(ROUTE_MAX_LESSONS_PER_DAY),
      }),
    )
    .min(1)
    .max(ROUTE_MAX_DAYS),
  notes: z.array(shortText(300)).max(5).describe("假設與提醒，例如省略了哪些加分主題"),
});
export type RoutePlanOutput = z.infer<typeof routePlanSchema>;

export function routeDiagnosisJsonSchema(): Record<string, unknown> {
  return toProviderJsonSchema(z.toJSONSchema(routeDiagnosisSchema, { target: "draft-2020-12" }));
}

export function routePlanJsonSchema(): Record<string, unknown> {
  return toProviderJsonSchema(z.toJSONSchema(routePlanSchema, { target: "draft-2020-12" }));
}
