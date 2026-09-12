-- Fabrication pack: ITP templates over kernel job_stages, heat/mill cert
-- material traceability, NDI records, offcut allocation.

CREATE TABLE itp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  name text NOT NULL,
  stages jsonb NOT NULL DEFAULT '[]',  -- [{name, requires_photo}]
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE material_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  capture_id uuid REFERENCES captures(id) ON DELETE SET NULL,
  heat_no text NOT NULL,
  material text,
  mill text,
  cert_ref text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX material_lots_job_idx ON material_lots (job_id);

CREATE TABLE ndi_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('visual','UT','MT','PT','RT')),
  result text NOT NULL CHECK (result IN ('pass','fail')),
  report_ref text,
  inspector text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE offcuts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  description text NOT NULL,
  material text,
  heat_no text,
  from_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  allocated_job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','allocated','scrapped')),
  created_at timestamptz NOT NULL DEFAULT now()
);
