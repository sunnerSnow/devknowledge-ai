"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { type ActionState, resetPasswordAction } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CtaButton } from "@/components/ui/cta-button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type ResetPasswordInput, resetPasswordSchema } from "@/lib/validation/auth";

export function ResetPasswordForm({ token }: { token: string }) {
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "", confirm: "" },
  });
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setState({});
    startTransition(async () => {
      setState(await resetPasswordAction(values));
    });
  });

  return (
    <form className="mt-6 grid gap-4" onSubmit={onSubmit} noValidate>
      <input type="hidden" {...form.register("token")} />
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Field data-invalid={Boolean(errors.password)}>
        <FieldLabel htmlFor="password">新密碼</FieldLabel>
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} {...form.register("password")} />
        {errors.password ? <FieldError>{errors.password.message}</FieldError> : <FieldDescription>8–72 個字元</FieldDescription>}
      </Field>
      <Field data-invalid={Boolean(errors.confirm)}>
        <FieldLabel htmlFor="confirm">再輸入一次</FieldLabel>
        <Input id="confirm" type="password" autoComplete="new-password" aria-invalid={Boolean(errors.confirm)} {...form.register("confirm")} />
        {errors.confirm ? <FieldError>{errors.confirm.message}</FieldError> : null}
      </Field>
      <CtaButton className="mt-2 w-full justify-between" size="lg" type="submit" disabled={pending}>
        {pending ? "處理中…" : "設定新密碼"}
      </CtaButton>
    </form>
  );
}
