"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CtaButton } from "@/components/ui/cta-button";
import { Textarea } from "@/components/ui/textarea";

const MAX = 2000;

export interface QuizFormQuestion {
  text: string;
  /** 題目旁的小標籤（例如診斷題對應的技能） */
  tag?: string | null;
}

/**
 * 一次寫完全部題目再交卷：知識頁小測驗與學習路線的診斷共用。
 * onSubmit 回傳錯誤訊息（失敗）或 null（成功，清空回答）。
 */
export function QuizAnswerForm({
  questions,
  idPrefix,
  intro,
  submitLabel,
  busyLabel = "AI 批改中，約 10–40 秒…",
  onSubmit,
}: {
  questions: QuizFormQuestion[];
  idPrefix: string;
  intro: React.ReactNode;
  submitLabel: string;
  busyLabel?: string;
  onSubmit: (answers: string[]) => Promise<string | null>;
}) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (answers.every((a) => !a.trim())) {
      setError("至少回答一題；不會的寫「不知道」");
      return;
    }
    setError(null);
    setBusy(true);
    const message = await onSubmit(answers);
    setBusy(false);
    if (message) setError(message);
    else setAnswers(questions.map(() => ""));
  }

  return (
    <form onSubmit={submit} className="grid gap-6" noValidate>
      <div className="text-sm leading-7 tracking-[0.06em] text-muted-foreground">{intro}</div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <ol className="grid gap-6">
        {questions.map((q, i) => (
          <li key={i} className="grid gap-2">
            <label htmlFor={`${idPrefix}-${i}`} className="flex flex-wrap gap-x-3 gap-y-1 font-medium tracking-[0.02em]">
              <span className="pt-0.5 text-xs tracking-[0.12em] text-muted-foreground tabular-nums">Q{i + 1}</span>
              {q.tag ? <span className="self-center bg-secondary px-2 py-0.5 text-[11px] font-normal tracking-[0.1em] text-muted-foreground">{q.tag}</span> : null}
              <span className="min-w-0 basis-full sm:basis-auto sm:flex-1">{q.text}</span>
            </label>
            <Textarea
              id={`${idPrefix}-${i}`}
              rows={3}
              value={answers[i]}
              onChange={(e) => {
                const next = [...answers];
                next[i] = e.target.value.slice(0, MAX);
                setAnswers(next);
              }}
              placeholder="你的回答（不會就寫「不知道」）"
              className="bg-card leading-7"
              disabled={busy}
            />
          </li>
        ))}
      </ol>
      <p className="text-xs leading-6 text-muted-foreground">請不要寫入個人聯絡資料；使用 Gemini 免費方案時，內容會被 Google 用來改善產品。</p>
      <div>
        <CtaButton type="submit" disabled={busy} icon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}>
          {busy ? busyLabel : submitLabel}
        </CtaButton>
      </div>
    </form>
  );
}
