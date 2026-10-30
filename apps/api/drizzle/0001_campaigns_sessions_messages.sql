CREATE TYPE "public"."campaign_status" AS ENUM('DRAFT', 'ACTIVE', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."ending_type" AS ENUM('OBJECTIVE_COMPLETED', 'NARRATIVE_PAUSE', 'PLAYER_REQUESTED');--> statement-breakpoint
CREATE TYPE "public"."interaction_mode" AS ENUM('SPEAK', 'ACT', 'THINK', 'OUT_OF_CHARACTER');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('PLAYER', 'GAME_MASTER', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('LOCKED', 'AVAILABLE', 'IN_PROGRESS', 'PAUSED', 'COMPLETED');--> statement-breakpoint
CREATE TABLE "campaign_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "session_status" DEFAULT 'LOCKED' NOT NULL,
	"estimated_duration_minutes" integer DEFAULT 120 NOT NULL,
	"active_duration_seconds" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"resumed_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"ending_type" "ending_type",
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_campaign_number_unique" UNIQUE("campaign_id","session_number"),
	CONSTRAINT "sessions_id_campaign_unique" UNIQUE("id","campaign_id"),
	CONSTRAINT "session_number_positive" CHECK ("campaign_sessions"."session_number" > 0),
	CONSTRAINT "session_duration_positive" CHECK ("campaign_sessions"."estimated_duration_minutes" > 0),
	CONSTRAINT "session_active_nonnegative" CHECK ("campaign_sessions"."active_duration_seconds" >= 0),
	CONSTRAINT "session_title_nonempty" CHECK (length(btrim("campaign_sessions"."title")) > 0),
	CONSTRAINT "session_running_clock" CHECK (("campaign_sessions"."status" = 'IN_PROGRESS') = ("campaign_sessions"."resumed_at" IS NOT NULL)),
	CONSTRAINT "session_completed_fields" CHECK (("campaign_sessions"."status" = 'COMPLETED') = ("campaign_sessions"."completed_at" IS NOT NULL AND "campaign_sessions"."ending_type" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"planned_sessions" integer DEFAULT 8 NOT NULL,
	"default_session_duration_minutes" integer DEFAULT 120 NOT NULL,
	"current_session_number" integer,
	"status" "campaign_status" DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "campaign_title_nonempty" CHECK (length(btrim("campaigns"."title")) > 0),
	CONSTRAINT "campaign_planned_positive" CHECK ("campaigns"."planned_sessions" > 0),
	CONSTRAINT "campaign_duration_positive" CHECK ("campaigns"."default_session_duration_minutes" > 0),
	CONSTRAINT "campaign_current_in_range" CHECK ("campaigns"."current_session_number" BETWEEN 1 AND "campaigns"."planned_sessions")
);
--> statement-breakpoint
CREATE TABLE "session_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"role" "message_role" NOT NULL,
	"interaction_mode" "interaction_mode",
	"content" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_session_sequence_unique" UNIQUE("session_id","sequence_number"),
	CONSTRAINT "message_content_nonempty" CHECK (length(btrim("session_messages"."content")) > 0),
	CONSTRAINT "message_sequence_positive" CHECK ("session_messages"."sequence_number" > 0)
);
--> statement-breakpoint
ALTER TABLE "campaign_sessions" ADD CONSTRAINT "campaign_sessions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_messages" ADD CONSTRAINT "session_messages_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_messages" ADD CONSTRAINT "messages_session_campaign_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_sessions"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_one_running_per_campaign" ON "campaign_sessions" USING btree ("campaign_id") WHERE "campaign_sessions"."status" IN ('IN_PROGRESS', 'PAUSED');--> statement-breakpoint
CREATE INDEX "campaigns_created_idx" ON "campaigns" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "messages_campaign_created_idx" ON "session_messages" USING btree ("campaign_id","created_at");