import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-10" aria-busy="true" aria-label="載入中">
      <div className="grid gap-3">
        <Skeleton className="h-3 w-20 bg-foreground/10" />
        <Skeleton className="h-10 w-64 bg-foreground/10" />
      </div>
      <Skeleton className="h-14 w-full max-w-2xl bg-card" />
      <div className="grid gap-px sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-44 bg-card" />
        <Skeleton className="h-44 bg-card" />
        <Skeleton className="h-44 bg-card" />
      </div>
    </div>
  );
}
