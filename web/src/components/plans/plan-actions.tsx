"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deletePlanAction, setPlanStatusAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { PlanStatus } from "@/lib/db/schema";

export function PlanActions({ planId, status }: { planId: string; status: PlanStatus }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleArchive() {
    startTransition(async () => {
      const result = await setPlanStatusAction(planId, status === "archived" ? "active" : "archived");
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" className="h-9 tracking-[0.04em]" disabled={pending} onClick={toggleArchive}>
        {status === "archived" ? "恢復" : "封存"}
      </Button>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="刪除學習計畫" className="text-muted-foreground hover:text-destructive">
            <Trash2 />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>刪除這份學習計畫？</DialogTitle>
            <DialogDescription>計畫與所有任務會一起刪除；已回寫到知識頁的學習狀態會保留。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <form action={deletePlanAction.bind(null, planId)}>
              <Button type="submit" variant="destructive">
                刪除
              </Button>
            </form>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {error ? (
        <p className="basis-full text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
