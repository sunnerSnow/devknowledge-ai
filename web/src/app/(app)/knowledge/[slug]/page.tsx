import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GenerateButton } from "@/components/knowledge/generate-button";
import { GeneratingWatcher } from "@/components/knowledge/generating-watcher";
import { articleSections, KnowledgeArticle } from "@/components/knowledge/knowledge-article";
import { CategoryBadge, ProgressBadge } from "@/components/knowledge/progress-badge";
import { ProgressControl } from "@/components/knowledge/progress-control";
import { RelationsPanel } from "@/components/knowledge/relations-panel";
import { ViewTracker } from "@/components/knowledge/view-tracker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { getKnowledge, type KnowledgeDetail } from "@/lib/services/knowledge";

async function load(slug: string): Promise<KnowledgeDetail | null> {
  const user = await requireUser();
  try {
    return await getKnowledge(await getDb(), user.id, decodeURIComponent(slug));
  } catch (e) {
    if (e instanceof AppError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/knowledge/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const detail = await load(slug);
  return { title: detail?.name ?? "知識頁" };
}

export default async function KnowledgeDetailPage({ params }: PageProps<"/knowledge/[slug]">) {
  const { slug } = await params;
  const detail = await load(slug);
  if (!detail) notFound();

  const updated = new Date(detail.contentMeta?.createdAt ?? detail.updatedAt).toLocaleDateString("zh-TW", { year: "numeric", month: "short", day: "numeric" });
  const sections = detail.content ? articleSections(detail.content) : [];

  return (
    <div className="grid gap-8">
      <ViewTracker nodeId={detail.id} />
      <header className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <CategoryBadge category={detail.category} />
          <ProgressBadge status={detail.progress?.status} />
          <span>更新於 {updated}</span>
          {detail.contentMeta ? (
            <span>
              v{detail.contentMeta.version}・{detail.contentMeta.provider}
              {detail.contentMeta.modelName ? ` ${detail.contentMeta.modelName}` : ""}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-3xl font-semibold tracking-tight text-primary sm:text-4xl dark:text-foreground">{detail.name}</h1>
            {detail.englishName && detail.englishName !== detail.name ? <p className="mt-1 text-base text-muted-foreground">{detail.englishName}</p> : null}
            {detail.aliases.length ? <p className="mt-1 text-xs text-muted-foreground">別名：{detail.aliases.join("、")}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {detail.content ? <ProgressControl nodeId={detail.id} slug={detail.slug} status={detail.progress?.status ?? "not_started"} /> : null}
            {detail.content && !detail.generating ? <GenerateButton topic={detail.name} slug={detail.slug} regenerate variant="outline" size="sm" /> : null}
          </div>
        </div>
        {detail.generating ? <GeneratingWatcher slug={detail.slug} /> : null}
        {detail.content ? (
          <Alert>
            <AlertDescription>此頁內容由 AI 產生（{detail.contentMeta?.provider === "mock" ? "mock provider 固定範例" : `${detail.contentMeta?.provider} ${detail.contentMeta?.modelName ?? ""}`}），版本、API 與價格等易變資訊請依官方文件確認。</AlertDescription>
          </Alert>
        ) : null}
      </header>

      {detail.content ? (
        <div className="grid gap-8 lg:grid-cols-[180px_minmax(0,1fr)_260px]">
          <nav aria-label="章節" className="hidden lg:block">
            <ol className="sticky top-24 grid gap-1 text-sm">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="min-w-0">
            <KnowledgeArticle content={detail.content} />
          </div>
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <h2 className="mb-3 text-sm font-semibold text-muted-foreground">知識關聯</h2>
            <RelationsPanel detail={detail} />
          </aside>
        </div>
      ) : detail.generating ? (
        <EmptyState title="生成中" description="第一次生成需要一點時間。你可以留在這頁等待，完成後會自動顯示內容。" />
      ) : detail.status === "failed" ? (
        <EmptyState
          title="上次生成失敗"
          description="AI 沒有回傳可用的內容。可以再試一次；若持續失敗，可能是額度或服務暫時有問題。"
          action={<GenerateButton topic={detail.name} slug={detail.slug} label="再試一次" />}
        />
      ) : (
        <EmptyState
          title={`「${detail.name}」還沒有內容`}
          description="這個節點是從其他知識頁的前置知識或相關技術建立的。用 AI 產生內容後，就會接上現有的知識關聯。"
          action={<GenerateButton topic={detail.name} slug={detail.slug} size="lg" />}
        />
      )}

      {!detail.content && (detail.relations.length || detail.neededBy.length) ? (
        <section className="max-w-md">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">知識關聯</h2>
          <RelationsPanel detail={detail} />
        </section>
      ) : null}
    </div>
  );
}
