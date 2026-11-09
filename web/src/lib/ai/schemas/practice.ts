import { z } from "zod";
import { toProviderJsonSchema } from "@/lib/ai/schemas/knowledge";
import { QUESTION_TYPES } from "@/lib/db/schema";

/**
 * 面試練習的兩種結構化輸出（規格 4.7、7.4）：
 * - 出題：一題、題型、評分重點（好的回答該涵蓋什麼）、參考回答、相關知識主題。
 * - 評估：四個維度各 0–4 分與理由、答對的部分、遺漏的重點、建議追問、參考回答、相關知識。
 */
const shortText = (max: number) => z.string().trim().min(1).max(max);

export const practiceQuestionSchema = z.object({
  question: shortText(1200).describe("題目本身；情境題與架構題要把情境條件講清楚"),
  question_type: z.enum(QUESTION_TYPES).describe("concept 概念、scenario 情境、architecture 架構、coding 程式"),
  skill: shortText(80).describe("這題考的技能名稱，原樣使用輸入的技能"),
  rubric: z.array(shortText(200)).min(2).max(6).describe("好的回答應該涵蓋的重點，評估時逐項對照"),
  reference_answer: shortText(3000).describe("精簡的參考回答，涵蓋 rubric 的每一點"),
  knowledge_topics: z.array(shortText(80)).max(4).describe("回答這題需要的知識頁主題名稱"),
});
export type PracticeQuestionOutput = z.infer<typeof practiceQuestionSchema>;

const dimension = z.object({
  score: z.number().int().min(0).max(4),
  reason: shortText(300).describe("為什麼給這個分數，引用回答裡的內容"),
});

export const practiceEvaluationSchema = z.object({
  scores: z.object({
    correctness: dimension.describe("技術正確性"),
    completeness: dimension.describe("回答完整度（對照評分重點）"),
    reasoning: dimension.describe("推理與取捨"),
    clarity: dimension.describe("表達清晰度"),
  }),
  correct_points: z.array(shortText(200)).max(6).describe("回答中正確的部分"),
  missing_points: z.array(shortText(200)).max(6).describe("遺漏的關鍵點"),
  follow_up_questions: z.array(shortText(300)).max(3).describe("面試官可能接著問的追問"),
  reference_answer: shortText(3000),
  related_topics: z.array(shortText(80)).max(5).describe("建議回頭看的知識頁主題名稱"),
  summary: shortText(500).describe("一段總結與下一步建議；不要給總分、不要判定能力等級"),
});
export type PracticeEvaluationOutput = z.infer<typeof practiceEvaluationSchema>;

export const SCORE_DIMENSIONS = ["correctness", "completeness", "reasoning", "clarity"] as const;
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];
export const SCORE_DIMENSION_LABELS: Record<ScoreDimension, string> = {
  correctness: "技術正確性",
  completeness: "回答完整度",
  reasoning: "推理與取捨",
  clarity: "表達清晰度",
};

/** 四個維度的平均（一位小數），存進 practice_attempts.score */
export function averageScore(evaluation: PracticeEvaluationOutput): number {
  const sum = SCORE_DIMENSIONS.reduce((n, d) => n + evaluation.scores[d].score, 0);
  return Math.round((sum / SCORE_DIMENSIONS.length) * 10) / 10;
}

export function practiceQuestionJsonSchema(): Record<string, unknown> {
  return toProviderJsonSchema(z.toJSONSchema(practiceQuestionSchema, { target: "draft-2020-12" }));
}

export function practiceEvaluationJsonSchema(): Record<string, unknown> {
  return toProviderJsonSchema(z.toJSONSchema(practiceEvaluationSchema, { target: "draft-2020-12" }));
}
