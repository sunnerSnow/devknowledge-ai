import { ArrowRight, Briefcase, MessageSquareText, Sparkles } from "lucide-react";
import Link from "next/link";
import { KnowledgeCard } from "@/components/knowledge/knowledge-card";
import { PROGRESS_LABELS } from "@/components/knowledge/progress-badge";
import { SearchForm } from "@/components/knowledge/search-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { PROGRESS_STATUSES } from "@/lib/db/schema";
import { getProgressStats, listRecentKnowledge } from "@/lib/services/knowledge";
import { getProfile } from "@/lib/services/profiles";

const EXAMPLES = ["RAG", "LLM", "AWS", "Docker", "React", "PostgreSQL"];

export default async function DashboardPage() {
  const user = await requireUser();
  const db = await getDb();
  const [recent, stats, profile] = await Promise.all([listRecentKnowledge(db, user.id, 6), getProgressStats(db, user.id), getProfile(db, user.id)]);
  const total = PROGRESS_STATUSES.reduce((n, s) => n + stats[s], 0);
  const greeting = profile?.displayName ? `${profile.displayName}，` : "";

  return (
    <div className="grid gap-10">
      <section className="rounded-2xl border bg-card px-5 py-8 sm:px-8 sm:py-10">
        <p className="text-xs font-medium tracking-wide text-teal uppercase">Explore</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-primary sm:text-3xl dark:text-foreground">{greeting}今天想弄懂哪個技術？</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">輸入技術名詞或架構，已有的知識頁會直接顯示；沒有的可以用 AI 建立。</p>
        <SearchForm size="lg" className="mt-6 max-w-2xl" />
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="範例">
          {EXAMPLES.map((e) => (
            <li key={e}>
              <Link href={`/knowledge?q=${encodeURIComponent(e)}`} className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-teal hover:text-foreground">
                {e}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="border-primary/20 bg-primary text-primary-foreground">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="size-4" aria-hidden="true" />
              分析一份職缺
            </CardTitle>
            <CardDescription className="text-primary-foreground/75">貼上 104 職缺，拆解技能需求、找出差距、產生學習路徑。</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary" className="bg-gold text-gold-foreground hover:bg-gold/90">
              <Link href="/jobs">
                前往 Job Analyzer <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <p className="mt-2 text-xs text-primary-foreground/60">Phase 2 推出</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MessageSquareText className="size-4 text-teal" aria-hidden="true" />
              最近的面試練習
            </CardTitle>
            <CardDescription>一次一題，依評分規準給回饋。</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">還沒有練習紀錄。面試練習會在 Phase 4 推出。</p>
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="progress-title">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="progress-title" className="text-lg font-semibold text-primary dark:text-foreground">
              學習進度
            </h2>
            <p className="text-sm text-muted-foreground">{total ? `共 ${total} 個知識頁` : "還沒有標記任何知識頁"}</p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {PROGRESS_STATUSES.map((s) => (
            <div key={s} className="rounded-xl border bg-card px-4 py-3">
              <dt className="text-xs text-muted-foreground">{PROGRESS_LABELS[s]}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-primary dark:text-foreground">{stats[s]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="recent-title">
        <div className="flex items-end justify-between gap-4">
          <h2 id="recent-title" className="text-lg font-semibold text-primary dark:text-foreground">
            最近瀏覽
          </h2>
          <Link href="/knowledge" className="text-sm text-teal hover:underline">
            全部知識
          </Link>
        </div>
        {recent.length ? (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((n) => (
              <li key={n.id}>
                <KnowledgeCard node={n} className="h-full" />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed bg-card/60 px-6 py-10 text-center">
            <Sparkles className="mx-auto size-6 text-gold" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-primary dark:text-foreground">從一個名詞開始</p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted-foreground">試試搜尋「RAG」：你會得到定義、前置知識、架構圖、程式碼與面試題，並能標記自己的學習狀態。</p>
            <Button asChild className="mt-4" variant="outline">
              <Link href="/knowledge?q=RAG">搜尋 RAG</Link>
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
