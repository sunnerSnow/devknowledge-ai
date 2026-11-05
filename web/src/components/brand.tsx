import { cn } from "@/lib/utils";

/** 品牌標誌：知識節點的意象（三個相連的點） */
export function Brand({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg aria-hidden="true" viewBox="0 0 32 32" className="size-7 shrink-0">
        <circle cx="8" cy="22" r="4" fill="var(--teal)" />
        <circle cx="24" cy="22" r="4" fill="var(--gold)" />
        <circle cx="16" cy="9" r="4.5" fill="var(--primary)" />
        <path d="M11 20.5 14.5 12M21 20.5 17.5 12M12 22h8" stroke="var(--primary)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </svg>
      {!compact ? (
        <span className="font-semibold tracking-tight text-primary dark:text-foreground">
          DevKnowledge <span className="text-teal">AI</span>
        </span>
      ) : null}
    </span>
  );
}
