import type { Metadata } from "next";
import Link from "next/link";
import { type JobOption, StartPracticeForm } from "@/components/practice/start-practice-form";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader, SectionHeader } from "@/components/ui/page-header";
import { QUESTION_TYPE_LABELS } from "@/lib/ai/prompts/practice-v1";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { isUuid } from "@/lib/db/with-user";
import { getJob, listJobs } from "@/lib/services/jobs";
import { listReviewItems, listSessions, type PracticeSessionSummary } from "@/lib/services/practice";
import { levelLabel } from "@/lib/skills/levels";

export const metadata: Metadata = { title: "Interview Practice" };

const MODE_LABELS = { interview: "面試模擬", quiz: "快速測驗", coding: "程式實作" } as const;

export default async function PracticePage({ searchParams }: PageProps<"/practice">) {
  const user = await requireUser();
  const db = await getDb();
  const params = await searchParams;
  const defaultJobId = typeof params.job === "string" && isUuid(params.job) ? params.job : null;
  const defaultTopic = typeof params.topic === "string" ? params.topic.slice(0, 80) : null;

  const [jobs, sessions, review] = await Promise.all([listJobs(db, user.id), listSessions(db, user.id, { limit: 30 }), listReviewItems(db, user.id, 12)]);
  // 表單需要每份職缺的技能清單；只取最近 8 份使用中的職缺
  const activeJobs = jobs.filter((j) => j.status === "active").slice(0, 8);
  const jobOptions: JobOption[] = await Promise.all(
    activeJobs.map(async (j) => {
      const detail = await getJob(db, user.id, j.id);
      return { id: j.id, title: j.title, skills: detail.skills.map((s) => ({ name: s.skillName, slug: s.skillSlug, requiredLevel: s.requiredLevel, userLevel: s.user?.level ?? null })) };
    }),
  );
  const active = sessions.filter((s) => s.status === "active");
  const ended = sessions.filter((s) => s.status === "ended");

  return (
    <div className="grid gap-16">
      <PageHeader eyebrow="面試練習" title="Interview Practice" description="一次一題：概念、情境、架構、程式題。AI 依評分規準給回饋，但不會未經你確認就改寫技能等級。" />

      <section className="panel p-6 sm:p-8">
        <SectionHeader eyebrow="開始練習" title="Start" />
        <div className="mt-8">
          <StartPracticeForm jobs={jobOptions} defaultJobId={defaultJobId} defaultTopic={defaultTopic} />
        </div>
      </section>

      {active.length ? (
        <section className="grid gap-6">
          <SectionHeader eyebrow="進行中" title="In progress" />
          <SessionList sessions={active} />
        </section>
      ) : null}

      <section className="grid gap-6">
        <SectionHeader eyebrow="複習清單" title="Review" aside={<span className="text-muted-foreground">加入複習的，或平均分低於 2.5 的作答</span>} />
        {review.length ? (
          <ul className="grid gap-3">
            {review.map((r) => (
              <li key={r.attemptId} className="panel flex flex-col gap-2 p-5 sm:flex-row sm:items-baseline sm:justify-between">
                <div className="min-w-0">
                  <p className="text-xs tracking-[0.16em] text-muted-foreground">
                    {r.topic}・{QUESTION_TYPE_LABELS[r.questionType]}
                    {r.reviewFlag ? "・已加入複習" : ""}
                  </p>
                  <Link href={`/practice/${r.sessionId}#q-${r.questionId}`} className="mt-1 block text-[15px] leading-7 tracking-[0.06em] hover:dotted-underline">
                    {r.question}
                  </Link>
                </div>
                <span className="shrink-0 font-display text-xl text-primary tabular-nums">{r.score === null ? "–" : r.score.toFixed(1)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="還沒有要複習的題目" description="作答後可以把題目加入複習；平均分低於 2.5 的也會自動列在這裡。" />
        )}
      </section>

      <section className="grid gap-6">
        <SectionHeader eyebrow="練習紀錄" title="History" />
        {ended.length ? <SessionList sessions={ended} /> : <EmptyState title="還沒有結束的練習" description="每次練習結束後會列在這裡，可以回頭看題目、回答與評估。" />}
      </section>
    </div>
  );
}

function SessionList({ sessions }: { sessions: PracticeSessionSummary[] }) {
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {sessions.map((s) => (
        <li key={s.id} className="flex">
          <Link href={`/practice/${s.id}`} className="group panel flex flex-1 flex-col p-6 transition-colors outline-none hover:bg-card/70 focus-visible:focus-ring">
            <div className="flex items-baseline justify-between gap-3 text-xs tracking-[0.16em] text-muted-foreground">
              <span className="truncate">{s.jobTitle ?? "沒有對應職缺"}</span>
              <span className="shrink-0">
                {MODE_LABELS[s.mode]}・{s.status === "active" ? "進行中" : "已結束"}
              </span>
            </div>
            <h3 className="mt-4 text-xl font-medium tracking-[0.1em] group-hover:dotted-underline">{s.topic}</h3>
            <p className="mt-2 text-xs tracking-[0.08em] text-muted-foreground">目標 {levelLabel(s.targetLevel)}</p>
            <p className="mt-auto pt-5 text-xs tracking-[0.08em] text-muted-foreground">
              {s.questionCount} 題・已答 {s.answeredCount}
              {s.averageScore !== null ? `・平均 ${s.averageScore.toFixed(1)}` : ""}・{new Date(s.createdAt).toLocaleDateString("zh-TW")}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
