"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CtaButton } from "@/components/ui/cta-button";

/** 學習路線的下一步（出診斷題、排課）：POST 到指定的 API，成功後重新整理頁面 */
export function RouteStepButton({
  url,
  label,
  busyLabel,
  variant = "cta",
}: {
  url: string;
  label: string;
  busyLabel: string;
  variant?: "cta" | "outline";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "POST" });
      const json = (await res.json()) as { data: unknown; error: { message: string } | null };
      if (!res.ok || !json.data) {
        setError(json.error?.message ?? "沒有完成，請稍後再試");
        setBusy(false);
        return;
      }
      router.refresh();
      setBusy(false);
    } catch {
      setError("連線失敗，請稍後再試");
      setBusy(false);
    }
  }

  return (
    <div className="grid justify-items-start gap-2">
      {variant === "cta" ? (
        <CtaButton type="button" onClick={run} disabled={busy} icon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}>
          {busy ? busyLabel : label}
        </CtaButton>
      ) : (
        <Button type="button" variant="outline" onClick={run} disabled={busy} className="tracking-[0.04em]">
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
          {busy ? busyLabel : label}
        </Button>
      )}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
