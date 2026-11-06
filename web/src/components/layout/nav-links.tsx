"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  hint: string;
  /** 這個 Phase 還沒做 */
  soon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", hint: "總覽" },
  { href: "/knowledge", label: "Knowledge", hint: "知識探索" },
  { href: "/jobs", label: "Job Analyzer", hint: "職缺分析", soon: true },
  { href: "/practice", label: "Practice", hint: "面試練習", soon: true },
  { href: "/skills", label: "My Skills", hint: "技能地圖", soon: true },
  { href: "/settings", label: "Settings", hint: "設定" },
];

/** 文字式導覽：目前頁用虛線底線標示 */
export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="主選單" className="grid gap-1">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn("group flex items-start justify-between gap-3 py-2.5 text-[15px] transition-colors", active ? "text-foreground" : "text-foreground/60 hover:text-foreground")}
          >
            <span className="flex min-w-0 flex-col gap-1">
              <span className={cn("font-medium tracking-[0.04em] whitespace-nowrap", active && "dotted-underline")}>{item.label}</span>
              <span className="text-[11px] tracking-[0.14em] text-muted-foreground">{item.hint}</span>
            </span>
            {item.soon ? <span className="mt-1 shrink-0 text-[10px] tracking-[0.12em] text-muted-foreground">SOON</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
