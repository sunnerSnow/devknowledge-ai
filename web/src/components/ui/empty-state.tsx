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
    <div className={cn("panel flex flex-col items-center px-6 py-14 text-center", className)}>
      {icon ? <div className="mb-4 text-muted-foreground">{icon}</div> : null}
      <h2 className="text-lg font-medium tracking-[0.12em]">{title}</h2>
      {description ? <div className="mt-3 max-w-md text-sm leading-7 text-muted-foreground">{description}</div> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
