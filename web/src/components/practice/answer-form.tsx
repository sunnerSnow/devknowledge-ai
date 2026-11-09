"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CtaButton } from "@/components/ui/cta-button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

const MAX = 6000;

/** 作答欄：送出 POST /api/practice/[sessionId]/answer，AI 評估約 10–40 秒，完成後重新整理頁面顯示評估 */
export function AnswerForm({ sessionId, questionId }: { sessionId: string; questionId: string }) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!answer.trim()) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/practice/${sessionId}/answer`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId, answer }),
      });
      const json = (await res.json()) as { data: unknown; error: { message: string } | null };
      if (!res.ok || !json.data) {
        setError(json.error?.message ?? "評估失敗，請稍後再試");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setError("連線失敗，請檢查網路後再試");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-5" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Field>
        <FieldLabel htmlFor="practice-answer">你的回答</FieldLabel>
        <Textarea
          id="practice-answer"
          rows={8}
          value={answer}
          onChange={(e) => setAnswer(e.target.value.slice(0, MAX))}
          placeholder="像在面試現場一樣回答：先講結論，再說明原因與取捨。可以條列。"
          className="bg-card leading-7"
          disabled={busy}
          autoFocus
        />
        <FieldDescription>
          {answer.length} / {MAX} 字。請不要貼入個人聯絡資料；使用 Gemini 免費方案時，內容會被 Google 用來改善產品。
        </FieldDescription>
      </Field>
      <div>
        <CtaButton type="submit" disabled={busy || !answer.trim()} icon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}>
          {busy ? "AI 評估中，約 10–40 秒…" : "送出回答"}
        </CtaButton>
      </div>
    </form>
  );
}
