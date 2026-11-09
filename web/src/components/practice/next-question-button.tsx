"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CtaButton } from "@/components/ui/cta-button";

/** POST /api/practice/[sessionId]/questions → 出下一題後重新整理 */
export function NextQuestionButton({ sessionId, label = "下一題", variant = "default" }: { sessionId: string; label?: string; variant?: "default" | "secondary" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/practice/${sessionId}/questions`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const json = (await res.json()) as { data: unknown; error: { message: string } | null };
      if (!res.ok || !json.data) {
        setError(json.error?.message ?? "出題失敗，請稍後再試");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("連線失敗，請稍後再試");
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-2">
      <CtaButton type="button" variant={variant} onClick={run} disabled={busy} icon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}>
        {busy ? "AI 出題中，約 10–30 秒…" : label}
      </CtaButton>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
