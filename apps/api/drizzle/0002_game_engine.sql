CREATE TYPE "public"."blue_rose_ability" AS ENUM('ACCURACY', 'COMMUNICATION', 'CONSTITUTION', 'DEXTERITY', 'FIGHTING', 'INTELLIGENCE', 'PERCEPTION', 'STRENGTH', 'WILLPOWER');--> statement-breakpoint
CREATE TYPE "public"."character_kind" AS ENUM('PROTAGONIST', 'NPC', 'COMPANION', 'ADVERSARY');--> statement-breakpoint
CREATE TYPE "public"."dice_visibility" AS ENUM('PUBLIC', 'PLAYER_ONLY', 'GM_ONLY');--> statement-breakpoint
CREATE TABLE "character_abilities" (
	"character_id" uuid NOT NULL,
	"ability" "blue_rose_ability" NOT NULL,
	"score" integer NOT NULL,
	CONSTRAINT "character_abilities_character_id_ability_pk" PRIMARY KEY("character_id","ability"),
	CONSTRAINT "ability_storage_bounds" CHECK ("character_abilities"."score" BETWEEN -10 AND 30)
);
--> statement-breakpoint
CREATE TABLE "character_conditions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"visibility" "dice_visibility" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_details" (
	"character_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "character_details_character_id_kind_value_pk" PRIMARY KEY("character_id","kind","value"),
	CONSTRAINT "detail_kind_valid" CHECK ("character_details"."kind" IN ('LANGUAGE','GOAL'))
);
--> statement-breakpoint
CREATE TABLE "character_features" (
	"character_id" uuid NOT NULL,
	"rule_id" text NOT NULL,
	"degree" text,
	CONSTRAINT "character_features_character_id_rule_id_pk" PRIMARY KEY("character_id","rule_id"),
	CONSTRAINT "feature_degree_valid" CHECK ("character_features"."degree" IN ('NOVICE','JOURNEYMAN','MASTER'))
);
--> statement-breakpoint
CREATE TABLE "character_resources" (
	"character_id" uuid NOT NULL,
	"name" text NOT NULL,
	"current" integer NOT NULL,
	"maximum" integer NOT NULL,
	CONSTRAINT "character_resources_character_id_name_pk" PRIMARY KEY("character_id","name"),
	CONSTRAINT "resource_name_valid" CHECK ("character_resources"."name" IN ('HEALTH','CONVICTION','CORRUPTION')),
	CONSTRAINT "resource_bounds" CHECK ("character_resources"."current" >= 0 AND "character_resources"."current" <= "character_resources"."maximum" AND "character_resources"."maximum" BETWEEN 0 AND 10000)
);
--> statement-breakpoint
CREATE TABLE "character_secrets" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"objectives" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"kind" character_kind NOT NULL,
	"known" boolean DEFAULT false NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"people" text NOT NULL,
	"character_class" text,
	"background" text NOT NULL,
	"level" integer NOT NULL,
	"calling" text DEFAULT '' NOT NULL,
	"destiny" text DEFAULT '' NOT NULL,
	"fate" text DEFAULT '' NOT NULL,
	"personality" text DEFAULT '' NOT NULL,
	"motivations" text DEFAULT '' NOT NULL,
	"state" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_id_campaign" UNIQUE("id","campaign_id"),
	CONSTRAINT "character_level_range" CHECK ("characters"."level" BETWEEN 1 AND 20),
	CONSTRAINT "character_name_nonempty" CHECK (length(btrim("characters"."name")) > 0),
	CONSTRAINT "character_class_valid" CHECK ("characters"."character_class" IN ('ADEPT','EXPERT','WARRIOR')),
	CONSTRAINT "protagonist_known" CHECK ("characters"."kind" <> 'PROTAGONIST' OR "characters"."known")
);
--> statement-breakpoint
CREATE TABLE "blue_rose_check_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"ability" "blue_rose_ability" NOT NULL,
	"focus_id" text,
	"target_number" integer NOT NULL,
	"modifier" integer DEFAULT 0 NOT NULL,
	"reason" text NOT NULL,
	"stunts_eligible" boolean DEFAULT false NOT NULL,
	"visibility" "dice_visibility" NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "check_id_campaign" UNIQUE("id","campaign_id"),
	CONSTRAINT "check_tn_positive" CHECK ("blue_rose_check_requests"."target_number" BETWEEN 1 AND 100),
	CONSTRAINT "check_modifier_bounds" CHECK ("blue_rose_check_requests"."modifier" BETWEEN -30 AND 30)
);
--> statement-breakpoint
CREATE TABLE "blue_rose_dice_rolls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence" serial NOT NULL,
	"public_sequence" integer,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"character_id" uuid,
	"request_id" uuid,
	"die1" integer NOT NULL,
	"die2" integer NOT NULL,
	"drama_die" integer NOT NULL,
	"modifier" integer NOT NULL,
	"total" integer NOT NULL,
	"success" boolean,
	"stunt_points" integer NOT NULL,
	"reason" text NOT NULL,
	"visibility" "dice_visibility" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blue_rose_dice_rolls_sequence_unique" UNIQUE("sequence"),
	CONSTRAINT "blue_rose_dice_rolls_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "rolls_public_sequence" UNIQUE("campaign_id","public_sequence"),
	CONSTRAINT "rolls_public_sequence_visibility" CHECK (("blue_rose_dice_rolls"."visibility" = 'GM_ONLY' AND "blue_rose_dice_rolls"."public_sequence" IS NULL) OR ("blue_rose_dice_rolls"."visibility" <> 'GM_ONLY' AND "blue_rose_dice_rolls"."public_sequence" > 0 AND "blue_rose_dice_rolls"."public_sequence" IS NOT NULL)),
	CONSTRAINT "roll_faces_valid" CHECK ("blue_rose_dice_rolls"."die1" BETWEEN 1 AND 6 AND "blue_rose_dice_rolls"."die2" BETWEEN 1 AND 6 AND "blue_rose_dice_rolls"."drama_die" BETWEEN 1 AND 6),
	CONSTRAINT "roll_total_valid" CHECK ("blue_rose_dice_rolls"."total" = "blue_rose_dice_rolls"."die1" + "blue_rose_dice_rolls"."die2" + "blue_rose_dice_rolls"."drama_die" + "blue_rose_dice_rolls"."modifier"),
	CONSTRAINT "roll_sp_valid" CHECK ("blue_rose_dice_rolls"."stunt_points" BETWEEN 0 AND 6 AND ("blue_rose_dice_rolls"."stunt_points" = 0 OR ("blue_rose_dice_rolls"."success" AND "blue_rose_dice_rolls"."stunt_points" = "blue_rose_dice_rolls"."drama_die" AND ("blue_rose_dice_rolls"."die1" = "blue_rose_dice_rolls"."die2" OR "blue_rose_dice_rolls"."die1" = "blue_rose_dice_rolls"."drama_die" OR "blue_rose_dice_rolls"."die2" = "blue_rose_dice_rolls"."drama_die"))))
);
--> statement-breakpoint
CREATE TABLE "game_event_participants" (
	"campaign_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	CONSTRAINT "game_event_participants_event_id_character_id_pk" PRIMARY KEY("event_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "game_commands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"digest" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "command_campaign_key" UNIQUE("campaign_id","command_id")
);
--> statement-breakpoint
CREATE TABLE "game_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence" serial NOT NULL,
	"public_sequence" integer,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid,
	"command_id" uuid NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"visibility" "dice_visibility" NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_events_sequence_unique" UNIQUE("sequence"),
	CONSTRAINT "event_id_campaign" UNIQUE("id","campaign_id"),
	CONSTRAINT "events_public_sequence" UNIQUE("campaign_id","public_sequence"),
	CONSTRAINT "events_public_sequence_visibility" CHECK (("game_events"."visibility" = 'GM_ONLY' AND "game_events"."public_sequence" IS NULL) OR ("game_events"."visibility" <> 'GM_ONLY' AND "game_events"."public_sequence" > 0 AND "game_events"."public_sequence" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "game_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"consumable" boolean DEFAULT false NOT NULL,
	"visibility" "dice_visibility" NOT NULL,
	CONSTRAINT "items_id_campaign" UNIQUE("id","campaign_id")
);
--> statement-breakpoint
CREATE TABLE "character_inventory" (
	"campaign_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"equipped" boolean DEFAULT false NOT NULL,
	CONSTRAINT "character_inventory_character_id_item_id_pk" PRIMARY KEY("character_id","item_id"),
	CONSTRAINT "inventory_quantity_bounds" CHECK ("character_inventory"."quantity" BETWEEN 0 AND 10000),
	CONSTRAINT "equipped_requires_quantity" CHECK (NOT "character_inventory"."equipped" OR "character_inventory"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "relationship_metrics" (
	"campaign_id" uuid NOT NULL,
	"name" text NOT NULL,
	"minimum" integer NOT NULL,
	"maximum" integer NOT NULL,
	CONSTRAINT "relationship_metrics_campaign_id_name_pk" PRIMARY KEY("campaign_id","name"),
	CONSTRAINT "metric_range" CHECK ("relationship_metrics"."minimum" < "relationship_metrics"."maximum")
);
--> statement-breakpoint
CREATE TABLE "character_relationships" (
	"campaign_id" uuid NOT NULL,
	"from_character_id" uuid NOT NULL,
	"to_character_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"value" integer NOT NULL,
	"reason" text NOT NULL,
	"visibility" "dice_visibility" NOT NULL,
	CONSTRAINT "character_relationships_campaign_id_from_character_id_to_character_id_metric_pk" PRIMARY KEY("campaign_id","from_character_id","to_character_id","metric"),
	CONSTRAINT "relationship_not_self" CHECK ("character_relationships"."from_character_id" <> "character_relationships"."to_character_id"),
	CONSTRAINT "relationship_reason_nonempty" CHECK (length(btrim("character_relationships"."reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "blue_rose_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"source" text NOT NULL,
	"page" text NOT NULL,
	"ability" "blue_rose_ability",
	"prerequisites" text,
	"usage" text,
	"cost" text,
	"effect" text,
	"duration" text,
	"limitations" text,
	CONSTRAINT "rule_status_valid" CHECK ("blue_rose_rules"."status" IN ('IMPLEMENTED','RECORDED','PENDING')),
	CONSTRAINT "rule_kind_valid" CHECK ("blue_rose_rules"."kind" IN ('FOCUS','TALENT','SPECIALIZATION','ARCANUM','STUNT'))
);
--> statement-breakpoint
CREATE TABLE "world_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"accessible" boolean NOT NULL,
	"private_notes" text DEFAULT '' NOT NULL,
	"visibility" "dice_visibility" NOT NULL,
	CONSTRAINT "world_kind_valid" CHECK ("world_entities"."kind" IN ('LOCATION','OBJECT','FACTION'))
);
--> statement-breakpoint
ALTER TABLE "character_abilities" ADD CONSTRAINT "character_abilities_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_conditions" ADD CONSTRAINT "character_conditions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_details" ADD CONSTRAINT "character_details_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_features" ADD CONSTRAINT "character_features_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_features" ADD CONSTRAINT "character_features_rule_id_blue_rose_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."blue_rose_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_resources" ADD CONSTRAINT "character_resources_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_secrets" ADD CONSTRAINT "character_secrets_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_check_requests" ADD CONSTRAINT "blue_rose_check_requests_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_check_requests" ADD CONSTRAINT "blue_rose_check_requests_focus_id_blue_rose_rules_id_fk" FOREIGN KEY ("focus_id") REFERENCES "public"."blue_rose_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_check_requests" ADD CONSTRAINT "blue_rose_check_requests_session_id_campaign_id_campaign_sessions_id_campaign_id_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_sessions"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_check_requests" ADD CONSTRAINT "blue_rose_check_requests_character_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_dice_rolls" ADD CONSTRAINT "blue_rose_dice_rolls_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_dice_rolls" ADD CONSTRAINT "blue_rose_dice_rolls_session_id_campaign_id_campaign_sessions_id_campaign_id_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_sessions"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_dice_rolls" ADD CONSTRAINT "blue_rose_dice_rolls_character_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_dice_rolls" ADD CONSTRAINT "blue_rose_dice_rolls_request_id_campaign_id_blue_rose_check_requests_id_campaign_id_fk" FOREIGN KEY ("request_id","campaign_id") REFERENCES "public"."blue_rose_check_requests"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_event_participants" ADD CONSTRAINT "game_event_participants_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_event_participants" ADD CONSTRAINT "game_event_participants_event_id_campaign_id_game_events_id_campaign_id_fk" FOREIGN KEY ("event_id","campaign_id") REFERENCES "public"."game_events"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_event_participants" ADD CONSTRAINT "game_event_participants_character_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_commands" ADD CONSTRAINT "game_commands_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_session_id_campaign_id_campaign_sessions_id_campaign_id_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_sessions"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_items" ADD CONSTRAINT "game_items_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_inventory" ADD CONSTRAINT "character_inventory_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_inventory" ADD CONSTRAINT "character_inventory_character_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_inventory" ADD CONSTRAINT "character_inventory_item_id_campaign_id_game_items_id_campaign_id_fk" FOREIGN KEY ("item_id","campaign_id") REFERENCES "public"."game_items"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relationship_metrics" ADD CONSTRAINT "relationship_metrics_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_from_character_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("from_character_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_to_character_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("to_character_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_campaign_id_metric_relationship_metrics_campaign_id_name_fk" FOREIGN KEY ("campaign_id","metric") REFERENCES "public"."relationship_metrics"("campaign_id","name") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_entities" ADD CONSTRAINT "world_entities_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "one_protagonist_per_campaign" ON "characters" USING btree ("campaign_id") WHERE "characters"."kind" = 'PROTAGONIST';--> statement-breakpoint
CREATE INDEX "check_requests_campaign_idx" ON "blue_rose_check_requests" USING btree ("campaign_id","resolved");--> statement-breakpoint
CREATE INDEX "rolls_campaign_sequence_idx" ON "blue_rose_dice_rolls" USING btree ("campaign_id","sequence");--> statement-breakpoint
CREATE INDEX "events_campaign_sequence_idx" ON "game_events" USING btree ("campaign_id","sequence");--> statement-breakpoint
CREATE INDEX "events_session_sequence_idx" ON "game_events" USING btree ("session_id","sequence");--> statement-breakpoint
CREATE INDEX "world_campaign_idx" ON "world_entities" USING btree ("campaign_id");
--> statement-breakpoint
-- Small, sourced reference catalogue. RECORDED entries never execute effects.
INSERT INTO blue_rose_rules(id,kind,name,status,source,page,ability) VALUES
('dexterity-stealth','FOCUS','Stealth','IMPLEMENTED','https://greenronin.com/blog/category/blue-rose-rpg-news/page/4/','Playing a Mongrel','DEXTERITY'),
('perception-smelling','FOCUS','Smelling','IMPLEMENTED','https://greenronin.com/blog/category/blue-rose-rpg-news/page/4/','Playing a Mongrel','PERCEPTION'),
('perception-hearing','FOCUS','Hearing','IMPLEMENTED','https://greenronin.com/blog/category/blue-rose-rpg-news/page/4/','Mongrel Benefits','PERCEPTION'),
('accuracy-brawling','FOCUS','Brawling','IMPLEMENTED','https://greenronin.com/blog/category/blue-rose-rpg-news/page/4/','Mongrel Benefits','ACCURACY'),
('constitution-running','FOCUS','Running','IMPLEMENTED','https://greenronin.com/blog/category/blue-rose-rpg-news/page/4/','Mongrel Benefits','CONSTITUTION'),
('fighting-heavy-blades','FOCUS','Heavy Blades','IMPLEMENTED','https://greenronin.com/blog/category/blue-rose-rpg-news/page/4/','Mongrel Benefits','FIGHTING'),
('artificer','TALENT','Artificer','RECORDED','https://freeronin.com/age-blue-rose/GRR6501e_Blue%20Rose_TheAGERoleplayingGameOfRomanticFantasy_Errata.pdf','Core p.71; errata p.1',NULL),
('knight','SPECIALIZATION','Knight','RECORDED','https://freeronin.com/age-blue-rose/GRR6501e_Blue%20Rose_TheAGERoleplayingGameOfRomanticFantasy_Preview.pdf','Core contents p.3 / p.84',NULL),
('body-control','ARCANUM','Body Control','RECORDED','https://freeronin.com/age-blue-rose/GRR6501e_Blue%20Rose_TheAGERoleplayingGameOfRomanticFantasy_Errata.pdf','Core pp.96-97; errata pp.1-2',NULL),
('psychic-contact','ARCANUM','Psychic Contact','RECORDED','https://freeronin.com/age-blue-rose/GRR6501e_Blue%20Rose_TheAGERoleplayingGameOfRomanticFantasy_Errata.pdf','Core pp.105-106; errata p.2',NULL),
('cure','ARCANUM','Cure','RECORDED','https://freeronin.com/age-blue-rose/GRR6501e_Blue%20Rose_TheAGERoleplayingGameOfRomanticFantasy_Preview.pdf','Core contents p.3 / p.97',NULL);
