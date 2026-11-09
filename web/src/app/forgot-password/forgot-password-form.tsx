"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { type ActionState, requestPasswordResetAction } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CtaButton } from "@/components/ui/cta-button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type ForgotPasswordInput, forgotPasswordSchema } from "@/lib/validation/auth";

export function ForgotPasswordForm() {
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setState({});
    startTransition(async () => {
      setState(await requestPasswordResetAction(values));
    });
  });

  if (state.done) {
    return (
      <Alert className="mt-6" role="status">
        <AlertDescription>如果這個 Email 有帳號，重設密碼的信已經寄出。沒收到的話請檢查垃圾信件匣，或幾分鐘後再試一次。</AlertDescription>
      </Alert>
    );
  }

  return (
    <form className="mt-6 grid gap-4" onSubmit={onSubmit} noValidate>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Field data-invalid={Boolean(errors.email)}>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...form.register("email")} />
        {errors.email ? <FieldError>{errors.email.message}</FieldError> : null}
      </Field>
      <CtaButton className="mt-2 w-full justify-between" size="lg" type="submit" disabled={pending}>
        {pending ? "寄送中…" : "寄送重設連結"}
      </CtaButton>
    </form>
  );
}
