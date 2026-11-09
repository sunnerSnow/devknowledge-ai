import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";

/**
 * 登入以外的帳號頁（忘記密碼、重設密碼、Email 驗證）共用的外框：
 * 頂端品牌、置中一塊白色面板、底部版權。標題照全站慣例是英文襯線大字＋中文小字。
 */
export function AuthShell({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-8 sm:px-10">
        <Link href="/login" className="focus-ring inline-flex outline-none" aria-label="回到登入頁">
          <Brand />
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 items-start justify-center px-6 py-10 sm:px-10">
        <section className="panel w-full max-w-[440px] p-8 sm:p-10">
          <h1 className="font-display text-[1.75rem] leading-none text-primary">{title}</h1>
          <p className="section-sub mt-2 text-xs">{eyebrow}</p>
          {children}
        </section>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-6 py-8 font-display text-xs tracking-[0.16em] text-muted-foreground sm:px-10">© DevKnowledge AI</footer>
    </div>
  );
}
