import { z } from "zod";
import { toProviderJsonSchema } from "@/lib/ai/schemas/knowledge";

/**
 * 知識頁小測驗的批改輸出：每題一個判定、一句話原因；答錯或不完整時糾正誤解並給比喻。
 * results 必須和題目一樣多、順序相同（schema 依題數產生，數量不對會附錯誤重試一次）。
 */
export const QUIZ_VERDICTS = ["correct", "partial", "incorrect", "unanswered"] as const;
export type QuizVerdict = (typeof QUIZ_VERDICTS)[number];

export const QUIZ_VERDICT_LABELS: Record<QuizVerdict, string> = {
  correct: "答對",
  partial: "部分正確",
  incorrect: "答錯",
  unanswered: "不知道",
};

const shortText = (max: number) => z.string().trim().min(1).max(max);

const quizResultSchema = z.object({
  verdict: z.enum(QUIZ_VERDICTS).describe("correct 答對、partial 方向對但不完整、incorrect 答錯、unanswered 寫不知道或空白"),
  reason: shortText(200).describe("一句話原因"),
  correction: z
    .string()
    .trim()
    .max(400)
    .nullable()
    .describe("答對時 null；其他情況先肯定回答裡對的直覺，再用「你說 X，正確是 Y，因為 Z」糾正；不知道就直接用一句話講清楚"),
  analogy: z.string().trim().max(200).nullable().describe("答對時 null；其他情況給一個幫助記住正確觀念的生活比喻"),
});

export function quizGradeSchema(questionCount: number) {
  return z.object({
    results: z.array(quizResultSchema).length(questionCount).describe("依題目順序，每題一筆"),
    summary: shortText(300).describe("一兩句總評：先肯定做對的地方，再說下一步要回頭看什麼"),
  });
}

export type QuizGradeOutput = z.infer<ReturnType<typeof quizGradeSchema>>;
export type QuizResult = QuizGradeOutput["results"][number];

export function quizGradeJsonSchema(questionCount: number): Record<string, unknown> {
  return toProviderJsonSchema(z.toJSONSchema(quizGradeSchema(questionCount), { target: "draft-2020-12" }));
}
