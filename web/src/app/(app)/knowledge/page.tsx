import type { Metadata } from "next";
import { GenerateButton } from "@/components/knowledge/generate-button";
import { KnowledgeCard } from "@/components/knowledge/knowledge-card";
import { SearchForm } from "@/components/knowledge/search-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { cleanTopic, normalizeSlug } from "@/lib/knowledge/slug";
import { type KnowledgeNodeSummary, listRecentKnowledge, searchKnowledge } from "@/lib/services/knowledge";

export const metadata: Metadata = { title: "Knowledge" };

export default async function KnowledgePage({ searchParams }: PageProps<"/knowledge">) {
  const user = await requireUser();
  const db = await getDb();
  const params = await searchParams;
  const raw = typeof params.q === "string" ? params.q : "";
  const q = cleanTopic(raw);

  let results: KnowledgeNodeSummary[] = [];
  let error: string | null = null;
  if (q) {
    try {
      results = await searchKnowledge(db, user.id, q);
    } catch (e) {
      if (e instanceof AppError && e.status === 400) error = e.message;
      else throw e;
    }
  }
  const recent = q ? [] : await listRecentKnowledge(db, user.id, 9);
  const slug = normalizeSlug(q);
  const exact = results.find((n) => n.slug === slug || n.name.toLowerCase() === q.toLowerCase());
  const canCreate = q && !error && !exact && slug.length > 0;

  return (
    <div className="grid gap-12">
      <PageHeader eyebrow="知識探索" title="Knowledge" description="搜尋支援繁體中文與英文別名。找不到時，可以用 AI 建立一份結構化知識頁。" />
      <SearchForm defaultValue={q} autoFocus={!q} className="max-w-2xl" />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {q && !error ? (
        <section aria-live="polite" className="grid gap-6">
          <SectionHeader
            eyebrow={results.length ? `「${q}」找到 ${results.length} 個結果` : `「${q}」沒有符合的知識頁`}
            title="Results"
            aside={canCreate && results.length ? <GenerateButton topic={q} variant="outline" size="sm" /> : null}
          />
          {results.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((n) => (
                <li key={n.id} className="flex">
                  <KnowledgeCard node={n} className="flex-1" />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={`還沒有「${q}」的知識頁`}
              description="AI 會產生定義、原理、架構圖、程式碼範例、常見誤解與面試重點，通常需要 20–60 秒。內容為 AI 產生，請依官方文件確認。"
              action={canCreate ? <GenerateButton topic={q} size="lg" /> : null}
            />
          )}
        </section>
      ) : null}

      {!q ? (
        <section className="grid gap-6">
          <SectionHeader eyebrow="最近瀏覽" title="Recent" />
          {recent.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {recent.map((n) => (
                <li key={n.id} className="flex">
                  <KnowledgeCard node={n} className="flex-1" />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="從搜尋開始" description="例如 RAG、LLM、AWS、Docker。已有的頁面會直接顯示；沒有的可以用 AI 建立。" />
          )}
        </section>
      ) : null}
    </div>
  );
}
