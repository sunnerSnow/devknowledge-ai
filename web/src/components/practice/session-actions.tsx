"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteSessionAction, endSessionAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { SessionStatus } from "@/lib/db/schema";

export function SessionActions({ sessionId, status }: { sessionId: string; status: SessionStatus }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function end() {
    startTransition(async () => {
      const result = await endSessionAction(sessionId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "active" ? (
        <Button type="button" variant="outline" disabled={pending} onClick={end}>
          結束練習
        </Button>
      ) : null}
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="刪除練習紀錄" className="text-muted-foreground hover:text-destructive">
            <Trash2 />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>刪除這次練習？</DialogTitle>
            <DialogDescription>題目、回答與評估會一起刪除；你已確認到 My Skills 的程度會保留。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <form action={deleteSessionAction.bind(null, sessionId)}>
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
