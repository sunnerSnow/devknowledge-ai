"use client";

import { LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { Brand } from "@/components/brand";
import { NavLinks } from "@/components/layout/nav-links";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface AppShellProps {
  userLabel: string;
  localMode: boolean;
  aiProvider: string;
  logout: () => Promise<void>;
  children: ReactNode;
}

/**
 * 登入後的外框：桌機左側導覽＋主內容；平板／手機改成頂欄＋抽屜。
 * 右側關聯欄由各頁自己決定（知識頁有）。
 */
export function AppShell({ userLabel, localMode, aiProvider, logout, children }: AppShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-full flex-col">
      {localMode ? (
        <p className="local-banner border-b border-gold/60 bg-accent px-4 py-1.5 text-center text-xs text-accent-foreground">
          本機示範模式：資料存在這台電腦，不是正式資料庫。AI provider：{aiProvider}
          {aiProvider === "mock" ? "（固定範例內容，不是真的 AI）" : ""}
        </p>
      ) : aiProvider === "mock" ? (
        <p className="border-b border-gold/60 bg-accent px-4 py-1.5 text-center text-xs text-accent-foreground">AI provider 目前是 mock：知識頁是固定範例內容，不是真的 AI 產生。</p>
      ) : null}
      <div className="flex flex-1">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-sidebar px-4 py-5 lg:flex">
          <Link href="/" className="px-2">
            <Brand />
          </Link>
          <div className="mt-8 flex-1">
            <NavLinks />
          </div>
          <UserBox userLabel={userLabel} logout={logout} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
            <Link href="/">
              <Brand />
            </Link>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" aria-label="開啟選單">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 px-4 py-6">
                <SheetHeader className="px-2">
                  <SheetTitle>
                    <Brand />
                  </SheetTitle>
                  <SheetDescription className="sr-only">主選單</SheetDescription>
                </SheetHeader>
                <div className="mt-6 flex-1">
                  <NavLinks onNavigate={() => setOpen(false)} />
                </div>
                <UserBox userLabel={userLabel} logout={logout} />
              </SheetContent>
            </Sheet>
          </header>
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

function UserBox({ userLabel, logout }: { userLabel: string; logout: () => Promise<void> }) {
  return (
    <div className="mt-6 flex items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2">
      <span className="truncate text-xs text-muted-foreground" title={userLabel}>
        {userLabel}
      </span>
      <form action={logout}>
        <Button type="submit" variant="ghost" size="icon-sm" aria-label="登出" title="登出">
          <LogOut />
        </Button>
      </form>
    </div>
  );
}
