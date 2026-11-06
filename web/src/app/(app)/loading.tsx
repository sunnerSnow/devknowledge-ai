import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="grid gap-10" aria-busy="true" aria-label="載入中">
      <div className="grid gap-3">
        <Skeleton className="h-7 w-40 bg-secondary" />
        <Skeleton className="h-4 w-24 bg-secondary" />
      </div>
      <Skeleton className="h-14 w-full max-w-2xl bg-card" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-44 bg-card" />
        <Skeleton className="h-44 bg-card" />
        <Skeleton className="h-44 bg-card" />
      </div>
    </div>
  );
}
