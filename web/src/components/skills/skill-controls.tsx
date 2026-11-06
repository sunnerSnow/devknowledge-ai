"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteSkillAction, setSkillLevelAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { CtaButton } from "@/components/ui/cta-button";
import { Input } from "@/components/ui/input";
import { SKILL_LEVEL_LABELS, SKILL_LEVELS } from "@/lib/skills/levels";

/** 手動新增一個技能（名稱＋程度） */
export function AddSkillForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [level, setLevel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await setSkillLevelAction(name, level === "" ? null : Number(level));
          if (result.error) setError(result.error);
          else {
            setName("");
            setLevel("");
            router.refresh();
          }
        });
      }}
    >
      <label className="sr-only" htmlFor="new-skill-name">
        技能名稱
      </label>
      <Input id="new-skill-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="技能名稱，例如 TypeScript" maxLength={80} className="h-10 bg-background" required />
      <select aria-label="程度" value={level} onChange={(e) => setLevel(e.target.value)} className="h-10 border border-input bg-background px-2 text-sm">
        <option value="">未評估</option>
        {SKILL_LEVELS.map((l) => (
          <option key={l} value={l}>
            {l}・{SKILL_LEVEL_LABELS[l]}
          </option>
        ))}
      </select>
      <CtaButton type="submit" disabled={pending || !name.trim()}>
        {pending ? "新增中…" : "新增"}
      </CtaButton>
      {error ? (
        <p className="text-xs text-destructive sm:col-span-3" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

export function DeleteSkillButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={`刪除 ${name}`}
      title="刪除"
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
      onClick={() => {
        if (!window.confirm(`刪除「${name}」的自評？職缺的技能需求不受影響。`)) return;
        startTransition(async () => {
          await deleteSkillAction(id);
          router.refresh();
        });
      }}
    >
      <Trash2 />
    </Button>
  );
}
