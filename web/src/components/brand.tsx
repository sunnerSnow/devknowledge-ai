import { cn } from "@/lib/utils";

/** 品牌標誌：小字副標在上、字標在下 */
export function Brand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg aria-hidden="true" viewBox="0 0 32 32" className="size-7 shrink-0">
        <circle cx="8" cy="22" r="4" fill="var(--blob-blue)" />
        <circle cx="24" cy="22" r="4" fill="var(--blob-yellow)" />
        <circle cx="16" cy="9" r="4.5" fill="var(--foreground)" />
        <path d="M11 20.5 14.5 12M21 20.5 17.5 12M12 22h8" stroke="var(--foreground)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </svg>
      {!compact ? (
        <span className="flex flex-col leading-none whitespace-nowrap">
          <span className="text-[9px] tracking-[0.3em] text-muted-foreground">知識地圖</span>
          <span className="mt-1 text-[15px] font-medium tracking-[0.04em]">DevKnowledge AI</span>
        </span>
      ) : null}
    </span>
  );
}
