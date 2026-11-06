"use client";

import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteJobAction, updateJobAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** 職缺頁右上角的操作：編輯、重新分析、封存／恢復、刪除 */
export function JobActions({ jobId, status }: { jobId: string; status: "active" | "archived" }) {
  const router = useRouter();
  const [reanalyzing, setReanalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function reanalyze() {
    setError(null);
    setReanalyzing(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ reanalyze: true }) });
      const json = (await res.json()) as { error: { message: string } | null };
      if (!res.ok) setError(json.error?.message ?? "重新分析失敗");
      else router.refresh();
    } catch {
      setError("連線失敗，請稍後再試");
    } finally {
      setReanalyzing(false);
    }
  }

  function toggleArchive() {
    startTransition(async () => {
      const result = await updateJobAction(jobId, { status: status === "active" ? "archived" : "active" });
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild variant="outline" className="h-9 tracking-[0.04em]">
        <Link href={`/jobs/${jobId}/edit`}>編輯</Link>
      </Button>
      <Button type="button" variant="outline" className="h-9 tracking-[0.04em]" disabled={reanalyzing} onClick={reanalyze}>
        {reanalyzing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        {reanalyzing ? "重新分析中…" : "重新分析"}
      </Button>
      <Button type="button" variant="ghost" className="h-9 tracking-[0.04em]" disabled={pending} onClick={toggleArchive}>
        {status === "active" ? "封存" : "恢復"}
      </Button>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label="刪除職缺" className="text-muted-foreground hover:text-destructive">
            <Trash2 />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>刪除這份職缺？</DialogTitle>
            <DialogDescription>職缺內容與它的技能需求會一起刪除；你對技能的自評會保留在 My Skills。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                取消
              </Button>
            </DialogClose>
            <form action={deleteJobAction.bind(null, jobId)}>
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
