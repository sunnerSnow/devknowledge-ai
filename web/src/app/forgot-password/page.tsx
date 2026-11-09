import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/layout/auth-shell";
import { getSessionUser } from "@/lib/auth/session";
import { mailReady } from "@/lib/config";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "忘記密碼" };

export default async function ForgotPasswordPage() {
  if (await getSessionUser()) redirect("/");
  const canMail = mailReady();

  return (
    <AuthShell title="Reset password" eyebrow="忘記密碼">
      {canMail ? (
        <>
          <p className="mt-6 text-sm leading-7 tracking-[0.06em]">輸入註冊時的 Email，我們會寄一封信給你，連結 30 分鐘內有效。</p>
          <ForgotPasswordForm />
        </>
      ) : (
        <p className="mt-6 text-sm leading-7 tracking-[0.06em] text-muted-foreground">這個站還沒有設定寄信服務，暫時無法用 Email 重設密碼。請聯絡管理員。</p>
      )}
      <p className="mt-6 border-t border-border pt-4 text-xs tracking-[0.08em]">
        <Link href="/login" className="dotted-underline text-primary">
          回到登入
        </Link>
      </p>
    </AuthShell>
  );
}
