CREATE TABLE "ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_knowledge" (
	"campaign_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"source" text NOT NULL,
	"importance" integer DEFAULT 50 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_knowledge_character_id_event_id_pk" PRIMARY KEY("character_id","event_id"),
	CONSTRAINT "knowledge_importance" CHECK ("character_knowledge"."importance" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "narrative_actions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"digest" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"player_message_id" uuid NOT NULL,
	"master_message_id" uuid,
	"revision" text,
	"proposal" jsonb,
	"confirmed" jsonb,
	"request_id" uuid,
	"option_id" uuid,
	"success" boolean,
	"lease_token" uuid,
	"lease_until" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "narrative_status_valid" CHECK ("narrative_actions"."status" IN ('PENDING','AWAITING_ROLL','AWAITING_STUNTS','COMMITTED','COMPLETED','REJECTED'))
);
--> statement-breakpoint
CREATE TABLE "narrative_session_plans" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"plan" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage" ADD CONSTRAINT "ai_usage_action_id_narrative_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."narrative_actions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_knowledge" ADD CONSTRAINT "character_knowledge_character_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_knowledge" ADD CONSTRAINT "character_knowledge_event_id_campaign_id_game_events_id_campaign_id_fk" FOREIGN KEY ("event_id","campaign_id") REFERENCES "public"."game_events"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative_actions" ADD CONSTRAINT "narrative_actions_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative_actions" ADD CONSTRAINT "narrative_actions_player_message_id_session_messages_id_fk" FOREIGN KEY ("player_message_id") REFERENCES "public"."session_messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative_actions" ADD CONSTRAINT "narrative_actions_master_message_id_session_messages_id_fk" FOREIGN KEY ("master_message_id") REFERENCES "public"."session_messages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative_actions" ADD CONSTRAINT "narrative_actions_session_id_campaign_id_campaign_sessions_id_campaign_id_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_sessions"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "narrative_session_plans" ADD CONSTRAINT "narrative_session_plans_session_id_campaign_id_campaign_sessions_id_campaign_id_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_sessions"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_pending_narrative_per_campaign" ON "narrative_actions" USING btree ("campaign_id") WHERE "narrative_actions"."status" NOT IN ('COMPLETED','REJECTED');--> statement-breakpoint
CREATE UNIQUE INDEX "narrative_player_message_unique" ON "narrative_actions" USING btree ("player_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX "narrative_master_message_unique" ON "narrative_actions" USING btree ("master_message_id");--> statement-breakpoint
CREATE INDEX "narrative_session_idx" ON "narrative_actions" USING btree ("session_id","created_at");