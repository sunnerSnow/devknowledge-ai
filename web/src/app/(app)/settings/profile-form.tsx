"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { type ActionState, updateProfileAction } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const schema = z.object({
  displayName: z.string().trim().max(60, "顯示名稱最多 60 個字"),
  targetRole: z.string().trim().max(80, "目標職務最多 80 個字"),
  weeklyLearningMinutes: z.coerce.number<number>().int("請輸入整數").min(0, "不能是負數").max(10080, "一週最多 10080 分鐘"),
});
type Values = z.infer<typeof schema>;

export function ProfileForm({ defaults }: { defaults: Values }) {
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setState({});
    startTransition(async () => {
      const result = await updateProfileAction(values);
      setState(result);
      if (result.done) form.reset(values);
    });
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {state.done ? (
        <Alert>
          <AlertDescription>已儲存。</AlertDescription>
        </Alert>
      ) : null}
      <Field data-invalid={Boolean(errors.displayName)}>
        <FieldLabel htmlFor="displayName">顯示名稱</FieldLabel>
        <Input id="displayName" autoComplete="nickname" aria-invalid={Boolean(errors.displayName)} {...form.register("displayName")} />
        {errors.displayName ? <FieldError>{errors.displayName.message}</FieldError> : null}
      </Field>
      <Field data-invalid={Boolean(errors.targetRole)}>
        <FieldLabel htmlFor="targetRole">目標職務</FieldLabel>
        <Input id="targetRole" placeholder="例如：Junior Full-Stack Engineer" aria-invalid={Boolean(errors.targetRole)} {...form.register("targetRole")} />
        <FieldDescription>AI 產生知識頁與學習計畫時會參考這個職務。</FieldDescription>
        {errors.targetRole ? <FieldError>{errors.targetRole.message}</FieldError> : null}
      </Field>
      <Field data-invalid={Boolean(errors.weeklyLearningMinutes)}>
        <FieldLabel htmlFor="weeklyLearningMinutes">每週可投入學習時間（分鐘）</FieldLabel>
        <Input id="weeklyLearningMinutes" type="number" inputMode="numeric" min={0} max={10080} step={10} className="max-w-40" aria-invalid={Boolean(errors.weeklyLearningMinutes)} {...form.register("weeklyLearningMinutes")} />
        {errors.weeklyLearningMinutes ? <FieldError>{errors.weeklyLearningMinutes.message}</FieldError> : null}
      </Field>
      <div>
        <Button type="submit" disabled={pending || !form.formState.isDirty}>
          {pending ? "儲存中…" : "儲存"}
        </Button>
      </div>
    </form>
  );
}
