CREATE TABLE "arcane_contexts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arcane_effects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"arcanum" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sustained" boolean NOT NULL,
	"value" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "arcane_contexts" ADD CONSTRAINT "arcane_contexts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcane_contexts" ADD CONSTRAINT "arcane_contexts_session_id_campaign_id_campaign_sessions_id_campaign_id_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_sessions"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcane_contexts" ADD CONSTRAINT "arcane_contexts_character_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcane_effects" ADD CONSTRAINT "arcane_effects_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcane_effects" ADD CONSTRAINT "arcane_effects_character_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arcane_effects" ADD CONSTRAINT "arcane_effects_target_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("target_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;