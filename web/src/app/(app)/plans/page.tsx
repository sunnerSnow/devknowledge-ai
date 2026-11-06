import type { Metadata } from "next";
import Link from "next/link";
import { CtaButton } from "@/components/ui/cta-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listPlans, type PlanSummary } from "@/lib/services/plans";

export const metadata: Metadata = { title: "Plans" };

const STATUS_LABELS = { active: "進行中", completed: "已完成", archived: "已封存" } as const;

export default async function PlansPage() {
  const user = await requireUser();
  const plans = await listPlans(await getDb(), user.id);
  const active = plans.filter((p) => p.status !== "archived");
  const archived = plans.filter((p) => p.status === "archived");

  return (
    <div className="grid gap-12">
      <PageHeader
        eyebrow="學習計畫"
        title="Plans"
        description="依職缺差距排出的週學習任務。完成「閱讀」任務會把知識頁標成已理解，完成「實作」標成已實作；回到職缺頁可以看差距的變化。"
        actions={<CtaButton href="/jobs">從職缺產生計畫</CtaButton>}
      />
      {plans.length === 0 ? (
        <EmptyState title="還沒有學習計畫" description="先到職缺頁逐項自評，有差距後按「產生學習計畫」。" action={<CtaButton href="/jobs" size="lg">前往職缺</CtaButton>} />
      ) : (
        <>
          <PlanList plans={active} />
          {archived.length ? (
            <section className="grid gap-4">
              <p className="section-label">已封存</p>
              <PlanList plans={archived} muted />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function PlanList({ plans, muted = false }: { plans: PlanSummary[]; muted?: boolean }) {
  if (!plans.length) return null;
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {plans.map((p) => {
        const done = p.completedTasks + p.skippedTasks;
        const pct = p.totalTasks ? Math.round((p.completedTasks / p.totalTasks) * 100) : 0;
        return (
          <li key={p.id} className="flex">
            <Link href={`/plans/${p.id}`} className={`group flex flex-1 flex-col bg-card p-6 transition-colors hover:bg-white ${muted ? "opacity-70" : ""}`}>
              <div className="flex items-start justify-between gap-3 text-[11px] tracking-[0.12em] text-muted-foreground">
                <span className="truncate">{p.jobTitle ?? "沒有對應職缺"}</span>
                <span className="shrink-0">{STATUS_LABELS[p.status]}</span>
              </div>
              <h3 className="mt-4 text-xl font-medium tracking-[0.03em] group-hover:dotted-underline">{p.title}</h3>
              {p.goal ? <p className="mt-3 line-clamp-2 text-[13px] leading-6 text-muted-foreground">{p.goal}</p> : null}
              <div className="mt-auto pt-5">
                <div className="h-1 w-full bg-foreground/10">
                  <div className="h-1 bg-foreground" style={{ width: `${pct}%` }} />
                </div>
                <p className="mt-2 text-xs tracking-[0.06em] text-muted-foreground">
                  {p.weekCount} 週・{p.totalTasks} 項任務・完成 {p.completedTasks}
                  {p.skippedTasks ? `・略過 ${p.skippedTasks}` : ""}・剩餘約 {Math.round(p.remainingMinutes / 60)} 小時
                  {done === p.totalTasks && p.totalTasks ? "・全部處理完" : ""}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
