import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { VerifyEmailButton } from "./verify-email-button";

// 網址帶 token：不把它當 referrer 送給任何其他網站
export const metadata: Metadata = { title: "驗證 Email", referrer: "no-referrer" };

/**
 * 信裡的連結會帶 ?token=…。驗證要按一下按鈕才送出：
 * 信箱或聊天軟體的連結預覽會先開一次網址，直接在 GET 時消耗 token 會讓使用者真正點進來時已失效。
 */
export default async function VerifyEmailPage({ searchParams }: PageProps<"/verify-email">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  return (
    <AuthShell title="Verify email" eyebrow="驗證 Email">
      {token ? (
        <>
          <p className="mt-6 text-sm leading-7 tracking-[0.06em]">按下方按鈕完成驗證。完成後會直接登入。</p>
          <VerifyEmailButton token={token} />
        </>
      ) : (
        <p className="mt-6 text-sm leading-7 tracking-[0.06em] text-muted-foreground">這個連結不完整。請從信裡的連結重新開啟；已登入的話可到設定頁重寄驗證信。</p>
      )}
      <p className="mt-6 border-t border-border pt-4 text-xs tracking-[0.08em]">
        <Link href="/login" className="dotted-underline text-primary">
          回到登入
        </Link>
      </p>
    </AuthShell>
  );
}
