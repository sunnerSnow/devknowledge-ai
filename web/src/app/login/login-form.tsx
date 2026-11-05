"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { type ActionState, loginAction } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type Credentials, credentialsSchema } from "@/lib/validation/auth";

export function LoginForm() {
  const [intent, setIntent] = useState<"signin" | "signup">("signin");
  const form = useForm<Credentials>({ resolver: zodResolver(credentialsSchema), defaultValues: { email: "", password: "", name: "" } });
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) => {
    setState({});
    startTransition(async () => {
      setState(await loginAction(intent, values));
    });
  });

  return (
    <form className="mt-6 grid gap-4" onSubmit={onSubmit} noValidate>
      <Tabs value={intent} onValueChange={(v) => setIntent(v === "signup" ? "signup" : "signin")}>
        <TabsList className="w-full">
          <TabsTrigger value="signin" className="flex-1">
            登入
          </TabsTrigger>
          <TabsTrigger value="signup" className="flex-1">
            註冊
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      {intent === "signup" ? (
        <Field data-invalid={Boolean(errors.name)}>
          <FieldLabel htmlFor="name">顯示名稱</FieldLabel>
          <Input id="name" autoComplete="nickname" placeholder="留空就用 Email 帳號" aria-invalid={Boolean(errors.name)} {...form.register("name")} />
          {errors.name ? <FieldError>{errors.name.message}</FieldError> : null}
        </Field>
      ) : null}
      <Field data-invalid={Boolean(errors.email)}>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input id="email" type="email" autoComplete="email" aria-invalid={Boolean(errors.email)} {...form.register("email")} />
        {errors.email ? <FieldError>{errors.email.message}</FieldError> : null}
      </Field>
      <Field data-invalid={Boolean(errors.password)}>
        <FieldLabel htmlFor="password">密碼</FieldLabel>
        <Input
          id="password"
          type="password"
          autoComplete={intent === "signup" ? "new-password" : "current-password"}
          aria-invalid={Boolean(errors.password)}
          {...form.register("password")}
        />
        {errors.password ? <FieldError>{errors.password.message}</FieldError> : <FieldDescription>至少 8 個字元</FieldDescription>}
      </Field>
      <Button className="mt-2 w-full" size="lg" type="submit" disabled={pending}>
        {pending ? "處理中…" : intent === "signup" ? "建立帳號" : "登入"}
      </Button>
    </form>
  );
}
