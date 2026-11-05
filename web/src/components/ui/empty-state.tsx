import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-xl border border-dashed bg-card/60 px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 text-muted-foreground">{icon}</div> : null}
      <h2 className="text-base font-semibold text-primary dark:text-foreground">{title}</h2>
      {description ? <div className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{description}</div> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
