import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AnswerForm } from "@/components/practice/answer-form";
import { AttemptControls } from "@/components/practice/attempt-controls";
import { EvaluationPanel } from "@/components/practice/evaluation-panel";
import { NextQuestionButton } from "@/components/practice/next-question-button";
import { SessionActions } from "@/components/practice/session-actions";
import { SectionHeader } from "@/components/ui/page-header";
import { QUESTION_TYPE_LABELS } from "@/lib/ai/prompts/practice-v1";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { AppError } from "@/lib/errors";
import { getSession, MAX_QUESTIONS_PER_SESSION, type PracticeQuestionView, type PracticeSessionDetail } from "@/lib/services/practice";
import { levelLabel } from "@/lib/skills/levels";

const MODE_LABELS = { interview: "面試模擬", quiz: "快速測驗", coding: "程式實作" } as const;

/** 出題失敗時 query string 只帶錯誤碼，訊息由這裡對照（不信任網址裡的文字） */
const QUESTION_ERROR_MESSAGES: Record<string, string> = {
  rate_limited: "AI 使用次數已達上限，請稍後再按「出題」。",
  ai_unavailable: "AI 服務暫時無法使用，請稍後再按「出題」。",
  ai_invalid_output: "AI 回傳的題目格式不正確，請再按一次「出題」。",
  internal_error: "出題時發生錯誤，請再按一次「出題」。",
};

