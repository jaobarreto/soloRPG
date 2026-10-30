CREATE TYPE "public"."blue_rose_weapon_rule" AS ENUM('heavy-blade', 'light-blade', 'longbow');--> statement-breakpoint
CREATE TABLE "blue_rose_advanced_tests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"ability" "blue_rose_ability" NOT NULL,
	"focus_id" text,
	"target_number" integer NOT NULL,
	"threshold" integer NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"interval_minutes" integer NOT NULL,
	"reason" text NOT NULL,
	"visibility" "dice_visibility" NOT NULL,
	CONSTRAINT "advanced_id_campaign" UNIQUE("id","campaign_id"),
	CONSTRAINT "advanced_bounds" CHECK ("blue_rose_advanced_tests"."target_number" > 0 AND "blue_rose_advanced_tests"."threshold" > 0 AND "blue_rose_advanced_tests"."progress" >= 0 AND "blue_rose_advanced_tests"."attempts" >= 0 AND "blue_rose_advanced_tests"."interval_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "blue_rose_arcana_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"visibility" "dice_visibility" NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_vitals" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"fatigue_level" integer DEFAULT 0 NOT NULL,
	"casts_since_rest" integer DEFAULT 0 NOT NULL,
	"living" boolean DEFAULT true NOT NULL,
	"unconscious_hours" integer,
	"cure_used" boolean DEFAULT false NOT NULL,
	"breather_available" boolean DEFAULT false NOT NULL,
	"life_state" text DEFAULT 'ALIVE' NOT NULL,
	CONSTRAINT "vitals_fatigue_range" CHECK ("character_vitals"."fatigue_level" BETWEEN 0 AND 4),
	CONSTRAINT "vitals_casts_nonnegative" CHECK ("character_vitals"."casts_since_rest" >= 0),
	CONSTRAINT "vitals_state_valid" CHECK ("character_vitals"."life_state" IN ('ALIVE','DYING','DEAD','UNCONSCIOUS'))
);
--> statement-breakpoint
CREATE TABLE "blue_rose_attacks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"encounter_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"roll_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"stunt_points" integer NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	"raw_damage" integer,
	"armor" integer,
	"damage" integer,
	CONSTRAINT "attack_roll_unique" UNIQUE("roll_id"),
	CONSTRAINT "attack_damage_nonnegative" CHECK ("blue_rose_attacks"."damage" IS NULL OR "blue_rose_attacks"."damage" >= 0)
);
--> statement-breakpoint
CREATE TABLE "blue_rose_encounters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"round" integer DEFAULT 1 NOT NULL,
	"turn_index" integer DEFAULT 0 NOT NULL,
	"visibility" "dice_visibility" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "encounter_id_campaign" UNIQUE("id","campaign_id"),
	CONSTRAINT "encounter_state_valid" CHECK ("blue_rose_encounters"."status" IN ('ACTIVE','COMPLETED') AND "blue_rose_encounters"."round" > 0 AND "blue_rose_encounters"."turn_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "blue_rose_combat_members" (
	"campaign_id" uuid NOT NULL,
	"encounter_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"initiative" integer NOT NULL,
	"initiative_drama" integer NOT NULL,
	"weapon_item_id" uuid NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"major_used" boolean DEFAULT false NOT NULL,
	"minor_used" integer DEFAULT 0 NOT NULL,
	"aimed" boolean DEFAULT false NOT NULL,
	"defense_bonus" integer DEFAULT 0 NOT NULL,
	"prone" boolean DEFAULT false NOT NULL,
	"loaded" boolean DEFAULT true NOT NULL,
	"dying_at_round" integer,
	"uses_dying_rules" boolean NOT NULL,
	CONSTRAINT "blue_rose_combat_members_encounter_id_character_id_pk" PRIMARY KEY("encounter_id","character_id"),
	CONSTRAINT "member_order_unique" UNIQUE("encounter_id","ordinal"),
	CONSTRAINT "combat_member_actions" CHECK ("blue_rose_combat_members"."minor_used" BETWEEN 0 AND 2 AND (NOT "blue_rose_combat_members"."major_used" OR "blue_rose_combat_members"."minor_used" <= 1))
);
--> statement-breakpoint
CREATE TABLE "blue_rose_combat_profiles" (
	"character_id" uuid PRIMARY KEY NOT NULL,
	"armor_type" text NOT NULL,
	"armor_trained" boolean NOT NULL,
	"shield_type" text NOT NULL,
	"shield_trained" boolean NOT NULL,
	"base_speed" integer NOT NULL,
	CONSTRAINT "combat_profile_armor" CHECK ("blue_rose_combat_profiles"."armor_type" IN ('NONE','LIGHT','MEDIUM','HEAVY') AND "blue_rose_combat_profiles"."shield_type" IN ('NONE','LIGHT','MEDIUM','HEAVY')),
	CONSTRAINT "combat_profile_speed" CHECK ("blue_rose_combat_profiles"."base_speed" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "blue_rose_stunt_uses" (
	"attack_id" uuid NOT NULL,
	"stunt_id" text NOT NULL,
	"cost" integer NOT NULL,
	CONSTRAINT "blue_rose_stunt_uses_attack_id_stunt_id_pk" PRIMARY KEY("attack_id","stunt_id"),
	CONSTRAINT "stunt_cost_positive" CHECK ("blue_rose_stunt_uses"."cost" > 0)
);
--> statement-breakpoint
CREATE TABLE "blue_rose_special_check_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"character_id" uuid NOT NULL,
	"ability" "blue_rose_ability" NOT NULL,
	"focus_id" text,
	"modifier" integer DEFAULT 0 NOT NULL,
	"opponent_id" uuid,
	"opponent_ability" "blue_rose_ability",
	"opponent_focus_id" text,
	"opponent_modifier" integer DEFAULT 0 NOT NULL,
	"advanced_test_id" uuid,
	"reason" text NOT NULL,
	"visibility" "dice_visibility" NOT NULL,
	"stunts_eligible" boolean DEFAULT false NOT NULL,
	"resolved" boolean DEFAULT false NOT NULL,
	CONSTRAINT "special_kind_fields" CHECK (("blue_rose_special_check_requests"."kind" = 'OPPOSED' AND "blue_rose_special_check_requests"."opponent_id" IS NOT NULL AND "blue_rose_special_check_requests"."opponent_ability" IS NOT NULL AND "blue_rose_special_check_requests"."advanced_test_id" IS NULL) OR ("blue_rose_special_check_requests"."kind" = 'ADVANCED' AND "blue_rose_special_check_requests"."advanced_test_id" IS NOT NULL AND "blue_rose_special_check_requests"."opponent_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "blue_rose_weapon_training" (
	"character_id" uuid NOT NULL,
	"rule_id" "blue_rose_weapon_rule" NOT NULL,
	CONSTRAINT "blue_rose_weapon_training_character_id_rule_id_pk" PRIMARY KEY("character_id","rule_id")
);
--> statement-breakpoint
ALTER TABLE "character_conditions" ADD COLUMN "rule_key" text;--> statement-breakpoint
ALTER TABLE "character_features" ADD COLUMN "improved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "game_items" ADD COLUMN "equipment_rule_id" "blue_rose_weapon_rule";--> statement-breakpoint
ALTER TABLE "blue_rose_advanced_tests" ADD CONSTRAINT "blue_rose_advanced_tests_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_advanced_tests" ADD CONSTRAINT "blue_rose_advanced_tests_focus_id_blue_rose_rules_id_fk" FOREIGN KEY ("focus_id") REFERENCES "public"."blue_rose_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_advanced_tests" ADD CONSTRAINT "blue_rose_advanced_tests_character_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_arcana_requests" ADD CONSTRAINT "blue_rose_arcana_requests_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_arcana_requests" ADD CONSTRAINT "blue_rose_arcana_requests_session_id_campaign_id_campaign_sessions_id_campaign_id_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_sessions"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_arcana_requests" ADD CONSTRAINT "blue_rose_arcana_requests_character_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_arcana_requests" ADD CONSTRAINT "blue_rose_arcana_requests_target_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("target_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_vitals" ADD CONSTRAINT "character_vitals_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_attacks" ADD CONSTRAINT "blue_rose_attacks_encounter_id_blue_rose_encounters_id_fk" FOREIGN KEY ("encounter_id") REFERENCES "public"."blue_rose_encounters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_attacks" ADD CONSTRAINT "blue_rose_attacks_roll_id_blue_rose_dice_rolls_id_fk" FOREIGN KEY ("roll_id") REFERENCES "public"."blue_rose_dice_rolls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_attacks" ADD CONSTRAINT "blue_rose_attacks_encounter_id_actor_id_blue_rose_combat_members_encounter_id_character_id_fk" FOREIGN KEY ("encounter_id","actor_id") REFERENCES "public"."blue_rose_combat_members"("encounter_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_attacks" ADD CONSTRAINT "blue_rose_attacks_encounter_id_target_id_blue_rose_combat_members_encounter_id_character_id_fk" FOREIGN KEY ("encounter_id","target_id") REFERENCES "public"."blue_rose_combat_members"("encounter_id","character_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_encounters" ADD CONSTRAINT "blue_rose_encounters_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_encounters" ADD CONSTRAINT "blue_rose_encounters_session_id_campaign_id_campaign_sessions_id_campaign_id_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_sessions"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_combat_members" ADD CONSTRAINT "blue_rose_combat_members_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_combat_members" ADD CONSTRAINT "blue_rose_combat_members_encounter_id_campaign_id_blue_rose_encounters_id_campaign_id_fk" FOREIGN KEY ("encounter_id","campaign_id") REFERENCES "public"."blue_rose_encounters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_combat_members" ADD CONSTRAINT "blue_rose_combat_members_character_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_combat_members" ADD CONSTRAINT "blue_rose_combat_members_weapon_item_id_campaign_id_game_items_id_campaign_id_fk" FOREIGN KEY ("weapon_item_id","campaign_id") REFERENCES "public"."game_items"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_combat_profiles" ADD CONSTRAINT "blue_rose_combat_profiles_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_stunt_uses" ADD CONSTRAINT "blue_rose_stunt_uses_attack_id_blue_rose_attacks_id_fk" FOREIGN KEY ("attack_id") REFERENCES "public"."blue_rose_attacks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_special_check_requests" ADD CONSTRAINT "blue_rose_special_check_requests_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_special_check_requests" ADD CONSTRAINT "blue_rose_special_check_requests_character_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("character_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_special_check_requests" ADD CONSTRAINT "blue_rose_special_check_requests_opponent_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("opponent_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_special_check_requests" ADD CONSTRAINT "blue_rose_special_check_requests_advanced_test_id_campaign_id_blue_rose_advanced_tests_id_campaign_id_fk" FOREIGN KEY ("advanced_test_id","campaign_id") REFERENCES "public"."blue_rose_advanced_tests"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_special_check_requests" ADD CONSTRAINT "blue_rose_special_check_requests_session_id_campaign_id_campaign_sessions_id_campaign_id_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_sessions"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blue_rose_weapon_training" ADD CONSTRAINT "blue_rose_weapon_training_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attacks_encounter_pending" ON "blue_rose_attacks" USING btree ("encounter_id","resolved");--> statement-breakpoint
CREATE UNIQUE INDEX "one_active_encounter" ON "blue_rose_encounters" USING btree ("campaign_id") WHERE "blue_rose_encounters"."status" = 'ACTIVE';--> statement-breakpoint
ALTER TABLE "character_conditions" ADD CONSTRAINT "condition_rule_unique" UNIQUE("character_id","rule_key");
--> statement-breakpoint
INSERT INTO character_vitals(character_id) SELECT id FROM characters ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO character_resources(character_id,name,current,maximum) SELECT id,'CONVICTION',3+(level-1)/2,3+(level-1)/2 FROM characters WHERE kind='PROTAGONIST' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO blue_rose_rules(id,kind,name,status,source,page,ability) VALUES
('dexterity-initiative','FOCUS','Iniciativa','IMPLEMENTED','local:blue-rose-age-br-2023','pp.19,69','DEXTERITY'),
('intelligence-healing','FOCUS','Curar','IMPLEMENTED','local:blue-rose-age-br-2023','pp.69-71,101','INTELLIGENCE'),
('willpower-self-discipline','FOCUS','Autodisciplina','IMPLEMENTED','local:blue-rose-age-br-2023','pp.71,96','WILLPOWER'),
('accuracy-light-blades','FOCUS','Lâminas Leves','IMPLEMENTED','local:blue-rose-age-br-2023','pp.54,71','ACCURACY'),
('accuracy-bows','FOCUS','Arcos','IMPLEMENTED','local:blue-rose-age-br-2023','pp.54,71','ACCURACY'),
('healing-talent','TALENT','Curar (talento arcano)','RECORDED','local:blue-rose-age-br-2023','pp.71-80,92,101',NULL),
('MIGHTY_BLOW','STUNT','Golpe Poderoso','IMPLEMENTED','local:blue-rose-age-br-2023','pp.23-24',NULL),
('PIERCE_ARMOR','STUNT','Perfurar Armadura','IMPLEMENTED','local:blue-rose-age-br-2023','pp.23-24',NULL),
('KNOCK_PRONE','STUNT','Derrubar','IMPLEMENTED','local:blue-rose-age-br-2023','pp.23-24',NULL),
('DEFENSIVE_STANCE','STUNT','Postura Defensiva','IMPLEMENTED','local:blue-rose-age-br-2023','pp.23-24',NULL),
('LETHAL_BLOW','STUNT','Golpe Letal','IMPLEMENTED','local:blue-rose-age-br-2023','pp.23-24',NULL);
--> statement-breakpoint
UPDATE blue_rose_rules SET status='IMPLEMENTED',source='local:blue-rose-age-br-2023',page='pp.92-96,101',prerequisites='Known Cure and Healing talent; living target; touch confirmed by local operator',usage='Narrative time, Healing tradition only; Intelligence (Healing), TN 11',cost='Fatigue test TN 11 plus previous fatiguing uses since breather',effect='Healing capped by maximum Health',duration='Instantaneous',limitations='Target must take a breather before benefiting again. Meditative tradition and arcane Stunts pending.' WHERE id='cure';
