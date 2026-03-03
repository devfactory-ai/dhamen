-- 0061_seed_reconciliation.sql
-- Seed reconciliation_items and discrepancies for demo
-- Links to bordereaux seeded in 0060

-- Reconciliation items for each old bordereau
INSERT INTO reconciliation_items (
  id, bordereau_id, claim_count, declared_amount, verified_amount, difference,
  status, notes, created_at, updated_at
) VALUES
-- STAR Jan (paid, matched) - exact match
('recon_star_jan', 'bord_old_star_jan', 12, 2150000, 2150000, 0,
 'MATCHED', 'Rapprochement automatique - aucun ecart', '2026-02-05 09:00:00', '2026-02-05 09:00:00'),

-- STAR Feb (acknowledged, unmatched) - small discrepancy
('recon_star_feb', 'bord_old_star_feb', 9, 1890000, 1875000, -15000,
 'UNMATCHED', 'Ecart de 15 TND detecte - en attente de verification', '2026-03-02 09:00:00', '2026-03-02 09:00:00'),

-- GAT Jan (paid, matched with resolved discrepancy)
('recon_gat_jan', 'bord_old_gat_jan', 6, 980000, 980000, 0,
 'RESOLVED', 'Ecart initial resolu apres ajustement', '2026-02-05 09:00:00', '2026-02-12 09:00:00'),

-- STAR Dr Jan (sent, disputed)
('recon_star_dr_jan', 'bord_old_star_dr_jan', 4, 3500000, 3420000, -80000,
 'DISPUTED', 'Ecart significatif sur 2 PEC hospitalisation - conteste par le prestataire', '2026-02-05 09:00:00', '2026-02-08 14:00:00');

-- Discrepancies
INSERT INTO reconciliation_discrepancies (
  id, reconciliation_item_id, discrepancy_type, description,
  amount, status, resolution, resolved_at, created_at
) VALUES
-- Star Feb - amount mismatch (pending)
('disc_star_feb_1', 'recon_star_feb', 'AMOUNT_MISMATCH',
 'Ecart de 15.000 TND sur PEC pharmacie - montant facture superieur au tarif conventionne',
 15000, 'PENDING', NULL, NULL, '2026-03-02 09:00:00'),

-- GAT Jan - was a duplicate claim, now resolved
('disc_gat_jan_1', 'recon_gat_jan', 'DUPLICATE_CLAIM',
 'Double facturation detectee et corrigee - PEC du 15/01/2026',
 45000, 'RESOLVED', 'Doublon confirme et retire du bordereau. Montant ajuste.', '2026-02-12 09:00:00', '2026-02-05 09:00:00'),

-- Star Dr Jan - two discrepancies (one resolved, one pending)
('disc_star_dr_1', 'recon_star_dr_jan', 'AMOUNT_MISMATCH',
 'Depassement plafond hospitalisation: montant demande 2.500 TND vs plafond 2.200 TND',
 300000, 'PENDING', NULL, NULL, '2026-02-05 09:00:00'),

('disc_star_dr_2', 'recon_star_dr_jan', 'STATUS_MISMATCH',
 'PEC en attente de validation mais incluse dans le bordereau',
 0, 'ESCALATED', NULL, NULL, '2026-02-05 09:00:00');
