"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteRouteAction, setRouteArchivedAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function RouteActions({ routeId, archived }: { routeId: string; archived: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleArchive() {
    startTransition(async () => {
      const result = await setRouteArchivedAction(routeId, !archived);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" className="h-9 tracking-[0.04em]" disabled={pending} onClick={toggleArchive}>
        {archived ? "恢復" : "封存"}
      </Button>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="刪除學習路線" className="text-muted-foreground hover:text-destructive">
            <Trash2 />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>刪除這條學習路線？</DialogTitle>
            <DialogDescription>路線、診斷結果與課程安排會一起刪除；知識頁與小測驗的作答紀錄會保留。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <form action={deleteRouteAction.bind(null, routeId)}>
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
