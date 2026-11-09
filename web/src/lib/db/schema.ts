import { boolean, integer, jsonb, numeric, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { authSchema } from "@/lib/db/auth-schema";

/**
 * 與 db/migrations/ 對應的 Drizzle schema（帳號表在 auth-schema.ts）。
 * 約束、RLS 與權限以 SQL migration 為準；這裡只描述欄位，讓查詢有型別。
 * search_text／search_vector 由資料庫維護，不在這裡宣告（查詢時用 sql 片段）。
 */
export const dk = pgSchema("dk");

const createdAt = () => timestamp("created_at", { withTimezone: true, mode: "string" }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull().defaultNow();

export const NODE_STATUSES = ["published", "generating", "failed", "stub"] as const;
export type NodeStatus = (typeof NODE_STATUSES)[number];

export const RELATION_TYPES = ["prerequisite", "related", "extension", "alternative"] as const;
export type RelationType = (typeof RELATION_TYPES)[number];

export const PROGRESS_STATUSES = ["not_started", "learning", "understood", "implemented"] as const;
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number];

export const AI_USAGE_KINDS = ["knowledge_generate", "job_analyze", "learning_plan", "practice_question", "practice_evaluate"] as const;
export type AiUsageKind = (typeof AI_USAGE_KINDS)[number];

export const profiles = dk.table("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email"),
  displayName: text("display_name"),
  targetRole: text("target_role"),
  weeklyLearningMinutes: integer("weekly_learning_minutes").notNull().default(120),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const knowledgeNodes = dk.table("knowledge_nodes", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  englishName: text("english_name"),
  aliases: text("aliases").array().notNull().default([]),
  category: text("category"),
  summary: text("summary"),
  status: text("status", { enum: NODE_STATUSES }).notNull().default("published"),
  generationStartedAt: timestamp("generation_started_at", { withTimezone: true, mode: "string" }),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const knowledgeContents = dk.table("knowledge_contents", {
  id: uuid("id").primaryKey().defaultRandom(),
  knowledgeNodeId: uuid("knowledge_node_id").notNull(),
  version: integer("version").notNull(),
  content: jsonb("content").notNull(),
  sourceNotes: jsonb("source_notes").notNull().default([]),
  provider: text("provider").notNull(),
  modelName: text("model_name"),
  promptVersion: text("prompt_version").notNull(),
  createdBy: uuid("created_by"),
  createdAt: createdAt(),
});

export const knowledgeRelations = dk.table("knowledge_relations", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromNodeId: uuid("from_node_id").notNull(),
  toNodeId: uuid("to_node_id").notNull(),
  relationType: text("relation_type", { enum: RELATION_TYPES }).notNull(),
  strength: numeric("strength", { precision: 4, scale: 2 }).notNull().default("1"),
  reason: text("reason"),
  createdAt: createdAt(),
});

export const userKnowledgeProgress = dk.table("user_knowledge_progress", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  knowledgeNodeId: uuid("knowledge_node_id").notNull(),
  status: text("status", { enum: PROGRESS_STATUSES }).notNull().default("not_started"),
  confidence: integer("confidence"),
  lastViewedAt: timestamp("last_viewed_at", { withTimezone: true, mode: "string" }),
  updatedAt: updatedAt(),
});

export const aiUsage = dk.table("ai_usage", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  kind: text("kind", { enum: AI_USAGE_KINDS }).notNull(),
  provider: text("provider").notNull(),
  modelName: text("model_name"),
  status: text("status", { enum: ["started", "succeeded", "failed"] }).notNull().default("started"),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: createdAt(),
});

export const REQUIREMENT_TYPES = ["required", "preferred"] as const;
export type RequirementType = (typeof REQUIREMENT_TYPES)[number];

export const EVIDENCE_TYPES = ["self_assessment", "quiz", "project", "interview_practice"] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const jobPostings = dk.table("job_postings", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  title: text("title").notNull(),
  company: text("company"),
  sourceUrl: text("source_url"),
  rawDescription: text("raw_description").notNull(),
  requiredSkillsRaw: text("required_skills_raw"),
  preferredSkillsRaw: text("preferred_skills_raw"),
  notes: text("notes"),
  analysis: jsonb("analysis"),
  analysisProvider: text("analysis_provider"),
  analysisModel: text("analysis_model"),
  analysisPromptVersion: text("analysis_prompt_version"),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true, mode: "string" }),
  status: text("status", { enum: ["active", "archived"] }).notNull().default("active"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const jobSkills = dk.table("job_skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobPostingId: uuid("job_posting_id").notNull(),
  userId: uuid("user_id").notNull(),
  knowledgeNodeId: uuid("knowledge_node_id"),
  skillName: text("skill_name").notNull(),
  skillSlug: text("skill_slug").notNull(),
  category: text("category"),
  requirementType: text("requirement_type", { enum: REQUIREMENT_TYPES }).notNull(),
  requiredLevel: integer("required_level").notNull(),
  importance: integer("importance").notNull().default(1),
  originalPhrase: text("original_phrase"),
  reason: text("reason"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
});

export const userSkills = dk.table("user_skills", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  knowledgeNodeId: uuid("knowledge_node_id"),
  skillName: text("skill_name").notNull(),
  skillSlug: text("skill_slug").notNull(),
  category: text("category"),
  level: integer("level"),
  evidenceType: text("evidence_type", { enum: EVIDENCE_TYPES }).notNull().default("self_assessment"),
  evidenceNote: text("evidence_note"),
  confirmedByUser: boolean("confirmed_by_user").notNull().default(true),
  goalWeight: numeric("goal_weight", { precision: 3, scale: 1 }).notNull().default("1"),
  updatedAt: updatedAt(),
});

