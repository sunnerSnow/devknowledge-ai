import { CtaButton } from "@/components/ui/cta-button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export function ComingSoon({ eyebrow, title, phase, description }: { eyebrow: string; title: string; phase: string; description: string }) {
  return (
    <div className="grid gap-12">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <EmptyState
        title={`${phase} 推出`}
        description="目前可以先用 Knowledge 建立知識頁並標記學習狀態；這個模組完成後，會自動接上你已經累積的知識進度。"
        action={<CtaButton href="/knowledge">先去探索知識</CtaButton>}
      />
    </div>
  );
}
