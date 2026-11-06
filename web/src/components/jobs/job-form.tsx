"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CtaButton } from "@/components/ui/cta-button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/** 表單用的 schema（跟服務層的 jobInputSchema 同規則，但欄位全部是字串） */
const formSchema = z.object({
  title: z.string().trim().min(1, "請輸入職缺名稱").max(120, "職缺名稱最多 120 個字"),
  company: z.string().trim().max(120, "公司名稱最多 120 個字"),
  sourceUrl: z
    .string()
    .trim()
    .max(500, "網址最多 500 個字")
    .refine((v) => !v || /^https?:\/\//i.test(v), "網址需以 http:// 或 https:// 開頭"),
  rawDescription: z.string().trim().min(20, "工作內容至少 20 個字，建議直接貼整份職缺").max(12000, "工作內容最多 12000 個字"),
  requiredSkillsRaw: z.string().trim().max(4000, "必要技能最多 4000 個字"),
  preferredSkillsRaw: z.string().trim().max(4000, "加分技能最多 4000 個字"),
  notes: z.string().trim().max(2000, "備註最多 2000 個字"),
});
export type JobFormValues = z.infer<typeof formSchema>;

const EMPTY: JobFormValues = { title: "", company: "", sourceUrl: "", rawDescription: "", requiredSkillsRaw: "", preferredSkillsRaw: "", notes: "" };

interface ApiEnvelope<T> {
  data: T | null;
  error: { code: string; message: string; issues?: { field: string; message: string }[] } | null;
}

/**
 * 新增：POST /api/jobs/analyze（建立＋AI 分析，約 10–40 秒）→ 導到職缺頁。
 * 編輯：PATCH /api/jobs/[id]，可選擇同時重新分析。
 */
export function JobForm({ mode, jobId, defaults }: { mode: "create" | "edit"; jobId?: string; defaults?: Partial<JobFormValues> }) {
  const router = useRouter();
  const form = useForm<JobFormValues>({ resolver: zodResolver(formSchema), defaultValues: { ...EMPTY, ...defaults } });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "analyze" | "save">(null);
  const { errors } = form.formState;

  async function submit(values: JobFormValues, reanalyze: boolean) {
    setError(null);
    setBusy(reanalyze ? "analyze" : "save");
    const payload = {
      title: values.title,
      company: values.company || null,
      sourceUrl: values.sourceUrl || null,
      rawDescription: values.rawDescription,
      requiredSkillsRaw: values.requiredSkillsRaw || null,
      preferredSkillsRaw: values.preferredSkillsRaw || null,
      notes: values.notes || null,
    };
    try {
      const res =
        mode === "create"
          ? await fetch("/api/jobs/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) })
          : await fetch(`/api/jobs/${jobId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, reanalyze }) });
      const json = (await res.json()) as ApiEnvelope<{ id: string; analysisError?: { code: string; message: string } | null }>;
      if (!res.ok || !json.data) {
        for (const issue of json.error?.issues ?? []) {
          if (issue.field in EMPTY) form.setError(issue.field as keyof JobFormValues, { message: issue.message });
        }
        setError(json.error?.message ?? "送出失敗，請稍後再試");
        setBusy(null);
        return;
      }
      // 職缺已建立但 AI 分析失敗：帶到職缺頁顯示原因，那裡可以重新分析（不要讓使用者重送表單再建一筆）
      const suffix = json.data.analysisError ? `?analysisError=${encodeURIComponent(json.data.analysisError.code)}` : "";
      router.push(`/jobs/${json.data.id}${suffix}`);
      router.refresh();
    } catch {
      setError("連線失敗，請檢查網路後再試");
      setBusy(null);
    }
  }

  const field = (name: keyof JobFormValues, label: string, opts: { placeholder?: string; hint?: string; textarea?: boolean; rows?: number; required?: boolean }) => (
    <Field data-invalid={Boolean(errors[name])}>
      <FieldLabel htmlFor={`job-${name}`}>
        {label}
        {opts.required ? <span className="ml-1 text-muted-foreground">*</span> : null}
      </FieldLabel>
      {opts.textarea ? (
        <Textarea id={`job-${name}`} rows={opts.rows ?? 4} placeholder={opts.placeholder} aria-invalid={Boolean(errors[name])} className="panel leading-7" {...form.register(name)} />
      ) : (
        <Input id={`job-${name}`} placeholder={opts.placeholder} aria-invalid={Boolean(errors[name])} className="panel" {...form.register(name)} />
      )}
      {errors[name] ? <FieldError>{errors[name]?.message}</FieldError> : opts.hint ? <FieldDescription>{opts.hint}</FieldDescription> : null}
    </Field>
  );

  return (
    <form onSubmit={form.handleSubmit((v) => submit(v, mode === "create"))} className="grid gap-6" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-6 sm:grid-cols-2">
        {field("title", "職缺名稱", { placeholder: "例如：Junior Full-Stack Engineer", required: true })}
        {field("company", "公司名稱", { placeholder: "選填" })}
      </div>
      {field("sourceUrl", "職缺網址", { placeholder: "https://www.104.com.tw/job/…（只保存，不會自動抓取）" })}
      {field("rawDescription", "工作內容", {
        textarea: true,
        rows: 10,
        required: true,
        placeholder: "直接貼整份職缺也可以：工作內容、需求條件、加分條件……AI 會自行拆解。",
        hint: "請不要貼入個人聯絡資料。使用 Gemini 免費方案時，內容會被 Google 用來改善產品。",
      })}
      <div className="grid gap-6 sm:grid-cols-2">
        {field("requiredSkillsRaw", "必要技能", { textarea: true, rows: 4, placeholder: "選填；職缺有分開列時貼這裡" })}
        {field("preferredSkillsRaw", "加分技能", { textarea: true, rows: 4, placeholder: "選填" })}
      </div>
      {field("notes", "備註", { textarea: true, rows: 2, placeholder: "選填：你對這份職缺的想法、投遞狀態…" })}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
        {mode === "create" ? (
          <CtaButton type="submit" size="lg" disabled={busy !== null} icon={busy ? <Loader2 className="size-4 animate-spin" /> : undefined}>
            {busy ? "AI 分析中，約 10–40 秒…" : "儲存並用 AI 分析"}
          </CtaButton>
        ) : (
          <>
            <CtaButton type="submit" disabled={busy !== null} icon={busy === "save" ? <Loader2 className="size-4 animate-spin" /> : undefined}>
              {busy === "save" ? "儲存中…" : "儲存"}
            </CtaButton>
            <Button type="button" variant="outline" disabled={busy !== null} onClick={form.handleSubmit((v) => submit(v, true))} className="h-10 tracking-[0.04em]">
              {busy === "analyze" ? (
                <>
                  <Loader2 className="animate-spin" />
                  重新分析中…
                </>
              ) : (
                "儲存並重新分析"
              )}
            </Button>
          </>
        )}
        <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => router.back()} className="tracking-[0.04em]">
          取消
        </Button>
      </div>
    </form>
  );
}
