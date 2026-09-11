DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN
  NULL; -- gen_random_uuid is in core on PG 13+
END $$;

CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name text NOT NULL,
  trading_name text NOT NULL,
  slug text UNIQUE NOT NULL,
  abn text,
  structure text NOT NULL DEFAULT 'company' CHECK (structure IN ('sole_trader','partnership','company')),
  is_demo boolean NOT NULL DEFAULT false,
  modules jsonb NOT NULL DEFAULT '{"trades":"live","civil":"not_commissioned","fab":"not_commissioned","fleet":"not_commissioned"}',
  xero_tenant_id text,
  timezone text NOT NULL DEFAULT 'Australia/Perth',
  settings jsonb NOT NULL DEFAULT '{"trades":{"default_variation_unit_cents":0,"require_customer_po":false,"materials_markup_bps":0,"default_deposit_bps":0,"owner_copy_email":null}}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  role text NOT NULL CHECK (role IN ('owner','bookkeeper','crew')),
  name text NOT NULL,
  email text UNIQUE,
  password_hash text,
  pin_hash text,
  labour_cents_per_hour integer NOT NULL DEFAULT 0,
  charge_cents_per_hour integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  name text NOT NULL, abn text, email text, xero_contact_id text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  name text NOT NULL, address_text text, lat double precision, lng double precision,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  site_id uuid REFERENCES sites(id),
  bill_to_client_id uuid REFERENCES clients(id),
  quote_id uuid,
  code text NOT NULL, title text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','awaiting_signoff','ready_to_invoice','draft_in_ledger','closed')),
  billing text NOT NULL DEFAULT 'tm' CHECK (billing IN ('quoted','tm')),
  quoted_cents integer NOT NULL DEFAULT 0,
  deposit_cents integer NOT NULL DEFAULT 0,
  customer_po text, recall_on date, starts_on date,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  client_id uuid NOT NULL REFERENCES clients(id),
  site_id uuid REFERENCES sites(id),
  bill_to_client_id uuid REFERENCES clients(id),
  code text NOT NULL, title text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','declined','expired')),
  valid_until date, deposit_bps integer NOT NULL DEFAULT 0,
  job_id uuid REFERENCES jobs(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE TABLE quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description text NOT NULL, qty numeric NOT NULL DEFAULT 1, unit_cents integer NOT NULL DEFAULT 0, sort integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quote_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  quote_id uuid NOT NULL REFERENCES quotes(id),
  to_email text NOT NULL, token_hash text NOT NULL,
  expires_at timestamptz NOT NULL, emailed_at timestamptz, accepted_at timestamptz, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  on_date date NOT NULL, window_start time, window_end time,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, user_id, on_date)
);

CREATE TABLE job_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name text NOT NULL, sort integer NOT NULL DEFAULT 0, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  user_id uuid NOT NULL REFERENCES users(id),
  started_at timestamptz NOT NULL, ended_at timestamptz, note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  kind text NOT NULL CHECK (kind IN ('van','vehicle')),
  name text NOT NULL, code text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  job_id uuid REFERENCES jobs(id),
  kind text NOT NULL CHECK (kind IN ('docket_photo','voice_note','signature','cert_pdf','job_pack_pdf','before_photo','after_photo','quote_pdf','variation_pdf')),
  file_path text NOT NULL, mime text NOT NULL DEFAULT 'image/jpeg',
  uploaded_by uuid REFERENCES users(id), meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE docket_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  document_id uuid NOT NULL REFERENCES documents(id),
  job_id uuid REFERENCES jobs(id),
  status text NOT NULL DEFAULT 'needs_verify' CHECK (status IN ('needs_verify','verified','rejected','failed')),
  kind text NOT NULL DEFAULT 'unknown' CHECK (kind IN ('wholesale_receipt','mix_docket','fuel','timesheet_voice','unknown')),
  extracted jsonb NOT NULL DEFAULT '{}',
  supplier text, total_cents integer, gst_cents integer, docket_number text, receipt_date date,
  verified_by uuid REFERENCES users(id), error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  name text NOT NULL, method text NOT NULL CHECK (method IN ('canvas','token')),
  image_path text, signed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  code text NOT NULL, title text NOT NULL, amount_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','signed','rejected')),
  signature_id uuid REFERENCES signatures(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, code),
  CONSTRAINT signed_requires_signature CHECK (status <> 'signed' OR signature_id IS NOT NULL)
);

CREATE TABLE variation_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  variation_id uuid NOT NULL REFERENCES variations(id),
  to_email text NOT NULL, token_hash text NOT NULL,
  expires_at timestamptz NOT NULL, emailed_at timestamptz, signed_at timestamptz, revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_extra_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  job_id uuid NOT NULL REFERENCES jobs(id),
  kind text NOT NULL CHECK (kind IN ('travel','callout','other')),
  description text NOT NULL DEFAULT '', qty integer NOT NULL DEFAULT 1, unit_cents integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE supplier_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  job_id uuid REFERENCES jobs(id),
  extraction_id uuid UNIQUE REFERENCES docket_extractions(id),
  supplier text NOT NULL CHECK (supplier IN ('reece','middys','rexel','other')),
  docket_number text, total_cents integer NOT NULL DEFAULT 0, gst_cents integer NOT NULL DEFAULT 0, receipt_date date,
  document_id uuid REFERENCES documents(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE xero_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  job_id uuid REFERENCES jobs(id),
  quote_id uuid REFERENCES quotes(id),
  purpose text NOT NULL CHECK (purpose IN ('deposit','final','tm','bill')),
  status text NOT NULL DEFAULT 'pending_push' CHECK (status IN ('pending_push','pushed','failed')),
  contact_client_id uuid REFERENCES clients(id),
  total_cents integer NOT NULL DEFAULT 0, gst_cents integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}', attachments jsonb NOT NULL DEFAULT '[]',
  xero_id text, error text, pushed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sync_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  client_id text NOT NULL,
  user_id uuid REFERENCES users(id),
  op jsonb NOT NULL DEFAULT '{}', status text NOT NULL DEFAULT 'applied',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, client_id)
);

CREATE TABLE certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  job_id uuid REFERENCES jobs(id),
  name text NOT NULL, document_id uuid REFERENCES documents(id),
  emailed_to text, emailed_at timestamptz, status text NOT NULL DEFAULT 'stored',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mail_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id),
  to_email text NOT NULL, subject text NOT NULL, kind text NOT NULL, ref_id uuid,
  status text NOT NULL DEFAULT 'queued',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_assign_date ON job_assignments(org_id, on_date);
CREATE INDEX idx_extract_status ON docket_extractions(org_id, status);
CREATE INDEX idx_jobs_org ON jobs(org_id, status);
