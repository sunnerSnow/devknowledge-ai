"use client";

import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface ApiEnvelope<T> {
  data: T | null;
  error: { code: string; message: string } | null;
}
interface GenerateData {
  node: { slug: string; status: string; generating: boolean };
  existing: boolean;
}

type Phase = { kind: "idle" } | { kind: "generating"; hint: string } | { kind: "error"; message: string };

/**
 * 呼叫 POST /api/knowledge/generate。
 * - 成功：導到知識頁
 * - 409（別人正在生成同一主題）：每 3 秒查一次狀態，完成後導過去
 * - 429／5xx：顯示訊息，可重試
 */
export function GenerateButton({
  topic,
  regenerate = false,
  slug,
  label,
  variant = "default",
  size = "default",
}: {
  topic: string;
  regenerate?: boolean;
  /** 已知 slug（重新生成或 stub）時用來輪詢 */
  slug?: string;
  label?: string;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm" | "lg";
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function pollUntilDone(targetSlug: string) {
    for (let i = 0; i < 40 && alive.current; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`/api/knowledge/${encodeURIComponent(targetSlug)}`, { cache: "no-store" });
      const json = (await res.json()) as ApiEnvelope<{ status: string; generating: boolean }>;
      if (json.data && !json.data.generating) {
        if (json.data.status === "published") return goTo(targetSlug);
        return setPhase({ kind: "error", message: "生成失敗了，請再試一次。" });
      }
    }
    setPhase({ kind: "error", message: "等太久了，請重新整理頁面看看。" });
  }

  function goTo(targetSlug: string) {
    router.push(`/knowledge/${encodeURIComponent(targetSlug)}`);
    router.refresh();
  }

  async function run() {
    setPhase({ kind: "generating", hint: regenerate ? "重新生成中，通常需要 20–60 秒…" : "AI 生成中，通常需要 20–60 秒…" });
    try {
      const res = await fetch("/api/knowledge/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, regenerate }),
      });
      const json = (await res.json()) as ApiEnvelope<GenerateData>;
      if (res.ok && json.data) return goTo(json.data.node.slug);
      if (res.status === 409) {
        setPhase({ kind: "generating", hint: "這個主題正在生成中（可能是其他人剛送出），等它完成…" });
        return pollUntilDone(slug ?? topic);
      }
      setPhase({ kind: "error", message: json.error?.message ?? "生成失敗，請稍後再試。" });
    } catch {
      setPhase({ kind: "error", message: "連線失敗，請檢查網路後再試。" });
    }
  }

  const busy = phase.kind === "generating";
  const Icon = regenerate ? RefreshCw : Sparkles;
  return (
    <div className="grid gap-2">
      <Button type="button" onClick={run} disabled={busy} variant={variant} size={size} aria-busy={busy}>
        {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Icon aria-hidden="true" />}
        {busy ? "生成中…" : (label ?? (regenerate ? "重新生成" : `用 AI 建立「${topic}」知識頁`))}
      </Button>
      {phase.kind === "generating" ? (
        <p className="text-xs text-muted-foreground" role="status">
          {phase.hint}
        </p>
      ) : null}
      {phase.kind === "error" ? (
        <p className="text-xs text-destructive" role="alert">
          {phase.message}
        </p>
      ) : null}
    </div>
  );
}
