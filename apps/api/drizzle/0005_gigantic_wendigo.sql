ALTER TYPE "public"."blue_rose_weapon_rule" ADD VALUE 'staff';--> statement-breakpoint
ALTER TYPE "public"."blue_rose_weapon_rule" ADD VALUE 'shortbow';--> statement-breakpoint
ALTER TYPE "public"."blue_rose_weapon_rule" ADD VALUE 'sling';--> statement-breakpoint
CREATE TABLE "adventure_cast" (
	"campaign_id" uuid NOT NULL,
	"key" text NOT NULL,
	"known" boolean DEFAULT false NOT NULL,
	"current_state" text DEFAULT 'Sem alterações confirmadas.' NOT NULL,
	CONSTRAINT "adventure_cast_campaign_id_key_pk" PRIMARY KEY("campaign_id","key")
);
--> statement-breakpoint
CREATE TABLE "adventure_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"digest" text NOT NULL,
	"definition" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adventure_instances" (
	"campaign_id" uuid PRIMARY KEY NOT NULL,
	"definition_id" text NOT NULL,
	"protagonist_id" uuid,
	"reviewed_digest" text,
	"review_notes" text
);
--> statement-breakpoint
CREATE TABLE "adventure_memories" (
	"campaign_id" uuid NOT NULL,
	"character_key" text NOT NULL,
	"event_id" uuid NOT NULL,
	CONSTRAINT "adventure_memories_campaign_id_character_key_event_id_pk" PRIMARY KEY("campaign_id","character_key","event_id")
);
--> statement-breakpoint
CREATE TABLE "adventure_reviews" (
	"campaign_id" uuid NOT NULL,
	"session_id" uuid PRIMARY KEY NOT NULL,
	"session_number" integer NOT NULL,
	"event_ids" jsonb NOT NULL,
	"reason" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adventure_scenes" (
	"campaign_id" uuid NOT NULL,
	"session_id" uuid PRIMARY KEY NOT NULL,
	"scene_key" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adventure_cast" ADD CONSTRAINT "adventure_cast_campaign_id_adventure_instances_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."adventure_instances"("campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adventure_instances" ADD CONSTRAINT "adventure_instances_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adventure_instances" ADD CONSTRAINT "adventure_instances_definition_id_adventure_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."adventure_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adventure_instances" ADD CONSTRAINT "adventure_instances_protagonist_id_campaign_id_characters_id_campaign_id_fk" FOREIGN KEY ("protagonist_id","campaign_id") REFERENCES "public"."characters"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adventure_memories" ADD CONSTRAINT "adventure_memories_campaign_id_character_key_adventure_cast_campaign_id_key_fk" FOREIGN KEY ("campaign_id","character_key") REFERENCES "public"."adventure_cast"("campaign_id","key") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adventure_memories" ADD CONSTRAINT "adventure_memories_event_id_campaign_id_game_events_id_campaign_id_fk" FOREIGN KEY ("event_id","campaign_id") REFERENCES "public"."game_events"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adventure_reviews" ADD CONSTRAINT "adventure_reviews_session_id_campaign_id_campaign_sessions_id_campaign_id_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_sessions"("id","campaign_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adventure_scenes" ADD CONSTRAINT "adventure_scenes_session_id_campaign_id_campaign_sessions_id_campaign_id_fk" FOREIGN KEY ("session_id","campaign_id") REFERENCES "public"."campaign_sessions"("id","campaign_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
-- References are operational labels. RECORDED never grants automatic effects.
INSERT INTO blue_rose_rules(id,kind,name,status,source,page,ability) VALUES
('accuracy-staves','FOCUS','Cajados','IMPLEMENTED','local:blue-rose-age-br-2023','pp.54,71','ACCURACY'),
('intelligence-natural-lore','FOCUS','Conhecimento Natural','IMPLEMENTED','local:blue-rose-age-br-2023','pp.44,70','INTELLIGENCE'),
('willpower-courage','FOCUS','Coragem','IMPLEMENTED','local:blue-rose-age-br-2023','pp.71','WILLPOWER'),
('perception-tracking','FOCUS','Rastrear','IMPLEMENTED','local:blue-rose-age-br-2023','pp.70','PERCEPTION'),
('perception-empathy','FOCUS','Empatia','IMPLEMENTED','local:blue-rose-age-br-2023','pp.70','PERCEPTION'),
('perception-seeing','FOCUS','Visão','IMPLEMENTED','local:blue-rose-age-br-2023','pp.70','PERCEPTION'),
('perception-psychic','FOCUS','Psíquico','IMPLEMENTED','local:blue-rose-age-br-2023','pp.70','PERCEPTION'),
('communication-persuasion','FOCUS','Persuasão','IMPLEMENTED','local:blue-rose-age-br-2023','pp.69','COMMUNICATION'),
('communication-etiquette','FOCUS','Etiqueta','IMPLEMENTED','local:blue-rose-age-br-2023','pp.69','COMMUNICATION'),
('intelligence-cultural-lore','FOCUS','Conhecimento Cultural','IMPLEMENTED','local:blue-rose-age-br-2023','pp.70','INTELLIGENCE'),
('animism-talent','TALENT','Animismo','RECORDED','local:blue-rose-age-br-2023','pp.72',NULL),
('shaping-talent','TALENT','Moldar','RECORDED','local:blue-rose-age-br-2023','pp.78',NULL),
('medicine','TALENT','Medicina','RECORDED','local:blue-rose-age-br-2023','pp.78',NULL),
('quick-reflexes','TALENT','Reflexos Rápidos','RECORDED','local:blue-rose-age-br-2023','pp.79',NULL),
('scouting','TALENT','Batedor','RECORDED','local:blue-rose-age-br-2023','pp.72',NULL),
('oratory','TALENT','Oratória','RECORDED','local:blue-rose-age-br-2023','pp.78–79',NULL),
('armor-training','TALENT','Treinamento com Armadura','RECORDED','local:blue-rose-age-br-2023','pp.79–80',NULL),
('weapon-shield-style','TALENT','Estilo de Arma e Escudo','RECORDED','local:blue-rose-age-br-2023','pp.75',NULL),
('psychic-shield','ARCANUM','Escudo Psíquico','RECORDED','local:blue-rose-age-br-2023','pp.102',NULL),
('second-sight','ARCANUM','Segunda Visão','RECORDED','local:blue-rose-age-br-2023','pp.113',NULL),
('move-object','ARCANUM','Mover Objeto','RECORDED','local:blue-rose-age-br-2023','pp.112',NULL),
('wind-shaping','ARCANUM','Moldar Vento','RECORDED','local:blue-rose-age-br-2023','pp.111–112',NULL);

--> statement-breakpoint
INSERT INTO blue_rose_rules(id,kind,name,status,source,page,ability) VALUES
('intelligence-historical-lore','FOCUS','Conhecimento Histórico','IMPLEMENTED','local:blue-rose-age-br-2023','pp.43,70','INTELLIGENCE'),
('constitution-stamina','FOCUS','Vigor','IMPLEMENTED','local:blue-rose-age-br-2023','pp.38,69','CONSTITUTION'),
('meditative-talent','TALENT','Meditativo','RECORDED','local:blue-rose-age-br-2023','p.78',NULL),
('single-weapon-style','TALENT','Estilo de Arma Única','RECORDED','local:blue-rose-age-br-2023','pp.75–76',NULL);
