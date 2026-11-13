import { QUIZ_VERDICT_LABELS, type QuizVerdict } from "@/lib/ai/schemas/knowledge-quiz";
import type { QuizAttemptItem } from "@/lib/services/knowledge-quiz";
import { cn } from "@/lib/utils";

const VERDICT_STYLES: Record<QuizVerdict, string> = {
  correct: "bg-soft-blue text-foreground",
  partial: "bg-soft-yellow text-foreground",
  incorrect: "border border-destructive text-destructive",
  unanswered: "bg-secondary text-muted-foreground",
};

const VERDICT_MARKS: Record<QuizVerdict, string> = { correct: "✓", partial: "△", incorrect: "✕", unanswered: "？" };

export function VerdictBadge({ verdict }: { verdict: QuizVerdict }) {
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 text-[11px] tracking-[0.12em]", VERDICT_STYLES[verdict])}>
      <span aria-hidden="true">{VERDICT_MARKS[verdict]}</span>
      {QUIZ_VERDICT_LABELS[verdict]}
    </span>
  );
}

/** 逐題批改結果：判定、你的回答、原因、觀念修正與比喻、標準答案（答對的預設收合） */
export function QuizResultList({ items }: { items: (QuizAttemptItem & { tag?: string | null })[] }) {
  return (
    <ol className="grid gap-5">
      {items.map((it, i) => (
        <li key={i} className="grid gap-4 border border-border bg-background p-5">
          <div className="flex flex-wrap items-start gap-3">
            <span className="text-xs tracking-[0.12em] text-muted-foreground tabular-nums">Q{i + 1}</span>
            <VerdictBadge verdict={it.verdict} />
            {it.tag ? <span className="bg-secondary px-2 py-0.5 text-[11px] tracking-[0.1em] text-muted-foreground">{it.tag}</span> : null}
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
  );
}
