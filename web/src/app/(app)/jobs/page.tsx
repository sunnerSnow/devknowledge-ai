import type { Metadata } from "next";
import Link from "next/link";
import { CtaButton } from "@/components/ui/cta-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listJobs } from "@/lib/services/jobs";

export const metadata: Metadata = { title: "Job Analyzer" };

const SENIORITY_LABELS: Record<string, string> = { intern: "實習", junior: "初階", mid: "中階", senior: "資深", lead: "主管／Lead", unknown: "未標示" };

export default async function JobsPage() {
  const user = await requireUser();
  const jobs = await listJobs(await getDb(), user.id);
  const active = jobs.filter((j) => j.status === "active");
  const archived = jobs.filter((j) => j.status === "archived");

  return (
    <div className="grid gap-12">
      <PageHeader
        eyebrow="職缺分析"
        title="Job Analyzer"
        description="貼上 104 職缺，AI 會拆解成標準化技能需求；你逐項自評後，就能看見差距與優先順序。職缺需求與你的能力分開儲存，不會因為貼了職缺就被當成不足。"
        actions={<CtaButton href="/jobs/new">分析一份職缺</CtaButton>}
      />

      {jobs.length === 0 ? (
        <EmptyState
          title="還沒有分析過職缺"
          description="把 104 的職稱、工作內容、必要與加分條件貼進來，AI 會列出技能需求、建議等級與判斷理由。"
          action={<CtaButton href="/jobs/new" size="lg">貼上第一份職缺</CtaButton>}
        />
      ) : (
        <>
          <JobList jobs={active} />
          {archived.length ? (
            <section className="grid gap-4">
              <p className="section-sub">已封存</p>
              <JobList jobs={archived} muted />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function JobList({ jobs, muted = false }: { jobs: Awaited<ReturnType<typeof listJobs>>; muted?: boolean }) {
  if (!jobs.length) return null;
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {jobs.map((j) => (
        <li key={j.id} className="flex">
          <Link href={`/jobs/${j.id}`} className={`group flex flex-1 flex-col panel p-6 transition-colors hover:bg-card/70 ${muted ? "opacity-70" : ""}`}>
            <div className="flex items-start justify-between gap-3 text-xs tracking-[0.1em] text-muted-foreground">
              <span className="truncate">{j.company ?? "公司未填"}</span>
              <span className="shrink-0">{j.seniority ? SENIORITY_LABELS[j.seniority] : "未分析"}</span>
            </div>
            <h3 className="mt-4 text-xl font-medium tracking-[0.03em] group-hover:dotted-underline">{j.title}</h3>
            <p className="mt-3 line-clamp-2 text-[13px] leading-6 text-muted-foreground">{j.roleSummary ?? "尚未分析"}</p>
            <p className="mt-auto pt-5 text-xs tracking-[0.06em] text-muted-foreground">
              {j.skillCount} 項技能・必要 {j.requiredCount}・{new Date(j.createdAt).toLocaleDateString("zh-TW")}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
