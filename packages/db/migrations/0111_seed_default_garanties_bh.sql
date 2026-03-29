-- Migration: 0111_seed_default_garanties_bh
-- Description: Seed default BH Assurance standard reimbursement rates
-- WARNING: These are approximate defaults — à confirmer avec BH Assurance
-- These are inserted into contract_guarantees for any active group_contract

-- Create a migration log table to track data migrations
CREATE TABLE IF NOT EXISTS migration_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  migration_name TEXT NOT NULL,
  description TEXT,
  rows_affected INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed', 'partial')),
  executed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Log this migration
INSERT INTO migration_log (migration_name, description, status)
VALUES (
  '0111_seed_default_garanties_bh',
  'Seed default BH Assurance standard guarantee rates (à confirmer)',
  'completed'
);

-- Note: Default rates are only inserted for group contracts that don't already have guarantees.
-- The actual seeding should be done programmatically via the API when creating a new contract.
-- Below we document the standard BH Assurance rates as reference:

-- ┌──────────────────────────────────┬──────────┬──────────────────┬─────────────────┐
-- │ Type d'acte                      │ Taux (%) │ Plafond/acte TND │ Plafond/an TND  │
-- ├──────────────────────────────────┼──────────┼──────────────────┼─────────────────┤
-- │ Consultation généraliste         │    80    │       30         │       -         │
-- │ Consultation spécialiste         │    80    │       60         │       -         │
-- │ Médicaments                      │    70    │     variable     │       -         │
-- │ Analyses biologiques             │    80    │        -         │       -         │
-- │ Radiologie                       │    80    │        -         │       -         │
-- │ Hospitalisation                  │    90    │        -         │       -         │
-- │ Dentaire                         │    70    │        -         │      200        │
-- │ Kinésithérapie                   │    70    │        -         │       -         │
-- │ Optique                          │    70    │        -         │      300        │
-- │ Actes chirurgicaux               │    80    │        -         │       -         │
-- │ Maternité                        │    90    │        -         │       -         │
-- │ Transport médical                │    80    │        -         │       -         │
-- └──────────────────────────────────┴──────────┴──────────────────┴─────────────────┘
-- ⚠️  À CONFIRMER AVEC BH ASSURANCE — valeurs indicatives uniquement

-- Create a reference table for default rates (not FK-linked, pure reference)
CREATE TABLE IF NOT EXISTS default_garanties_reference (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type_acte TEXT NOT NULL,
  label_fr TEXT NOT NULL,
  taux_remboursement REAL NOT NULL,  -- 0.80 = 80%
  plafond_par_acte REAL,             -- in TND, NULL = no ceiling
  plafond_annuel REAL,               -- in TND, NULL = no ceiling
  franchise REAL DEFAULT 0,          -- deductible in TND
  ticket_moderateur REAL,            -- % remaining at patient charge
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO default_garanties_reference (type_acte, label_fr, taux_remboursement, plafond_par_acte, plafond_annuel, ticket_moderateur, notes) VALUES
  ('consultation_generaliste', 'Consultation généraliste', 0.80, 30.000, NULL, 0.20, 'À confirmer avec BH Assurance'),
  ('consultation_specialiste', 'Consultation spécialiste', 0.80, 60.000, NULL, 0.20, 'À confirmer avec BH Assurance'),
  ('medicaments', 'Médicaments', 0.70, NULL, NULL, 0.30, 'Taux variable selon famille thérapeutique — À confirmer'),
  ('analyse_biologique', 'Analyses biologiques', 0.80, NULL, NULL, 0.20, 'À confirmer avec BH Assurance'),
  ('radiologie', 'Radiologie / Imagerie', 0.80, NULL, NULL, 0.20, 'À confirmer avec BH Assurance'),
  ('acte_chirurgical', 'Actes chirurgicaux', 0.80, NULL, NULL, 0.20, 'À confirmer avec BH Assurance'),
  ('hospitalisation', 'Hospitalisation', 0.90, NULL, NULL, 0.10, 'À confirmer avec BH Assurance'),
  ('dentaire', 'Soins dentaires', 0.70, NULL, 200.000, 0.30, 'Plafond annuel 200 TND — À confirmer'),
  ('kinesitherapie', 'Kinésithérapie', 0.70, NULL, NULL, 0.30, 'À confirmer avec BH Assurance'),
  ('optique', 'Optique', 0.70, NULL, 300.000, 0.30, 'Plafond annuel 300 TND — À confirmer'),
  ('maternite', 'Maternité', 0.90, NULL, NULL, 0.10, 'À confirmer avec BH Assurance'),
  ('transport', 'Transport médical', 0.80, NULL, NULL, 0.20, 'À confirmer avec BH Assurance');
