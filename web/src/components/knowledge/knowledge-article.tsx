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
  return (
    <article className="grid gap-10">
      <Section id="summary" title="一句話理解">
        <p className="text-lg leading-8 font-medium text-primary dark:text-foreground">{content.summary}</p>
      </Section>

      <Section id="why" title="為什麼需要它">
        <Markdown content={content.why_it_matters} />
      </Section>

      {content.sections.map((s, i) => (
        <Section key={i} id={`section-${i}`} title={s.title}>
          <Markdown content={s.content_md} />
          {s.key_points.length ? (
            <ul className="mt-4 flex flex-wrap gap-2" aria-label="重點">
              {s.key_points.map((p, j) => (
                <li key={j} className="rounded-full border border-teal/40 bg-secondary px-3 py-1 text-xs text-secondary-foreground">
                  {p}
                </li>
              ))}
            </ul>
          ) : null}
        </Section>
      ))}

      {content.architecture ? (
        <Section id="architecture" title="架構圖">
          <MermaidDiagram code={content.architecture.mermaid} description={content.architecture.description} />
        </Section>
      ) : null}

      {content.code_examples.length ? (
        <Section id="code" title="程式碼範例">
          <div className="grid gap-5">
            {content.code_examples.map((ex, i) => (
              <div key={i} className="grid gap-2">
                {ex.description ? <p className="text-sm leading-6 text-muted-foreground">{ex.description}</p> : null}
                <CodeBlock code={ex.code} language={ex.language} title={ex.title} />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {content.comparisons.length ? (
        <Section id="comparisons" title="與相似技術比較">
          <dl className="grid gap-3">
            {content.comparisons.map((c, i) => (
              <div key={i} className="rounded-lg border bg-card p-4">
                <dt className="font-semibold text-primary dark:text-foreground">vs. {c.name}</dt>
                <dd className="mt-1 text-sm leading-6 text-foreground/90">{c.difference}</dd>
              </div>
            ))}
          </dl>
        </Section>
      ) : null}

      {content.common_misconceptions.length ? (
        <Section id="misconceptions" title="常見誤解">
          <ul className="grid gap-2">
            {content.common_misconceptions.map((m, i) => (
              <li key={i} className="flex gap-3 rounded-lg border-l-4 border-gold bg-accent/50 px-4 py-2.5 text-sm leading-6">
                {m}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {content.interview_topics.length ? (
        <Section id="interview" title="面試重點">
          <ol className="grid gap-4">
            {content.interview_topics.map((t, i) => (
              <li key={i} className="rounded-xl border bg-card p-4">
                <p className="font-medium text-primary dark:text-foreground">
                  <span className="mr-2 text-teal">Q{i + 1}</span>
                  {t.question}
                </p>
                <p className="mt-2 text-xs font-medium text-muted-foreground">評量重點</p>
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {t.evaluation_points.map((p, j) => (
                    <li key={j} className="rounded-md bg-muted px-2 py-0.5 text-xs">
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
        <Section id="tasks" title="實作任務">
          <ul className="grid gap-3">
            {content.learning_tasks.map((t, i) => (
              <li key={i} className="flex items-start justify-between gap-4 rounded-xl border bg-card p-4">
                <div>
                  <p className="font-medium text-primary dark:text-foreground">{t.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{t.description}</p>
                </div>
                <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs text-secondary-foreground">約 {t.estimated_minutes} 分鐘</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">學習計畫（Phase 3）完成後，可以把任務加入計畫並追蹤完成狀態。</p>
        </Section>
      ) : null}

      {content.caveats.length ? (
        <Section id="caveats" title="注意事項">
          <ul className="grid gap-1.5 text-sm leading-6 text-muted-foreground">
            {content.caveats.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden="true">•</span>
                {c}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </article>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <h2 id={`${id}-title`} className="mb-3 text-lg font-semibold tracking-tight text-primary dark:text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}
