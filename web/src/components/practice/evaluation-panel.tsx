import Link from "next/link";
import { SCORE_DIMENSION_LABELS, SCORE_DIMENSIONS } from "@/lib/ai/schemas/practice";
import type { PracticeAttemptView } from "@/lib/services/practice";

/** 作答後的評估：四個維度與理由、答對的、遺漏的、追問、參考回答、相關知識 */
export function EvaluationPanel({ attempt, referenceAnswer }: { attempt: PracticeAttemptView; referenceAnswer: string | null }) {
  const f = attempt.feedback;
  if (!f) return <p className="text-sm text-muted-foreground">這筆作答沒有評估內容。</p>;
  return (
    <div className="grid gap-8">
      <dl className="grid gap-3 sm:grid-cols-2">
        {SCORE_DIMENSIONS.map((d) => (
          <div key={d} className="border border-border bg-background p-4">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-xs tracking-[0.16em] text-muted-foreground">{SCORE_DIMENSION_LABELS[d]}</dt>
              <dd className="font-display text-2xl text-primary tabular-nums">
                {f.scores[d].score}
                <span className="text-sm text-muted-foreground"> / 4</span>
              </dd>
            </div>
            <p className="mt-2 text-[13px] leading-6 tracking-[0.04em]">{f.scores[d].reason}</p>
          </div>
        ))}
      </dl>

      <p className="text-[15px] leading-8 tracking-[0.08em]">{f.summary}</p>

      <div className="grid gap-6 sm:grid-cols-2">
        <section>
          <h4 className="text-xs tracking-[0.16em] text-primary">答對的部分</h4>
          {f.correct_points.length ? (
            <ul className="mt-3 grid gap-2 text-sm leading-6">
              {f.correct_points.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true" className="text-primary">
                    ✓
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">評估沒有列出明確答對的點。</p>
          )}
        </section>
        <section>
          <h4 className="text-xs tracking-[0.16em] text-primary">遺漏的重點</h4>
          {f.missing_points.length ? (
            <ul className="mt-3 grid gap-2 text-sm leading-6">
              {f.missing_points.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden="true" className="text-muted-foreground">
                    –
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">評分重點都有涵蓋到。</p>
          )}
        </section>
      </div>

      {f.follow_up_questions.length ? (
        <section>
          <h4 className="text-xs tracking-[0.16em] text-primary">面試官可能接著問</h4>
          <ol className="mt-3 grid gap-2 text-sm leading-6">
            {f.follow_up_questions.map((q, i) => (
              <li key={i} className="flex gap-3">
                <span className="font-display text-base text-primary tabular-nums">{i + 1}.</span>
                {q}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <details className="group border border-border bg-background">
        <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium tracking-[0.12em]">
          參考回答 <span className="ml-2 text-xs text-muted-foreground group-open:hidden">展開</span>
        </summary>
        <div className="border-t border-border px-5 py-4 text-sm leading-8 tracking-[0.06em] whitespace-pre-line">{f.reference_answer || referenceAnswer || "（無）"}</div>
      </details>

      {f.related_nodes.length ? (
        <section>
          <h4 className="text-xs tracking-[0.16em] text-primary">相關知識頁</h4>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm tracking-[0.08em]">
            {f.related_nodes.map((n) => (
              <li key={n.name}>
                <Link href={`/knowledge?q=${encodeURIComponent(n.name)}`} className="dotted-underline text-primary">
                  {n.name}
                </Link>
                {n.slug === null ? <span className="ml-1 text-xs text-muted-foreground">（待建立）</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
