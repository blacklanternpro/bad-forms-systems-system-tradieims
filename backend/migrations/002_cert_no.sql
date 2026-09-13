ALTER TABLE certificates ADD COLUMN cert_no text;
CREATE UNIQUE INDEX certificates_org_cert_no_uidx
  ON certificates (org_id, lower(btrim(cert_no)))
  WHERE cert_no IS NOT NULL AND btrim(cert_no) <> '';