async function load(id: string): Promise<PracticeSessionDetail | null> {
  const user = await requireUser();
  try {
    return await getSession(await getDb(), user.id, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: PageProps<"/practice/[sessionId]">): Promise<Metadata> {
  const { sessionId } = await params;
  const session = await load(sessionId);
  return { title: session ? `${session.topic} 練習` : "面試練習" };
}

export default async function PracticeSessionPage({ params, searchParams }: PageProps<"/practice/[sessionId]">) {
  const { sessionId } = await params;
  const { questionError } = await searchParams;
  const session = await load(sessionId);
  if (!session) notFound();

  const failedMessage = typeof questionError === "string" && !session.questions.length ? (Object.hasOwn(QUESTION_ERROR_MESSAGES, questionError) ? QUESTION_ERROR_MESSAGES[questionError] : QUESTION_ERROR_MESSAGES.internal_error) : null;
  const current = session.currentQuestion;
  const answered = session.questions.filter((q) => q.attempt);
  const latest = answered.at(-1) ?? null;
  const history = latest ? answered.filter((q) => q.id !== latest.id) : [];

  return (
    <div className="grid gap-14">
      <header className="grid gap-6">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs tracking-[0.1em] text-muted-foreground">
          <Link href="/practice" className="hover:dotted-underline">
            ← 全部練習
          </Link>
          {session.jobPostingId ? (
            <Link href={`/jobs/${session.jobPostingId}`} className="hover:dotted-underline">
              職缺：{session.jobTitle}
            </Link>
          ) : null}
          <span>{MODE_LABELS[session.mode]}</span>
          <span>目標 {levelLabel(session.targetLevel)}</span>
          <span>{session.status === "active" ? "進行中" : "已結束"}</span>
        </div>
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="section-sub">面試練習</p>
            <h1 className="mt-2 text-3xl leading-relaxed font-medium tracking-[0.12em] sm:text-4xl">{session.topic}</h1>
            <p className="mt-3 text-sm tracking-[0.08em] text-muted-foreground">
              第 {session.questions.length} 題，最多 {MAX_QUESTIONS_PER_SESSION} 題・已答 {session.answeredCount}
              {session.averageScore !== null ? `・平均 ${session.averageScore.toFixed(1)} / 4` : ""}
              {session.knowledge ? (
                <>
                  ・
                  <Link href={`/knowledge/${encodeURIComponent(session.knowledge.slug)}`} className="hover:dotted-underline">
                    知識頁
                  </Link>
                </>
              ) : null}
            </p>
          </div>
          <SessionActions sessionId={session.id} status={session.status} />
        </div>
      </header>

      {/* 目前這一題（未作答） */}
      {current ? (
        <section aria-labelledby="current-title" className="grid gap-8">
          <SectionHeader eyebrow={`第 ${current.sortOrder + 1} 題・${QUESTION_TYPE_LABELS[current.questionType]}`} title="Question" id="current-title" />
          <div className="panel p-6 sm:p-8">
            <p id={`q-${current.id}`} className="text-lg leading-9 font-medium tracking-[0.1em] whitespace-pre-line">
              {current.question}
            </p>
            {session.status === "active" ? (
              <div className="mt-8">
                <AnswerForm sessionId={session.id} questionId={current.id} />
              </div>
            ) : (
              <p className="mt-6 text-sm text-muted-foreground">練習已結束，這題沒有作答。</p>
            )}
          </div>
        </section>
      ) : null}

      {/* 沒有題目（出題失敗）或可以出下一題 */}
      {!current ? (
        <section className="panel grid gap-5 p-6 sm:p-8">
          {!session.questions.length ? (
            <>
              <p className="section-sub">還沒有題目</p>
              <p className="text-sm leading-7 tracking-[0.06em]">{failedMessage ?? "練習已建立，按下面的按鈕開始出題。"}</p>
            </>
          ) : (
            <>
              <p className="section-sub">{session.status === "active" ? (session.canAskMore ? "這題評估完成" : "已到題數上限") : "練習已結束"}</p>
              <p className="text-sm leading-7 tracking-[0.06em]">
                {session.status === "active"
                  ? session.canAskMore
                    ? "看完下面的評估後，可以加入複習、確認自己的程度，或繼續下一題。"
                    : `一次練習最多 ${MAX_QUESTIONS_PER_SESSION} 題，結束這次練習後可以再開一次。`
                  : "可以回頭看每一題的回答與評估。"}
              </p>
            </>
          )}
          {session.status === "active" && session.canAskMore ? <NextQuestionButton sessionId={session.id} label={session.questions.length ? "下一題" : "出題"} /> : null}
          {session.status === "active" && !session.canAskMore && session.questions.length ? (
            <Link href="/practice" className="dotted-underline text-sm tracking-[0.1em] text-primary">
              開始新的練習
            </Link>
          ) : null}
        </section>
      ) : null}

      {/* 最近一次作答的評估 */}
      {latest?.attempt ? (
        <section aria-labelledby="latest-title" className="grid gap-8">
          <SectionHeader eyebrow={`第 ${latest.sortOrder + 1} 題的評估・${QUESTION_TYPE_LABELS[latest.questionType]}`} title="Feedback" id="latest-title" />
          <QuestionBlock question={latest} sessionId={session.id} topic={session.topic} open />
        </section>
      ) : null}

      {history.length ? (
        <section aria-labelledby="history-title" className="grid gap-8">
          <SectionHeader eyebrow="之前的題目" title="Earlier" id="history-title" />
          <div className="grid gap-4">
            {[...history].reverse().map((q) => (
              <QuestionBlock key={q.id} question={q} sessionId={session.id} topic={session.topic} />
            ))}
          </div>
        </section>
      ) : null}

      <p className="text-xs leading-6 tracking-[0.06em] text-muted-foreground">AI 的評分是練習用的回饋，不是客觀或正式的能力認證；分數高低也不代表會不會被錄取。</p>
    </div>
  );
}

function QuestionBlock({ question, sessionId, topic, open = false }: { question: PracticeQuestionView; sessionId: string; topic: string; open?: boolean }) {
  const a = question.attempt;
  return (
    <details id={`q-${question.id}`} open={open} className="group panel scroll-mt-24">
      <summary className="cursor-pointer list-none p-6 sm:px-8">
        <span className="flex items-baseline justify-between gap-4">
          <span className="text-xs tracking-[0.16em] text-muted-foreground">
            第 {question.sortOrder + 1} 題・{QUESTION_TYPE_LABELS[question.questionType]}
          </span>
          {a?.score !== null && a?.score !== undefined ? (
            <span className="font-display text-xl text-primary tabular-nums">
              {a.score.toFixed(1)}
              <span className="text-sm text-muted-foreground"> / 4</span>
            </span>
          ) : null}
        </span>
        <span className="mt-3 block text-[15px] leading-8 tracking-[0.08em] whitespace-pre-line">{question.question}</span>
      </summary>
      {a ? (
        <div className="grid gap-8 border-t border-border p-6 sm:px-8">
          <section>
            <h4 className="text-xs tracking-[0.16em] text-primary">你的回答</h4>
            <p className="mt-3 text-sm leading-8 tracking-[0.06em] whitespace-pre-line">{a.answer}</p>
          </section>
          <EvaluationPanel attempt={a} referenceAnswer={question.referenceAnswer} />
          <AttemptControls sessionId={sessionId} attemptId={a.id} topic={topic} reviewFlag={a.reviewFlag} confirmedLevel={a.userConfirmedLevel} />
        </div>
      ) : null}
    </details>
  );
}
