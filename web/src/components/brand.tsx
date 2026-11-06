import { cn } from "@/lib/utils";

/** 品牌標誌：青藍色的小圖示＋中文字標，下方一行英文襯線小字 */
export function Brand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <svg aria-hidden="true" viewBox="0 0 32 32" className="size-8 shrink-0 text-primary">
        <rect x="5" y="4" width="9" height="24" fill="currentColor" />
        <rect x="18" y="12" width="9" height="16" fill="currentColor" opacity="0.55" />
        <circle cx="22.5" cy="7" r="3" fill="currentColor" />
      </svg>
      {!compact ? (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="text-[15px] font-medium tracking-[0.1em] whitespace-nowrap">DevKnowledge AI</span>
          <span className="mt-1.5 text-[11px] tracking-[0.2em] text-muted-foreground">工程師的知識地圖</span>
        </span>
      ) : null}
    </span>
  );
}
