"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmLevelAction, setReviewFlagAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { SKILL_LEVEL_LABELS, SKILL_LEVELS } from "@/lib/skills/levels";

/**
 * 評估後的操作：加入複習、確認自己的程度。
 * 確認程度才會寫進 My Skills（來源：面試練習）；AI 的分數不會自動改。
 */
export function AttemptControls({ sessionId, attemptId, topic, reviewFlag, confirmedLevel }: { sessionId: string; attemptId: string; topic: string; reviewFlag: boolean; confirmedLevel: number | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<string>(confirmedLevel === null ? "" : String(confirmedLevel));

  function toggleReview() {
    setError(null);
    startTransition(async () => {
      const result = await setReviewFlagAction(sessionId, attemptId, !reviewFlag);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  function confirm(value: string) {
    setLevel(value);
    setError(null);
    startTransition(async () => {
      const result = await confirmLevelAction(sessionId, attemptId, value === "" ? null : Number(value));
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <div className="grid gap-4 border-t border-border pt-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Button type="button" variant={reviewFlag ? "default" : "outline"} size="sm" disabled={pending} onClick={toggleReview}>
          {reviewFlag ? <BookmarkCheck /> : <Bookmark />}
          {reviewFlag ? "已加入複習" : "加入複習"}
        </Button>
        <label className="flex flex-wrap items-center gap-3 text-sm tracking-[0.08em]">
          <span>看完評估後，你覺得自己對 {topic} 的程度：</span>
          <select
            value={level}
            disabled={pending}
            onChange={(e) => confirm(e.target.value)}
            className="h-9 border border-input bg-background px-3 text-sm tracking-[0.04em] outline-none focus-visible:border-primary focus-visible:focus-ring"
          >
            <option value="">先不更新</option>
            {SKILL_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}・{SKILL_LEVEL_LABELS[l]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs leading-6 text-muted-foreground">AI 的分數只是練習回饋；只有你在這裡選擇的程度會更新到 My Skills（來源標記為「面試練習」）。</p>
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
