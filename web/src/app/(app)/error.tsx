"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // 只記錯誤類型與 digest；不把內容送到瀏覽器 console 以外的地方
    console.error("[dk] page error", error.digest ?? error.name);
  }, [error]);

  return (
    <EmptyState
      title="這個頁面出了點問題"
      description="系統發生錯誤。你可以重試一次；若持續發生，請稍後再回來。"
      action={
        <Button onClick={reset} variant="outline">
          重試
        </Button>
      }
    />
  );
}
