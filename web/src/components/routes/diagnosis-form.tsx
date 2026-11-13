"use client";

import { useRouter } from "next/navigation";
import { QuizAnswerForm } from "@/components/quiz/quiz-answer-form";

/** 診斷題作答：POST /api/routes/[id]/diagnosis/answers，批改完重新整理頁面顯示結果 */
export function DiagnosisForm({ routeId, questions }: { routeId: string; questions: { skill: string; question: string }[] }) {
  const router = useRouter();

  async function submit(answers: string[]): Promise<string | null> {
    try {
      const res = await fetch(`/api/routes/${routeId}/diagnosis/answers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const json = (await res.json()) as { data: unknown; error: { message: string } | null };
      if (!res.ok || !json.data) return json.error?.message ?? "批改失敗，請稍後再試";
      router.refresh();
      return null;
    } catch {
      return "連線失敗，請檢查網路後再試";
    }
  }

  return (
    <QuizAnswerForm
      questions={questions.map((q) => ({ text: q.question, tag: q.skill }))}
      idPrefix="diagnosis"
      intro={
        <>
          每題用 1～3 句回答就好，<strong className="font-medium text-foreground">不會的直接寫「不知道」</strong>——診斷是為了知道從哪裡開始教，不是考試。交卷後 AI 會逐題說明正確觀念，並估出每個技能的初步程度。
        </>
      }
      submitLabel="交卷，開始診斷"
      onSubmit={submit}
    />
  );
}
