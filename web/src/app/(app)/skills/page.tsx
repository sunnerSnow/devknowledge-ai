import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/coming-soon";

export const metadata: Metadata = { title: "My Skills" };

export default function SkillsPage() {
  return (
    <ComingSoon
      eyebrow="技能地圖"
      title="My Skills"
      phase="Phase 2"
      description="技能清單與熟悉程度、來源（自評、測驗、實作）、關聯職缺，可依 Frontend、Backend、Database、Cloud、AI、Testing、DevOps 篩選。"
    />
  );
}
