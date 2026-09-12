-- Trades pack: variations raised on the phone, numbered certificates.

CREATE TABLE variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  detail text,
  amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','declined')),
  raised_by uuid REFERENCES users(id),
  decided_by_name text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE TABLE certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  kind text NOT NULL,
  code text NOT NULL,
  fields jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued')),
  issued_by uuid REFERENCES users(id),
  issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE INDEX variations_job_idx ON variations (job_id);
CREATE INDEX certificates_job_idx ON certificates (job_id);
