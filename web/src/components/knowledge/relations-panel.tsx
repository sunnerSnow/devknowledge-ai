import Link from "next/link";
import { ProgressBadge } from "@/components/knowledge/progress-badge";
import type { RelationType } from "@/lib/db/schema";
import type { KnowledgeDetail, KnowledgeRelationItem } from "@/lib/services/knowledge";

const GROUPS: { type: RelationType; title: string; hint: string }[] = [
  { type: "prerequisite", title: "前置知識", hint: "先懂這些，再讀本頁會順很多" },
  { type: "related", title: "相關技術", hint: "常一起出現" },
  { type: "extension", title: "延伸學習", hint: "讀完本頁可以接著學" },
  { type: "alternative", title: "替代方案", hint: "解決類似問題的其他做法" },
];

export function RelationsPanel({ detail }: { detail: KnowledgeDetail }) {
  const byType = new Map<RelationType, KnowledgeRelationItem[]>();
  for (const r of detail.relations) byType.set(r.type, [...(byType.get(r.type) ?? []), r]);
  const hasAny = detail.relations.length > 0 || detail.neededBy.length > 0;

  if (!hasAny) {
    return <p className="text-sm leading-7 text-muted-foreground">生成內容後，這裡會列出前置知識與相關技術。</p>;
  }

  return (
    <div className="grid gap-7">
      {GROUPS.map((g) => {
        const items = byType.get(g.type);
        if (!items?.length) return null;
        return (
          <section key={g.type} aria-labelledby={`rel-${g.type}`}>
            <h3 id={`rel-${g.type}`} className="text-sm font-medium tracking-[0.06em]">
              {g.title}
            </h3>
            <p className="text-[11px] tracking-[0.04em] text-muted-foreground">{g.hint}</p>
            <ul className="mt-3 grid gap-px bg-foreground/10">
              {items.map((r) => (
                <li key={r.node.id}>
                  <RelationLink node={r.node} reason={r.reason} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {detail.neededBy.length ? (
        <section aria-labelledby="rel-needed-by">
          <h3 id="rel-needed-by" className="text-sm font-medium tracking-[0.06em]">
            誰需要它
          </h3>
          <p className="text-[11px] tracking-[0.04em] text-muted-foreground">這些知識頁把本頁列為前置知識</p>
          <ul className="mt-3 grid gap-px bg-foreground/10">
            {detail.neededBy.map((n) => (
              <li key={n.id}>
                <RelationLink node={n} reason={null} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function RelationLink({ node, reason }: { node: KnowledgeRelationItem["node"]; reason: string | null }) {
  const stub = node.status === "stub";
  return (
    <Link href={`/knowledge/${encodeURIComponent(node.slug)}`} className="group block bg-card px-4 py-3 transition-colors hover:bg-white" title={reason ?? undefined}>
      <span className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium tracking-[0.02em] group-hover:dotted-underline">{node.name}</span>
        {stub ? <span className="shrink-0 text-[10px] tracking-[0.12em] text-muted-foreground">待建立</span> : <ProgressBadge status={node.progress?.status} className="shrink-0" />}
      </span>
      {reason ? <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{reason}</span> : null}
    </Link>
  );
}
