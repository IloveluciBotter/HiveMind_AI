CREATE TABLE "answer_events" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar NOT NULL,
	"attempt_id" varchar NOT NULL,
	"track_id" varchar NOT NULL,
	"question_id" varchar NOT NULL,
	"selected_answer" integer NOT NULL,
	"is_correct" boolean NOT NULL,
	"score_pct" numeric(5, 4),
	"attempt_duration_sec" integer,
	"level_at_time" integer,
	"auto_decision" varchar,
	"cycle_number" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar,
	"action" varchar NOT NULL,
	"target_type" varchar,
	"target_id" varchar,
	"metadata" jsonb,
	"request_id" varchar NOT NULL,
	"ip_hash" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_nonces" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar NOT NULL,
	"nonce" varchar,
	"nonce_hash" varchar NOT NULL,
	"message" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"ip_hash" varchar,
	"user_agent_hash" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "benchmarks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_version_id" varchar,
	"previous_model_version_id" varchar,
	"score" numeric(10, 2) NOT NULL,
	"previous_score" numeric(10, 2),
	"score_drop" numeric(10, 2),
	"was_rolled_back" boolean DEFAULT false NOT NULL,
	"quarantined_cycle_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar NOT NULL,
	"track_id" varchar,
	"ai_level" integer NOT NULL,
	"user_message" text NOT NULL,
	"ai_response" text NOT NULL,
	"corpus_items_used" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributor_shares" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" varchar NOT NULL,
	"wallet_pubkey" varchar NOT NULL,
	"source" text NOT NULL,
	"shares" numeric(18, 8) NOT NULL,
	"ref_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contributor_shares_v2" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" varchar NOT NULL,
	"wallet_pubkey" varchar NOT NULL,
	"source" text NOT NULL,
	"ref_id" varchar,
	"difficulty_score" numeric(5, 4) NOT NULL,
	"quality_score" numeric(5, 4) NOT NULL,
	"base_shares" numeric(18, 8) NOT NULL,
	"usage_score" numeric(5, 4),
	"shares" numeric(18, 8),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corpus_chunks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"corpus_item_id" varchar NOT NULL,
	"chunk_index" integer NOT NULL,
	"chunk_text" text NOT NULL,
	"embedding_model" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycle_aggregates" (
	"cycle_number" integer PRIMARY KEY NOT NULL,
	"attempts_total" integer DEFAULT 0 NOT NULL,
	"accuracy_pct" numeric(5, 2),
	"last_calculated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycle_payouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" varchar NOT NULL,
	"wallet_pubkey" varchar NOT NULL,
	"shares" numeric(18, 8) NOT NULL,
	"payout_hive" numeric(18, 8) NOT NULL,
	"status" text DEFAULT 'calculated' NOT NULL,
	"tx_signature" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cycles" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_number" integer NOT NULL,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"end_date" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cycles_cycle_number_unique" UNIQUE("cycle_number")
);
--> statement-breakpoint
CREATE TABLE "hub_posts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poster_id" varchar,
	"content" text NOT NULL,
	"cycle_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hub_submissions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"content" text NOT NULL,
	"fee" numeric(18, 8) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"locked_at" timestamp,
	"locked_by" varchar,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"attempt_id" varchar,
	"amount" numeric(18, 8) NOT NULL,
	"original_amount" numeric(18, 8) NOT NULL,
	"cycle_created" integer NOT NULL,
	"cycles_remaining" integer NOT NULL,
	"unlocked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_state" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"active_model_version_id" varchar,
	"previous_model_version_id" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_versions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version_number" integer NOT NULL,
	"cycle_id" varchar,
	"is_active" boolean DEFAULT false NOT NULL,
	"dataset_size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"activated_at" timestamp,
	CONSTRAINT "model_versions_version_number_unique" UNIQUE("version_number")
);
--> statement-breakpoint
CREATE TABLE "model_versions_v2" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar DEFAULT 'candidate' NOT NULL,
	"corpus_hash" varchar NOT NULL,
	"benchmarks" jsonb,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "phrases" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"normalized" text NOT NULL,
	"redacted" text NOT NULL,
	"global_mentions" integer DEFAULT 0 NOT NULL,
	"track_mentions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_cycle_counted" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "phrases_normalized_unique" UNIQUE("normalized")
);
--> statement-breakpoint
CREATE TABLE "question_aggregates" (
	"question_id" varchar PRIMARY KEY NOT NULL,
	"track_id" varchar NOT NULL,
	"attempts_total" integer DEFAULT 0 NOT NULL,
	"correct_total" integer DEFAULT 0 NOT NULL,
	"accuracy_pct" numeric(5, 2),
	"avg_duration_sec" numeric(10, 2),
	"last_calculated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" varchar,
	"text" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct_index" integer NOT NULL,
	"complexity" integer NOT NULL,
	"is_benchmark" boolean DEFAULT false NOT NULL,
	"question_type" varchar DEFAULT 'mcq' NOT NULL,
	"numeric_answer" text,
	"numeric_tolerance" numeric(10, 6),
	"numeric_unit" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rankup_trials" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"wallet_address" varchar NOT NULL,
	"from_level" integer NOT NULL,
	"to_level" integer NOT NULL,
	"required_wallet_hold" numeric(18, 8) NOT NULL,
	"required_vault_stake" numeric(18, 8) NOT NULL,
	"wallet_hold_at_start" numeric(18, 8) NOT NULL,
	"vault_stake_at_start" numeric(18, 8) NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"question_count" integer DEFAULT 20 NOT NULL,
	"min_accuracy" numeric(5, 4) DEFAULT '0.8' NOT NULL,
	"min_avg_difficulty" numeric(3, 2) DEFAULT '3' NOT NULL,
	"trial_stake_hive" numeric(18, 8) DEFAULT '0' NOT NULL,
	"correct_count" integer DEFAULT 0 NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"avg_difficulty" numeric(3, 2),
	"accuracy" numeric(5, 4),
	"failed_reason" text,
	"expires_at" timestamp,
	"cooldown_until" timestamp,
	"slashed_hive" numeric(18, 8) DEFAULT '0' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" varchar NOT NULL,
	"reviewer_id" varchar NOT NULL,
	"reviewer_wallet_address" varchar,
	"vote" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rewards_pool" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pending_hive" numeric(18, 8) DEFAULT '0' NOT NULL,
	"total_swept_hive" numeric(18, 8) DEFAULT '0' NOT NULL,
	"rewards_wallet_address" varchar,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rewards_pool_ledger" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" varchar,
	"source" text NOT NULL,
	"wallet_pubkey" varchar,
	"amount_hive" numeric(18, 8) NOT NULL,
	"status" text DEFAULT 'recorded' NOT NULL,
	"tx_signature" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar NOT NULL,
	"session_token_hash" varchar NOT NULL,
	"expires_at" timestamp NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stake_ledger" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar NOT NULL,
	"tx_signature" varchar,
	"amount" numeric(18, 8) NOT NULL,
	"balance_after" numeric(18, 8) NOT NULL,
	"reason" varchar NOT NULL,
	"attempt_id" varchar,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stake_ledger_tx_signature_unique" UNIQUE("tx_signature")
);
--> statement-breakpoint
CREATE TABLE "track_aggregates" (
	"track_id" varchar PRIMARY KEY NOT NULL,
	"attempts_total" integer DEFAULT 0 NOT NULL,
	"accuracy_pct" numeric(5, 2),
	"last_calculated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tracks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "train_attempts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar,
	"submitter_wallet_pubkey" varchar,
	"track_id" varchar,
	"difficulty" text NOT NULL,
	"cost" numeric(18, 8) NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"evidence_packet" jsonb,
	"cycle_id" varchar,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"score_pct" numeric(5, 4),
	"attempt_duration_sec" integer,
	"auto_reviewed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "training_corpus_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"track_id" varchar,
	"cycle_id" varchar,
	"title" text,
	"normalized_text" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by_wallet" varchar,
	"submitter_wallet_pubkey" varchar,
	"source_attempt_id" varchar,
	"approved_at" timestamp,
	"embed_status" text DEFAULT 'not_embedded' NOT NULL,
	"embed_error" text,
	"embed_attempts" integer DEFAULT 0 NOT NULL,
	"embed_next_retry_at" timestamp,
	"content_hash" text,
	"last_embedded_hash" text,
	"embed_updated_at" timestamp,
	"usage_count_cycle" numeric(18, 8) DEFAULT '0' NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_pool" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"amount" numeric(18, 8) DEFAULT '0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"is_reviewer" boolean DEFAULT false NOT NULL,
	"is_hub_poster" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "wallet_balances" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"wallet_address" varchar NOT NULL,
	"training_stake_hive" numeric(18, 8) DEFAULT '0' NOT NULL,
	"training_stake_escrow_hive" numeric(18, 8) DEFAULT '0' NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"rankup_fail_streak" integer DEFAULT 0 NOT NULL,
	"rankup_fail_streak_target_level" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_balances_wallet_address_unique" UNIQUE("wallet_address")
);
--> statement-breakpoint
ALTER TABLE "answer_events" ADD CONSTRAINT "answer_events_attempt_id_train_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."train_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_events" ADD CONSTRAINT "answer_events_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_events" ADD CONSTRAINT "answer_events_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_model_version_id_model_versions_id_fk" FOREIGN KEY ("model_version_id") REFERENCES "public"."model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_previous_model_version_id_model_versions_id_fk" FOREIGN KEY ("previous_model_version_id") REFERENCES "public"."model_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benchmarks" ADD CONSTRAINT "benchmarks_quarantined_cycle_id_cycles_id_fk" FOREIGN KEY ("quarantined_cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributor_shares" ADD CONSTRAINT "contributor_shares_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributor_shares_v2" ADD CONSTRAINT "contributor_shares_v2_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corpus_chunks" ADD CONSTRAINT "corpus_chunks_corpus_item_id_training_corpus_items_id_fk" FOREIGN KEY ("corpus_item_id") REFERENCES "public"."training_corpus_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cycle_payouts" ADD CONSTRAINT "cycle_payouts_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_posts" ADD CONSTRAINT "hub_posts_poster_id_users_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_posts" ADD CONSTRAINT "hub_posts_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hub_submissions" ADD CONSTRAINT "hub_submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locks" ADD CONSTRAINT "locks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locks" ADD CONSTRAINT "locks_attempt_id_train_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."train_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_versions" ADD CONSTRAINT "model_versions_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_versions_v2" ADD CONSTRAINT "model_versions_v2_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_aggregates" ADD CONSTRAINT "question_aggregates_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_aggregates" ADD CONSTRAINT "question_aggregates_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rankup_trials" ADD CONSTRAINT "rankup_trials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_attempt_id_train_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."train_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rewards_pool_ledger" ADD CONSTRAINT "rewards_pool_ledger_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stake_ledger" ADD CONSTRAINT "stake_ledger_attempt_id_train_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."train_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "track_aggregates" ADD CONSTRAINT "track_aggregates_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "train_attempts" ADD CONSTRAINT "train_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "train_attempts" ADD CONSTRAINT "train_attempts_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "train_attempts" ADD CONSTRAINT "train_attempts_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_corpus_items" ADD CONSTRAINT "training_corpus_items_track_id_tracks_id_fk" FOREIGN KEY ("track_id") REFERENCES "public"."tracks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_corpus_items" ADD CONSTRAINT "training_corpus_items_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_corpus_items" ADD CONSTRAINT "training_corpus_items_source_attempt_id_train_attempts_id_fk" FOREIGN KEY ("source_attempt_id") REFERENCES "public"."train_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stake_ledger_attempt_reason_idx" ON "stake_ledger" USING btree ("attempt_id","reason");