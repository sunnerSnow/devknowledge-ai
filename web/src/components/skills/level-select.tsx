"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setSkillLevelAction } from "@/app/actions";
import { SKILL_LEVEL_HINTS, SKILL_LEVEL_LABELS, SKILL_LEVELS, UNASSESSED_LABEL } from "@/lib/skills/levels";
import { cn } from "@/lib/utils";

/**
 * 技能自評的下拉選單：未評估／0–4。
 * 選了就立刻存（Server Action），不需要另外按儲存；失敗會還原並顯示訊息。
 */
export function LevelSelect({
  skillName,
  level,
  category,
  size = "default",
  className,
}: {
  skillName: string;
  level: number | null;
  category?: string | null;
  size?: "default" | "sm";
  className?: string;
}) {
  const router = useRouter();
  const fromProps = level === null ? "" : String(level);
  const [current, setCurrent] = useState<string>(fromProps);
  const [seen, setSeen] = useState(fromProps);
  // 別處改了同一個技能、router.refresh 之後 props 變了，顯示值要跟著更新
  if (seen !== fromProps) {
    setSeen(fromProps);
    setCurrent(fromProps);
  }
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onChange(value: string) {
    const previous = current;
    setCurrent(value);
    setError(null);
    startTransition(async () => {
      const result = await setSkillLevelAction(skillName, value === "" ? null : Number(value), { category: category ?? undefined });
      if (result.error) {
        setCurrent(previous);
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <span className={cn("inline-flex flex-col gap-1", className)}>
      <select
        aria-label={`${skillName} 的程度`}
        value={current}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "rounded-full border border-border bg-card px-3 tracking-[0.02em] outline-none focus-visible:focus-ring disabled:opacity-60",
          size === "sm" ? "h-8 text-xs" : "h-10 text-sm",
          current === "" ? "text-muted-foreground" : "text-foreground",
        )}
      >
        <option value="">{UNASSESSED_LABEL}</option>
        {SKILL_LEVELS.map((l) => (
          <option key={l} value={l}>
            {l}・{SKILL_LEVEL_LABELS[l]}（{SKILL_LEVEL_HINTS[l]}）
          </option>
        ))}
      </select>
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
