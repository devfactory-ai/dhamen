-- Migration 0082: Seed contrat_periodes and contrat_baremes with BH Assurance rates (REQ-009)
-- Source: Tableau des prestations contrat type BH Assurance 2026
-- Applies to the first 3 active contracts as demo data (STAR contracts)
-- Amounts in millimes (1 DT = 1000 millimes)

-- ============================================
-- PERIODE for STAR-2024-00001 (individual)
-- ============================================
INSERT OR IGNORE INTO contrat_periodes (id, contract_id, numero, date_debut, date_fin, ref_periode, is_active)
VALUES ('per-star-001', '01JCVMKB1AP2N3X4Y5Z6A7B8C9', 1, '2024-01-01', '2024-12-31', 'BH-2024-P1', 1);

-- PERIODE for STAR-2024-00002 (family)
INSERT OR IGNORE INTO contrat_periodes (id, contract_id, numero, date_debut, date_fin, ref_periode, is_active)
VALUES ('per-star-002', '01JCVMKB1BP2N3X4Y5Z6A7B8D0', 1, '2024-01-01', '2024-12-31', 'BH-2024-P1', 1);

-- PERIODE for STAR-2024-00003 (individual)
INSERT OR IGNORE INTO contrat_periodes (id, contract_id, numero, date_debut, date_fin, ref_periode, is_active)
VALUES ('per-star-003', '01JCVMKB1IP2N3X4Y5Z6A7B8K7', 1, '2024-04-01', '2025-03-31', 'BH-2024-P1', 1);

-- ============================================
-- BAREMES pour per-star-001 (same rates for all 3 periods)
-- Each INSERT is duplicated for per-star-002 and per-star-003
-- ============================================

-- FA0001: Consultations et Visites (forfait)
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-c1',  'per-star-001', 'acte-c1',  'fa-001', 'forfait', 45000,  45000,  NULL),
  ('bar-001-c2',  'per-star-001', 'acte-c2',  'fa-001', 'forfait', 55000,  55000,  NULL),
  ('bar-001-c3',  'per-star-001', 'acte-c3',  'fa-001', 'forfait', 55000,  55000,  NULL),
  ('bar-001-v1',  'per-star-001', 'acte-v1',  'fa-001', 'forfait', 50000,  50000,  NULL),
  ('bar-001-v2',  'per-star-001', 'acte-v2',  'fa-001', 'forfait', 55000,  55000,  NULL),
  ('bar-001-v3',  'per-star-001', 'acte-v3',  'fa-001', 'forfait', 55000,  55000,  NULL);

-- FA0003: Frais pharmaceutiques (taux 90%, plafond 1000 DT ordinaire / 1500 DT chronique)
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-ph1', 'per-star-001', 'acte-ph1', 'fa-003', 'taux', 0.90, NULL, 1000000);

-- FA0004: Analyses (taux 80%)
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-an',  'per-star-001', 'acte-an',  'fa-004', 'taux', 0.80, NULL, NULL);

-- FA0005: Orthopedie et protheses (100%, plafond 600 DT/an)
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-orp', 'per-star-001', 'acte-orp', 'fa-005', 'taux', 1.00, NULL, 600000);

-- FA0006: Optique (100%, plafonds par sous-type geres au niveau acte)
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-opt', 'per-star-001', 'acte-opt', 'fa-006', 'taux', 1.00, 300000, NULL);

-- FA0007: Hospitalisation clinique (forfait 120 DT/jour)
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-cl',  'per-star-001', 'acte-cl',  'fa-007', 'forfait', 120000, 120000, NULL);

-- FA0008: Hospitalisation hopital (forfait 45 DT/jour)
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-hp',  'per-star-001', 'acte-hp',  'fa-008', 'forfait', 45000,  45000,  NULL);

-- FA0009: Actes de specialistes
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-ts',  'per-star-001', 'acte-ts',  'fa-009', 'taux',    1.00,  200000, NULL),
  ('bar-001-pc',  'per-star-001', 'acte-pc',  'fa-009', 'forfait', 1500,  NULL,   NULL),
  ('bar-001-am',  'per-star-001', 'acte-am',  'fa-009', 'forfait', 1500,  NULL,   NULL),
  ('bar-001-amm', 'per-star-001', 'acte-amm', 'fa-009', 'forfait', 10000, NULL,   NULL),
  ('bar-001-e',   'per-star-001', 'acte-e',   'fa-009', 'forfait', 7000,  NULL,   NULL),
  ('bar-001-z',   'per-star-001', 'acte-z',   'fa-009', 'forfait', 2000,  NULL,   NULL);

