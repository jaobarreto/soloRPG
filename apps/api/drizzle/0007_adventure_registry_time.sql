ALTER TABLE "adventure_instances" ADD COLUMN "entity_namespace" text DEFAULT 'adventure' NOT NULL;--> statement-breakpoint
ALTER TABLE "adventure_instances" ADD COLUMN "narrative_minutes" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
-- Preserve the UUID namespace of all existing Gloamhale instances.
UPDATE "adventure_instances" SET "entity_namespace" = 'gloamhale'
WHERE "definition_id" = 'six-of-swords-gloamhale:v1';
