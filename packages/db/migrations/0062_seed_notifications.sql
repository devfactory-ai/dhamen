-- 0062_seed_notifications.sql
-- Seed demo notifications for all user roles
-- References templates from 0017 and users from 0011

-- ============================================
-- ADMIN notifications
-- ============================================
INSERT INTO notifications (id, user_id, template_id, type, event_type, title, body, metadata, status, entity_type, entity_id, created_at) VALUES
-- System alert
('notif_admin_001', '01JCVMKC1AP2N3X4Y5Z6A7B8C9', 'tmpl_system_maintenance', 'IN_APP', 'SYSTEM_MAINTENANCE',
 'Maintenance programmee', 'Une maintenance est programmee le 05/03/2026 de 02:00 a 04:00.',
 '{}', 'DELIVERED', NULL, NULL, '2026-03-02 10:00:00'),

-- Fraud alert
('notif_admin_002', '01JCVMKC1AP2N3X4Y5Z6A7B8C9', 'tmpl_fraud_alert_sms', 'IN_APP', 'FRAUD_DETECTED',
 'Alerte fraude detectee', 'Score fraude eleve (85) sur PEC DEM-2026-00029 - Hospitalisation suspecte. Verification requise.',
 '{"claimNumber":"DEM-2026-00029","fraudScore":85}', 'DELIVERED', 'CLAIM', '01JSD0F029DEM0PHARMA0009', '2026-03-02 14:30:00'),

-- New user registration
('notif_admin_003', '01JCVMKC1AP2N3X4Y5Z6A7B8C9', NULL, 'IN_APP', 'USER_REGISTERED',
 'Nouveau prestataire inscrit', 'Pharmacie El Manar a ete inscrite et est en attente de validation.',
 '{}', 'PENDING', 'PROVIDER', NULL, '2026-03-03 08:15:00'),

-- Daily summary
('notif_admin_004', '01JCVMKC1AP2N3X4Y5Z6A7B8C9', NULL, 'IN_APP', 'DAILY_SUMMARY',
 'Resume quotidien - 02/03/2026', '12 nouvelles PEC, 8 approuvees, 2 rejetees. Montant total: 1,250 TND.',
 '{"date":"2026-03-02","newClaims":12,"approved":8,"rejected":2}', 'READ', NULL, NULL, '2026-03-02 18:00:00');

-- ============================================
-- PHARMACIST notifications (Pharmacie Centrale)
-- ============================================
INSERT INTO notifications (id, user_id, template_id, type, event_type, title, body, metadata, status, entity_type, entity_id, created_at) VALUES
-- Claim approved
('notif_pharma_001', '01JCVMKC1FP2N3X4Y5Z6A7B8H4', 'tmpl_claim_approved', 'IN_APP', 'CLAIM_APPROVED',
 'PEC DEM-2026-00020 approuvee', 'La PEC pharmacie pour Mohamed Ben Salah a ete approuvee. Montant couvert: 15.400 TND.',
 '{"claimNumber":"DEM-2026-00020","adherentName":"Mohamed Ben Salah"}', 'DELIVERED', 'CLAIM', '01JSD0F020DEM0PHARMA0006', '2026-02-15 10:00:00'),

-- Bordereau paid
('notif_pharma_002', '01JCVMKC1FP2N3X4Y5Z6A7B8H4', 'tmpl_bordereau_paid', 'IN_APP', 'BORDEREAU_PAID',
 'Bordereau BDX-STAR-202601-001 paye', 'Le bordereau janvier 2026 a ete paye. Montant: 2,150 TND.',
 '{"bordereauNumber":"BDX-STAR-202601-001","paidAmount":"2150"}', 'READ', 'BORDEREAU', 'bord_old_star_jan', '2026-02-15 14:00:00'),