-- FA0010: Frais chirurgicaux
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-kc',  'per-star-001', 'acte-kc',  'fa-010', 'forfait', 10000,  NULL,   NULL),
  ('bar-001-ane', 'per-star-001', 'acte-ane', 'fa-010', 'taux',    1.00,   300000, NULL),
  ('bar-001-so',  'per-star-001', 'acte-so',  'fa-010', 'taux',    1.00,   300000, NULL),
  ('bar-001-puu', 'per-star-001', 'acte-puu', 'fa-010', 'taux',    0.90,   300000, NULL);

-- FA0011: Soins dentaires (80%, plafond 1200 DT/an)
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-sd',  'per-star-001', 'acte-sd',  'fa-011', 'taux', 0.80, NULL, 1200000);

-- FA0012: Maternite
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-acc', 'per-star-001', 'acte-acc', 'fa-012', 'taux', 1.00, 200000, NULL),
  ('bar-001-ig',  'per-star-001', 'acte-ig',  'fa-012', 'taux', 1.00, 100000, NULL);

-- FA0014: Orthodontie (80%, plafond 600 DT/an)
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-odf', 'per-star-001', 'acte-odf', 'fa-014', 'taux', 0.80, NULL, 600000);

-- FA0015: Circoncision (forfait 200 DT)
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-cir', 'per-star-001', 'acte-cir', 'fa-015', 'forfait', 200000, 200000, NULL);

-- FA0016: Transport (100%, plafond 100 DT/an)
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-tr',  'per-star-001', 'acte-tr',  'fa-016', 'taux', 1.00, NULL, 100000);

-- FA0017: Radiologie (80%)
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-r',   'per-star-001', 'acte-r',   'fa-017', 'taux', 0.80, NULL, NULL);

-- FA0019: Frais funeraires (forfait 200 DT)
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-001-ff',  'per-star-001', 'acte-ff',  'fa-019', 'forfait', 200000, 200000, NULL);


-- ============================================
-- Duplicate baremes for per-star-002 (family contract)
-- ============================================
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-002-c1',  'per-star-002', 'acte-c1',  'fa-001', 'forfait', 45000,  45000,  NULL),
  ('bar-002-c2',  'per-star-002', 'acte-c2',  'fa-001', 'forfait', 55000,  55000,  NULL),
  ('bar-002-c3',  'per-star-002', 'acte-c3',  'fa-001', 'forfait', 55000,  55000,  NULL),
  ('bar-002-v1',  'per-star-002', 'acte-v1',  'fa-001', 'forfait', 50000,  50000,  NULL),
  ('bar-002-v2',  'per-star-002', 'acte-v2',  'fa-001', 'forfait', 55000,  55000,  NULL),
  ('bar-002-v3',  'per-star-002', 'acte-v3',  'fa-001', 'forfait', 55000,  55000,  NULL),
  ('bar-002-ph1', 'per-star-002', 'acte-ph1', 'fa-003', 'taux',    0.90,   NULL,   1000000),
  ('bar-002-an',  'per-star-002', 'acte-an',  'fa-004', 'taux',    0.80,   NULL,   NULL),
  ('bar-002-orp', 'per-star-002', 'acte-orp', 'fa-005', 'taux',    1.00,   NULL,   600000),
  ('bar-002-opt', 'per-star-002', 'acte-opt', 'fa-006', 'taux',    1.00,   300000, NULL),
  ('bar-002-cl',  'per-star-002', 'acte-cl',  'fa-007', 'forfait', 120000, 120000, NULL),
  ('bar-002-hp',  'per-star-002', 'acte-hp',  'fa-008', 'forfait', 45000,  45000,  NULL),
  ('bar-002-ts',  'per-star-002', 'acte-ts',  'fa-009', 'taux',    1.00,   200000, NULL),
  ('bar-002-pc',  'per-star-002', 'acte-pc',  'fa-009', 'forfait', 1500,   NULL,   NULL),
  ('bar-002-am',  'per-star-002', 'acte-am',  'fa-009', 'forfait', 1500,   NULL,   NULL),
  ('bar-002-amm', 'per-star-002', 'acte-amm', 'fa-009', 'forfait', 10000,  NULL,   NULL),
  ('bar-002-e',   'per-star-002', 'acte-e',   'fa-009', 'forfait', 7000,   NULL,   NULL),
  ('bar-002-z',   'per-star-002', 'acte-z',   'fa-009', 'forfait', 2000,   NULL,   NULL),
  ('bar-002-kc',  'per-star-002', 'acte-kc',  'fa-010', 'forfait', 10000,  NULL,   NULL),
  ('bar-002-ane', 'per-star-002', 'acte-ane', 'fa-010', 'taux',    1.00,   300000, NULL),
  ('bar-002-so',  'per-star-002', 'acte-so',  'fa-010', 'taux',    1.00,   300000, NULL),
  ('bar-002-puu', 'per-star-002', 'acte-puu', 'fa-010', 'taux',    0.90,   300000, NULL),
  ('bar-002-sd',  'per-star-002', 'acte-sd',  'fa-011', 'taux',    0.80,   NULL,   1200000),
  ('bar-002-acc', 'per-star-002', 'acte-acc', 'fa-012', 'taux',    1.00,   200000, NULL),
  ('bar-002-ig',  'per-star-002', 'acte-ig',  'fa-012', 'taux',    1.00,   100000, NULL),
  ('bar-002-odf', 'per-star-002', 'acte-odf', 'fa-014', 'taux',    0.80,   NULL,   600000),
  ('bar-002-cir', 'per-star-002', 'acte-cir', 'fa-015', 'forfait', 200000, 200000, NULL),
  ('bar-002-tr',  'per-star-002', 'acte-tr',  'fa-016', 'taux',    1.00,   NULL,   100000),
  ('bar-002-r',   'per-star-002', 'acte-r',   'fa-017', 'taux',    0.80,   NULL,   NULL),
  ('bar-002-ff',  'per-star-002', 'acte-ff',  'fa-019', 'forfait', 200000, 200000, NULL);


