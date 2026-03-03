-- 0060_seed_bordereaux.sql
-- Seed sante_bordereaux with historical data for demo
-- Also seed the old bordereaux table for provider view

--------------------------------------------------------------------------------
-- Sante bordereaux (historical - already paid)
--------------------------------------------------------------------------------

INSERT INTO sante_bordereaux (
  id, numero_bordereau, periode_debut, periode_fin,
  nombre_demandes, montant_total, statut, date_generation,
  date_validation, date_envoi, date_paiement,
  genere_par, valide_par, notes, created_at, updated_at
) VALUES
-- January 2026 bordereau (paid)
('bord_01JAN2026_PAID', 'BDX-202601-0001',
 '2026-01-01', '2026-01-31', 7, 4253400, 'paye',
 '2026-02-01 09:00:00', '2026-02-02 10:00:00', '2026-02-03 14:00:00', '2026-02-10 09:00:00',
 '01JCVMKD1AP2N3X4Y5Z6A7B8A1', '01JCVMKD1BP2N3X4Y5Z6A7B8B2',
 'Bordereau janvier 2026 - paiement recu',
 '2026-02-01 09:00:00', '2026-02-10 09:00:00'),

-- February 2026 bordereau (validated, sent)
('bord_02FEB2026_SENT', 'BDX-202602-0001',
 '2026-02-01', '2026-02-28', 3, 3234000, 'envoye',
 '2026-03-01 09:00:00', '2026-03-01 14:00:00', '2026-03-02 09:00:00', NULL,
 '01JCVMKD1AP2N3X4Y5Z6A7B8A1', '01JCVMKD1BP2N3X4Y5Z6A7B8B2',
 'Bordereau fevrier 2026 - en attente de paiement',
 '2026-03-01 09:00:00', '2026-03-02 09:00:00');

-- Link January paid claims to the January bordereau
INSERT INTO sante_bordereau_lignes (id, bordereau_id, demande_id, created_at) VALUES
('bl_jan_001', 'bord_01JAN2026_PAID', '01JSD0F020DEM0PHARMA0006', '2026-02-01 09:00:00'),
('bl_jan_002', 'bord_01JAN2026_PAID', '01JSD0F021DEM0CONSULT005', '2026-02-01 09:00:00'),
('bl_jan_003', 'bord_01JAN2026_PAID', '01JSD0F022DEM0HOSPIT0004', '2026-02-01 09:00:00'),
('bl_jan_004', 'bord_01JAN2026_PAID', '01JSD0F023DEM0DENTAIRE03', '2026-02-01 09:00:00'),
('bl_jan_005', 'bord_01JAN2026_PAID', '01JSD0F024DEM0LABORAT004', '2026-02-01 09:00:00'),
('bl_jan_006', 'bord_01JAN2026_PAID', '01JSD0F025DEM0OPTIQUE003', '2026-02-01 09:00:00'),
('bl_jan_007', 'bord_01JAN2026_PAID', '01JSD0F026DEM0PHARMA0007', '2026-02-01 09:00:00');

-- Link February en_paiement claims to the February bordereau
INSERT INTO sante_bordereau_lignes (id, bordereau_id, demande_id, created_at) VALUES
('bl_feb_001', 'bord_02FEB2026_SENT', '01JSD0E017DEM0CONSULT004', '2026-03-01 09:00:00'),
('bl_feb_002', 'bord_02FEB2026_SENT', '01JSD0E018DEM0PHARMA0005', '2026-03-01 09:00:00'),
('bl_feb_003', 'bord_02FEB2026_SENT', '01JSD0E019DEM0LABORAT003', '2026-03-01 09:00:00');

--------------------------------------------------------------------------------
-- Old bordereaux table (for provider /bordereaux view)
-- These reference providers and insurers from the original schema
--------------------------------------------------------------------------------

INSERT OR IGNORE INTO bordereaux (
  id, bordereau_number, insurer_id, provider_id,
  period_start, period_end, total_amount, claims_count,
  status, generated_at, sent_at, paid_at,
  created_at, updated_at
) VALUES
-- STAR - Pharmacie Centrale Tunis (Jan)
('bord_old_star_jan', 'BDX-STAR-202601-001',
 '01JCVMK8R7P2N3X4Y5Z6A7B8C9', '01JCVMK9A1P2N3X4Y5Z6A7B8C9',
 '2026-01-01', '2026-01-31', 2150000, 12,
 'paid', '2026-02-01 09:00:00', '2026-02-02 09:00:00', '2026-02-15 09:00:00',
 '2026-02-01 09:00:00', '2026-02-15 09:00:00'),

-- STAR - Pharmacie Centrale Tunis (Feb)
('bord_old_star_feb', 'BDX-STAR-202602-001',
 '01JCVMK8R7P2N3X4Y5Z6A7B8C9', '01JCVMK9A1P2N3X4Y5Z6A7B8C9',
 '2026-02-01', '2026-02-28', 1890000, 9,
 'acknowledged', '2026-03-01 09:00:00', '2026-03-01 14:00:00', NULL,
 '2026-03-01 09:00:00', '2026-03-01 14:00:00'),

-- GAT - Pharmacie Centrale Tunis (Jan)
('bord_old_gat_jan', 'BDX-GAT-202601-001',
 '01JCVMK8R7P2N3X4Y5Z6A7B8D0', '01JCVMK9A1P2N3X4Y5Z6A7B8C9',
 '2026-01-01', '2026-01-31', 980000, 6,
 'paid', '2026-02-01 09:00:00', '2026-02-03 09:00:00', '2026-02-20 09:00:00',
 '2026-02-01 09:00:00', '2026-02-20 09:00:00'),

-- STAR - Cabinet Dr. Ben Ali (Jan)
('bord_old_star_dr_jan', 'BDX-STAR-202601-002',
 '01JCVMK8R7P2N3X4Y5Z6A7B8C9', '01JCVMK9B1P2N3X4Y5Z6A7B8C9',
 '2026-01-01', '2026-01-31', 3500000, 4,
 'sent', '2026-02-01 09:00:00', '2026-02-02 09:00:00', NULL,
 '2026-02-01 09:00:00', '2026-02-02 09:00:00');
