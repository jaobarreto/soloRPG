ALTER TABLE "ai_usage" ADD COLUMN "input_characters" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "total_tokens" integer;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "usage_reported" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "ai_usage" ADD COLUMN "stage" text;