"use client";

import { Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setProgressAction } from "@/app/actions";
import { QuizAnswerForm } from "@/components/quiz/quiz-answer-form";
import { QuizResultList } from "@/components/quiz/quiz-result-list";
import { Button } from "@/components/ui/button";
import type { ProgressStatus } from "@/lib/db/schema";
import type { QuizAttemptView } from "@/lib/services/knowledge-quiz";

interface Props {
  nodeId: string;
  slug: string;
  version: number;
  questions: string[];
  initialAttempt: QuizAttemptView | null;
  progressStatus: ProgressStatus;
  /** 從學習路線進來時：全部答對後顯示「回到學習路線」 */
  routeHref?: string | null;
}

/**
 * 小測驗：一次寫完全部題目再交卷（不會寫「不知道」），AI 逐題批改並糾正誤解。
 * 標準答案只在批改後由伺服器回傳；全部答對時提供「標記為已理解」，但不會自動改進度。
 */
export function KnowledgeQuiz({ nodeId, slug, version, questions, initialAttempt, progressStatus, routeHref = null }: Props) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<QuizAttemptView | null>(initialAttempt);
  const [marking, startMarking] = useTransition();
  const [markError, setMarkError] = useState<string | null>(null);

  async function submit(answers: string[]): Promise<string | null> {
    try {
      const res = await fetch(`/api/knowledge/${nodeId}/quiz`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version, answers }),
      });
      const json = (await res.json()) as { data: QuizAttemptView | null; error: { message: string } | null };
      if (!res.ok || !json.data) return json.error?.message ?? "批改失敗，請稍後再試";
      setAttempt(json.data);
      // 學習路線的解鎖狀態依作答計算；讓伺服器元件（路線提示）重新讀取
      if (json.data.passed) router.refresh();
      return null;
    } catch {
      return "連線失敗，請檢查網路後再試";
    }
  }

  function markUnderstood() {
    setMarkError(null);
    startMarking(async () => {
      const result = await setProgressAction(nodeId, slug, "understood");
      if (result.error) setMarkError(result.error);
      else router.refresh();
    });
  }

  if (!attempt) {
    return (
      <QuizAnswerForm
        questions={questions.map((text) => ({ text }))}
        idPrefix="quiz"
        intro="讀完上面的內容後作答：用自己的話寫，計算題寫出過程；不會的寫「不知道」。交卷後 AI 會逐題批改並說明正確觀念。"
        submitLabel="交卷，請 AI 批改"
        onSubmit={submit}
      />
    );
  }

  const alreadyUnderstood = progressStatus === "understood" || progressStatus === "implemented";
  return (
    <div className="grid gap-8">
      <div className="grid gap-3 border border-border bg-card p-5" role="status">
        <p className="flex items-baseline gap-3">
          <span className="font-display text-3xl text-primary tabular-nums">
            {attempt.correctCount}
            <span className="text-base text-muted-foreground"> / {attempt.totalCount}</span>
          </span>
          <span className="text-sm tracking-[0.12em]">{attempt.passed ? "全部答對" : "題答對"}</span>
        </p>
        <p className="text-[15px] leading-8 tracking-[0.06em]">{attempt.summary}</p>
        {attempt.passed ? (
          <div className="flex flex-wrap items-center gap-3">
            {alreadyUnderstood ? (
              <p className="text-xs tracking-[0.08em] text-muted-foreground">這一頁的學習狀態已經是「已理解」以上。</p>
            ) : (
              <>
                <Button type="button" size="sm" onClick={markUnderstood} disabled={marking}>
                  {marking ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  標記為已理解
                </Button>
                <span className="text-xs text-muted-foreground">測驗結果不會自動改學習狀態，由你確認。</span>
              </>
            )}
            {routeHref ? (
              <Link href={routeHref} className="dotted-underline text-sm tracking-[0.1em] text-primary">
                回到學習路線 →
              </Link>
            ) : null}
          </div>
        ) : (
          <p className="text-xs leading-6 tracking-[0.08em] text-muted-foreground">看完下面的觀念修正，回頭讀相關段落，再測一次。全部答對再往下一個主題。</p>
        )}
        {markError ? (
          <p className="text-xs text-destructive" role="alert">
            {markError}
          </p>
        ) : null}
      </div>

      <QuizResultList items={attempt.items} />

      <div>
        <Button type="button" variant="outline" onClick={() => setAttempt(null)}>
          <RotateCcw className="size-4" aria-hidden="true" />
          再測一次
        </Button>
      </div>
    </div>
  );
}
