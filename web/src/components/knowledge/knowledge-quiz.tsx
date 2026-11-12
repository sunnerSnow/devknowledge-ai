"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setProgressAction } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CtaButton } from "@/components/ui/cta-button";
import { Textarea } from "@/components/ui/textarea";
import { QUIZ_VERDICT_LABELS, type QuizVerdict } from "@/lib/ai/schemas/knowledge-quiz";
import type { ProgressStatus } from "@/lib/db/schema";
import type { QuizAttemptView } from "@/lib/services/knowledge-quiz";
import { cn } from "@/lib/utils";

const MAX = 2000;

const VERDICT_STYLES: Record<QuizVerdict, string> = {
  correct: "bg-soft-blue text-foreground",
  partial: "bg-soft-yellow text-foreground",
  incorrect: "border border-destructive text-destructive",
  unanswered: "bg-secondary text-muted-foreground",
};

const VERDICT_MARKS: Record<QuizVerdict, string> = { correct: "✓", partial: "△", incorrect: "✕", unanswered: "？" };

interface Props {
  nodeId: string;
  slug: string;
  version: number;
  questions: string[];
  initialAttempt: QuizAttemptView | null;
  progressStatus: ProgressStatus;
}

/**
 * 小測驗：一次寫完全部題目再交卷（不會寫「不知道」），AI 逐題批改並糾正誤解。
 * 標準答案只在批改後由伺服器回傳；全部答對時提供「標記為已理解」，但不會自動改進度。
 */
export function KnowledgeQuiz({ nodeId, slug, version, questions, initialAttempt, progressStatus }: Props) {
  const router = useRouter();
  const [attempt, setAttempt] = useState<QuizAttemptView | null>(initialAttempt);
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marking, startMarking] = useTransition();
  const [markError, setMarkError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (answers.every((a) => !a.trim())) {
      setError("至少回答一題；不會的寫「不知道」");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/knowledge/${nodeId}/quiz`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ version, answers }),
      });
      const json = (await res.json()) as { data: QuizAttemptView | null; error: { message: string } | null };
      if (!res.ok || !json.data) {
        setError(json.error?.message ?? "批改失敗，請稍後再試");
        return;
      }
      setAttempt(json.data);
      setAnswers(questions.map(() => ""));
    } catch {
      setError("連線失敗，請檢查網路後再試");
    } finally {
      setBusy(false);
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

  if (attempt) {
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
            alreadyUnderstood ? (
              <p className="text-xs tracking-[0.08em] text-muted-foreground">這一頁的學習狀態已經是「已理解」以上。</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" size="sm" onClick={markUnderstood} disabled={marking}>
                  {marking ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                  標記為已理解
                </Button>
                <span className="text-xs text-muted-foreground">測驗結果不會自動改學習狀態，由你確認。</span>
              </div>
            )
          ) : (
            <p className="text-xs leading-6 tracking-[0.08em] text-muted-foreground">看完下面的觀念修正，回頭讀相關段落，再測一次。全部答對再往下一個主題。</p>
          )}
          {markError ? (
            <p className="text-xs text-destructive" role="alert">
              {markError}
            </p>
          ) : null}
        </div>

        <ol className="grid gap-5">
          {attempt.items.map((it, i) => (
            <li key={i} className="grid gap-4 border border-border bg-background p-5">
              <div className="flex flex-wrap items-start gap-3">
                <span className="text-xs tracking-[0.12em] text-muted-foreground tabular-nums">Q{i + 1}</span>
                <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 text-[11px] tracking-[0.12em]", VERDICT_STYLES[it.verdict])}>
                  <span aria-hidden="true">{VERDICT_MARKS[it.verdict]}</span>
                  {QUIZ_VERDICT_LABELS[it.verdict]}
                </span>
                <p className="min-w-0 flex-1 basis-60 font-medium tracking-[0.02em]">{it.question}</p>
              </div>
              <div className="grid gap-1">
                <p className="text-xs tracking-[0.12em] text-muted-foreground">你的回答</p>
                <p className="text-sm leading-7 whitespace-pre-line text-foreground/80">{it.userAnswer || "（空白）"}</p>
              </div>
              <p className="text-sm leading-7">{it.reason}</p>
              {it.correction ? (
                <div className="border-l-2 border-primary pl-4">
                  <p className="text-xs tracking-[0.12em] text-primary">觀念修正</p>
                  <p className="mt-1 text-sm leading-7">{it.correction}</p>
                  {it.analogy ? <p className="mt-2 text-sm leading-7 text-foreground/80">比喻：{it.analogy}</p> : null}
                </div>
              ) : null}
              <details className="group border border-border bg-card" open={it.verdict !== "correct"}>
                <summary className="cursor-pointer list-none px-4 py-2.5 text-sm tracking-[0.12em]">
                  標準答案 <span className="ml-2 text-xs text-muted-foreground group-open:hidden">展開</span>
                </summary>
                <div className="grid gap-3 border-t border-border px-4 py-3">
                  <p className="text-sm leading-7 whitespace-pre-line">{it.answer}</p>
                  <ul className="flex flex-wrap gap-2" aria-label="批改重點">
                    {it.keyPoints.map((p, j) => (
                      <li key={j} className="bg-secondary px-2.5 py-0.5 text-xs tracking-[0.08em]">
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </li>
          ))}
        </ol>

        <div>
          <Button type="button" variant="outline" onClick={() => setAttempt(null)}>
            <RotateCcw className="size-4" aria-hidden="true" />
            再測一次
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-6" noValidate>
      <p className="text-sm leading-7 tracking-[0.06em] text-muted-foreground">
        讀完上面的內容後作答：用自己的話寫，計算題寫出過程；不會的寫「不知道」。交卷後 AI 會逐題批改並說明正確觀念。
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <ol className="grid gap-6">
        {questions.map((q, i) => (
          <li key={i} className="grid gap-2">
            <label htmlFor={`quiz-${i}`} className="flex gap-3 font-medium tracking-[0.02em]">
              <span className="pt-0.5 text-xs tracking-[0.12em] text-muted-foreground tabular-nums">Q{i + 1}</span>
              {q}
            </label>
            <Textarea
              id={`quiz-${i}`}
              rows={3}
              value={answers[i]}
              onChange={(e) => {
                const next = [...answers];
                next[i] = e.target.value.slice(0, MAX);
                setAnswers(next);
              }}
              placeholder="你的回答（不會就寫「不知道」）"
              className="bg-card leading-7"
              disabled={busy}
            />
          </li>
        ))}
      </ol>
      <p className="text-xs leading-6 text-muted-foreground">請不要寫入個人聯絡資料；使用 Gemini 免費方案時，內容會被 Google 用來改善產品。</p>
      <div>
        <CtaButton type="submit" disabled={busy} icon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}>
          {busy ? "AI 批改中，約 10–40 秒…" : "交卷，請 AI 批改"}
        </CtaButton>
      </div>
    </form>
  );
}
