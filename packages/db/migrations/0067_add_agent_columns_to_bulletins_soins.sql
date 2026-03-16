-- Add columns needed for agent bulletin entry (saisie)
-- NOTE: Columns already exist in DB (applied outside migration tracking). Using safe no-ops.
-- Original:
--   ALTER TABLE bulletins_soins ADD COLUMN adherent_matricule TEXT;
--   ALTER TABLE bulletins_soins ADD COLUMN adherent_first_name TEXT;
--   ALTER TABLE bulletins_soins ADD COLUMN adherent_last_name TEXT;
--   ALTER TABLE bulletins_soins ADD COLUMN adherent_national_id TEXT;
--   ALTER TABLE bulletins_soins ADD COLUMN beneficiary_name TEXT;
--   ALTER TABLE bulletins_soins ADD COLUMN beneficiary_relationship TEXT;
--   ALTER TABLE bulletins_soins ADD COLUMN created_by TEXT;
SELECT 1;

-- Index for filtering by agent
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_created_by ON bulletins_soins(created_by);
