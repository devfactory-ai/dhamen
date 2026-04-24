-- Migration 0152: Add bordereau_id to bulletins_soins for linking bulletins to bordereaux
-- No FK constraint because bordereaux are stored in sante_bordereaux table

ALTER TABLE bulletins_soins ADD COLUMN bordereau_id TEXT;

CREATE INDEX idx_bulletins_soins_bordereau_id ON bulletins_soins(bordereau_id);
