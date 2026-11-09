import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loginLocalAction } from "@/app/actions";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { LOCAL_USERS } from "@/lib/auth/local-users";
import { getSessionUser } from "@/lib/auth/session";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { isLocalMode, mailReady, requireEmailVerification } from "@/lib/config";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "登入" };

const POINTS = ["知識頁包含定義、原理、架構圖、程式碼、常見誤解與面試重點", "職缺技能與你的能力分開儲存，差距排序可解釋", "AI 產生的內容會標示來源與版本，請依官方文件確認"];

/** 其他帳號頁導回來時帶的提示（?notice=…）；只接受這幾個鍵 */
const NOTICES: Record<string, string> = {
  reset: "密碼已重設，請用新密碼登入。",
  "check-mail": "帳號已建立。我們寄了一封驗證信給你，請到信箱點連結後再登入。",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getSessionUser()) redirect("/");
  const local = isLocalMode();
  const canMail = mailReady();
  const needVerify = requireEmailVerification();
  const params = await searchParams;
  const noticeKey = typeof params.notice === "string" ? params.notice : "";
  const notice = Object.hasOwn(NOTICES, noticeKey) ? NOTICES[noticeKey] : null;

  return (
    <div className="flex min-h-full flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-8 sm:px-10">
        <Brand />
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-16 px-6 py-10 sm:px-10 lg:grid-cols-[1.1fr_1fr] lg:gap-24">
        <section className="flex gap-10 lg:gap-16">
          {/* 直書的標語，像事務所網站的開場；小螢幕改橫排 */}
          <h1 className="vertical-text hidden min-h-[22rem] text-3xl leading-[2] font-medium tracking-[0.3em] text-primary lg:block">
            從一個技術名詞，
            <br />
            長出整張技能地圖。
          </h1>
          <div className="max-w-[30em]">
            <h1 className="text-2xl leading-[1.9] font-medium tracking-[0.2em] text-primary lg:hidden">
              從一個技術名詞，
              <br />
              長出整張技能地圖。
            </h1>
            <p className="mt-6 text-[15px] leading-9 tracking-[0.12em] lg:mt-0">
              輸入 RAG、Docker、AWS 這類名詞，AI 會整理成可累積的結構化知識頁；
              <br className="hidden sm:block" />
              貼上職缺，就能看見技能差距並規劃學習路徑。
            </p>
            <ol className="mt-8 grid gap-3 text-sm leading-8 tracking-[0.08em]">
              {POINTS.map((t, i) => (
                <li key={t} className="flex gap-3">
                  <span className="font-display text-base text-primary tabular-nums">{i + 1}.</span>
                  {t}
                </li>
              ))}
            </ol>
          </div>
        </section>
        <section className="panel w-full max-w-[440px] p-8 sm:p-10 lg:justify-self-end">
          <h2 className="font-display text-[1.75rem] leading-none text-primary">Sign in</h2>
          <p className="section-sub mt-2 text-xs">登入</p>

          {local ? (
            <>
              <p className="mt-6 text-xs leading-6 tracking-[0.06em] text-muted-foreground">
                本機示範模式：資料存在這台電腦的 <code className="font-mono tracking-normal">web/.data/pglite</code>，不是正式資料庫。可以一鍵以示範使用者登入；兩位的資料互相看不到。
              </p>
              <div className="mt-4 grid gap-2">
                {LOCAL_USERS.map((u) => (
                  <form key={u.key} action={loginLocalAction}>
                    <input type="hidden" name="user" value={u.key} />
                    <Button className="w-full" size="lg" variant={u.key === "a" ? "default" : "outline"} type="submit">
                      以{u.label}登入
                    </Button>
                  </form>
                ))}
              </div>
              <p className="mt-6 border-t border-border pt-4 text-xs tracking-[0.12em] text-muted-foreground">或用 Email 註冊／登入</p>
            </>
          ) : null}

          {notice ? (
            <Alert className="mt-6" role="status">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ) : null}
          <LoginForm />
          {canMail ? (
            <p className="mt-5 flex items-center justify-between gap-4 text-xs leading-6 tracking-[0.06em] text-muted-foreground">
              <span>{needVerify ? "註冊後請到信箱點驗證連結再登入。" : "目前不需要驗證 Email。"}</span>
              <Link href="/forgot-password" className="dotted-underline shrink-0 text-primary">
                忘記密碼？
              </Link>
            </p>
          ) : (
            <p className="mt-5 text-xs leading-6 tracking-[0.06em] text-muted-foreground">這個站沒有設定寄信服務：不需要驗證 Email，也暫時無法用 Email 重設密碼。</p>
          )}
        </section>
      </main>
      <footer className="mx-auto w-full max-w-6xl px-6 py-8 font-display text-xs tracking-[0.16em] text-muted-foreground sm:px-10">© DevKnowledge AI</footer>
    </div>
  );
}
