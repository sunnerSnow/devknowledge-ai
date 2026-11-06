"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CtaButton } from "@/components/ui/cta-button";

/** POST /api/jobs/[id]/learning-plan → 導到計畫頁 */
export function GeneratePlanButton({ jobId, disabledReason, label = "產生學習計畫" }: { jobId: string; disabledReason?: string | null; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/learning-plan`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const json = (await res.json()) as { data: { id: string } | null; error: { message: string } | null };
      if (!res.ok || !json.data) {
        setError(json.error?.message ?? "產生失敗，請稍後再試");
        setBusy(false);
        return;
      }
      router.push(`/plans/${json.data.id}`);
      router.refresh();
    } catch {
      setError("連線失敗，請稍後再試");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <CtaButton type="button" onClick={run} disabled={busy || Boolean(disabledReason)} icon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}>
        {busy ? "AI 排程中，約 10–40 秒…" : label}
      </CtaButton>
      {disabledReason ? <p className="text-xs text-muted-foreground">{disabledReason}</p> : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
