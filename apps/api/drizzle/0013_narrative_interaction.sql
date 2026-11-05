ALTER TYPE interaction_mode ADD VALUE 'REQUEST_CHECK';
--> statement-breakpoint
ALTER TYPE interaction_mode ADD VALUE 'ROLL_RESULT';
--> statement-breakpoint
CREATE TABLE campaign_mounts (
  campaign_id uuid NOT NULL REFERENCES campaigns(id),
  character_id uuid PRIMARY KEY REFERENCES characters(id),
  rider_id uuid NOT NULL REFERENCES characters(id),
  location_id uuid NOT NULL REFERENCES world_entities(id),
  mounted boolean NOT NULL,
  UNIQUE (campaign_id, rider_id)
);
