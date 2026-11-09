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
  { href: "/", label: "Top", hint: "總覽" },
  { href: "/knowledge", label: "Knowledge", hint: "知識探索" },
  { href: "/jobs", label: "Jobs", hint: "職缺分析" },
  { href: "/plans", label: "Plans", hint: "學習計畫" },
  { href: "/practice", label: "Practice", hint: "面試練習" },
  { href: "/skills", label: "Skills", hint: "技能地圖" },
  { href: "/settings", label: "Settings", hint: "設定" },
];

/** 純文字導覽：中文為主、英文襯線小字在後；目前頁是青藍色加細底線 */
export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="主選單">
      <ul className="grid gap-5">
        {NAV_ITEMS.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn("inline-flex flex-col gap-1 text-[15px] tracking-[0.14em] transition-colors outline-none focus-visible:focus-ring", active ? "text-primary" : "text-foreground hover:text-primary")}
              >
                <span className={cn(active && "dotted-underline")}>
                  {item.hint}
                  {item.soon ? <span className="ml-1 text-[11px] tracking-[0.1em] text-muted-foreground">（準備中）</span> : null}
                </span>
                <span className="font-display text-xs tracking-[0.12em] text-muted-foreground">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
