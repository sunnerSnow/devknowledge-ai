import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { aiEnv, isLocalMode } from "@/lib/config";
import { getDb } from "@/lib/db/client";
import { getProfile } from "@/lib/services/profiles";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "設定" };

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await getProfile(await getDb(), user.id);
  const ai = aiEnv();

  return (
    <div className="grid gap-12">
      <PageHeader eyebrow="設定" title="Settings" description="個人資料會用來調整 AI 產生內容的對象與學習計畫的時數。" />
      <div className="grid gap-px bg-foreground/10 lg:grid-cols-[2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>個人資料</CardTitle>
            <CardDescription>{user.email ?? user.id}</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              defaults={{
                displayName: profile?.displayName ?? "",
                targetRole: profile?.targetRole ?? "",
                weeklyLearningMinutes: profile?.weeklyLearningMinutes ?? 120,
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>系統狀態</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">資料庫</dt>
              <dd>{isLocalMode() ? "本機示範（PGlite）" : "Postgres（Neon）"}</dd>
              <dt className="text-muted-foreground">AI provider</dt>
              <dd>
                {ai.provider}
                {ai.provider === "gemini" ? <span className="text-muted-foreground">（{ai.model}）</span> : null}
              </dd>
              <dt className="text-muted-foreground">每小時 AI 上限</dt>
              <dd>{ai.hourlyLimit} 次</dd>
            </dl>
            {ai.provider === "mock" ? (
              <p className="border-l-2 border-foreground pl-3 text-xs leading-6 text-muted-foreground">
                目前是 mock provider。在 <code className="font-mono">web/.env.local</code> 設定 <code className="font-mono">AI_PROVIDER=gemini</code> 與{" "}
                <code className="font-mono">GEMINI_API_KEY</code> 後重新啟動，就會使用真正的 AI。
              </p>
            ) : (
              <p className="border-l-2 border-foreground pl-3 text-xs leading-6 text-muted-foreground">Gemini 免費方案的資料會被 Google 用來改善產品；請不要在技術名詞或職缺內容裡放個人聯絡資料。</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
