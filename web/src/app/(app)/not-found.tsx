import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function NotFound() {
  return (
    <EmptyState
      title="找不到這個頁面"
      description="它可能已被移除，或你沒有權限存取。"
      action={
        <Button asChild variant="outline">
          <Link href="/">回到 Dashboard</Link>
        </Button>
      }
    />
  );
}
