"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { type ActionState, loginSupabaseAction } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type Credentials, credentialsSchema } from "@/lib/validation/auth";

export function SupabaseLoginForm() {
  const form = useForm<Credentials>({ resolver: zodResolver(credentialsSchema), defaultValues: { email: "", password: "" } });
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  const submit = (intent: "signin" | "signup") =>
    form.handleSubmit((values) => {
      startTransition(async () => {
        setState(await loginSupabaseAction(intent, values));
      });
    });

  if (state.done) {
    return (
      <Alert className="mt-6">
        <AlertDescription>註冊成功！請到信箱點確認連結，完成後就能登入。</AlertDescription>
      </Alert>
    );
  }

  const { errors } = form.formState;
  return (
    <form className="mt-6 grid gap-4" onSubmit={submit("signin")} noValidate>
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
      <Field data-invalid={Boolean(errors.password)}>
        <FieldLabel htmlFor="password">密碼</FieldLabel>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={Boolean(errors.password)} {...form.register("password")} />
        {errors.password ? <FieldError>{errors.password.message}</FieldError> : <p className="text-xs text-muted-foreground">至少 8 個字元</p>}
      </Field>
      <div className="mt-2 flex gap-3">
        <Button className="flex-1" size="lg" type="submit" disabled={pending}>
          登入
        </Button>
        <Button className="flex-1" size="lg" type="button" variant="outline" disabled={pending} onClick={submit("signup")}>
          註冊
        </Button>
      </div>
    </form>
  );
}