-- ============================================
-- Duplicate baremes for per-star-003
-- ============================================
INSERT OR IGNORE INTO contrat_baremes (id, periode_id, acte_ref_id, famille_id, type_calcul, valeur, plafond_acte, plafond_famille_annuel) VALUES
  ('bar-003-c1',  'per-star-003', 'acte-c1',  'fa-001', 'forfait', 45000,  45000,  NULL),
  ('bar-003-c2',  'per-star-003', 'acte-c2',  'fa-001', 'forfait', 55000,  55000,  NULL),
  ('bar-003-c3',  'per-star-003', 'acte-c3',  'fa-001', 'forfait', 55000,  55000,  NULL),
  ('bar-003-v1',  'per-star-003', 'acte-v1',  'fa-001', 'forfait', 50000,  50000,  NULL),
  ('bar-003-v2',  'per-star-003', 'acte-v2',  'fa-001', 'forfait', 55000,  55000,  NULL),
  ('bar-003-v3',  'per-star-003', 'acte-v3',  'fa-001', 'forfait', 55000,  55000,  NULL),
  ('bar-003-ph1', 'per-star-003', 'acte-ph1', 'fa-003', 'taux',    0.90,   NULL,   1000000),
  ('bar-003-an',  'per-star-003', 'acte-an',  'fa-004', 'taux',    0.80,   NULL,   NULL),
  ('bar-003-orp', 'per-star-003', 'acte-orp', 'fa-005', 'taux',    1.00,   NULL,   600000),
  ('bar-003-opt', 'per-star-003', 'acte-opt', 'fa-006', 'taux',    1.00,   300000, NULL),
  ('bar-003-cl',  'per-star-003', 'acte-cl',  'fa-007', 'forfait', 120000, 120000, NULL),
  ('bar-003-hp',  'per-star-003', 'acte-hp',  'fa-008', 'forfait', 45000,  45000,  NULL),
  ('bar-003-ts',  'per-star-003', 'acte-ts',  'fa-009', 'taux',    1.00,   200000, NULL),
  ('bar-003-pc',  'per-star-003', 'acte-pc',  'fa-009', 'forfait', 1500,   NULL,   NULL),
  ('bar-003-am',  'per-star-003', 'acte-am',  'fa-009', 'forfait', 1500,   NULL,   NULL),
  ('bar-003-amm', 'per-star-003', 'acte-amm', 'fa-009', 'forfait', 10000,  NULL,   NULL),
  ('bar-003-e',   'per-star-003', 'acte-e',   'fa-009', 'forfait', 7000,   NULL,   NULL),
  ('bar-003-z',   'per-star-003', 'acte-z',   'fa-009', 'forfait', 2000,   NULL,   NULL),
  ('bar-003-kc',  'per-star-003', 'acte-kc',  'fa-010', 'forfait', 10000,  NULL,   NULL),
  ('bar-003-ane', 'per-star-003', 'acte-ane', 'fa-010', 'taux',    1.00,   300000, NULL),
  ('bar-003-so',  'per-star-003', 'acte-so',  'fa-010', 'taux',    1.00,   300000, NULL),
  ('bar-003-puu', 'per-star-003', 'acte-puu', 'fa-010', 'taux',    0.90,   300000, NULL),
  ('bar-003-sd',  'per-star-003', 'acte-sd',  'fa-011', 'taux',    0.80,   NULL,   1200000),
  ('bar-003-acc', 'per-star-003', 'acte-acc', 'fa-012', 'taux',    1.00,   200000, NULL),
  ('bar-003-ig',  'per-star-003', 'acte-ig',  'fa-012', 'taux',    1.00,   100000, NULL),
  ('bar-003-odf', 'per-star-003', 'acte-odf', 'fa-014', 'taux',    0.80,   NULL,   600000),
  ('bar-003-cir', 'per-star-003', 'acte-cir', 'fa-015', 'forfait', 200000, 200000, NULL),
  ('bar-003-tr',  'per-star-003', 'acte-tr',  'fa-016', 'taux',    1.00,   NULL,   100000),
  ('bar-003-r',   'per-star-003', 'acte-r',   'fa-017', 'taux',    0.80,   NULL,   NULL),
  ('bar-003-ff',  'per-star-003', 'acte-ff',  'fa-019', 'forfait', 200000, 200000, NULL);


