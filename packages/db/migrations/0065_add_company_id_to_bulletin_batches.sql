-- Add company_id to bulletin_batches to link each batch to a company
ALTER TABLE bulletin_batches ADD COLUMN company_id TEXT REFERENCES companies(id);

-- Index for filtering batches by company
CREATE INDEX IF NOT EXISTS idx_bulletin_batches_company_id ON bulletin_batches(company_id);
