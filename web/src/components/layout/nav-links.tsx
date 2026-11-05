"use client";

import { BookOpen, Briefcase, LayoutDashboard, type LucideIcon, Map, MessageSquareText, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  /** 這個 Phase 還沒做 */
  soon?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", hint: "總覽", icon: LayoutDashboard },
  { href: "/knowledge", label: "Knowledge", hint: "知識探索", icon: BookOpen },
  { href: "/jobs", label: "Job Analyzer", hint: "職缺分析", icon: Briefcase, soon: true },
  { href: "/practice", label: "Interview Practice", hint: "面試練習", icon: MessageSquareText, soon: true },
  { href: "/skills", label: "My Skills", hint: "技能地圖", icon: Map, soon: true },
  { href: "/settings", label: "Settings", hint: "設定", icon: Settings },
];

export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="主選單" className="grid gap-1">
      {NAV_ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Icon className={cn("size-4 shrink-0", active ? "text-teal" : "text-muted-foreground group-hover:text-foreground")} aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate">{item.label}</span>
              <span className="truncate text-[11px] font-normal text-muted-foreground">{item.hint}</span>
            </span>
            {item.soon ? <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">即將推出</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
