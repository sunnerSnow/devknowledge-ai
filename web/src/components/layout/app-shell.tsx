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
 * 登入後的外框：整頁淡青綠底，桌機左側是純文字導覽（沒有底色、沒有框線），右邊是內容；
 * 平板／手機改成頂欄＋抽屜。
 */
export function AppShell({ userLabel, localMode, aiProvider, logout, children }: AppShellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-full flex-col">
      {localMode ? (
        <p className="local-banner border-b border-border px-4 py-1.5 text-center text-xs tracking-[0.1em] text-muted-foreground">
          本機示範模式：資料存在這台電腦，不是正式資料庫。AI provider：{aiProvider}
          {aiProvider === "mock" ? "（固定範例內容，不是真的 AI）" : ""}
        </p>
      ) : aiProvider === "mock" ? (
        <p className="border-b border-border px-4 py-1.5 text-center text-xs tracking-[0.1em] text-muted-foreground">AI provider 目前是 mock：知識頁是固定範例內容，不是真的 AI 產生。</p>
      ) : null}

      <div className="flex flex-1">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col px-8 py-12 lg:flex">
          <Link href="/" className="inline-flex outline-none focus-visible:focus-ring">
            <Brand />
          </Link>
          <div className="mt-16 flex-1 overflow-y-auto p-1">
            <NavLinks />
          </div>
          <UserBox userLabel={userLabel} logout={logout} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-5 py-4 backdrop-blur lg:hidden">
            <Link href="/" className="outline-none focus-visible:focus-ring">
              <Brand />
            </Link>
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="開啟選單">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-background px-8 py-10">
                <SheetHeader className="p-0">
                  <SheetTitle>
                    <Brand />
                  </SheetTitle>
                  <SheetDescription className="sr-only">主選單</SheetDescription>
                </SheetHeader>
                <div className="mt-10 flex-1">
                  <NavLinks onNavigate={() => setOpen(false)} />
                </div>
                <UserBox userLabel={userLabel} logout={logout} />
              </SheetContent>
            </Sheet>
          </header>
          <main className="w-full flex-1 px-5 py-10 sm:px-10 lg:px-16 lg:py-14">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}

function UserBox({ userLabel, logout }: { userLabel: string; logout: () => Promise<void> }) {
  return (
    <div className="mt-8 flex items-center justify-between gap-2 border-t border-border pt-5">
      <span className="truncate text-xs tracking-[0.1em] text-muted-foreground" title={userLabel}>
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
