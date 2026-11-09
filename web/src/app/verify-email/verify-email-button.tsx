"use client";

import { useState, useTransition } from "react";
import { type ActionState, verifyEmailAction } from "@/app/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CtaButton } from "@/components/ui/cta-button";

export function VerifyEmailButton({ token }: { token: string }) {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-6 grid gap-4">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <CtaButton
        className="w-full justify-between"
        size="lg"
        type="button"
        disabled={pending}
        onClick={() => {
          setState({});
          startTransition(async () => {
            setState(await verifyEmailAction(token));
          });
        }}
      >
        {pending ? "驗證中…" : "完成驗證"}
      </CtaButton>
    </div>
  );
}
