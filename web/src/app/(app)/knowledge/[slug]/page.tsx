import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GenerateButton } from "@/components/knowledge/generate-button";
import { GeneratingWatcher } from "@/components/knowledge/generating-watcher";
import { articleSections, KnowledgeArticle } from "@/components/knowledge/knowledge-article";
import { KnowledgeQuiz } from "@/components/knowledge/knowledge-quiz";
import { CategoryBadge, ProgressBadge } from "@/components/knowledge/progress-badge";
import { ProgressControl } from "@/components/knowledge/progress-control";
import { RelationsPanel } from "@/components/knowledge/relations-panel";
import { ViewTracker } from "@/components/knowledge/view-tracker";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { getKnowledge, type KnowledgeDetail } from "@/lib/services/knowledge";
import { getLatestQuizAttempt, type QuizAttemptView } from "@/lib/services/knowledge-quiz";

async function load(slug: string): Promise<KnowledgeDetail | null> {
  const user = await requireUser();
  try {
    return await getKnowledge(await getDb(), user.id, decodeURIComponent(slug));
  } catch (e) {
    if (e instanceof AppError && e.status === 404) return null;
    throw e;
  }
}

/** 目前內容版本的最近一次小測驗作答（沒有小測驗就不查） */
async function loadQuizAttempt(detail: KnowledgeDetail): Promise<QuizAttemptView | null> {
  if (!detail.content?.quiz.length || !detail.contentMeta) return null;
  const user = await requireUser();
  return getLatestQuizAttempt(await getDb(), user.id, detail.id, detail.contentMeta.version);
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
  const providerLabel = detail.contentMeta ? (detail.contentMeta.provider === "mock" ? "mock provider 固定範例" : `${detail.contentMeta.provider} ${detail.contentMeta.modelName ?? ""}`.trim()) : null;
  const quizAttempt = await loadQuizAttempt(detail);
  const progressStatus = detail.progress?.status ?? "not_started";
  const quiz =
    detail.content?.quiz.length && detail.contentMeta ? (
      <KnowledgeQuiz
        key={detail.contentMeta.version}
        nodeId={detail.id}
        slug={detail.slug}
        version={detail.contentMeta.version}
        questions={detail.content.quiz.map((q) => q.question)}
        initialAttempt={quizAttempt}
        progressStatus={progressStatus}
      />
    ) : null;

  return (
    <div className="grid gap-12">
      <ViewTracker nodeId={detail.id} />
      <header className="grid gap-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs tracking-[0.1em] text-muted-foreground">
          <CategoryBadge category={detail.category} />
          <span>更新於 {updated}</span>
          {detail.contentMeta ? <span>v{detail.contentMeta.version}</span> : null}
          {providerLabel ? <span>{providerLabel}</span> : null}
        </div>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            {detail.englishName && detail.englishName !== detail.name ? <p className="section-sub">{detail.englishName}</p> : null}
            <h1 className="mt-2 text-4xl leading-relaxed font-medium tracking-[0.12em] sm:text-5xl">{detail.name}</h1>
            {detail.aliases.length ? <p className="mt-4 text-xs tracking-[0.08em] text-muted-foreground">別名：{detail.aliases.join("、")}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* key：小測驗後按「標記為已理解」會 refresh，狀態改變時重新掛載才會顯示新狀態 */}
            {detail.content ? <ProgressControl key={progressStatus} nodeId={detail.id} slug={detail.slug} status={progressStatus} /> : <ProgressBadge status={detail.progress?.status} />}
            {detail.content && !detail.generating ? <GenerateButton topic={detail.name} slug={detail.slug} regenerate variant="outline" size="sm" /> : null}
          </div>
        </div>
        {detail.generating ? <GeneratingWatcher slug={detail.slug} /> : null}
        {detail.content ? <p className="border-l-2 border-primary pl-3 text-xs leading-6 text-muted-foreground">此頁內容由 AI 產生（{providerLabel}），版本、API 與價格等易變資訊請依官方文件確認。</p> : null}
        {detail.content && !detail.content.quick_take && !detail.generating ? (
          <p className="text-xs leading-6 text-muted-foreground">這一頁是舊版格式；按「重新生成」可以加上快速理解卡與小測驗（舊版本會保留）。</p>
        ) : null}
      </header>

      {detail.content ? (
        <div className="grid gap-12 lg:grid-cols-[170px_minmax(0,1fr)_250px]">
          <nav aria-label="章節" className="hidden lg:block">
            <ol className="sticky top-24 grid gap-2 text-[13px] tracking-[0.04em]">
              {sections.map((s, i) => (
                <li key={s.id} className="flex gap-3">
                  <span className="w-5 shrink-0 tabular-nums text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  <a href={`#${s.id}`} className="text-foreground/70 hover:dotted-underline hover:text-foreground">
                    {s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>
          <div className="min-w-0">
            <KnowledgeArticle content={detail.content} quiz={quiz} />
          </div>
          <aside className="lg:sticky lg:top-24 lg:self-start">
            <p className="section-sub mb-4">知識關聯</p>
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
          <p className="section-sub mb-4">知識關聯</p>
          <RelationsPanel detail={detail} />
        </section>
      ) : null}
    </div>
  );
}
