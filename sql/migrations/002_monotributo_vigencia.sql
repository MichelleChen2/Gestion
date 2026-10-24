ALTER TABLE member_documents ADD COLUMN IF NOT EXISTS issued_at DATE;
ALTER TABLE member_documents ADD COLUMN IF NOT EXISTS expires_at DATE;
ALTER TABLE member_documents ADD COLUMN IF NOT EXISTS validity_status VARCHAR(30) NOT NULL DEFAULT 'unknown';
ALTER TABLE member_documents ADD COLUMN IF NOT EXISTS validity_source VARCHAR(80);
ALTER TABLE member_documents ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE member_documents ADD COLUMN IF NOT EXISTS validation_details JSONB;
ALTER TABLE member_documents ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT FALSE;

WITH ranked AS (
  SELECT id,ROW_NUMBER() OVER(PARTITION BY member_id,document_type ORDER BY uploaded_at DESC,id DESC) rn
  FROM member_documents
)
UPDATE member_documents d
SET is_current=(ranked.rn=1)
FROM ranked
WHERE ranked.id=d.id;

CREATE UNIQUE INDEX IF NOT EXISTS member_documents_current_uidx
  ON member_documents(member_id,document_type) WHERE is_current=TRUE;
