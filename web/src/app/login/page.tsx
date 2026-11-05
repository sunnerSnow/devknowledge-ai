import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loginLocalAction } from "@/app/actions";
import { Brand } from "@/components/brand";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LOCAL_USERS } from "@/lib/auth/local-users";
import { getSessionUser } from "@/lib/auth/session";
import { isLocalMode } from "@/lib/config";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "登入" };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/");
  const local = isLocalMode();

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-8">
        <Brand />
      </header>
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-10 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <section>
          <p className="text-sm font-medium tracking-wide text-teal">工程師的知識地圖</p>
          <h1 className="mt-3 text-[clamp(32px,4.5vw,56px)] leading-[1.15] font-semibold tracking-tight text-primary dark:text-foreground">
            從一個技術名詞，
            <br />
            長出整張技能地圖。
          </h1>
          <p className="mt-5 max-w-[34em] text-base leading-7 text-muted-foreground">
            輸入 RAG、Docker、AWS 這類名詞，AI 會整理成可累積的結構化知識頁；貼上職缺，就能看見技能差距並規劃學習路徑。
          </p>
          <ul className="mt-6 grid gap-2 text-sm text-foreground/80">
            <li className="flex items-start gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-gold" />
              知識頁包含定義、原理、架構圖、程式碼、常見誤解與面試重點
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-teal" />
              職缺技能與你的能力分開儲存，差距排序可解釋
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              AI 產生的內容會標示來源與版本，請依官方文件確認
            </li>
          </ul>
        </section>
        <section className="w-full max-w-[440px] rounded-2xl border bg-card p-6 shadow-sm sm:p-8 lg:justify-self-end">
          <h2 className="text-xl font-semibold text-primary dark:text-foreground">登入 DevKnowledge AI</h2>

          {local ? (
            <>
              <Alert className="mt-4">
                <AlertDescription>
                  本機示範模式：資料存在這台電腦的 <code className="font-mono text-xs">web/.data/pglite</code>，不是正式資料庫。可以一鍵以示範使用者登入；兩位的資料互相看不到。
                </AlertDescription>
              </Alert>
              <div className="mt-4 grid gap-3">
                {LOCAL_USERS.map((u) => (
                  <form key={u.key} action={loginLocalAction}>
                    <input type="hidden" name="user" value={u.key} />
                    <Button className="w-full" size="lg" variant={u.key === "a" ? "default" : "outline"} type="submit">
                      以{u.label}登入
                    </Button>
                  </form>
                ))}
              </div>
              <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
                <Separator className="flex-1" />
                或用 Email 註冊／登入
                <Separator className="flex-1" />
              </div>
            </>
          ) : null}

          <LoginForm />
          <p className="mt-4 text-xs leading-5 text-muted-foreground">目前不需要驗證 Email；忘記密碼的重設功能稍後提供。</p>
        </section>
      </main>
    </div>
  );
}
