import type { Metadata } from "next";
import { ComingSoon } from "@/components/ui/coming-soon";

export const metadata: Metadata = { title: "Interview Practice" };

export default function PracticePage() {
  return (
    <ComingSoon
      eyebrow="面試練習"
      title="Interview Practice"
      phase="Phase 4"
      description="依職缺技能一次一題：概念題、情境題、架構題、程式題。AI 依明確評分規準回饋，但不會未經你確認就改寫技能等級。"
    />
  );
}
