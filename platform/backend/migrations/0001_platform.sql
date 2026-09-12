-- Platform bootstrap: uuid generation + instance metadata.
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN
  NULL; -- gen_random_uuid() is core on PG 13+
END $$;

CREATE TABLE instance_meta (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO instance_meta (key, value) VALUES ('platform', '{"name": "badform-platform", "schema_epoch": 1}');
