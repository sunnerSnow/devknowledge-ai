"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setProgressAction } from "@/app/actions";
import { PROGRESS_LABELS } from "@/components/knowledge/progress-badge";
import { PROGRESS_STATUSES, type ProgressStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

/** 標記學習狀態：未學習／學習中／已理解／已實作（一排文字，目前的那個是青藍底） */
export function ProgressControl({ nodeId, slug, status }: { nodeId: string; slug: string; status: ProgressStatus }) {
  const router = useRouter();
  const [current, setCurrent] = useState<ProgressStatus>(status);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: ProgressStatus) {
    if (next === current || pending) return;
    const previous = current;
    setCurrent(next);
    setError(null);
    startTransition(async () => {
      const result = await setProgressAction(nodeId, slug, next);
      if (result.error) {
        setCurrent(previous);
        setError(result.error);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="grid gap-2">
      <div role="radiogroup" aria-label="學習狀態" className="inline-flex flex-wrap border border-border bg-card">
        {PROGRESS_STATUSES.map((s) => {
          const active = s === current;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => choose(s)}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2 text-[13px] tracking-[0.12em] transition-colors outline-none focus-visible:focus-ring disabled:opacity-60",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-primary-strong",
              )}
            >
              {active ? <Check className="size-3.5" aria-hidden="true" strokeWidth={2} /> : null}
              {PROGRESS_LABELS[s]}
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
