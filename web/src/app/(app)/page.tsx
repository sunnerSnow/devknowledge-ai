import Link from "next/link";
import { KnowledgeCard } from "@/components/knowledge/knowledge-card";
import { PROGRESS_LABELS } from "@/components/knowledge/progress-badge";
import { SearchForm } from "@/components/knowledge/search-form";
import { CtaButton } from "@/components/ui/cta-button";
import { SectionHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { PROGRESS_STATUSES } from "@/lib/db/schema";
import { listJobs, listTopGaps } from "@/lib/services/jobs";
import { getProgressStats, listRecentKnowledge } from "@/lib/services/knowledge";
import { listWeekProgress } from "@/lib/services/plans";
import { getProfile } from "@/lib/services/profiles";

const EXAMPLES = ["RAG", "LLM", "AWS", "Docker", "React", "PostgreSQL"];

export default async function DashboardPage() {
  const user = await requireUser();
  const db = await getDb();
  const [recent, stats, profile, gaps, jobs, weekProgress] = await Promise.all([
    listRecentKnowledge(db, user.id, 6),
    getProgressStats(db, user.id),
    getProfile(db, user.id),
    listTopGaps(db, user.id, 5),
    listJobs(db, user.id),
    listWeekProgress(db, user.id),
  ]);
  const activeJobs = jobs.filter((j) => j.status === "active");
  const total = PROGRESS_STATUSES.reduce((n, s) => n + stats[s], 0);
  const greeting = profile?.displayName ? `${profile.displayName}，` : "";

  return (
    <div className="grid gap-16">
      {/* Hero：大字標題＋搜尋，背景放裝飾色塊 */}
      <section className="relative py-6 sm:py-10">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
          <span className="blob blob-blue top-[-4rem] right-[8%] h-[18rem] w-[18rem] opacity-55" />
          <span className="blob blob-yellow top-[6rem] right-[22%] h-[11rem] w-[11rem] opacity-50" />
        </div>
        <div className="relative">
          <p className="section-label">探索</p>
          <h1 className="mt-4 text-[clamp(32px,4.2vw,56px)] leading-[1.2] font-medium tracking-[0.04em]">{greeting}今天想弄懂哪個技術？</h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-muted-foreground">輸入技術名詞或架構，已有的知識頁會直接顯示；沒有的可以用 AI 建立。</p>
          <SearchForm size="lg" className="mt-8 max-w-2xl" />
          <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2" aria-label="範例">
            {EXAMPLES.map((e) => (
              <li key={e}>
                <Link href={`/knowledge?q=${encodeURIComponent(e)}`} className="text-xs tracking-[0.12em] text-muted-foreground hover:dotted-underline hover:text-foreground">
                  {e}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid gap-px bg-foreground/10 md:grid-cols-2">
        <div className="flex flex-col justify-between gap-6 bg-primary p-8 text-primary-foreground">
          <div>
            <p className="text-xs tracking-[0.18em] text-white/60">職缺分析</p>
            <h2 className="mt-2 text-2xl font-medium tracking-[0.02em]">Job Analyzer</h2>
            <p className="mt-4 text-sm leading-7 text-white/75">
              {activeJobs.length ? `已分析 ${activeJobs.length} 份職缺。` : "貼上 104 職缺，"}
              拆解技能需求、找出差距、產生學習路徑。
            </p>
          </div>
          <div className="flex items-center justify-between gap-4">
            <CtaButton href="/jobs/new" variant="secondary" className="bg-white text-foreground hover:bg-white/90">
              分析一份職缺
            </CtaButton>
            {activeJobs.length ? (
              <Link href="/jobs" className="text-xs tracking-[0.12em] text-white/70 hover:dotted-underline hover:text-white">
                全部職缺
              </Link>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col justify-between gap-6 bg-card p-8">
          <div>
            <p className="section-label">面試練習</p>
            <h2 className="mt-2 text-2xl font-medium tracking-[0.02em]">Practice</h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">一次一題，依評分規準給回饋。還沒有練習紀錄。</p>
          </div>
          <span className="text-[10px] tracking-[0.2em] text-muted-foreground">PHASE 4</span>
        </div>
      </section>

      {weekProgress.length ? (
        <section aria-labelledby="week-title" className="grid gap-6">
          <SectionHeader
            eyebrow="本週學習進度"
            title="This week"
            id="week-title"
            aside={
              <Link href="/plans" className="dotted-underline tracking-[0.08em]">
                全部計畫
              </Link>
            }
          />
          <ul className="grid gap-4 md:grid-cols-3">
            {weekProgress.map((w) => (
              <li key={w.planId} className="flex flex-col bg-card p-5">
                <div className="flex items-baseline justify-between text-[11px] tracking-[0.12em] text-muted-foreground">
                  <span>WEEK {String(w.week).padStart(2, "0")}</span>
                  <span>
                    {w.completed}/{w.total} 完成
                  </span>
                </div>
                <Link href={`/plans/${w.planId}`} className="mt-3 text-lg font-medium tracking-[0.02em] hover:dotted-underline">
                  {w.planTitle}
                </Link>
                <div className="mt-3 h-1 w-full bg-foreground/10">
                  <div className="h-1 bg-foreground" style={{ width: `${w.total ? Math.round((w.completed / w.total) * 100) : 0}%` }} />
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{w.nextTask ? `下一步：${w.nextTask.title}` : "本週任務都處理完了"}・剩餘約 {w.minutes} 分鐘</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="gaps-title" className="grid gap-6">
        <SectionHeader
          eyebrow="待補強技能"
          title="Gaps"
          id="gaps-title"
          aside={
            activeJobs.length ? (
              <Link href="/skills" className="dotted-underline tracking-[0.08em]">
                技能地圖
              </Link>
            ) : null
          }
        />
        {gaps.length ? (
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {gaps.map((g, i) => (
              <li key={g.skillSlug} className="flex flex-col bg-card p-5">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs tracking-[0.12em] text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <span className="text-xl font-medium tabular-nums">{g.score}</span>
                </div>
                <p className="mt-3 text-lg font-medium tracking-[0.02em]">
                  {g.knowledgeSlug ? (
                    <Link href={`/knowledge/${encodeURIComponent(g.knowledgeSlug)}`} className="hover:dotted-underline">
                      {g.skillName}
                    </Link>
                  ) : (
                    g.skillName
                  )}
                </p>
                <Link href={`/jobs/${g.jobId}`} className="mt-auto pt-3 text-[11px] leading-5 tracking-[0.04em] text-muted-foreground hover:dotted-underline">
                  差距 {g.gap}・{g.jobTitle}
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="bg-card px-8 py-10 text-sm leading-7 text-muted-foreground">
            {activeJobs.length ? "到職缺頁逐項自評後，這裡會列出優先分數最高的技能。" : "分析一份職缺並自評後，這裡會列出最需要補強的技能。"}
          </div>
        )}
      </section>

      <section aria-labelledby="progress-title" className="grid gap-6">
        <SectionHeader eyebrow="學習進度" title="Progress" id="progress-title" aside={<span className="text-muted-foreground">{total ? `共 ${total} 個知識頁` : "還沒有標記任何知識頁"}</span>} />
        <dl className="grid grid-cols-2 gap-px bg-foreground/10 sm:grid-cols-4">
          {PROGRESS_STATUSES.map((s) => (
            <div key={s} className="bg-card px-5 py-5">
              <dt className="text-xs tracking-[0.12em] text-muted-foreground">{PROGRESS_LABELS[s]}</dt>
              <dd className="mt-3 text-4xl font-medium tabular-nums tracking-[0.02em]">{stats[s]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="recent-title" className="grid gap-6">
        <SectionHeader
          eyebrow="最近瀏覽"
          title="Recent"
          id="recent-title"
          aside={
            <Link href="/knowledge" className="dotted-underline tracking-[0.08em]">
              全部知識
            </Link>
          }
        />
        {recent.length ? (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((n) => (
              <li key={n.id} className="flex">
                <KnowledgeCard node={n} className="flex-1" />
              </li>
            ))}
          </ul>
        ) : (
          <div className="bg-card px-8 py-14 text-center">
            <p className="text-lg font-medium tracking-[0.04em]">從一個名詞開始</p>
            <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted-foreground">試試搜尋「RAG」：你會得到定義、前置知識、架構圖、程式碼與面試題，並能標記自己的學習狀態。</p>
            <div className="mt-6 flex justify-center">
              <CtaButton href="/knowledge?q=RAG">搜尋 RAG</CtaButton>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
