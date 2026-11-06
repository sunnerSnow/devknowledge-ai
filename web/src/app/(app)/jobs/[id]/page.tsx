import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JobActions } from "@/components/jobs/job-actions";
import { SkillGapTable } from "@/components/jobs/skill-gap-table";
import { ProgressBadge } from "@/components/knowledge/progress-badge";
import { SectionHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import type { ProgressStatus } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { GeneratePlanButton } from "@/components/plans/generate-plan-button";
import { ANALYSIS_ERROR_MESSAGES, getJob, type JobDetail } from "@/lib/services/jobs";
import { listPlans } from "@/lib/services/plans";

const SENIORITY_LABELS: Record<string, string> = { intern: "實習", junior: "初階", mid: "中階", senior: "資深", lead: "主管／Lead", unknown: "資歷未標示" };

async function load(id: string): Promise<JobDetail | null> {
  const user = await requireUser();
  try {
    return await getJob(await getDb(), user.id, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/jobs/[id]">): Promise<Metadata> {
  const { id } = await params;
  const job = await load(id);
  return { title: job?.title ?? "職缺" };
}

export default async function JobDetailPage({ params, searchParams }: PageProps<"/jobs/[id]">) {
  const { id } = await params;
  const { analysisError } = await searchParams;
  const job = await load(id);
  if (!job) notFound();
  const plans = await listPlans(await getDb(), (await requireUser()).id, { jobId: job.id });
  // query string 只帶錯誤碼，訊息由伺服器端對照（不信任網址裡的文字）
  const failedMessage =
    typeof analysisError === "string" ? (Object.hasOwn(ANALYSIS_ERROR_MESSAGES, analysisError) ? ANALYSIS_ERROR_MESSAGES[analysisError] : ANALYSIS_ERROR_MESSAGES.internal_error) : null;

  const required = job.skills.filter((s) => s.requirementType === "required");
  const preferred = job.skills.filter((s) => s.requirementType === "preferred");
  const linked = job.skills.filter((s) => s.knowledge);
  const analyzed = job.analyzedAt ? new Date(job.analyzedAt).toLocaleString("zh-TW", { dateStyle: "medium", timeStyle: "short" }) : null;

  return (
    <div className="grid gap-12">
      <header className="grid gap-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] tracking-[0.12em] text-muted-foreground">
          <Link href="/jobs" className="hover:dotted-underline">
            ← 全部職缺
          </Link>
          {job.company ? <span>{job.company}</span> : null}
          {job.seniority ? <span>{SENIORITY_LABELS[job.seniority]}</span> : null}
          {job.status === "archived" ? <span>已封存</span> : null}
          {analyzed ? <span>分析於 {analyzed}</span> : null}
          {job.analysisMeta ? <span>{job.analysisMeta.provider === "mock" ? "mock provider" : `${job.analysisMeta.provider} ${job.analysisMeta.model ?? ""}`}</span> : null}
        </div>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="section-label">職缺</p>
            <h1 className="mt-2 text-[clamp(30px,4vw,52px)] leading-[1.15] font-medium tracking-[0.03em]">{job.title}</h1>
            {job.sourceUrl ? (
              <a href={job.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-3 inline-block text-xs tracking-[0.06em] text-muted-foreground hover:dotted-underline">
                原始職缺連結 ↗
              </a>
            ) : null}
          </div>
          <JobActions jobId={job.id} status={job.status} />
        </div>
      </header>

      {!job.analysis ? (
        <div className="bg-card p-8 text-center text-sm leading-7 text-muted-foreground">
          {failedMessage ? (
            <p className="mb-2 text-foreground" role="alert">
              職缺已儲存，但 AI 分析沒有完成。{failedMessage}
            </p>
          ) : null}
          按右上角「重新分析」再試一次；不需要重新貼職缺。
        </div>
      ) : (
        <>
          {/* 職缺摘要 */}
          <section className="grid gap-px bg-foreground/10 lg:grid-cols-[1.4fr_1fr]">
            <div className="bg-card p-6">
              <p className="section-label">職缺摘要</p>
              <p className="mt-3 text-lg leading-8 font-medium tracking-[0.02em]">{job.analysis.role_summary}</p>
              {job.analysis.responsibilities.length ? (
                <ul className="mt-5 grid gap-1.5 text-sm leading-7 text-foreground/80">
                  {job.analysis.responsibilities.map((r, i) => (
                    <li key={i} className="flex gap-3">
                      <span aria-hidden="true" className="text-muted-foreground">
                        —
                      </span>
                      {r}
                    </li>
                  ))}
                </ul>
              ) : null}
              {job.analysis.assumptions.length ? (
                <div className="mt-5 border-l-2 border-foreground pl-3 text-xs leading-6 text-muted-foreground">
                  <p className="font-medium text-foreground">AI 的假設</p>
                  {job.analysis.assumptions.map((a, i) => (
                    <p key={i}>{a}</p>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="grid gap-px bg-foreground/10">
              <div className="bg-card p-6">
                <p className="section-label">技能需求</p>
                <dl className="mt-3 grid grid-cols-3 gap-3">
                  <Stat label="必要" value={required.length} />
                  <Stat label="加分" value={preferred.length} />
                  <Stat label="待評估" value={job.unassessedCount} muted={job.unassessedCount === 0} />
                </dl>
                {job.unassessedCount > 0 ? <p className="mt-4 text-xs leading-6 text-muted-foreground">逐項選擇「你的程度」後，才會算出差距與優先順序；不想現在評的可以先留著。</p> : null}
              </div>
              <div className="bg-card p-6">
                <p className="section-label">面試重點</p>
                {job.analysis.interview_focus.length ? (
                  <ul className="mt-3 grid gap-1.5 text-sm leading-6">
                    {job.analysis.interview_focus.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">分析沒有列出面試重點。</p>
                )}
                <p className="mt-4 text-[11px] tracking-[0.12em] text-muted-foreground">面試練習將在 PHASE 4 推出</p>
              </div>
            </div>
          </section>

          {/* 建議學習順序 */}
          <section className="grid gap-5">
            <SectionHeader eyebrow="建議學習順序" title="Priorities" aside={<span className="text-muted-foreground">優先分數＝必要 3／加分 1 × 差距 × 目標權重</span>} />
            {job.learningOrder.length ? (
              <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {job.learningOrder.map((s, i) => (
                  <li key={s.id} className="flex flex-col bg-card p-5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs tracking-[0.12em] text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                      <span className="text-2xl font-medium tabular-nums">{s.priority.score}</span>
                    </div>
                    <p className="mt-3 text-lg font-medium tracking-[0.02em]">
                      {s.knowledge ? (
                        <Link href={`/knowledge/${encodeURIComponent(s.knowledge.slug)}`} className="hover:dotted-underline">
                          {s.skillName}
                        </Link>
                      ) : (
                        s.skillName
                      )}
                    </p>
                    <ul className="mt-2 grid gap-0.5 text-[12px] leading-5 text-muted-foreground">
                      {s.priority.reasons.map((r, j) => (
                        <li key={j}>{r}</li>
                      ))}
                    </ul>
                    {s.knowledge?.status === "stub" ? (
                      <Link href={`/knowledge/${encodeURIComponent(s.knowledge.slug)}`} className="mt-auto pt-4 text-xs tracking-[0.08em] dotted-underline">
                        用 AI 建立知識頁 →
                      </Link>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <div className="bg-card p-8 text-sm leading-7 text-muted-foreground">
                {job.unassessedCount === job.skills.length ? "還沒有任何自評。在下面的差距表選擇你的程度，這裡會依優先分數排出建議順序。" : "已評估的技能都達到要求，沒有需要補強的項目。"}
              </div>
            )}
            <div className="grid gap-4 bg-card p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <div>
                <p className="section-label">學習計畫</p>
                {plans.length ? (
                  <ul className="mt-2 grid gap-1 text-sm">
                    {plans.map((p) => (
                      <li key={p.id}>
                        <Link href={`/plans/${p.id}`} className="hover:dotted-underline">
                          {p.title}
                        </Link>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {p.completedTasks}/{p.totalTasks} 完成・{p.status === "active" ? "進行中" : p.status === "completed" ? "已完成" : "已封存"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">依上面的建議順序與你每週可投入的時間（設定頁可改），AI 會排出每週的學習任務與可驗證成果。</p>
                )}
              </div>
              <GeneratePlanButton
                jobId={job.id}
                label={plans.length ? "再產生一份計畫" : "產生學習計畫"}
                disabledReason={job.learningOrder.length ? null : job.unassessedCount === job.skills.length ? "先自評才能產生計畫" : "沒有差距，不需要計畫"}
              />
            </div>
          </section>

          {/* 差距表 */}
          <section className="grid gap-8">
            <SectionHeader eyebrow="技能差距表" title="Skills" aside={<span className="text-muted-foreground">選擇程度會立即儲存到 My Skills</span>} />
            <SkillGapTable skills={required} title="必要技能" hint="權重 3" />
            <SkillGapTable skills={preferred} title="加分技能" hint="權重 1" />
          </section>

          {/* 知識進度 */}
          {linked.length ? (
            <section className="grid gap-5">
              <SectionHeader eyebrow="相關知識頁的學習進度" title="Knowledge" />
              <ul className="flex flex-wrap gap-2">
                {linked.map((s) => (
                  <li key={s.id}>
                    <Link href={`/knowledge/${encodeURIComponent(s.knowledge!.slug)}`} className="inline-flex items-center gap-2 bg-card px-3 py-2 text-sm hover:dotted-underline">
                      {s.skillName}
                      {s.knowledge!.status === "stub" ? <span className="text-[10px] tracking-[0.12em] text-muted-foreground">待建立</span> : <ProgressBadge status={(s.knowledge!.progress as ProgressStatus | null) ?? null} />}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {/* 原文 */}
      <details className="group bg-card">
        <summary className="cursor-pointer list-none p-5 text-sm font-medium tracking-[0.06em]">
          職缺原文 <span className="ml-2 text-xs text-muted-foreground group-open:hidden">展開</span>
        </summary>
        <div className="grid gap-5 border-t border-dotted border-foreground/30 p-5 text-sm leading-7 whitespace-pre-wrap">
          <div>{job.rawDescription}</div>
          {job.requiredSkillsRaw ? (
            <div>
              <p className="section-label mb-1">必要技能</p>
              {job.requiredSkillsRaw}
            </div>
          ) : null}
          {job.preferredSkillsRaw ? (
            <div>
              <p className="section-label mb-1">加分技能</p>
              {job.preferredSkillsRaw}
            </div>
          ) : null}
          {job.notes ? (
            <div>
              <p className="section-label mb-1">備註</p>
              {job.notes}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function Stat({ label, value, muted = false }: { label: string; value: number; muted?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className={`mt-1 text-2xl font-medium tabular-nums ${muted ? "text-muted-foreground" : ""}`}>{value}</dd>
    </div>
  );
}
