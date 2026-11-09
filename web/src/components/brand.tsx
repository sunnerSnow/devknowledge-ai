import { cn } from "@/lib/utils";

/**
 * 品牌圖示：兩圈等高線加一個定位點——「知識地圖」。
 * 以 currentColor 上色，放在青藍底時給 text-white 即可反白；同一份路徑也用在 app/icon.svg 與 OG 圖。
 */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className={cn("size-8 shrink-0 text-primary", className)}>
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3.5 19.5C3.5 11 10 4.5 18.5 4.5 24.5 4.5 28.5 9.5 28.5 16.5 28.5 24 22.5 28 15 28 8 28 3.5 25 3.5 19.5Z" />
        <path d="M8.5 19C8.5 14.2 12 10 17.5 10 21.5 10 24 13.2 24 17 24 21.6 20.2 24 15.5 24 11 24 8.5 22 8.5 19Z" />
      </g>
      <circle cx="17" cy="17" r="2.8" fill="currentColor" />
    </svg>
  );
}

/** 品牌標誌：等高線圖示＋英文字標，下方一行中文小字 */
export function Brand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <BrandMark />
      {!compact ? (
        <span className="flex min-w-0 flex-col leading-none">
          <span className="text-[15px] font-medium tracking-[0.1em] whitespace-nowrap">DevKnowledge AI</span>
          <span className="mt-1.5 text-[11px] tracking-[0.2em] text-muted-foreground">工程師的知識地圖</span>
        </span>
      ) : null}
    </span>
  );
}
