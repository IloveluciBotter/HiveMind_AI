import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, bigint, boolean, timestamp, jsonb, numeric, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  isReviewer: boolean("is_reviewer").notNull().default(false),
  isHubPoster: boolean("is_hub_poster").notNull().default(false),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// HiveMind Tables

export const tracks = pgTable("tracks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const questions = pgTable("questions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackId: varchar("track_id").references(() => tracks.id),
  text: text("text").notNull(),
  options: jsonb("options").notNull().$type<string[]>(),
  correctIndex: integer("correct_index").notNull(),
  complexity: integer("complexity").notNull(), // 1-5
  isBenchmark: boolean("is_benchmark").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const phrases = pgTable("phrases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  normalized: text("normalized").notNull().unique(),
  redacted: text("redacted").notNull(),
  globalMentions: integer("global_mentions").notNull().default(0),
  trackMentions: jsonb("track_mentions").notNull().$type<Record<string, number>>().default({}),
  lastCycleCounted: integer("last_cycle_counted"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const cycles = pgTable("cycles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  cycleNumber: integer("cycle_number").notNull().unique(),
  startDate: timestamp("start_date").notNull().defaultNow(),
  endDate: timestamp("end_date"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const trainAttempts = pgTable("train_attempts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  trackId: varchar("track_id").references(() => tracks.id),
  difficulty: text("difficulty").notNull(), // "low" | "medium" | "high" | "extreme"
  cost: numeric("cost", { precision: 18, scale: 8 }).notNull(),
  content: text("content").notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"
  evidencePacket: jsonb("evidence_packet").$type<Record<string, any>>(),
  cycleId: varchar("cycle_id").references(() => cycles.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
  // Auto-review fields
  scorePct: numeric("score_pct", { precision: 5, scale: 4 }), // 0.0000 - 1.0000
  attemptDurationSec: integer("attempt_duration_sec"),
  autoReviewedAt: timestamp("auto_reviewed_at"),
});

export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  attemptId: varchar("attempt_id").notNull().references(() => trainAttempts.id),
  reviewerId: varchar("reviewer_id").notNull().references(() => users.id),
  vote: text("vote").notNull(), // "approve" | "reject"
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const locks = pgTable("locks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  attemptId: varchar("attempt_id").references(() => trainAttempts.id),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(),
  originalAmount: numeric("original_amount", { precision: 18, scale: 8 }).notNull(),
  cycleCreated: integer("cycle_created").notNull(),
  cyclesRemaining: integer("cycles_remaining").notNull(),
  unlockedAt: timestamp("unlocked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const modelVersions = pgTable("model_versions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  versionNumber: integer("version_number").notNull().unique(),
  cycleId: varchar("cycle_id").references(() => cycles.id),
  isActive: boolean("is_active").notNull().default(false),
  datasetSize: integer("dataset_size").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  activatedAt: timestamp("activated_at"),
});

export const benchmarks = pgTable("benchmarks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  modelVersionId: varchar("model_version_id").references(() => modelVersions.id),
  previousModelVersionId: varchar("previous_model_version_id").references(() => modelVersions.id),
  score: numeric("score", { precision: 10, scale: 2 }).notNull(),
  previousScore: numeric("previous_score", { precision: 10, scale: 2 }),
  scoreDrop: numeric("score_drop", { precision: 10, scale: 2 }),
  wasRolledBack: boolean("was_rolled_back").notNull().default(false),
  quarantinedCycleId: varchar("quarantined_cycle_id").references(() => cycles.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const hubPosts = pgTable("hub_posts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  posterId: varchar("poster_id").references(() => users.id),
  content: text("content").notNull(),
  cycleId: varchar("cycle_id").references(() => cycles.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const hubSubmissions = pgTable("hub_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id),
  content: text("content").notNull(),
  fee: numeric("fee", { precision: 18, scale: 8 }).notNull(),
  status: text("status").notNull().default("pending"), // "pending" | "approved" | "rejected"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

// Training Pool (global state)
export const trainingPool = pgTable("training_pool", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Training Corpus Items - the canonical dataset the official HiveMind AI learns from
export const trainingCorpusItems = pgTable("training_corpus_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  trackId: varchar("track_id").references(() => tracks.id),
  cycleId: varchar("cycle_id").references(() => cycles.id),
  title: text("title"),
  normalizedText: text("normalized_text").notNull(),
  status: text("status").notNull().default("draft"), // draft | approved | rejected
  createdByWallet: varchar("created_by_wallet"),
  sourceAttemptId: varchar("source_attempt_id").references(() => trainAttempts.id),
  approvedAt: timestamp("approved_at"),
  embedStatus: text("embed_status").notNull().default("not_embedded"), // not_embedded | queued | embedding | embedded | failed
  embedError: text("embed_error"),
  embedAttempts: integer("embed_attempts").notNull().default(0),
  embedNextRetryAt: timestamp("embed_next_retry_at"),
  contentHash: text("content_hash"),
  lastEmbeddedHash: text("last_embedded_hash"),
  embedUpdatedAt: timestamp("embed_updated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Corpus Chunks - chunked text with vector embeddings for RAG
// Note: embedding column uses pgvector(1024) - managed via raw SQL
export const corpusChunks = pgTable("corpus_chunks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  corpusItemId: varchar("corpus_item_id").notNull().references(() => trainingCorpusItems.id),
  chunkIndex: integer("chunk_index").notNull(),
  chunkText: text("chunk_text").notNull(),
  embeddingModel: text("embedding_model"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Chat messages for the official HiveMind AI
export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: varchar("wallet_address").notNull(),
  trackId: varchar("track_id").references(() => tracks.id),
  aiLevel: integer("ai_level").notNull(),
  userMessage: text("user_message").notNull(),
  aiResponse: text("ai_response").notNull(),
  corpusItemsUsed: jsonb("corpus_items_used").$type<string[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Auth Nonces - for secure wallet authentication
export const authNonces = pgTable("auth_nonces", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: varchar("wallet_address").notNull(),
  nonce: varchar("nonce").notNull(),
  message: text("message").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Sessions - server-side session storage
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: varchar("wallet_address").notNull(),
  sessionTokenHash: varchar("session_token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Wallet Balances - internal stake tracking per wallet
export const walletBalances = pgTable("wallet_balances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: varchar("wallet_address").notNull().unique(),
  trainingStakeHive: numeric("training_stake_hive", { precision: 18, scale: 8 }).notNull().default("0"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Stake Ledger - idempotent deposit/withdrawal tracking
export const stakeLedger = pgTable("stake_ledger", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: varchar("wallet_address").notNull(),
  txSignature: varchar("tx_signature").unique(), // Unique for idempotent deposits
  amount: numeric("amount", { precision: 18, scale: 8 }).notNull(), // Positive = credit, negative = debit
  balanceAfter: numeric("balance_after", { precision: 18, scale: 8 }).notNull(),
  reason: varchar("reason").notNull(), // deposit, fee_reserve, fee_refund, fee_cost_to_rewards, withdrawal
  attemptId: varchar("attempt_id").references(() => trainAttempts.id),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  attemptReasonUnique: uniqueIndex("stake_ledger_attempt_reason_idx").on(table.attemptId, table.reason),
}));

// Rewards Pool - accounting for collected fees
export const rewardsPool = pgTable("rewards_pool", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  pendingHive: numeric("pending_hive", { precision: 18, scale: 8 }).notNull().default("0"),
  totalSweptHive: numeric("total_swept_hive", { precision: 18, scale: 8 }).notNull().default("0"),
  rewardsWalletAddress: varchar("rewards_wallet_address"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Answer Events - raw training telemetry (expires after retention period)
export const answerEvents = pgTable("answer_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: varchar("wallet_address").notNull(),
  attemptId: varchar("attempt_id").notNull().references(() => trainAttempts.id),
  trackId: varchar("track_id").notNull().references(() => tracks.id),
  questionId: varchar("question_id").notNull().references(() => questions.id),
  selectedAnswer: integer("selected_answer").notNull(),
  isCorrect: boolean("is_correct").notNull(),
  scorePct: numeric("score_pct", { precision: 5, scale: 4 }), // overall attempt score at time
  attemptDurationSec: integer("attempt_duration_sec"),
  levelAtTime: integer("level_at_time"),
  autoDecision: varchar("auto_decision"), // approved | rejected | pending
  cycleNumber: integer("cycle_number"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Question Aggregates - rolled up stats per question (kept forever)
export const questionAggregates = pgTable("question_aggregates", {
  questionId: varchar("question_id").primaryKey().references(() => questions.id),
  trackId: varchar("track_id").notNull().references(() => tracks.id),
  attemptsTotal: integer("attempts_total").notNull().default(0),
  correctTotal: integer("correct_total").notNull().default(0),
  accuracyPct: numeric("accuracy_pct", { precision: 5, scale: 2 }),
  avgDurationSec: numeric("avg_duration_sec", { precision: 10, scale: 2 }),
  lastCalculatedAt: timestamp("last_calculated_at").notNull().defaultNow(),
});

// Track Aggregates - rolled up stats per track (kept forever)
export const trackAggregates = pgTable("track_aggregates", {
  trackId: varchar("track_id").primaryKey().references(() => tracks.id),
  attemptsTotal: integer("attempts_total").notNull().default(0),
  accuracyPct: numeric("accuracy_pct", { precision: 5, scale: 2 }),
  lastCalculatedAt: timestamp("last_calculated_at").notNull().defaultNow(),
});

// Cycle Aggregates - rolled up stats per cycle (kept forever)
export const cycleAggregates = pgTable("cycle_aggregates", {
  cycleNumber: integer("cycle_number").primaryKey(),
  attemptsTotal: integer("attempts_total").notNull().default(0),
  accuracyPct: numeric("accuracy_pct", { precision: 5, scale: 2 }),
  lastCalculatedAt: timestamp("last_calculated_at").notNull().defaultNow(),
});

// Audit Logs - for tracking sensitive actions
export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  walletAddress: varchar("wallet_address"),
  action: varchar("action").notNull(), // login_success, login_failure, submission_created, review_vote, corpus_change, cosmetic_purchase, admin_action
  targetType: varchar("target_type"), // corpus_item, submission, review_vote, cosmetic, user, session
  targetId: varchar("target_id"),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  requestId: varchar("request_id").notNull(),
  ipHash: varchar("ip_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Types
export type AuditLog = typeof auditLogs.$inferSelect;
export type AuthNonce = typeof authNonces.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type WalletBalance = typeof walletBalances.$inferSelect;
export type StakeLedgerEntry = typeof stakeLedger.$inferSelect;
export type RewardsPool = typeof rewardsPool.$inferSelect;
export type AnswerEvent = typeof answerEvents.$inferSelect;
export type QuestionAggregate = typeof questionAggregates.$inferSelect;
export type TrackAggregate = typeof trackAggregates.$inferSelect;
export type CycleAggregate = typeof cycleAggregates.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type Track = typeof tracks.$inferSelect;
export type Question = typeof questions.$inferSelect;
export type Phrase = typeof phrases.$inferSelect;
export type Cycle = typeof cycles.$inferSelect;
export type TrainAttempt = typeof trainAttempts.$inferSelect;
export type Review = typeof reviews.$inferSelect;
export type Lock = typeof locks.$inferSelect;
export type ModelVersion = typeof modelVersions.$inferSelect;
export type Benchmark = typeof benchmarks.$inferSelect;
export type HubPost = typeof hubPosts.$inferSelect;
export type HubSubmission = typeof hubSubmissions.$inferSelect;
export type TrainingPool = typeof trainingPool.$inferSelect;
export type TrainingCorpusItem = typeof trainingCorpusItems.$inferSelect;
export type CorpusChunk = typeof corpusChunks.$inferSelect;

// Insert schemas
export const insertTrackSchema = createInsertSchema(tracks).omit({ id: true, createdAt: true });
export type InsertTrack = z.infer<typeof insertTrackSchema>;

export const insertCycleSchema = createInsertSchema(cycles).omit({ id: true, createdAt: true });
export type InsertCycle = z.infer<typeof insertCycleSchema>;

export const insertTrainingCorpusItemSchema = createInsertSchema(trainingCorpusItems).omit({ id: true, createdAt: true });
export type InsertTrainingCorpusItem = z.infer<typeof insertTrainingCorpusItemSchema>;

export const insertChatMessageSchema = createInsertSchema(chatMessages).omit({ id: true, createdAt: true });
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
