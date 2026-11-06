import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProgressBadge } from "@/components/knowledge/progress-badge";
import { PlanActions } from "@/components/plans/plan-actions";
import { TaskStatusControls } from "@/components/plans/task-status";
import { SectionHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import type { TaskStatus, TaskType } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { getPlan, type PlanDetail } from "@/lib/services/plans";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<TaskType, string> = { read: "閱讀", quiz: "測驗", code: "練習", project: "專案", review: "複習" };
const STATUS_LABELS: Record<TaskStatus, string> = { todo: "待辦", in_progress: "進行中", completed: "完成", skipped: "略過" };
const PLAN_STATUS_LABELS = { active: "進行中", completed: "已完成", archived: "已封存" } as const;

async function load(id: string): Promise<PlanDetail | null> {
  const user = await requireUser();
  try {
    return await getPlan(await getDb(), user.id, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/plans/[id]">): Promise<Metadata> {
  const { id } = await params;
  const plan = await load(id);
  return { title: plan?.title ?? "學習計畫" };
}

export default async function PlanDetailPage({ params }: PageProps<"/plans/[id]">) {
  const { id } = await params;
  const plan = await load(id);
  if (!plan) notFound();
  const pct = plan.totalTasks ? Math.round((plan.completedTasks / plan.totalTasks) * 100) : 0;

  return (
    <div className="grid gap-12">
      <header className="grid gap-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs tracking-[0.1em] text-muted-foreground">
          <Link href="/plans" className="hover:dotted-underline">
            ← 全部計畫
          </Link>
          {plan.jobPostingId ? (
            <Link href={`/jobs/${plan.jobPostingId}`} className="hover:dotted-underline">
              職缺：{plan.jobTitle}
            </Link>
          ) : null}
          <span>{PLAN_STATUS_LABELS[plan.status]}</span>
          <span>每週 {plan.weeklyMinutes} 分鐘</span>
          {plan.meta ? <span>{plan.meta.provider === "mock" ? "mock provider" : `${plan.meta.provider} ${plan.meta.model ?? ""}`}</span> : null}
        </div>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="section-sub">學習計畫</p>
            <h1 className="mt-2 text-3xl leading-relaxed font-medium tracking-[0.12em] sm:text-4xl">{plan.title}</h1>
            {plan.goal ? <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">{plan.goal}</p> : null}
          </div>
          <PlanActions planId={plan.id} status={plan.status} />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="週數" value={String(plan.weekCount)} />
          <Stat label="任務" value={`${plan.completedTasks} / ${plan.totalTasks}`} />
          <Stat label="完成率" value={`${pct}%`} />
          <Stat label="剩餘時數" value={`約 ${Math.round(plan.remainingMinutes / 60)} 小時`} />
        </div>
        {plan.summary ? <p className="border-l-2 border-primary pl-3 text-sm leading-7 whitespace-pre-line text-foreground/80">{plan.summary}</p> : null}
      </header>

      <section className="grid gap-10">
        <SectionHeader eyebrow="週次任務" title="Weeks" aside={<span className="text-muted-foreground">完成任務會回寫知識頁的學習狀態</span>} />
        {plan.weeks.map((w) => (
          <section key={w.week} aria-labelledby={`week-${w.week}`} className={cn("grid gap-4", w.done && "opacity-70")}>
            <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
              <h3 id={`week-${w.week}`} className="flex items-baseline gap-3 text-lg font-medium tracking-[0.04em]">
                <span className="text-xs tracking-[0.12em] text-muted-foreground tabular-nums">WEEK {String(w.week).padStart(2, "0")}</span>
                {w.week === plan.currentWeek && plan.status === "active" ? <span className="text-xs tracking-[0.12em] text-muted-foreground">本週</span> : null}
              </h3>
              <span className="text-xs tracking-[0.06em] text-muted-foreground">
                約 {w.minutes} 分鐘・{w.tasks.filter((t) => t.status === "completed").length}/{w.tasks.length} 完成
              </span>
            </div>
            <ol className="grid gap-3">
              {w.tasks.map((t) => (
                <li key={t.id} className={cn("grid gap-4 border border-border bg-card p-4 lg:grid-cols-[minmax(0,1fr)_auto]", (t.status === "completed" || t.status === "skipped") && "bg-secondary")}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tracking-[0.1em] text-muted-foreground">
                      <span>{TYPE_LABELS[t.taskType]}</span>
                      <span>約 {t.estimatedMinutes} 分鐘</span>
                      {t.skillName ? <span>{t.skillName}</span> : null}
                      <span className={cn(t.status === "completed" && "text-foreground")}>{STATUS_LABELS[t.status]}</span>
                    </div>
                    <p className={cn("mt-2 text-base font-medium tracking-[0.02em]", t.status === "completed" && "line-through decoration-foreground/40", t.status === "skipped" && "text-muted-foreground")}>
                      {t.title}
                    </p>
                    {t.description ? <p className="mt-1 text-[13px] leading-6 text-foreground/75">{t.description}</p> : null}
                    {t.verification ? (
                      <p className="mt-2 text-xs leading-5 text-muted-foreground">
                        <span className="font-medium text-foreground">驗證：</span>
                        {t.verification}
                      </p>
                    ) : null}
                    {t.knowledge ? (
                      <Link href={`/knowledge/${encodeURIComponent(t.knowledge.slug)}`} className="mt-2 inline-flex items-center gap-2 text-xs tracking-[0.06em] hover:dotted-underline">
                        知識頁：{t.skillName ?? t.knowledge.slug}
                        {t.knowledge.status === "stub" ? <span className="text-muted-foreground">待建立</span> : <ProgressBadge status={t.knowledge.progress} />}
                      </Link>
                    ) : null}
                  </div>
                  <div className="lg:pt-1">
                    <TaskStatusControls planId={plan.id} taskId={t.id} status={t.status} />
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-5 py-4">
      <p className="text-xs font-medium tracking-[0.1em] text-foreground/70">{label}</p>
      <p className="mt-1 font-display text-xl font-normal tabular-nums tracking-[0.02em]">{value}</p>
    </div>
  );
}
