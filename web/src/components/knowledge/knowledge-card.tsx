import { Loader2 } from "lucide-react";
import Link from "next/link";
import { CategoryBadge, ProgressBadge } from "@/components/knowledge/progress-badge";
import type { KnowledgeNodeSummary } from "@/lib/services/knowledge";
import { cn } from "@/lib/utils";

export function KnowledgeCard({ node, className }: { node: KnowledgeNodeSummary; className?: string }) {
  const stub = node.status === "stub";
  return (
    <Link
      href={`/knowledge/${encodeURIComponent(node.slug)}`}
      className={cn(
        "group flex flex-col gap-2 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        stub && "border-dashed",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-primary group-hover:underline dark:text-foreground">{node.name}</h3>
          {node.englishName && node.englishName !== node.name ? <p className="truncate text-xs text-muted-foreground">{node.englishName}</p> : null}
        </div>
        <ProgressBadge status={node.progress?.status} className="shrink-0" />
      </div>
      <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
        {node.generating ? (
          <span className="inline-flex items-center gap-1.5 text-teal">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            AI 生成中…
          </span>
        ) : stub ? (
          "尚未生成內容，點進去建立知識頁。"
        ) : (
          (node.summary ?? "")
        )}
      </p>
      <div className="mt-auto flex items-center gap-2 pt-1">
        <CategoryBadge category={node.category} />
        {stub ? <span className="text-xs text-muted-foreground">待建立</span> : null}
      </div>
    </Link>
  );
}
