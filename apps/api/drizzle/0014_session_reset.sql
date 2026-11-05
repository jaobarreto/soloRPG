CREATE TABLE "library_session_resets" (
  "sequence" serial PRIMARY KEY,
  "slot_id" uuid NOT NULL,
  "previous_campaign_id" uuid NOT NULL UNIQUE,
  "previous_session_id" uuid NOT NULL,
  "replacement_campaign_id" uuid NOT NULL UNIQUE,
  "replacement_session_id" uuid NOT NULL,
  "previous_planning" text,
  "previous_opening" text,
  "replacement_planning" text,
  "replacement_opening" text NOT NULL
);
