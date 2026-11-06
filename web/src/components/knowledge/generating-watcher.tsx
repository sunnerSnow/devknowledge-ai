"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 知識頁正在生成時掛上：每 3 秒查一次，完成就重新載入頁面 */
export function GeneratingWatcher({ slug }: { slug: string }) {
  const router = useRouter();
  useEffect(() => {
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/knowledge/${encodeURIComponent(slug)}`, { cache: "no-store" });
        const json = (await res.json()) as { data: { generating: boolean } | null };
        if (!stopped && json.data && !json.data.generating) {
          clearInterval(timer);
          router.refresh();
        }
      } catch {
        // 網路暫時失敗就等下一次
      }
    }, 3000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [slug, router]);

  return (
    <p className="inline-flex items-center gap-2 border-l-2 border-foreground pl-3 text-sm" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      AI 正在生成這一頁，通常需要 20–60 秒；完成後會自動更新。
    </p>
  );
}
