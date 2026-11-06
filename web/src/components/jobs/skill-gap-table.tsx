import Link from "next/link";
import { CategoryBadge } from "@/components/knowledge/progress-badge";
import { LevelSelect } from "@/components/skills/level-select";
import type { JobSkillRow } from "@/lib/services/jobs";
import { levelLabel } from "@/lib/skills/levels";
import { cn } from "@/lib/utils";

/** 技能差距表（規格 4.6）：職缺要求、你的程度（可直接自評）、差距、優先分數與理由 */
export function SkillGapTable({ skills, title, hint }: { skills: JobSkillRow[]; title: string; hint?: string }) {
  if (!skills.length) return null;
  return (
    <section className="grid gap-3">
      <div className="flex items-baseline gap-3">
        <h3 className="text-sm font-medium tracking-[0.08em]">{title}</h3>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      <ul className="grid gap-px bg-foreground/10">
        {skills.map((s) => (
          <li key={s.id} className="grid gap-4 bg-card p-5 md:grid-cols-[minmax(0,1.3fr)_auto_auto_minmax(0,1fr)] md:items-start">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {s.knowledge ? (
                  <Link href={`/knowledge/${encodeURIComponent(s.knowledge.slug)}`} className="text-base font-medium tracking-[0.02em] hover:dotted-underline">
                    {s.skillName}
                  </Link>
                ) : (
                  <span className="text-base font-medium tracking-[0.02em]">{s.skillName}</span>
                )}
                <CategoryBadge category={s.category} />
                {s.knowledge?.status === "stub" ? <span className="text-[10px] tracking-[0.12em] text-muted-foreground">知識頁待建立</span> : null}
              </div>
              {s.originalPhrase ? <p className="mt-1 text-xs text-muted-foreground">原文：「{s.originalPhrase}」</p> : null}
              {s.reason ? <p className="mt-1 text-[13px] leading-6 text-foreground/75">{s.reason}</p> : null}
            </div>
            <div className="text-sm md:text-right">
              <p className="text-[11px] tracking-[0.12em] text-muted-foreground">職缺要求</p>
              <p className="mt-1 whitespace-nowrap">
                {s.requiredLevel}・{levelLabel(s.requiredLevel)}
              </p>
              <p className="text-[11px] text-muted-foreground">重要性 {"●".repeat(s.importance)}</p>
            </div>
            <div className="text-sm">
              <p className="text-[11px] tracking-[0.12em] text-muted-foreground">你的程度</p>
              <LevelSelect skillName={s.skillName} level={s.user?.level ?? null} category={s.category} size="sm" className="mt-1" />
            </div>
            <div className="text-sm">
              <p className="text-[11px] tracking-[0.12em] text-muted-foreground">優先分數</p>
              {s.priority.score === null ? (
                <p className="mt-1 text-muted-foreground">待評估</p>
              ) : (
                <p className={cn("mt-1 text-xl font-medium tabular-nums", s.priority.score === 0 && "text-muted-foreground")}>{s.priority.score}</p>
              )}
              <ul className="mt-1 grid gap-0.5 text-[11px] leading-5 text-muted-foreground">
                {s.priority.reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
