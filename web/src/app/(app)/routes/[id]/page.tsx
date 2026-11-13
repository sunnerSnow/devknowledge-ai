import { Check, Lock, Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { QuizResultList } from "@/components/quiz/quiz-result-list";
import { DiagnosisForm } from "@/components/routes/diagnosis-form";
import { RouteActions } from "@/components/routes/route-actions";
import { RouteStepButton } from "@/components/routes/route-step-button";
import { CtaButton } from "@/components/ui/cta-button";
import { SectionHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import {
  DIAGNOSIS_ESTIMATE_LABELS,
  type DiagnosisEstimate,
  getRoute,
  type LessonState,
  ROUTE_STAGE_LABELS,
  ROUTE_STEP_ERROR_MESSAGES,
  type RouteDetail,
  type RouteLessonView,
} from "@/lib/services/routes";
import { cn } from "@/lib/utils";

async function load(id: string): Promise<RouteDetail | null> {
  const user = await requireUser();
  try {
    return await getRoute(await getDb(), user.id, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/routes/[id]">): Promise<Metadata> {
  const { id } = await params;
  const route = await load(id);
  return { title: route?.title ?? "學習路線" };
}

const ESTIMATE_STYLES: Record<DiagnosisEstimate, string> = {
  none: "border border-destructive text-destructive",
  basic: "bg-soft-yellow text-foreground",
  solid: "bg-soft-blue text-foreground",
};

/** 課程連到知識頁並帶上路線 id：知識頁會顯示「這是路線的第幾課」與回到路線的連結 */
function lessonHref(routeId: string, lesson: RouteLessonView): string | null {
  return lesson.knowledge ? `/knowledge/${encodeURIComponent(lesson.knowledge.slug)}?route=${routeId}` : null;
}

export default async function RouteDetailPage({ params, searchParams }: PageProps<"/routes/[id]">) {
  const { id } = await params;
  const { stepError } = await searchParams;
  const route = await load(id);
  if (!route) notFound();

  const archived = route.status === "archived";
  const pct = route.totalLessons ? Math.round((route.passedLessons / route.totalLessons) * 100) : 0;
  // 網址只帶錯誤碼；還在建立階段（沒有題目也沒有課）才顯示
  const stepMessage =
    typeof stepError === "string" && route.stage === "setup"
      ? Object.hasOwn(ROUTE_STEP_ERROR_MESSAGES, stepError)
        ? ROUTE_STEP_ERROR_MESSAGES[stepError]
        : ROUTE_STEP_ERROR_MESSAGES.internal_error
      : null;
  const current = route.currentLesson;
  const currentHref = current ? lessonHref(route.id, current) : null;

  return (
    <div className="grid gap-12">
      <header className="grid gap-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs tracking-[0.1em] text-muted-foreground">
          <Link href="/routes" className="hover:dotted-underline">
            ← 全部學習路線
          </Link>
          {route.jobPostingId ? (
            <Link href={`/jobs/${route.jobPostingId}`} className="hover:dotted-underline">
              職缺：{route.jobTitle}
            </Link>
          ) : null}
          <span>{archived ? "已封存" : ROUTE_STAGE_LABELS[route.stage]}</span>
          <span>
            {route.days} 天・每天 {route.dailyMinutes} 分鐘
          </span>
          {route.meta ? <span>{route.meta.provider === "mock" ? "mock provider" : `${route.meta.provider} ${route.meta.model ?? ""}`}</span> : null}
        </div>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="section-sub">學習路線</p>
            <h1 className="mt-2 text-3xl leading-relaxed font-medium tracking-[0.12em] sm:text-4xl">{route.title}</h1>
          </div>
          <RouteActions routeId={route.id} archived={archived} />
        </div>
        {route.totalLessons ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="課程" value={`${route.passedLessons} / ${route.totalLessons}`} />
            <Stat label="完成率" value={`${pct}%`} />
            <Stat label="天數" value={`${route.dayViews.length} 天`} />
          </div>
        ) : null}
        {route.summary ? <p className="border-l-2 border-primary pl-3 text-sm leading-7 whitespace-pre-line text-foreground/80">{route.summary}</p> : null}
        {archived ? <p className="text-sm text-muted-foreground">這條路線已封存；恢復後才能繼續診斷或排課。</p> : null}
      </header>

      {stepMessage ? (
        <p className="border border-destructive px-4 py-3 text-sm text-destructive" role="alert">
          {stepMessage}
        </p>
      ) : null}

      {/* 還沒有診斷題也沒有課：出題或略過 */}
      {route.stage === "setup" && !archived ? (
        <section className="grid gap-5 panel p-6">
          <p className="text-sm leading-7">先用幾題極短題診斷程度，排出來的課會比較準；趕時間也可以直接依差距表的自評排課。</p>
          <div className="flex flex-wrap items-start gap-3">
            <RouteStepButton url={`/api/routes/${route.id}/diagnosis`} label="出診斷題" busyLabel="AI 出題中，約 10–40 秒…" />
            <RouteStepButton url={`/api/routes/${route.id}/lessons`} label="略過診斷，直接排課" busyLabel="AI 排課中…" variant="outline" />
          </div>
        </section>
      ) : null}

      {/* 診斷作答 */}
      {route.stage === "diagnosis" && !archived ? (
        <section className="grid gap-6">
          <SectionHeader eyebrow="程度診斷" title="Diagnosis" aside={<span className="text-muted-foreground">{route.diagnosisQuestions.length} 題</span>} />
          <DiagnosisForm routeId={route.id} questions={route.diagnosisQuestions} />
          <div className="flex flex-wrap items-start gap-3 border-t border-border pt-6">
            <RouteStepButton url={`/api/routes/${route.id}/diagnosis`} label="換一組題目" busyLabel="AI 出題中…" variant="outline" />
            <RouteStepButton url={`/api/routes/${route.id}/lessons`} label="略過診斷，直接排課" busyLabel="AI 排課中…" variant="outline" />
          </div>
        </section>
      ) : null}

      {/* 診斷結果（排課前展開，排課後收合在下方） */}
      {route.diagnosisResult && route.stage === "diagnosed" ? (
        <section className="grid gap-6">
          <SectionHeader eyebrow="診斷結果" title="Diagnosis" />
          <DiagnosisSummary route={route} />
          {!archived ? (
            <div>
              <RouteStepButton url={`/api/routes/${route.id}/lessons`} label="依診斷結果排課" busyLabel="AI 排課中，約 10–40 秒…" />
            </div>
          ) : null}
          <QuizResultList items={route.diagnosisResult.items.map((it) => ({ ...it, tag: it.skill }))} />
        </section>
      ) : null}

      {/* 課程 */}
      {route.totalLessons ? (
        <>
          {route.stage === "completed" ? (
            <div className="panel p-6 text-sm leading-7">
              <p className="text-lg font-medium tracking-[0.04em]">全部課程都通過了</p>
              <p className="mt-2 text-muted-foreground">接下來用面試練習把觀念講成口語回答，或回職缺頁看還有哪些技能要補。</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <CtaButton href={route.jobPostingId ? `/practice?job=${route.jobPostingId}` : "/practice"}>開始面試練習</CtaButton>
              </div>
            </div>
          ) : current && currentHref ? (
            <div className="grid gap-3 panel p-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="text-xs tracking-[0.12em] text-muted-foreground">
                  目前這課・DAY {String(current.dayNumber).padStart(2, "0")}・第 {current.index} / {route.totalLessons} 課
                </p>
                <p className="mt-2 text-xl font-medium tracking-[0.04em]">{current.topic}</p>
                {current.goal ? <p className="mt-1 text-sm leading-7 text-foreground/80">{current.goal}</p> : null}
              </div>
              <CtaButton href={currentHref}>{current.knowledge?.status === "stub" ? "建立並開始這課" : "開始這課"}</CtaButton>
            </div>
          ) : null}

          <section className="grid gap-10">
            <SectionHeader eyebrow="每天的課程" title="Days" aside={<span className="text-muted-foreground">小測驗全對才解鎖下一課</span>} />
            {route.dayViews.map((d) => (
              <section key={d.day} aria-labelledby={`day-${d.day}`} className={cn("grid gap-4", d.done && "opacity-70")}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-3">
                  <h3 id={`day-${d.day}`} className="flex flex-wrap items-baseline gap-3 text-lg font-medium tracking-[0.04em]">
                    <span className="text-xs tracking-[0.12em] text-muted-foreground tabular-nums">DAY {String(d.day).padStart(2, "0")}</span>
                    {d.focus}
                  </h3>
                  <span className="text-xs tracking-[0.06em] text-muted-foreground">
                    約 {d.minutes} 分鐘・{d.lessons.filter((l) => l.state === "passed").length}/{d.lessons.length} 通過
                  </span>
                </div>
                <ol className="grid gap-3">
                  {d.lessons.map((l) => (
                    <LessonItem key={l.id} routeId={route.id} lesson={l} />
                  ))}
                </ol>
              </section>
            ))}
          </section>

          {route.notes.length ? (
            <section className="grid gap-2 text-sm leading-7 text-muted-foreground">
              <p className="section-sub">排課備註</p>
              {route.notes.map((n, i) => (
                <p key={i}>— {n}</p>
              ))}
            </section>
          ) : null}

          {route.diagnosisResult ? (
            <details className="group panel">
              <summary className="cursor-pointer list-none p-5 text-sm font-medium tracking-[0.06em]">
                診斷結果 <span className="ml-2 text-xs text-muted-foreground group-open:hidden">展開</span>
              </summary>
              <div className="grid gap-6 border-t border-border p-5">
                <DiagnosisSummary route={route} />
                <QuizResultList items={route.diagnosisResult.items.map((it) => ({ ...it, tag: it.skill }))} />
              </div>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function DiagnosisSummary({ route }: { route: RouteDetail }) {
  const result = route.diagnosisResult;
  if (!result) return null;
  return (
    <div className="grid gap-4">
      <p className="text-[15px] leading-8 tracking-[0.06em]">{result.summary}</p>
      {result.levels.length ? (
        <ul className="flex flex-wrap gap-2" aria-label="各技能的初步程度">
          {result.levels.map((l) => (
            <li key={l.skill} className={cn("px-3 py-1 text-sm tracking-[0.06em]", ESTIMATE_STYLES[l.estimate])}>
              {l.skill}：{DIAGNOSIS_ESTIMATE_LABELS[l.estimate]}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs leading-6 text-muted-foreground">初步程度依幾題極短題估計，只用來排課，不會改你在技能地圖填的程度。</p>
    </div>
  );
}

const STATE_LABELS: Record<LessonState, string> = { passed: "已通過", available: "目前這課", locked: "未解鎖" };

function LessonItem({ routeId, lesson }: { routeId: string; lesson: RouteLessonView }) {
  const href = lesson.state === "locked" ? null : lessonHref(routeId, lesson);
  const Icon = lesson.state === "passed" ? Check : lesson.state === "available" ? Play : Lock;
  return (
    <li className={cn("grid gap-3 border border-border p-4 sm:grid-cols-[2rem_minmax(0,1fr)]", lesson.state === "available" ? "bg-card" : "bg-secondary/50")}>
      <span
        className={cn(
          "flex size-8 items-center justify-center",
          lesson.state === "passed" && "bg-primary text-primary-foreground",
          lesson.state === "available" && "border border-primary text-primary",
          lesson.state === "locked" && "text-muted-foreground",
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tracking-[0.1em] text-muted-foreground">
          <span className="tabular-nums">第 {lesson.index} 課</span>
          <span className={cn(lesson.state === "available" && "text-primary")}>{STATE_LABELS[lesson.state]}</span>
          <span>約 {lesson.estimatedMinutes} 分鐘</span>
          {lesson.skillName ? <span>{lesson.skillName}</span> : null}
          <span>{lesson.core ? "面試必備" : "加分"}</span>
          {lesson.knowledge?.status === "stub" && lesson.state !== "locked" ? <span>知識頁待建立</span> : null}
        </div>
        <p className={cn("mt-2 text-base font-medium tracking-[0.02em]", lesson.state === "locked" && "text-muted-foreground")}>
          {href ? (
            <Link href={href} className="hover:dotted-underline">
              {lesson.topic}
            </Link>
          ) : (
            lesson.topic
          )}
        </p>
        {lesson.goal ? <p className="mt-1 text-[13px] leading-6 text-foreground/75">{lesson.goal}</p> : null}
      </div>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel px-5 py-4">
      <p className="text-xs font-medium tracking-[0.1em] text-foreground/70">{label}</p>
      <p className="mt-1 font-display text-xl font-normal tabular-nums tracking-[0.02em]">{value}</p>
    </div>
  );
}
