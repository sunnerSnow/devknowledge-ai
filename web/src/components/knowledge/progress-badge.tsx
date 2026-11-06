import { Badge } from "@/components/ui/badge";
import type { ProgressStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export const PROGRESS_LABELS: Record<ProgressStatus, string> = {
  not_started: "未學習",
  learning: "學習中",
  understood: "已理解",
  implemented: "已實作",
};

/* 單色為主，只有狀態用少量顏色：未學習灰、學習中黃、已理解藍、已實作黑 */
const STYLES: Record<ProgressStatus, string> = {
  not_started: "bg-muted text-muted-foreground",
  learning: "bg-gold/70 text-gold-foreground",
  understood: "bg-sky/20 text-[#1f3f85]",
  implemented: "bg-primary text-primary-foreground",
};

export function ProgressBadge({ status, className }: { status: ProgressStatus | null | undefined; className?: string }) {
  const s = status ?? "not_started";
  return (
    <Badge variant="outline" className={cn("h-auto border-transparent px-2 py-0.5 text-[11px] font-medium tracking-[0.08em]", STYLES[s], className)}>
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
  return <span className="text-[11px] tracking-[0.12em] text-muted-foreground uppercase">{CATEGORY_LABELS[category] ?? category}</span>;
}
