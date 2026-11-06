import type { Metadata } from "next";
import { JobForm } from "@/components/jobs/job-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "新增職缺" };

export default async function NewJobPage() {
  await requireUser();
  return (
    <div className="grid gap-10">
      <PageHeader eyebrow="新增職缺" title="New Job" description="貼上整份職缺也可以。AI 只分析職缺需求，不會推定你的能力；分析完成後再逐項自評。" />
      <div className="max-w-3xl panel p-6 sm:p-8">
        <JobForm mode="create" />
      </div>
    </div>
  );
}
