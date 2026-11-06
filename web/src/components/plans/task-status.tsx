"use client";

import { Check, Play, RotateCcw, SkipForward } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setTaskStatusAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { TaskStatus } from "@/lib/db/schema";

/** 任務的狀態操作：開始、完成、略過、還原 */
export function TaskStatusControls({ planId, taskId, status }: { planId: string; taskId: string; status: TaskStatus }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set(next: TaskStatus) {
    setError(null);
    startTransition(async () => {
      const result = await setTaskStatusAction(planId, taskId, next);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  const btn = "h-8 tracking-[0.04em]";
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "todo" ? (
        <>
          <Button type="button" size="sm" className={btn} disabled={pending} onClick={() => set("in_progress")}>
            <Play /> 開始
          </Button>
          <Button type="button" size="sm" variant="outline" className={btn} disabled={pending} onClick={() => set("completed")}>
            <Check /> 完成
          </Button>
          <Button type="button" size="sm" variant="ghost" className={btn} disabled={pending} onClick={() => set("skipped")}>
            <SkipForward /> 略過
          </Button>
        </>
      ) : status === "in_progress" ? (
        <>
          <Button type="button" size="sm" className={btn} disabled={pending} onClick={() => set("completed")}>
            <Check /> 完成
          </Button>
          <Button type="button" size="sm" variant="ghost" className={btn} disabled={pending} onClick={() => set("skipped")}>
            <SkipForward /> 略過
          </Button>
          <Button type="button" size="sm" variant="ghost" className={btn} disabled={pending} onClick={() => set("todo")}>
            <RotateCcw /> 還原
          </Button>
        </>
      ) : (
        <Button type="button" size="sm" variant="ghost" className={btn} disabled={pending} onClick={() => set("todo")}>
          <RotateCcw /> 還原為待辦
        </Button>
      )}
      {error ? (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