-- Claim created
('notif_pharma_003', '01JCVMKC1FP2N3X4Y5Z6A7B8H4', 'tmpl_claim_created_app', 'IN_APP', 'CLAIM_CREATED',
 'Nouvelle PEC soumise', 'PEC DEM-2026-00001 creee pour Mohamed Ben Salah - Pharmacie 35.000 TND.',
 '{"claimNumber":"DEM-2026-00001","adherentName":"Mohamed Ben Salah"}', 'DELIVERED', 'CLAIM', '01JSD0A001DEM0PHARMA0001', '2026-03-01 09:30:00'),

-- Bordereau ready
('notif_pharma_004', '01JCVMKC1FP2N3X4Y5Z6A7B8H4', 'tmpl_bordereau_ready', 'IN_APP', 'BORDEREAU_READY',
 'Bordereau fevrier pret', 'Le bordereau BDX-202602-0001 est pret pour validation. 3 PEC, 3,234 TND.',
 '{"bordereauNumber":"BDX-202602-0001","claimCount":"3","totalAmount":"3234"}', 'PENDING', 'BORDEREAU', 'bord_02FEB2026_SENT', '2026-03-01 09:00:00'),

-- Reconciliation alert
('notif_pharma_005', '01JCVMKC1FP2N3X4Y5Z6A7B8H4', 'tmpl_reconciliation_alert', 'IN_APP', 'RECONCILIATION_MISMATCH',
 'Ecart de reconciliation detecte', 'Ecart de 15 TND sur le bordereau fevrier STAR. Verification requise.',
 '{"period":"2026-02","unmatchedCount":"1","unmatchedAmount":"15"}', 'PENDING', 'RECONCILIATION', 'recon_star_feb', '2026-03-02 09:00:00');

-- ============================================
-- INSURER ADMIN notifications (STAR)
-- ============================================
INSERT INTO notifications (id, user_id, template_id, type, event_type, title, body, metadata, status, entity_type, entity_id, created_at) VALUES
-- Fraud detected
('notif_insurer_001', '01JCVMKC1BP2N3X4Y5Z6A7B8D0', 'tmpl_fraud_alert_sms', 'IN_APP', 'FRAUD_DETECTED',
 'Alerte fraude - Score critique', 'PEC DEM-2026-00029 - Score fraude 85/100. Hospitalisation suspecte detectee.',
 '{"claimNumber":"DEM-2026-00029","fraudScore":85}', 'DELIVERED', 'CLAIM', '01JSD0F029DEM0PHARMA0009', '2026-03-02 14:30:00'),

-- New claims batch
('notif_insurer_002', '01JCVMKC1BP2N3X4Y5Z6A7B8D0', NULL, 'IN_APP', 'CLAIMS_BATCH',
 '5 nouvelles PEC a traiter', '5 prises en charge en attente de validation pour le mois de mars.',
 '{"count":5,"month":"mars 2026"}', 'PENDING', NULL, NULL, '2026-03-03 08:00:00'),

-- Bordereau received
('notif_insurer_003', '01JCVMKC1BP2N3X4Y5Z6A7B8D0', NULL, 'IN_APP', 'BORDEREAU_RECEIVED',
 'Bordereau recu - Pharmacie Centrale', 'Bordereau BDX-202602-0001 recu de Pharmacie Centrale Tunis. 3 PEC, 3,234 TND.',
 '{"bordereauNumber":"BDX-202602-0001","providerName":"Pharmacie Centrale Tunis"}', 'DELIVERED', 'BORDEREAU', 'bord_02FEB2026_SENT', '2026-03-02 09:30:00'),

-- Reconciliation dispute
('notif_insurer_004', '01JCVMKC1BP2N3X4Y5Z6A7B8D0', NULL, 'IN_APP', 'RECONCILIATION_DISPUTE',
 'Contestation de reconciliation', 'Cabinet Dr. Ben Ali conteste un ecart de 80 TND sur le bordereau janvier.',
 '{"providerName":"Cabinet Dr. Ben Ali","amount":"80"}', 'PENDING', 'RECONCILIATION', 'recon_star_dr_jan', '2026-02-08 14:00:00'),

