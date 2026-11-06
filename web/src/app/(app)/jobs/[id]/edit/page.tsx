import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JobForm } from "@/components/jobs/job-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { getJob } from "@/lib/services/jobs";

export const metadata: Metadata = { title: "編輯職缺" };

export default async function EditJobPage({ params }: PageProps<"/jobs/[id]/edit">) {
  const { id } = await params;
  const user = await requireUser();
  let job;
  try {
    job = await getJob(await getDb(), user.id, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) notFound();
    throw e;
  }
  return (
    <div className="grid gap-10">
      <PageHeader eyebrow="編輯職缺" title="Edit Job" description={`${job.title}。改了工作內容或技能條件後，可以選「儲存並重新分析」；你的自評不會被改動。`} />
      <div className="max-w-3xl panel p-6 sm:p-8">
        <JobForm
          mode="edit"
          jobId={job.id}
          defaults={{
            title: job.title,
            company: job.company ?? "",
            sourceUrl: job.sourceUrl ?? "",
            rawDescription: job.rawDescription,
            requiredSkillsRaw: job.requiredSkillsRaw ?? "",
            preferredSkillsRaw: job.preferredSkillsRaw ?? "",
            notes: job.notes ?? "",
          }}
        />
      </div>
    </div>
  );
}
