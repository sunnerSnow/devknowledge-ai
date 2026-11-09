"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CtaButton } from "@/components/ui/cta-button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { QUESTION_TYPE_LABELS } from "@/lib/ai/prompts/practice-v1";
import { PRACTICE_MODES, type PracticeMode, QUESTION_TYPES, type SessionQuestionType } from "@/lib/db/schema";
import { levelLabel } from "@/lib/skills/levels";
import { cn } from "@/lib/utils";

export interface JobOption {
  id: string;
  title: string;
  skills: { name: string; slug: string; requiredLevel: number; userLevel: number | null }[];
}

const MODE_LABELS: Record<PracticeMode, { label: string; hint: string }> = {
  interview: { label: "面試模擬", hint: "輪流出概念、情境、架構、程式題" },
  quiz: { label: "快速測驗", hint: "只出概念、情境、架構題，不出程式題" },
  coding: { label: "程式實作", hint: "只出程式題" },
};

const SELECT_CLASS = "h-11 w-full border border-input bg-background px-3.5 text-sm tracking-[0.06em] outline-none focus-visible:border-primary focus-visible:focus-ring";

/**
 * 建立練習：選職缺（可不選）→ 選技能（職缺的技能清單或自己輸入）→ 題型與模式。
 * 送出後 POST /api/practice/sessions，成功就導到練習頁。
 */
export function StartPracticeForm({ jobs, defaultJobId, defaultTopic }: { jobs: JobOption[]; defaultJobId?: string | null; defaultTopic?: string | null }) {
  const router = useRouter();
  const initialJob = jobs.find((j) => j.id === defaultJobId) ?? null;
  const [jobId, setJobId] = useState<string>(initialJob?.id ?? "");
  const [topic, setTopic] = useState<string>(defaultTopic ?? initialJob?.skills[0]?.name ?? "");
  const [questionType, setQuestionType] = useState<SessionQuestionType>("mixed");
  const [mode, setMode] = useState<PracticeMode>("interview");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const job = jobs.find((j) => j.id === jobId) ?? null;
  const skill = job?.skills.find((s) => s.name === topic) ?? null;

  function chooseJob(id: string) {
    setJobId(id);
    const next = jobs.find((j) => j.id === id);
    if (next?.skills.length) setTopic(next.skills[0].name);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/practice/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: jobId || null, topic, mode, questionType }),
      });
      const json = (await res.json()) as { data: { session: { id: string }; questionError: { code: string } | null } | null; error: { message: string } | null };
      if (!res.ok || !json.data) {
        setError(json.error?.message ?? "建立練習失敗，請稍後再試");
        setBusy(false);
        return;
      }
      router.push(`/practice/${json.data.session.id}${json.data.questionError ? `?questionError=${encodeURIComponent(json.data.questionError.code)}` : ""}`);
      router.refresh();
    } catch {
      setError("連線失敗，請檢查網路後再試");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-6" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="practice-job">對應職缺</FieldLabel>
          <select id="practice-job" value={jobId} onChange={(e) => chooseJob(e.target.value)} className={SELECT_CLASS}>
            <option value="">不指定職缺</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
          <FieldDescription>選了職缺，題目難度會以職缺要求的等級為準。</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="practice-topic">
            技能 <span className="ml-1 text-muted-foreground">*</span>
          </FieldLabel>
          {job && job.skills.length ? (
            <select id="practice-topic" value={topic} onChange={(e) => setTopic(e.target.value)} className={SELECT_CLASS} required>
              {job.skills.map((s) => (
                <option key={s.slug} value={s.name}>
                  {s.name}（要求 {levelLabel(s.requiredLevel)}／目前 {levelLabel(s.userLevel)}）
                </option>
              ))}
            </select>
          ) : (
            <Input id="practice-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="例如 Docker、RAG、PostgreSQL" maxLength={80} required />
          )}
          {skill ? <FieldDescription>職缺要求「{levelLabel(skill.requiredLevel)}」，題目會以這個等級出。</FieldDescription> : <FieldDescription>沒選職缺時，題目難度比你目前的自評高一級。</FieldDescription>}
        </Field>
      </div>

      <Field>
        <FieldLabel>模式</FieldLabel>
        <div role="radiogroup" aria-label="模式" className="grid gap-3 sm:grid-cols-3">
          {PRACTICE_MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              className={cn("border px-4 py-3 text-left transition-colors outline-none focus-visible:focus-ring", mode === m ? "border-primary bg-card" : "border-border bg-background hover:border-primary/60")}
            >
              <span className={cn("block text-sm font-medium tracking-[0.12em]", mode === m && "text-primary")}>{MODE_LABELS[m].label}</span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">{MODE_LABELS[m].hint}</span>
            </button>
          ))}
        </div>
      </Field>

      <Field>
        <FieldLabel htmlFor="practice-type">題型</FieldLabel>
        <select id="practice-type" value={questionType} onChange={(e) => setQuestionType(e.target.value as SessionQuestionType)} className={cn(SELECT_CLASS, "sm:max-w-xs")} disabled={mode === "coding"}>
          <option value="mixed">依模式輪流</option>
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              只出{QUESTION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        <FieldDescription>一次只出一題；每次練習最多 10 題。AI 的評分是練習回饋，不是能力認證。</FieldDescription>
      </Field>

      <div>
        <CtaButton type="submit" size="lg" disabled={busy || !topic.trim()} icon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}>
          {busy ? "AI 出題中，約 10–30 秒…" : "開始練習"}
        </CtaButton>
      </div>
    </form>
  );
}
