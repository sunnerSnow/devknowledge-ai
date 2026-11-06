import type { Metadata } from "next";
import Link from "next/link";
import { ProgressBadge } from "@/components/knowledge/progress-badge";
import { AddSkillForm, DeleteSkillButton } from "@/components/skills/skill-controls";
import { LevelSelect } from "@/components/skills/level-select";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import type { ProgressStatus } from "@/lib/db/schema";
import { listUserSkills, SKILL_CATEGORIES } from "@/lib/services/skills";
import { EVIDENCE_LABELS } from "@/lib/skills/levels";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My Skills" };

const CATEGORY_LABELS: Record<string, string> = { Frontend: "前端", Backend: "後端", Database: "資料庫", Cloud: "雲端", AI: "AI", Testing: "測試", DevOps: "DevOps", Security: "資安", General: "一般" };

export default async function SkillsPage({ searchParams }: PageProps<"/skills">) {
  const user = await requireUser();
  const params = await searchParams;
  const category = typeof params.category === "string" && (SKILL_CATEGORIES as readonly string[]).includes(params.category) ? params.category : null;
  const skills = await listUserSkills(await getDb(), user.id, { category });
  const assessed = skills.filter((s) => s.level !== null).length;

  return (
    <div className="grid gap-12">
      <PageHeader
        eyebrow="技能地圖"
        title="My Skills"
        description="你的技能與熟悉程度，來源是自評、測驗或實作紀錄。等級可以隨時手動調整；AI 的建議不會未經你確認就改動這裡。"
      />

      <nav aria-label="分類" className="flex flex-wrap gap-x-5 gap-y-2 text-sm tracking-[0.06em]">
        <Link href="/skills" className={cn(category === null ? "dotted-underline text-foreground" : "text-muted-foreground hover:text-foreground")}>
          全部
        </Link>
        {SKILL_CATEGORIES.map((c) => (
          <Link key={c} href={`/skills?category=${c}`} className={cn(category === c ? "dotted-underline text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {CATEGORY_LABELS[c] ?? c}
          </Link>
        ))}
      </nav>

      {skills.length ? (
        <section className="grid gap-4">
          <p className="text-xs tracking-[0.08em] text-muted-foreground">
            {skills.length} 項技能，已評估 {assessed} 項
          </p>
          <ul className="grid gap-px bg-foreground/10">
            {skills.map((s) => (
              <li key={s.id} className="grid gap-4 bg-card p-5 md:grid-cols-[minmax(0,1.4fr)_auto_minmax(0,1fr)_auto] md:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {s.knowledge ? (
                      <Link href={`/knowledge/${encodeURIComponent(s.knowledge.slug)}`} className="text-base font-medium tracking-[0.02em] hover:dotted-underline">
                        {s.skillName}
                      </Link>
                    ) : (
                      <span className="text-base font-medium tracking-[0.02em]">{s.skillName}</span>
                    )}
                    {s.category ? <span className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">{CATEGORY_LABELS[s.category] ?? s.category}</span> : null}
                    {s.knowledge && s.knowledge.status !== "stub" ? <ProgressBadge status={(s.knowledge.progress as ProgressStatus | null) ?? null} /> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    來源：{EVIDENCE_LABELS[s.evidenceType] ?? s.evidenceType}・更新於 {new Date(s.updatedAt).toLocaleDateString("zh-TW")}
                    {s.jobCount ? `・${s.jobCount} 份職缺要求` : ""}
                    {s.goalWeight !== 1 ? `・目標權重 ${s.goalWeight}` : ""}
                  </p>
                  {s.evidenceNote ? <p className="mt-1 text-xs leading-5 text-foreground/70">{s.evidenceNote}</p> : null}
                </div>
                <LevelSelect skillName={s.skillName} level={s.level} category={s.category} />
                <span className="hidden md:block" />
                <DeleteSkillButton id={s.id} name={s.skillName} />
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <EmptyState
          title={category ? `這個分類還沒有技能` : "還沒有任何技能"}
          description="到職缺頁逐項自評，或在下面直接新增一個技能並選擇程度。"
        />
      )}

      <section className="max-w-xl bg-card p-6">
        <p className="section-label">新增技能</p>
        <AddSkillForm />
      </section>
    </div>
  );
}