export const TASK_TYPES = ["read", "quiz", "code", "project", "review"] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = ["todo", "in_progress", "completed", "skipped"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const PLAN_STATUSES = ["active", "completed", "archived"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const learningPlans = dk.table("learning_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  jobPostingId: uuid("job_posting_id"),
  title: text("title").notNull(),
  goal: text("goal"),
  summary: text("summary"),
  weeklyMinutes: integer("weekly_minutes").notNull().default(120),
  status: text("status", { enum: PLAN_STATUSES }).notNull().default("active"),
  provider: text("provider"),
  modelName: text("model_name"),
  promptVersion: text("prompt_version"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const learningTasks = dk.table("learning_tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  learningPlanId: uuid("learning_plan_id").notNull(),
  userId: uuid("user_id").notNull(),
  knowledgeNodeId: uuid("knowledge_node_id"),
  skillName: text("skill_name"),
  skillSlug: text("skill_slug"),
  title: text("title").notNull(),
  description: text("description"),
  taskType: text("task_type", { enum: TASK_TYPES }).notNull(),
  estimatedMinutes: integer("estimated_minutes").notNull(),
  verification: text("verification"),
  weekNumber: integer("week_number").notNull().default(1),
  sortOrder: integer("sort_order").notNull().default(0),
  status: text("status", { enum: TASK_STATUSES }).notNull().default("todo"),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "string" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ---------------------------------------------------------------------------
// Phase 4：面試練習
// ---------------------------------------------------------------------------

export const PRACTICE_MODES = ["interview", "quiz", "coding"] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

/** 單題的題型 */
export const QUESTION_TYPES = ["concept", "scenario", "architecture", "coding"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** 練習時選的題型：mixed 會輪流出不同題型 */
export const SESSION_QUESTION_TYPES = [...QUESTION_TYPES, "mixed"] as const;
export type SessionQuestionType = (typeof SESSION_QUESTION_TYPES)[number];

export const SESSION_STATUSES = ["active", "ended"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const practiceSessions = dk.table("practice_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull(),
  jobPostingId: uuid("job_posting_id"),
  knowledgeNodeId: uuid("knowledge_node_id"),
  mode: text("mode", { enum: PRACTICE_MODES }).notNull().default("interview"),
  topic: text("topic").notNull(),
  topicSlug: text("topic_slug"),
  questionType: text("question_type", { enum: SESSION_QUESTION_TYPES }).notNull().default("mixed"),
  targetLevel: integer("target_level"),
  status: text("status", { enum: SESSION_STATUSES }).notNull().default("active"),
  createdAt: createdAt(),
  endedAt: timestamp("ended_at", { withTimezone: true, mode: "string" }),
});

export const practiceQuestions = dk.table("practice_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id").notNull(),
  userId: uuid("user_id").notNull(),
  knowledgeNodeId: uuid("knowledge_node_id"),
  skillName: text("skill_name"),
  question: text("question").notNull(),
  questionType: text("question_type", { enum: QUESTION_TYPES }).notNull(),
  rubric: jsonb("rubric").$type<string[]>().notNull().default([]),
  referenceAnswer: text("reference_answer"),
  sortOrder: integer("sort_order").notNull().default(0),
  provider: text("provider"),
  modelName: text("model_name"),
  promptVersion: text("prompt_version"),
  createdAt: createdAt(),
});

export const practiceAttempts = dk.table("practice_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id").notNull(),
  userId: uuid("user_id").notNull(),
  answer: text("answer").notNull(),
  score: numeric("score", { precision: 3, scale: 1 }),
  feedback: jsonb("feedback"),
  userConfirmedLevel: integer("user_confirmed_level"),
  reviewFlag: boolean("review_flag").notNull().default(false),
  provider: text("provider"),
  modelName: text("model_name"),
  promptVersion: text("prompt_version"),
  createdAt: createdAt(),
});

export const schema = {
  profiles,
  knowledgeNodes,
  knowledgeContents,
  knowledgeRelations,
  userKnowledgeProgress,
  aiUsage,
  jobPostings,
  jobSkills,
  userSkills,
  learningPlans,
  learningTasks,
  practiceSessions,
  practiceQuestions,
  practiceAttempts,
  ...authSchema,
};
export { users } from "@/lib/db/auth-schema";
