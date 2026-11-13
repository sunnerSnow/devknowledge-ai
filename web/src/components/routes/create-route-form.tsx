"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CtaButton } from "@/components/ui/cta-button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/**
 * 職缺頁上的「產生學習路線」：填天數、每天分鐘數，預設先做程度診斷。
 * POST /api/jobs/[id]/learning-routes → 導到路線頁；AI 這一步失敗時路線仍會建立，路線頁可以再試。
 */
export function CreateRouteForm({ jobId, defaultDailyMinutes, disabledReason }: { jobId: string; defaultDailyMinutes: number; disabledReason?: string | null }) {
  const router = useRouter();
  const [days, setDays] = useState("7");
  const [dailyMinutes, setDailyMinutes] = useState(String(defaultDailyMinutes));
  const [diagnose, setDiagnose] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const d = Number(days);
    const m = Number(dailyMinutes);
    if (!Number.isInteger(d) || d < 1 || d > 30) return setError("天數請填 1–30");
    if (!Number.isInteger(m) || m < 15 || m > 480) return setError("每天分鐘數請填 15–480");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/learning-routes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: d, dailyMinutes: m, diagnose }),
      });
      const json = (await res.json()) as { data: { route: { id: string }; stepError: { code: string } | null } | null; error: { message: string } | null };
      if (!res.ok || !json.data) {
        setError(json.error?.message ?? "建立失敗，請稍後再試");
        setBusy(false);
        return;
      }
      const query = json.data.stepError ? `?stepError=${encodeURIComponent(json.data.stepError.code)}` : "";
      router.push(`/routes/${json.data.route.id}${query}`);
      router.refresh();
    } catch {
      setError("連線失敗，請稍後再試");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <div className="flex flex-wrap items-end gap-4">
        <Field className="w-28">
          <FieldLabel htmlFor="route-days">剩餘天數</FieldLabel>
          <Input id="route-days" type="number" inputMode="numeric" min={1} max={30} value={days} onChange={(e) => setDays(e.target.value)} disabled={busy || Boolean(disabledReason)} />
        </Field>
        <Field className="w-36">
          <FieldLabel htmlFor="route-minutes">每天分鐘數</FieldLabel>
          <Input id="route-minutes" type="number" inputMode="numeric" min={15} max={480} step={15} value={dailyMinutes} onChange={(e) => setDailyMinutes(e.target.value)} disabled={busy || Boolean(disabledReason)} />
        </Field>
        <label className="flex items-center gap-2 pb-2 text-sm tracking-[0.04em]">
          <input type="checkbox" checked={diagnose} onChange={(e) => setDiagnose(e.target.checked)} disabled={busy || Boolean(disabledReason)} className="size-4 accent-primary" />
          先做程度診斷（建議）
        </label>
      </div>
      <div>
        <CtaButton type="submit" disabled={busy || Boolean(disabledReason)} icon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}>
          {busy ? (diagnose ? "AI 出診斷題中，約 10–40 秒…" : "AI 排課中，約 10–40 秒…") : "產生學習路線"}
        </CtaButton>
      </div>
      {disabledReason ? <p className="text-xs text-muted-foreground">{disabledReason}</p> : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
