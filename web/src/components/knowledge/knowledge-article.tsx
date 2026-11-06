import { CodeBlock } from "@/components/knowledge/code-block";
import { Markdown } from "@/components/knowledge/markdown";
import { MermaidDiagram } from "@/components/knowledge/mermaid-diagram";
import type { KnowledgeContent } from "@/lib/ai/schemas/knowledge";

export interface ArticleSection {
  id: string;
  title: string;
}

/** 依規格 4.4 的 10 個內容區塊組出章節；沒有內容的區塊不顯示 */
export function articleSections(content: KnowledgeContent): ArticleSection[] {
  const sections: ArticleSection[] = [
    { id: "summary", title: "一句話理解" },
    { id: "why", title: "為什麼需要它" },
    ...content.sections.map((s, i) => ({ id: `section-${i}`, title: s.title })),
  ];
  if (content.architecture) sections.push({ id: "architecture", title: "架構圖" });
  if (content.code_examples.length) sections.push({ id: "code", title: "程式碼範例" });
  if (content.comparisons.length) sections.push({ id: "comparisons", title: "與相似技術比較" });
  if (content.common_misconceptions.length) sections.push({ id: "misconceptions", title: "常見誤解" });
  if (content.interview_topics.length) sections.push({ id: "interview", title: "面試重點" });
  if (content.learning_tasks.length) sections.push({ id: "tasks", title: "實作任務" });
  if (content.caveats.length) sections.push({ id: "caveats", title: "注意事項" });
  return sections;
}

export function KnowledgeArticle({ content }: { content: KnowledgeContent }) {
  const sections = articleSections(content);
  const num = (id: string) => String(sections.findIndex((s) => s.id === id) + 1).padStart(2, "0");

  return (
    <article className="grid gap-14">
      <Section id="summary" num={num("summary")} title="一句話理解">
        <p className="text-xl leading-9 font-medium tracking-[0.02em]">{content.summary}</p>
      </Section>

      <Section id="why" num={num("why")} title="為什麼需要它">
        <Markdown content={content.why_it_matters} />
      </Section>

      {content.sections.map((s, i) => (
        <Section key={i} id={`section-${i}`} num={num(`section-${i}`)} title={s.title}>
          <Markdown content={s.content_md} />
          {s.key_points.length ? (
            <ul className="mt-5 flex flex-wrap gap-2" aria-label="重點">
              {s.key_points.map((p, j) => (
                <li key={j} className="border border-foreground/30 px-3 py-1 text-xs tracking-[0.06em]">
                  {p}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      ))}

      {content.architecture ? (
        <Section id="architecture" num={num("architecture")} title="架構圖">
          <MermaidDiagram code={content.architecture.mermaid} description={content.architecture.description} />
        </Section>
      ) : null}

      {content.code_examples.length ? (
        <Section id="code" num={num("code")} title="程式碼範例">
          <div className="grid gap-6">
            {content.code_examples.map((ex, i) => (
              <div key={i} className="grid gap-2">
                {ex.description ? <p className="text-sm leading-7 text-muted-foreground">{ex.description}</p> : null}
                <CodeBlock code={ex.code} language={ex.language} title={ex.title} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {content.comparisons.length ? (
        <Section id="comparisons" num={num("comparisons")} title="與相似技術比較">
          <dl className="grid gap-px bg-foreground/10">
            {content.comparisons.map((c, i) => (
              <div key={i} className="bg-card p-5">
                <dt className="font-medium tracking-[0.04em]">vs. {c.name}</dt>
                <dd className="mt-2 text-sm leading-7 text-foreground/85">{c.difference}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {content.common_misconceptions.length ? (
        <Section id="misconceptions" num={num("misconceptions")} title="常見誤解">
          <ul className="grid gap-3">
            {content.common_misconceptions.map((m, i) => (
              <li key={i} className="border-l-2 border-foreground pl-4 text-sm leading-7">
                {m}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {content.interview_topics.length ? (
        <Section id="interview" num={num("interview")} title="面試重點">
          <ol className="grid gap-px bg-foreground/10">
            {content.interview_topics.map((t, i) => (
              <li key={i} className="bg-card p-5">
                <p className="font-medium tracking-[0.02em]">
                  <span className="mr-3 text-xs tracking-[0.12em] text-muted-foreground">Q{i + 1}</span>
                  {t.question}
                </p>
                <p className="mt-3 text-[11px] tracking-[0.12em] text-muted-foreground">評量重點</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {t.evaluation_points.map((p, j) => (
                    <li key={j} className="bg-secondary px-2 py-0.5 text-xs">
                      {p}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {content.learning_tasks.length ? (
        <Section id="tasks" num={num("tasks")} title="實作任務">
          <ul className="grid gap-px bg-foreground/10">
            {content.learning_tasks.map((t, i) => (
              <li key={i} className="flex items-start justify-between gap-4 bg-card p-5">
                <div>
                  <p className="font-medium tracking-[0.02em]">{t.title}</p>
                  <p className="mt-2 text-sm leading-7 text-muted-foreground">{t.description}</p>
                </div>
                <span className="shrink-0 text-xs tracking-[0.08em] text-muted-foreground">約 {t.estimated_minutes} 分鐘</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">學習計畫（Phase 3）完成後，可以把任務加入計畫並追蹤完成狀態。</p>
        </Section>
      ) : null}

      {content.caveats.length ? (
        <Section id="caveats" num={num("caveats")} title="注意事項">
          <ul className="grid gap-2 text-sm leading-7 text-muted-foreground">
            {content.caveats.map((c, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden="true">—</span>
                {c}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </article>
  );
}

function Section({ id, num, title, children }: { id: string; num: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <div className="mb-5 flex items-baseline gap-4 border-b border-dotted border-foreground/30 pb-3">
        <span className="text-xs tracking-[0.12em] text-muted-foreground tabular-nums">{num}</span>
        <h2 id={`${id}-title`} className="text-xl font-medium tracking-[0.04em]">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}
