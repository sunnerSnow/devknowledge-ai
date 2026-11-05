import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/coming-soon";

export const metadata: Metadata = { title: "Job Analyzer" };

export default function JobsPage() {
  return (
    <ComingSoon
      eyebrow="Job Analyzer"
      title="職缺分析"
      phase="Phase 2"
      description="貼上 104 職缺的職稱、工作內容與技能要求，AI 會拆解成標準化技能，讓你逐項自評並看見差距與優先順序。"
    />
  );
}
