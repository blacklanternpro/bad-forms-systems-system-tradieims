-- Civil pack: hire rates on plant (kernel assets), pre-starts that block dispatch,
-- sign-on-glass hire dockets with the tally counter, SoR library, quarry tickets.

CREATE TABLE hire_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('wet','dry')),
  rate_cents_per_hour integer NOT NULL,
  min_hours numeric NOT NULL DEFAULT 0,
  standby_cents_per_hour integer NOT NULL DEFAULT 0,
  travel_cents integer NOT NULL DEFAULT 0,
  UNIQUE (org_id, asset_id, mode)
);

CREATE TABLE prestarts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id),
  on_date date NOT NULL,
  checks jsonb NOT NULL DEFAULT '[]',
  faults jsonb NOT NULL DEFAULT '[]',
  result text NOT NULL CHECK (result IN ('pass','fail')),
  meter_hours numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX prestarts_asset_day_idx ON prestarts (asset_id, on_date);

CREATE TABLE hire_dockets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  code text NOT NULL,
  work_date date NOT NULL,
  mode text NOT NULL CHECK (mode IN ('wet','dry')),
  hours numeric NOT NULL DEFAULT 0,
  standby_hours numeric NOT NULL DEFAULT 0,
  travel boolean NOT NULL DEFAULT false,
  tally jsonb NOT NULL DEFAULT '{}',
  total_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','signed','approved')),
  signed_by_name text,
  signature_key text,
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE TABLE sor_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text NOT NULL,
  unit text NOT NULL DEFAULT 'ea',
  rate_cents integer NOT NULL,
  UNIQUE (org_id, code)
);

CREATE TABLE quarry_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  capture_id uuid REFERENCES captures(id) ON DELETE SET NULL,
  quarry text,
  ticket_no text,
  material text,
  tonnes numeric NOT NULL DEFAULT 0,
  rate_cents_per_tonne integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
