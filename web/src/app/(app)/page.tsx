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
    <div className="grid gap-20">
      {/* Hero：安靜的大標＋一句說明＋搜尋 */}
      <section className="grid gap-8 pt-4 lg:pt-10">
        <div>
          <p className="section-sub">知識探索</p>
          <h1 className="mt-5 text-3xl leading-[1.7] font-medium tracking-[0.16em] sm:text-4xl">
            {greeting}今天想弄懂
            <br />
            哪個技術？
          </h1>
          <p className="mt-6 max-w-xl text-[15px] leading-8 tracking-[0.1em]">輸入技術名詞或架構，已有的知識頁會直接顯示；沒有的可以用 AI 建立。</p>
        </div>
        <SearchForm size="lg" className="max-w-2xl" />
        <ul className="flex flex-wrap gap-x-6 gap-y-2" aria-label="範例">
          {EXAMPLES.map((e) => (
            <li key={e}>
              <Link href={`/knowledge?q=${encodeURIComponent(e)}`} className="dotted-underline text-sm tracking-[0.12em] text-primary outline-none focus-visible:focus-ring">
                {e}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* 兩個入口：白色面板，像「主な業務内容」的編號清單 */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="panel flex flex-col justify-between gap-8 p-8 sm:p-10">
          <div>
            <h2 className="font-display text-2xl leading-none text-primary">Job Analyzer</h2>
            <p className="section-sub mt-2 text-xs">職缺分析</p>
            <p className="mt-6 text-[15px] leading-8 tracking-[0.1em]">{activeJobs.length ? `已分析 ${activeJobs.length} 份職缺。` : "貼上 104 職缺，"}拆解技能需求、找出差距、產生學習路徑。</p>
            <ol className="mt-5 grid gap-2 text-sm leading-7 tracking-[0.08em]">
              {["貼上職缺，AI 拆解成技能需求", "逐項自評目前程度", "依差距產生週學習計畫"].map((t, i) => (
                <li key={t} className="flex gap-3">
                  <span className="font-display text-base text-primary tabular-nums">{i + 1}.</span>
                  {t}
                </li>
              ))}
            </ol>
          </div>
          <div className="flex items-center justify-between gap-4">
            <CtaButton href="/jobs/new">分析一份職缺</CtaButton>
            {activeJobs.length ? (
              <Link href="/jobs" className="dotted-underline text-sm tracking-[0.12em] text-primary">
                全部職缺
              </Link>
            ) : null}
          </div>
        </div>
        <div className="panel flex flex-col justify-between gap-8 p-8 sm:p-10">
          <div>
            <h2 className="font-display text-2xl leading-none text-primary">Practice</h2>
            <p className="section-sub mt-2 text-xs">面試練習</p>
            <p className="mt-6 text-[15px] leading-8 tracking-[0.1em]">一次一題，依評分規準給回饋。還沒有練習紀錄。</p>
          </div>
          <span className="text-xs tracking-[0.2em] text-muted-foreground">PHASE 4 準備中</span>
        </div>
      </section>

      {weekProgress.length ? (
        <section aria-labelledby="week-title" className="grid gap-8">
          <SectionHeader
            eyebrow="本週學習進度"
            title="This week"
            id="week-title"
            aside={
              <Link href="/plans" className="dotted-underline text-primary">
                全部計畫
              </Link>
            }
          />
          <ul className="grid gap-4 md:grid-cols-3">
            {weekProgress.map((w) => (
              <li key={w.planId} className="panel flex flex-col p-6">
                <div className="flex items-baseline justify-between text-xs tracking-[0.16em] text-muted-foreground">
                  <span className="font-display text-sm">WEEK {String(w.week).padStart(2, "0")}</span>
                  <span>
                    {w.completed}/{w.total} 完成
                  </span>
                </div>
                <Link href={`/plans/${w.planId}`} className="mt-4 text-lg font-medium tracking-[0.08em] hover:dotted-underline">
                  {w.planTitle}
                </Link>
                <div className="mt-4 h-1 w-full bg-secondary">
                  <div className="h-1 bg-primary" style={{ width: `${w.total ? Math.round((w.completed / w.total) * 100) : 0}%` }} />
                </div>
                <p className="mt-3 text-xs leading-6 tracking-[0.06em] text-muted-foreground">{w.nextTask ? `下一步：${w.nextTask.title}` : "本週任務都處理完了"}・剩餘約 {w.minutes} 分鐘</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="gaps-title" className="grid gap-8">
        <SectionHeader
          eyebrow="待補強技能"
          title="Gaps"
          id="gaps-title"
          aside={
            activeJobs.length ? (
              <Link href="/skills" className="dotted-underline text-primary">
                技能地圖
              </Link>
            ) : null
          }
        />
        {gaps.length ? (
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {gaps.map((g, i) => (
              <li key={g.skillSlug} className="panel flex flex-col p-6">
                <div className="flex items-baseline justify-between">
                  <span className="font-display text-xl text-primary tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                  <span className="font-display text-2xl tabular-nums">{g.score}</span>
                </div>
                <p className="mt-4 text-lg font-medium tracking-[0.08em]">
                  {g.knowledgeSlug ? (
                    <Link href={`/knowledge/${encodeURIComponent(g.knowledgeSlug)}`} className="hover:dotted-underline">
                      {g.skillName}
                    </Link>
                  ) : (
                    g.skillName
                  )}
                </p>
                <Link href={`/jobs/${g.jobId}`} className="mt-auto pt-4 text-xs leading-6 tracking-[0.06em] text-muted-foreground hover:dotted-underline">
                  差距 {g.gap}・{g.jobTitle}
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="panel px-8 py-10 text-[15px] leading-8 tracking-[0.1em] text-muted-foreground">
            {activeJobs.length ? "到職缺頁逐項自評後，這裡會列出優先分數最高的技能。" : "分析一份職缺並自評後，這裡會列出最需要補強的技能。"}
          </div>
        )}
      </section>

      <section aria-labelledby="progress-title" className="grid gap-8">
        <SectionHeader eyebrow="學習進度" title="Progress" id="progress-title" aside={<span className="text-muted-foreground">{total ? `共 ${total} 個知識頁` : "還沒有標記任何知識頁"}</span>} />
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {PROGRESS_STATUSES.map((s) => (
            <div key={s} className="panel px-6 py-6">
              <dt className="text-xs tracking-[0.16em] text-muted-foreground">{PROGRESS_LABELS[s]}</dt>
              <dd className="mt-3 font-display text-4xl text-primary tabular-nums">{stats[s]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="recent-title" className="grid gap-8">
        <SectionHeader
          eyebrow="最近瀏覽"
          title="Recent"
          id="recent-title"
          aside={
            <Link href="/knowledge" className="dotted-underline text-primary">
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
          <div className="panel px-8 py-14 text-center">
            <p className="text-lg font-medium tracking-[0.12em]">從一個名詞開始</p>
            <p className="mx-auto mt-4 max-w-md text-sm leading-8 tracking-[0.08em] text-muted-foreground">試試搜尋「RAG」：你會得到定義、前置知識、架構圖、程式碼與面試題，並能標記自己的學習狀態。</p>
            <div className="mt-8 flex justify-center">
              <CtaButton href="/knowledge?q=RAG">搜尋 RAG</CtaButton>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
