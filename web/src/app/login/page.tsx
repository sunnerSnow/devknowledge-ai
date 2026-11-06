import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loginLocalAction } from "@/app/actions";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { LOCAL_USERS } from "@/lib/auth/local-users";
import { getSessionUser } from "@/lib/auth/session";
import { isLocalMode } from "@/lib/config";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "登入" };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  const local = isLocalMode();

  return (
    <div className="relative flex min-h-full flex-col overflow-hidden">
      {/* 裝飾色塊 */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-0">
        <span className="blob blob-blue -top-40 -left-32 h-[30rem] w-[30rem] opacity-55" />
        <span className="blob blob-green top-1/3 right-[-8rem] h-[22rem] w-[22rem] opacity-55" />
        <span className="blob blob-pink bottom-[-12rem] left-1/3 h-[24rem] w-[24rem] opacity-40" />
      </div>

      <header className="relative flex items-center justify-between px-6 py-6 sm:px-10">
        <Brand />
        <span className="hidden text-xs tracking-[0.2em] text-muted-foreground sm:inline">Knowledge map for engineers</span>
      </header>
      <main className="relative mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-10 sm:px-10 lg:grid-cols-[1.15fr_1fr] lg:gap-20">
        <section>
          <p className="section-label">工程師的知識地圖</p>
          <h1 className="mt-5 text-[clamp(34px,4vw,54px)] leading-[1.25] font-medium tracking-[0.04em]">
            從一個技術名詞，
            <br />
            長出整張技能地圖。
          </h1>
          <p className="mt-8 max-w-[32em] text-[15px] leading-8 text-foreground/80">
            輸入 RAG、Docker、AWS 這類名詞，AI 會整理成可累積的結構化知識頁；貼上職缺，就能看見技能差距並規劃學習路徑。
          </p>
          <ul className="mt-8 grid gap-2 text-sm leading-7 text-muted-foreground">
            <li>知識頁包含定義、原理、架構圖、程式碼、常見誤解與面試重點</li>
            <li>職缺技能與你的能力分開儲存，差距排序可解釋</li>
            <li>AI 產生的內容會標示來源與版本，請依官方文件確認</li>
          </ul>
        </section>
        <section className="w-full max-w-[440px] bg-card p-7 sm:p-9 lg:justify-self-end">
          <p className="section-label">登入</p>
          <h2 className="mt-2 text-3xl font-medium tracking-[0.02em]">Sign in</h2>

          {local ? (
            <>
              <p className="mt-5 text-xs leading-6 text-muted-foreground">
                本機示範模式：資料存在這台電腦的 <code className="font-mono">web/.data/pglite</code>，不是正式資料庫。可以一鍵以示範使用者登入；兩位的資料互相看不到。
              </p>
              <div className="mt-4 grid gap-2">
                {LOCAL_USERS.map((u) => (
                  <form key={u.key} action={loginLocalAction}>
                    <input type="hidden" name="user" value={u.key} />
                    <Button className="h-11 w-full tracking-[0.06em]" variant={u.key === "a" ? "default" : "outline"} type="submit">
                      以{u.label}登入
                    </Button>
                  </form>
                ))}
              </div>
              <p className="mt-6 border-t border-dotted border-foreground/30 pt-4 text-xs tracking-[0.1em] text-muted-foreground">或用 Email 註冊／登入</p>
            </>
          ) : null}

          <LoginForm />
          <p className="mt-5 text-xs leading-6 text-muted-foreground">目前不需要驗證 Email；忘記密碼的重設功能稍後提供。</p>
        </section>
      </main>
    </div>
  );
}
