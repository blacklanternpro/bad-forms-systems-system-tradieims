-- Kernel schema: identity, clients, jobs, quotes, capture, procurement,
-- invoicing, notifications, timeline, assets, audit.

CREATE TABLE organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  legal_name text,
  abn text,
  brand jsonb NOT NULL DEFAULT '{}',
  theme text NOT NULL DEFAULT 'daybook',
  terminology jsonb NOT NULL DEFAULT '{}',
  modules jsonb NOT NULL DEFAULT '{}',
  settings jsonb NOT NULL DEFAULT '{}',
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  role text NOT NULL CHECK (role IN ('owner','office','crew')),
  password_hash text,
  pin text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_org_email_uidx ON users (org_id, lower(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_org_pin_uidx ON users (org_id, pin) WHERE pin IS NOT NULL;

CREATE TABLE licences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref text,
  expires_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  name text NOT NULL,
  address text,
  gate_code text,
  contact_name text,
  contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  name text NOT NULL,
  contact text,
  note text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','quoted','won','lost')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  site_id uuid REFERENCES sites(id) ON DELETE SET NULL,
  code text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('quoted','scheduled','live','done','invoiced')),
  quoted_cents integer NOT NULL DEFAULT 0,
  po_ref text,
  recall_on date,
  recur_rule text,
  starts_on date,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE TABLE job_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort integer NOT NULL DEFAULT 0,
  requires_photo boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completed_by uuid REFERENCES users(id)
);

CREATE TABLE job_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  on_date date NOT NULL,
  time_window text,
  UNIQUE (org_id, job_id, user_id, on_date)
);

CREATE TABLE availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  on_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('leave','sick')),
  note text,
  UNIQUE (org_id, user_id, on_date)
);

CREATE TABLE price_books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  supplier text NOT NULL,
  effective_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE price_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES price_books(id) ON DELETE CASCADE,
  sku text NOT NULL,
  description text NOT NULL,
  unit text NOT NULL DEFAULT 'ea',
  unit_cents integer NOT NULL
);
CREATE INDEX price_items_search_idx ON price_items (org_id, lower(description));

CREATE TABLE quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  enquiry_id uuid REFERENCES enquiries(id) ON DELETE SET NULL,
  code text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','declined')),
  valid_until date,
  deposit_cents integer NOT NULL DEFAULT 0,
  accept_token text UNIQUE,
  sent_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE TABLE quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  description text NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  unit_cents integer NOT NULL DEFAULT 0,
  sort integer NOT NULL DEFAULT 0
);

CREATE TABLE purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  supplier text NOT NULL,
  code text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','received','matched')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE TABLE po_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  description text NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  unit_cents integer NOT NULL DEFAULT 0,
  received_qty numeric NOT NULL DEFAULT 0,
  sort integer NOT NULL DEFAULT 0
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  kind text NOT NULL,
  name text NOT NULL,
  storage_key text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX documents_job_idx ON documents (org_id, job_id);

CREATE TABLE captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  capture_type text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','needs_verify','verified','rejected')),
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  extracted jsonb NOT NULL DEFAULT '{}',
  confidence numeric,
  checks jsonb NOT NULL DEFAULT '[]',
  geo jsonb,
  reviewer_note text,
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX captures_review_idx ON captures (org_id, status);

CREATE TABLE time_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','voice','kiosk','signin')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  code text NOT NULL,
  kind text NOT NULL DEFAULT 'invoice' CHECK (kind IN ('invoice','deposit','claim')),
  claim_pct numeric,
  retention_pct numeric,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid','overdue')),
  total_ex_cents integer NOT NULL DEFAULT 0,
  ledger_ref text,
  issued_on date,
  due_on date,
  paid_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

CREATE TABLE invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  unit_cents integer NOT NULL DEFAULT 0,
  sort integer NOT NULL DEFAULT 0
);

CREATE TABLE ledger_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ACCREC','ACCPAY')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pushed')),
  ledger_ref text,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  pushed_at timestamptz
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  audience text NOT NULL DEFAULT 'staff' CHECK (audience IN ('owner','staff','crew','all')),
  event_type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_unread_idx ON notifications (org_id, read_at);

CREATE TABLE comms_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  recipient text NOT NULL,
  subject text,
  body text NOT NULL,
  context jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','dead')),
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE TABLE timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  summary text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}',
  actor uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX timeline_job_idx ON timeline_events (org_id, job_id, created_at);

CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  name text NOT NULL,
  rego text,
  meter_hours numeric NOT NULL DEFAULT 0,
  yard text,
  active boolean NOT NULL DEFAULT true,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  actor text NOT NULL,
  action text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE site_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sign_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'crew' CHECK (kind IN ('crew','visitor')),
  in_at timestamptz NOT NULL DEFAULT now(),
  out_at timestamptz
);