-- Monthly report
('notif_insurer_005', '01JCVMKC1BP2N3X4Y5Z6A7B8D0', NULL, 'IN_APP', 'MONTHLY_REPORT',
 'Rapport mensuel fevrier 2026', 'Le rapport mensuel est disponible. 45 PEC traitees, taux d''approbation: 87%.',
 '{"month":"fevrier 2026","claimsProcessed":45,"approvalRate":87}', 'READ', NULL, NULL, '2026-03-01 08:00:00');

-- ============================================
-- ADHERENT notifications (Mohamed Ben Salah)
-- ============================================
INSERT INTO notifications (id, user_id, template_id, type, event_type, title, body, metadata, status, entity_type, entity_id, created_at) VALUES
-- Claim paid
('notif_adh_001', '01JCVMKC2AP2N3X4Y5Z6A7B8C9', 'tmpl_claim_approved', 'IN_APP', 'CLAIM_APPROVED',
 'Remboursement effectue', 'Votre PEC pharmacie DEM-2026-00020 a ete remboursee. Montant: 15.400 TND.',
 '{"claimNumber":"DEM-2026-00020","coveredAmount":"15.400"}', 'DELIVERED', 'CLAIM', '01JSD0F020DEM0PHARMA0006', '2026-02-15 10:00:00'),

-- Claim submitted
('notif_adh_002', '01JCVMKC2AP2N3X4Y5Z6A7B8C9', 'tmpl_claim_created_app', 'IN_APP', 'CLAIM_CREATED',
 'PEC soumise avec succes', 'Votre demande DEM-2026-00001 (pharmacie) a ete enregistree et est en cours de traitement.',
 '{"claimNumber":"DEM-2026-00001"}', 'READ', 'CLAIM', '01JSD0A001DEM0PHARMA0001', '2026-03-01 09:30:00'),

-- Contract renewal reminder
('notif_adh_003', '01JCVMKC2AP2N3X4Y5Z6A7B8C9', NULL, 'IN_APP', 'CONTRACT_REMINDER',
 'Rappel de renouvellement', 'Votre contrat STAR-2024-00001 expire le 31/12/2026. Pensez a le renouveler.',
 '{"contractNumber":"STAR-2024-00001","expiryDate":"2026-12-31"}', 'PENDING', 'CONTRACT', '01JCVMKB1AP2N3X4Y5Z6A7B8C9', '2026-03-03 08:00:00'),

-- Coverage update
('notif_adh_004', '01JCVMKC2AP2N3X4Y5Z6A7B8C9', NULL, 'IN_APP', 'COVERAGE_UPDATE',
 'Consommation pharmacie', 'Vous avez utilise 5.1% de votre plafond pharmacie annuel (51/1000 TND).',
 '{"careType":"pharmacy","percentage":5.1,"consumed":51,"limit":1000}', 'PENDING', NULL, NULL, '2026-03-03 09:00:00');

-- ============================================
-- DOCTOR notifications (Dr. Ben Ali)
-- ============================================
INSERT INTO notifications (id, user_id, template_id, type, event_type, title, body, metadata, status, entity_type, entity_id, created_at) VALUES
('notif_doc_001', '01JCVMKC1JP2N3X4Y5Z6A7B8L8', 'tmpl_claim_approved', 'IN_APP', 'CLAIM_APPROVED',
 'PEC consultation approuvee', 'PEC DEM-2026-00005 approuvee pour Fatma Trabelsi. Montant: 45.000 TND.',
 '{"claimNumber":"DEM-2026-00005","adherentName":"Fatma Trabelsi"}', 'READ', 'CLAIM', '01JSD0A005DEM0CONSULT002', '2026-02-20 11:00:00'),

('notif_doc_002', '01JCVMKC1JP2N3X4Y5Z6A7B8L8', NULL, 'IN_APP', 'BORDEREAU_DISPUTE',
 'Contestation bordereau janvier', 'Un ecart de 80 TND a ete detecte sur votre bordereau janvier. Veuillez verifier.',
 '{"bordereauNumber":"BDX-STAR-202601-002","amount":"80"}', 'PENDING', 'BORDEREAU', 'bord_old_star_dr_jan', '2026-02-08 14:30:00');
