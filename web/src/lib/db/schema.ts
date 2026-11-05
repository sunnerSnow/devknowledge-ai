import { integer, jsonb, numeric, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
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

export const schema = { profiles, knowledgeNodes, knowledgeContents, knowledgeRelations, userKnowledgeProgress, aiUsage, ...authSchema };
export { users } from "@/lib/db/auth-schema";
