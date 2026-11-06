import { Badge } from "@/components/ui/badge";
import type { ProgressStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export const PROGRESS_LABELS: Record<ProgressStatus, string> = {
  not_started: "未學習",
  learning: "學習中",
  understood: "已理解",
  implemented: "已實作",
};

/* 安靜的狀態標籤：未學習淡青、學習中淡黃、已理解淺藍、已實作青藍實底 */
const STYLES: Record<ProgressStatus, string> = {
  not_started: "bg-secondary text-muted-foreground",
  learning: "bg-soft-yellow text-foreground",
  understood: "bg-soft-blue text-foreground",
  implemented: "bg-primary text-primary-foreground",
};

export function ProgressBadge({ status, className }: { status: ProgressStatus | null | undefined; className?: string }) {
  const s = status ?? "not_started";
  return (
    <Badge variant="outline" className={cn("h-auto rounded-none border-transparent px-2 py-0.5 text-[11px] font-normal tracking-[0.12em]", STYLES[s], className)}>
      {PROGRESS_LABELS[s]}
    </Badge>
  );
}

export const CATEGORY_LABELS: Record<string, string> = {
  Frontend: "前端",
  Backend: "後端",
  Database: "資料庫",
  Cloud: "雲端",
  AI: "AI",
  Testing: "測試",
  DevOps: "DevOps",
  Security: "資安",
  General: "一般",
};

export function CategoryBadge({ category }: { category: string | null }) {
  if (!category) return null;
  return <span className="text-[11px] tracking-[0.16em] text-primary">{CATEGORY_LABELS[category] ?? category}</span>;
}
