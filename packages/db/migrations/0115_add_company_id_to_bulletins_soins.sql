-- Add company_id to bulletins_soins for direct company filtering
ALTER TABLE bulletins_soins ADD COLUMN company_id TEXT REFERENCES companies(id);

-- Backfill from adherent's company
UPDATE bulletins_soins
SET company_id = (SELECT a.company_id FROM adherents a WHERE a.id = bulletins_soins.adherent_id)
WHERE adherent_id IS NOT NULL AND company_id IS NULL;

-- Backfill from batch's company
UPDATE bulletins_soins
SET company_id = (SELECT bb.company_id FROM bulletin_batches bb WHERE bb.id = bulletins_soins.batch_id)
WHERE batch_id IS NOT NULL AND company_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_bulletins_soins_company ON bulletins_soins(company_id);
