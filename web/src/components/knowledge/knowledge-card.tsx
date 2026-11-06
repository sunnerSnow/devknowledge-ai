import { Loader2 } from "lucide-react";
import Link from "next/link";
import { CategoryBadge, ProgressBadge } from "@/components/knowledge/progress-badge";
import type { KnowledgeNodeSummary } from "@/lib/services/knowledge";
import { cn } from "@/lib/utils";

/** 白色面板卡片：沒有邊框，名稱置中偏大；hover 時名稱加青藍底線 */
export function KnowledgeCard({ node, className }: { node: KnowledgeNodeSummary; className?: string }) {
  const stub = node.status === "stub";
  return (
    <Link
      href={`/knowledge/${encodeURIComponent(node.slug)}`}
      // panel 這個 utility 會蓋掉同一元素上的 bg-*，stub 卡片改直接給半透明白底
      className={cn("group flex min-h-44 flex-col p-6 transition-colors outline-none hover:bg-card/70 focus-visible:focus-ring", stub ? "bg-card/60" : "panel", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <CategoryBadge category={node.category} />
        <ProgressBadge status={node.progress?.status} className="shrink-0" />
      </div>
      <div className="flex flex-1 flex-col justify-center py-5">
        <h3 className="text-xl font-medium tracking-[0.1em] group-hover:dotted-underline">{node.name}</h3>
        {node.englishName && node.englishName !== node.name ? <p className="mt-1.5 truncate font-display text-sm tracking-[0.06em] text-muted-foreground">{node.englishName}</p> : null}
      </div>
      <p className="line-clamp-2 text-[13px] leading-6 tracking-[0.06em] text-muted-foreground">
        {node.generating ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            AI 生成中…
          </span>
        ) : stub ? (
          "尚未生成內容，點進去建立知識頁。"
        ) : (
          (node.summary ?? "")
        )}
      </p>
    </Link>
  );
}
