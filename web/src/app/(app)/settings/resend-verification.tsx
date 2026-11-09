"use client";

import { useState, useTransition } from "react";
import { type ActionState, resendVerificationAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

/** 設定頁：Email 未驗證時重寄驗證信 */
export function ResendVerification() {
  const [state, setState] = useState<ActionState>({});
  const [pending, startTransition] = useTransition();

  if (state.done) return <span className="ml-3 text-xs tracking-[0.12em] text-primary">驗證信已寄出，請到信箱點連結</span>;
  return (
    <span className="ml-3 inline-flex items-center gap-3">
      <Button
        type="button"
        size="xs"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setState({});
          startTransition(async () => {
            setState(await resendVerificationAction());
          });
        }}
      >
        {pending ? "寄送中…" : "重寄驗證信"}
      </Button>
      {state.error ? (
        <span className="text-xs text-destructive" role="alert">
          {state.error}
        </span>
      ) : null}
    </span>
  );
}
