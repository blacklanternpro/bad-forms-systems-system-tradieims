-- Fleet pack: attachment links on kernel assets, float/mobilisation charging,
-- hour-meter service plans feeding the workshop queue, corrective actions, and
-- the CoR/SMS evidence vault (HVNL 2026 five-outcome standard).

CREATE TABLE fleet_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  carrier_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  UNIQUE (org_id, attachment_id)
);

CREATE TABLE floats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  code text NOT NULL,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  from_yard text NOT NULL,
  to_site text NOT NULL,
  float_date date NOT NULL,
  km numeric NOT NULL DEFAULT 0,
  mobilisation_cents integer NOT NULL DEFAULT 0,
  cents_per_km integer NOT NULL DEFAULT 0,
  charge_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','completed','cancelled')),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE TABLE service_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  name text NOT NULL,
  interval_hours numeric NOT NULL,
  last_service_hours numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, asset_id, name)
);

CREATE TABLE workshop_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES service_plans(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'service' CHECK (kind IN ('service','repair')),
  notes text,
  meter_hours numeric,
  done_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE corrective_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  code text NOT NULL,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  title text NOT NULL,
  detail text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('prestart','audit','incident','manual')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_note text,
  closed_by uuid REFERENCES users(id),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE TABLE sms_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  outcome text NOT NULL CHECK (outcome IN ('fit_drivers','safe_vehicles','mass_and_restraint','speed_and_fatigue','review_and_improve')),
  kind text NOT NULL,
  summary text NOT NULL,
  asset_id uuid REFERENCES assets(id) ON DELETE SET NULL,
  capture_id uuid REFERENCES captures(id) ON DELETE SET NULL,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  evidence_date date NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sms_evidence_outcome_idx ON sms_evidence (org_id, outcome, evidence_date);