-- ============================================
-- PLAFONDS PRESTATAIRE (seed initial consumption = 0)
-- Global plafond = 6000 DT per prestataire (adherent) per year
-- ============================================

-- Adherent 1 (STAR-001): global + pharmacy family plafond
INSERT OR IGNORE INTO plafonds_prestataire (id, adherent_id, contract_id, annee, famille_acte_id, type_maladie, montant_plafond, montant_consomme)
VALUES
  ('plf-001-global',    '01JCVMKA1AP2N3X4Y5Z6A7B8C9', '01JCVMKB1AP2N3X4Y5Z6A7B8C9', 2024, NULL,     'ordinaire', 6000000, 0),
  ('plf-001-ph-ord',    '01JCVMKA1AP2N3X4Y5Z6A7B8C9', '01JCVMKB1AP2N3X4Y5Z6A7B8C9', 2024, 'fa-003', 'ordinaire', 1000000, 0),
  ('plf-001-ph-chr',    '01JCVMKA1AP2N3X4Y5Z6A7B8C9', '01JCVMKB1AP2N3X4Y5Z6A7B8C9', 2024, 'fa-003', 'chronique',  1500000, 0),
  ('plf-001-dent',      '01JCVMKA1AP2N3X4Y5Z6A7B8C9', '01JCVMKB1AP2N3X4Y5Z6A7B8C9', 2024, 'fa-011', 'ordinaire', 1200000, 0),
  ('plf-001-ortho',     '01JCVMKA1AP2N3X4Y5Z6A7B8C9', '01JCVMKB1AP2N3X4Y5Z6A7B8C9', 2024, 'fa-014', 'ordinaire',  600000, 0),
  ('plf-001-transport', '01JCVMKA1AP2N3X4Y5Z6A7B8C9', '01JCVMKB1AP2N3X4Y5Z6A7B8C9', 2024, 'fa-016', 'ordinaire',  100000, 0),
  ('plf-001-orthoped',  '01JCVMKA1AP2N3X4Y5Z6A7B8C9', '01JCVMKB1AP2N3X4Y5Z6A7B8C9', 2024, 'fa-005', 'ordinaire',  600000, 0);

-- Adherent 2 (STAR-002): global + pharmacy
INSERT OR IGNORE INTO plafonds_prestataire (id, adherent_id, contract_id, annee, famille_acte_id, type_maladie, montant_plafond, montant_consomme)
VALUES
  ('plf-002-global',    '01JCVMKA1BP2N3X4Y5Z6A7B8D0', '01JCVMKB1BP2N3X4Y5Z6A7B8D0', 2024, NULL,     'ordinaire', 6000000, 0),
  ('plf-002-ph-ord',    '01JCVMKA1BP2N3X4Y5Z6A7B8D0', '01JCVMKB1BP2N3X4Y5Z6A7B8D0', 2024, 'fa-003', 'ordinaire', 1000000, 0),
  ('plf-002-ph-chr',    '01JCVMKA1BP2N3X4Y5Z6A7B8D0', '01JCVMKB1BP2N3X4Y5Z6A7B8D0', 2024, 'fa-003', 'chronique',  1500000, 0),
  ('plf-002-dent',      '01JCVMKA1BP2N3X4Y5Z6A7B8D0', '01JCVMKB1BP2N3X4Y5Z6A7B8D0', 2024, 'fa-011', 'ordinaire', 1200000, 0),
  ('plf-002-ortho',     '01JCVMKA1BP2N3X4Y5Z6A7B8D0', '01JCVMKB1BP2N3X4Y5Z6A7B8D0', 2024, 'fa-014', 'ordinaire',  600000, 0),
  ('plf-002-transport', '01JCVMKA1BP2N3X4Y5Z6A7B8D0', '01JCVMKB1BP2N3X4Y5Z6A7B8D0', 2024, 'fa-016', 'ordinaire',  100000, 0),
  ('plf-002-orthoped',  '01JCVMKA1BP2N3X4Y5Z6A7B8D0', '01JCVMKB1BP2N3X4Y5Z6A7B8D0', 2024, 'fa-005', 'ordinaire',  600000, 0);
