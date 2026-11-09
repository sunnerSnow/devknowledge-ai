import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { ResetPasswordForm } from "./reset-password-form";

// 網址帶 token：不把它當 referrer 送給任何其他網站
export const metadata: Metadata = { title: "重設密碼", referrer: "no-referrer" };

/** 信裡的連結會帶 ?token=…；token 在送出表單時才消耗，所以信箱的連結預覽不會把它用掉 */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  return (
    <AuthShell title="New password" eyebrow="設定新密碼">
      {token ? (
        <>
          <p className="mt-6 text-sm leading-7 tracking-[0.06em]">請輸入新密碼。設定完成後，所有已登入的裝置都會登出。</p>
          <ResetPasswordForm token={token} />
        </>
      ) : (
        <p className="mt-6 text-sm leading-7 tracking-[0.06em] text-muted-foreground">這個連結不完整。請從信裡的連結重新開啟，或再申請一次重設密碼。</p>
      )}
      <p className="mt-6 flex gap-5 border-t border-border pt-4 text-xs tracking-[0.08em]">
        <Link href="/forgot-password" className="dotted-underline text-primary">
          重新申請
        </Link>
        <Link href="/login" className="dotted-underline text-primary">
          回到登入
        </Link>
      </p>
    </AuthShell>
  );
}
