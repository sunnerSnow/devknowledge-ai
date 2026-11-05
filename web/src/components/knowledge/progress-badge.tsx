import { Badge } from "@/components/ui/badge";
import type { ProgressStatus } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export const PROGRESS_LABELS: Record<ProgressStatus, string> = {
  not_started: "未學習",
  learning: "學習中",
  understood: "已理解",
  implemented: "已實作",
};

const STYLES: Record<ProgressStatus, string> = {
  not_started: "bg-muted text-muted-foreground border-transparent",
  learning: "bg-accent text-accent-foreground border-transparent",
  understood: "bg-secondary text-secondary-foreground border-transparent",
  implemented: "bg-teal text-teal-foreground border-transparent",
};

export function ProgressBadge({ status, className }: { status: ProgressStatus | null | undefined; className?: string }) {
  const s = status ?? "not_started";
  return (
    <Badge variant="outline" className={cn(STYLES[s], className)}>
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
  return (
    <Badge variant="outline" className="border-border bg-card text-xs font-normal text-muted-foreground">
      {CATEGORY_LABELS[category] ?? category}
    </Badge>
  );
}
