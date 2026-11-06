"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setProgressAction } from "@/app/actions";
import { PROGRESS_LABELS } from "@/components/knowledge/progress-badge";
import { PROGRESS_STATUSES, type ProgressStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

/** 標記學習狀態：未學習／學習中／已理解／已實作 */
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
      <div role="radiogroup" aria-label="學習狀態" className="inline-flex flex-wrap gap-px bg-foreground/20">
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
                "inline-flex items-center gap-1 px-3 py-2 text-[13px] tracking-[0.06em] transition-colors disabled:opacity-60",
                active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {active ? <Check className="size-3.5" aria-hidden="true" /> : null}
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
