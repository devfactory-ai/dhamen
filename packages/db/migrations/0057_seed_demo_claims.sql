-- Migration: Seed realistic claims for demo
-- Description: 30 claims across all types and statuses with claim items

-- ============================================
-- PHARMACY CLAIMS (10)
-- ============================================

-- Approved pharmacy claims
INSERT INTO claims (id, type, contract_id, provider_id, adherent_id, insurer_id, total_amount, covered_amount, copay_amount, fraud_score, status, created_at, validated_at, updated_at) VALUES
('01DEMO_CLM_PH001', 'pharmacy', '01JCVMKB1AP2N3X4Y5Z6A7B8C9', '01JCVMK9A1P2N3X4Y5Z6A7B8C9', '01JCVMKA1AP2N3X4Y5Z6A7B8C9', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', 45000, 36000, 9000, 5, 'approved', '2026-03-01 09:15:00', '2026-03-01 09:15:30', '2026-03-01 09:15:30'),
('01DEMO_CLM_PH002', 'pharmacy', '01JCVMKB1BP2N3X4Y5Z6A7B8D0', '01JCVMK9A1P2N3X4Y5Z6A7B8C9', '01JCVMKA1BP2N3X4Y5Z6A7B8D0', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', 32500, 27625, 4875, 3, 'approved', '2026-03-01 10:30:00', '2026-03-01 10:30:25', '2026-03-01 10:30:25'),
('01DEMO_CLM_PH003', 'pharmacy', '01JCVMKB1CP2N3X4Y5Z6A7B8E1', '01JCVMK9A2P2N3X4Y5Z6A7B8D0', '01JCVMKA1CP2N3X4Y5Z6A7B8E1', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 78000, 58500, 19500, 8, 'approved', '2026-03-01 11:00:00', '2026-03-01 11:00:20', '2026-03-01 11:00:20'),
('01DEMO_CLM_PH004', 'pharmacy', '01JCVMKB1DP2N3X4Y5Z6A7B8F2', '01JCVMK9A3P2N3X4Y5Z6A7B8E1', '01JCVMKA1DP2N3X4Y5Z6A7B8F2', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 125000, 100000, 25000, 12, 'paid', '2026-02-25 14:20:00', '2026-02-25 14:20:30', '2026-02-28 10:00:00');

-- Pending pharmacy claims
INSERT INTO claims (id, type, contract_id, provider_id, adherent_id, insurer_id, total_amount, covered_amount, copay_amount, fraud_score, status, created_at, updated_at) VALUES
('01DEMO_CLM_PH005', 'pharmacy', '01JCVMKB1EP2N3X4Y5Z6A7B8G3', '01JCVMK9A1P2N3X4Y5Z6A7B8C9', '01JCVMKA1EP2N3X4Y5Z6A7B8G3', '01JCVMK8R7P2N3X4Y5Z6A7B8E1', 55000, 44000, 11000, 15, 'pending', '2026-03-03 08:00:00', '2026-03-03 08:00:00'),
('01DEMO_CLM_PH006', 'pharmacy', '01JCVMKB1FP2N3X4Y5Z6A7B8H4', '01JCVMK9A2P2N3X4Y5Z6A7B8D0', '01JCVMKA1FP2N3X4Y5Z6A7B8H4', '01JCVMK8R7P2N3X4Y5Z6A7B8E1', 28000, 23800, 4200, 4, 'pending', '2026-03-03 08:30:00', '2026-03-03 08:30:00'),
('01DEMO_CLM_PH007', 'pharmacy', '01JCVMKB1GP2N3X4Y5Z6A7B8I5', '01JCVMK9A4P2N3X4Y5Z6A7B8F2', '01JCVMKA1GP2N3X4Y5Z6A7B8I5', '01JCVMK8R7P2N3X4Y5Z6A7B8F2', 92000, 64400, 27600, 22, 'pending', '2026-03-03 09:00:00', '2026-03-03 09:00:00');

-- Rejected pharmacy claims
INSERT INTO claims (id, type, contract_id, provider_id, adherent_id, insurer_id, total_amount, covered_amount, copay_amount, fraud_score, fraud_flags_json, status, notes, created_at, validated_at, updated_at) VALUES
('01DEMO_CLM_PH008', 'pharmacy', '01JCVMKB1HP2N3X4Y5Z6A7B8J6', '01JCVMK9A1P2N3X4Y5Z6A7B8C9', '01JCVMKA1HP2N3X4Y5Z6A7B8J6', '01JCVMK8R7P2N3X4Y5Z6A7B8F2', 350000, 0, 350000, 72, '["montant_eleve","frequence_anormale"]', 'rejected', 'Montant anormalement élevé - fraude suspectée', '2026-02-28 16:00:00', '2026-03-01 09:00:00', '2026-03-01 09:00:00'),
('01DEMO_CLM_PH009', 'pharmacy', '01JCVMKB1IP2N3X4Y5Z6A7B8K7', '01JCVMK9A3P2N3X4Y5Z6A7B8E1', '01JCVMKA1IP2N3X4Y5Z6A7B8K7', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', 15000, 0, 15000, 45, '["medication_incompatible"]', 'rejected', 'Médicament incompatible avec traitement en cours', '2026-02-27 11:30:00', '2026-02-27 14:00:00', '2026-02-27 14:00:00');

-- High fraud score pending review
INSERT INTO claims (id, type, contract_id, provider_id, adherent_id, insurer_id, total_amount, covered_amount, copay_amount, fraud_score, fraud_flags_json, status, created_at, updated_at) VALUES
('01DEMO_CLM_PH010', 'pharmacy', '01JCVMKB1JP2N3X4Y5Z6A7B8L8', '01JCVMK9A1P2N3X4Y5Z6A7B8C9', '01JCVMKA1JP2N3X4Y5Z6A7B8L8', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', 280000, 238000, 42000, 65, '["montant_eleve","frequence_anormale","hors_zone_geographique"]', 'pending_review', '2026-03-02 15:00:00', '2026-03-02 15:00:00');

-- ============================================
-- CONSULTATION CLAIMS (10)
-- ============================================

INSERT INTO claims (id, type, contract_id, provider_id, adherent_id, insurer_id, total_amount, covered_amount, copay_amount, fraud_score, status, created_at, validated_at, updated_at) VALUES
('01DEMO_CLM_CO001', 'consultation', '01JCVMKB1AP2N3X4Y5Z6A7B8C9', '01JCVMK9B1P2N3X4Y5Z6A7B8C9', '01JCVMKA1AP2N3X4Y5Z6A7B8C9', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', 35000, 24500, 10500, 2, 'approved', '2026-03-01 08:00:00', '2026-03-01 08:00:15', '2026-03-01 08:00:15'),
('01DEMO_CLM_CO002', 'consultation', '01JCVMKB1BP2N3X4Y5Z6A7B8D0', '01JCVMK9B2P2N3X4Y5Z6A7B8D0', '01JCVMKA1BP2N3X4Y5Z6A7B8D0', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', 60000, 48000, 12000, 6, 'approved', '2026-02-28 10:00:00', '2026-02-28 10:00:20', '2026-02-28 10:00:20'),
('01DEMO_CLM_CO003', 'consultation', '01JCVMKB1CP2N3X4Y5Z6A7B8E1', '01JCVMK9B3P2N3X4Y5Z6A7B8E1', '01JCVMKA1CP2N3X4Y5Z6A7B8E1', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 25000, 17500, 7500, 1, 'approved', '2026-02-27 14:30:00', '2026-02-27 14:30:10', '2026-02-27 14:30:10'),
('01DEMO_CLM_CO004', 'consultation', '01JCVMKB1DP2N3X4Y5Z6A7B8F2', '01JCVMK9B4P2N3X4Y5Z6A7B8F2', '01JCVMKA1DP2N3X4Y5Z6A7B8F2', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 45000, 33750, 11250, 3, 'paid', '2026-02-20 09:00:00', '2026-02-20 09:00:30', '2026-02-25 10:00:00');

INSERT INTO claims (id, type, contract_id, provider_id, adherent_id, insurer_id, total_amount, covered_amount, copay_amount, fraud_score, status, created_at, updated_at) VALUES
('01DEMO_CLM_CO005', 'consultation', '01JCVMKB1EP2N3X4Y5Z6A7B8G3', '01JCVMK9B1P2N3X4Y5Z6A7B8C9', '01JCVMKA1EP2N3X4Y5Z6A7B8G3', '01JCVMK8R7P2N3X4Y5Z6A7B8E1', 40000, 30000, 10000, 8, 'pending', '2026-03-03 07:45:00', '2026-03-03 07:45:00'),
('01DEMO_CLM_CO006', 'consultation', '01JCVMKB1FP2N3X4Y5Z6A7B8H4', '01JCVMK9B2P2N3X4Y5Z6A7B8D0', '01JCVMKA1FP2N3X4Y5Z6A7B8H4', '01JCVMK8R7P2N3X4Y5Z6A7B8E1', 75000, 60000, 15000, 10, 'pending', '2026-03-02 16:00:00', '2026-03-02 16:00:00'),
('01DEMO_CLM_CO007', 'consultation', '01JCVMKB1GP2N3X4Y5Z6A7B8I5', '01JCVMK9B3P2N3X4Y5Z6A7B8E1', '01JCVMKA1GP2N3X4Y5Z6A7B8I5', '01JCVMK8R7P2N3X4Y5Z6A7B8F2', 30000, 19500, 10500, 5, 'pending', '2026-03-03 09:30:00', '2026-03-03 09:30:00');

INSERT INTO claims (id, type, contract_id, provider_id, adherent_id, insurer_id, total_amount, covered_amount, copay_amount, fraud_score, status, notes, created_at, validated_at, updated_at) VALUES
('01DEMO_CLM_CO008', 'consultation', '01JCVMKB1HP2N3X4Y5Z6A7B8J6', '01JCVMK9B1P2N3X4Y5Z6A7B8C9', '01JCVMKA1HP2N3X4Y5Z6A7B8J6', '01JCVMK8R7P2N3X4Y5Z6A7B8F2', 35000, 0, 35000, 38, 'rejected', 'Spécialité non couverte par le contrat', '2026-02-26 11:00:00', '2026-02-26 15:00:00', '2026-02-26 15:00:00');

-- Eligible (pre-approved by AI)
INSERT INTO claims (id, type, contract_id, provider_id, adherent_id, insurer_id, total_amount, covered_amount, copay_amount, fraud_score, status, created_at, updated_at) VALUES
('01DEMO_CLM_CO009', 'consultation', '01JCVMKB1IP2N3X4Y5Z6A7B8K7', '01JCVMK9B4P2N3X4Y5Z6A7B8F2', '01JCVMKA1IP2N3X4Y5Z6A7B8K7', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', 50000, 37500, 12500, 4, 'eligible', '2026-03-03 10:00:00', '2026-03-03 10:00:00'),
('01DEMO_CLM_CO010', 'consultation', '01JCVMKB1JP2N3X4Y5Z6A7B8L8', '01JCVMK9B2P2N3X4Y5Z6A7B8D0', '01JCVMKA1JP2N3X4Y5Z6A7B8L8', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', 85000, 72250, 12750, 7, 'eligible', '2026-03-02 14:00:00', '2026-03-02 14:00:00');

-- ============================================
-- HOSPITALIZATION CLAIMS (5)
-- ============================================

INSERT INTO claims (id, type, contract_id, provider_id, adherent_id, insurer_id, total_amount, covered_amount, copay_amount, fraud_score, status, created_at, validated_at, updated_at) VALUES
('01DEMO_CLM_HO001', 'hospitalization', '01JCVMKB1BP2N3X4Y5Z6A7B8D0', '01JCVMK9D1P2N3X4Y5Z6A7B8C9', '01JCVMKA1BP2N3X4Y5Z6A7B8D0', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', 2500000, 2375000, 125000, 3, 'approved', '2026-02-15 08:00:00', '2026-02-15 14:00:00', '2026-02-15 14:00:00'),
('01DEMO_CLM_HO002', 'hospitalization', '01JCVMKB1NP2N3X4Y5Z6A7B8P2', '01JCVMK9D2P2N3X4Y5Z6A7B8D0', '01JCVMKA1NP2N3X4Y5Z6A7B8P2', '01JCVMK8R7P2N3X4Y5Z6A7B8E1', 1800000, 1710000, 90000, 5, 'paid', '2026-02-10 10:00:00', '2026-02-10 16:00:00', '2026-02-20 10:00:00');

INSERT INTO claims (id, type, contract_id, provider_id, adherent_id, insurer_id, total_amount, covered_amount, copay_amount, fraud_score, status, created_at, updated_at) VALUES
('01DEMO_CLM_HO003', 'hospitalization', '01JCVMKB1FP2N3X4Y5Z6A7B8H4', '01JCVMK9D1P2N3X4Y5Z6A7B8C9', '01JCVMKA1FP2N3X4Y5Z6A7B8H4', '01JCVMK8R7P2N3X4Y5Z6A7B8E1', 3200000, 3040000, 160000, 18, 'pending', '2026-03-02 07:00:00', '2026-03-02 07:00:00'),
('01DEMO_CLM_HO004', 'hospitalization', '01JCVMKB1DP2N3X4Y5Z6A7B8F2', '01JCVMK9D2P2N3X4Y5Z6A7B8D0', '01JCVMKA1DP2N3X4Y5Z6A7B8F2', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 1500000, 1350000, 150000, 9, 'pending', '2026-03-01 12:00:00', '2026-03-01 12:00:00');

INSERT INTO claims (id, type, contract_id, provider_id, adherent_id, insurer_id, total_amount, covered_amount, copay_amount, fraud_score, fraud_flags_json, status, created_at, updated_at) VALUES
('01DEMO_CLM_HO005', 'hospitalization', '01JCVMKB1LP2N3X4Y5Z6A7B8N0', '01JCVMK9D1P2N3X4Y5Z6A7B8C9', '01JCVMKA1LP2N3X4Y5Z6A7B8N0', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 5500000, 4950000, 550000, 55, '["montant_eleve","sejour_prolonge"]', 'pending_review', '2026-02-28 08:00:00', '2026-02-28 08:00:00');

-- ============================================
-- LAB CLAIMS (5) - using type 'consultation' since schema only allows pharmacy/consultation/hospitalization
-- We'll use consultation type with lab providers
-- ============================================

INSERT INTO claims (id, type, contract_id, provider_id, adherent_id, insurer_id, total_amount, covered_amount, copay_amount, fraud_score, status, created_at, validated_at, updated_at) VALUES
('01DEMO_CLM_LB001', 'consultation', '01JCVMKB1AP2N3X4Y5Z6A7B8C9', '01JCVMK9C1P2N3X4Y5Z6A7B8C9', '01JCVMKA1AP2N3X4Y5Z6A7B8C9', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', 65000, 48750, 16250, 2, 'approved', '2026-02-28 08:30:00', '2026-02-28 08:30:15', '2026-02-28 08:30:15'),
('01DEMO_CLM_LB002', 'consultation', '01JCVMKB1CP2N3X4Y5Z6A7B8E1', '01JCVMK9C2P2N3X4Y5Z6A7B8D0', '01JCVMKA1CP2N3X4Y5Z6A7B8E1', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 120000, 84000, 36000, 4, 'approved', '2026-02-27 09:00:00', '2026-02-27 09:00:20', '2026-02-27 09:00:20');

INSERT INTO claims (id, type, contract_id, provider_id, adherent_id, insurer_id, total_amount, covered_amount, copay_amount, fraud_score, status, created_at, updated_at) VALUES
('01DEMO_CLM_LB003', 'consultation', '01JCVMKB1EP2N3X4Y5Z6A7B8G3', '01JCVMK9C1P2N3X4Y5Z6A7B8C9', '01JCVMKA1EP2N3X4Y5Z6A7B8G3', '01JCVMK8R7P2N3X4Y5Z6A7B8E1', 95000, 76000, 19000, 6, 'pending', '2026-03-03 07:30:00', '2026-03-03 07:30:00'),
('01DEMO_CLM_LB004', 'consultation', '01JCVMKB1GP2N3X4Y5Z6A7B8I5', '01JCVMK9C2P2N3X4Y5Z6A7B8D0', '01JCVMKA1GP2N3X4Y5Z6A7B8I5', '01JCVMK8R7P2N3X4Y5Z6A7B8F2', 42000, 27300, 14700, 3, 'pending', '2026-03-02 11:00:00', '2026-03-02 11:00:00'),
('01DEMO_CLM_LB005', 'consultation', '01JCVMKB1IP2N3X4Y5Z6A7B8K7', '01JCVMK9C1P2N3X4Y5Z6A7B8C9', '01JCVMKA1IP2N3X4Y5Z6A7B8K7', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', 180000, 135000, 45000, 11, 'eligible', '2026-03-02 09:00:00', '2026-03-02 09:00:00');

-- ============================================
-- CLAIM ITEMS (for the pharmacy claims)
-- ============================================

-- Items for PH001 (Paracetamol + Amoxicilline)
INSERT INTO claim_items (id, claim_id, code, label, quantity, unit_price, line_total, covered_amount, copay_amount, reimbursement_rate, is_generic) VALUES
('01DEMO_ITM_PH001A', '01DEMO_CLM_PH001', 'MED-001', 'Paracétamol 500mg x30', 2, 8500, 17000, 13600, 3400, 0.80, 1),
('01DEMO_ITM_PH001B', '01DEMO_CLM_PH001', 'MED-002', 'Amoxicilline 500mg x24', 1, 15000, 15000, 12000, 3000, 0.80, 1),
('01DEMO_ITM_PH001C', '01DEMO_CLM_PH001', 'MED-003', 'Ibuprofène 400mg x20', 1, 13000, 13000, 10400, 2600, 0.80, 1);

-- Items for PH002 (Antihypertenseur)
INSERT INTO claim_items (id, claim_id, code, label, quantity, unit_price, line_total, covered_amount, copay_amount, reimbursement_rate, is_generic) VALUES
('01DEMO_ITM_PH002A', '01DEMO_CLM_PH002', 'MED-010', 'Amlodipine 5mg x30', 1, 18500, 18500, 15725, 2775, 0.85, 0),
('01DEMO_ITM_PH002B', '01DEMO_CLM_PH002', 'MED-011', 'Metformine 850mg x60', 1, 14000, 14000, 11900, 2100, 0.85, 1);

-- Items for PH005 (Pending - Antibiotiques)
INSERT INTO claim_items (id, claim_id, code, label, quantity, unit_price, line_total, covered_amount, copay_amount, reimbursement_rate, is_generic) VALUES
('01DEMO_ITM_PH005A', '01DEMO_CLM_PH005', 'MED-020', 'Ciprofloxacine 500mg x14', 1, 22000, 22000, 17600, 4400, 0.80, 1),
('01DEMO_ITM_PH005B', '01DEMO_CLM_PH005', 'MED-021', 'Oméprazole 20mg x28', 1, 16000, 16000, 12800, 3200, 0.80, 1),
('01DEMO_ITM_PH005C', '01DEMO_CLM_PH005', 'MED-003', 'Ibuprofène 400mg x20', 1, 13000, 13000, 10400, 2600, 0.80, 1),
('01DEMO_ITM_PH005D', '01DEMO_CLM_PH005', 'MED-022', 'Vitamine C 1000mg x30', 1, 4000, 4000, 3200, 800, 0.80, 1);

-- Items for PH008 (Rejected - suspicious high amount)
INSERT INTO claim_items (id, claim_id, code, label, quantity, unit_price, line_total, covered_amount, copay_amount, reimbursement_rate, is_generic) VALUES
('01DEMO_ITM_PH008A', '01DEMO_CLM_PH008', 'MED-050', 'Traitement spécialisé X', 5, 50000, 250000, 0, 250000, 0.00, 0),
('01DEMO_ITM_PH008B', '01DEMO_CLM_PH008', 'MED-051', 'Complément spécial Y', 10, 10000, 100000, 0, 100000, 0.00, 0);

-- Items for consultation CO001
INSERT INTO claim_items (id, claim_id, code, label, quantity, unit_price, line_total, covered_amount, copay_amount, reimbursement_rate, is_generic) VALUES
('01DEMO_ITM_CO001A', '01DEMO_CLM_CO001', 'ACT-001', 'Consultation médecine générale', 1, 35000, 35000, 24500, 10500, 0.70, 0);

-- Items for consultation CO002 (Cardiology)
INSERT INTO claim_items (id, claim_id, code, label, quantity, unit_price, line_total, covered_amount, copay_amount, reimbursement_rate, is_generic) VALUES
('01DEMO_ITM_CO002A', '01DEMO_CLM_CO002', 'ACT-010', 'Consultation cardiologie', 1, 45000, 45000, 36000, 9000, 0.80, 0),
('01DEMO_ITM_CO002B', '01DEMO_CLM_CO002', 'ACT-011', 'ECG (Électrocardiogramme)', 1, 15000, 15000, 12000, 3000, 0.80, 0);

-- Items for hospitalization HO001
INSERT INTO claim_items (id, claim_id, code, label, quantity, unit_price, line_total, covered_amount, copay_amount, reimbursement_rate, is_generic) VALUES
('01DEMO_ITM_HO001A', '01DEMO_CLM_HO001', 'HOS-001', 'Chambre standard (3 nuits)', 3, 150000, 450000, 427500, 22500, 0.95, 0),
('01DEMO_ITM_HO001B', '01DEMO_CLM_HO001', 'HOS-010', 'Intervention chirurgicale', 1, 1500000, 1500000, 1425000, 75000, 0.95, 0),
('01DEMO_ITM_HO001C', '01DEMO_CLM_HO001', 'HOS-020', 'Anesthésie générale', 1, 350000, 350000, 332500, 17500, 0.95, 0),
('01DEMO_ITM_HO001D', '01DEMO_CLM_HO001', 'HOS-030', 'Médicaments hospitalisation', 1, 200000, 200000, 190000, 10000, 0.95, 0);

-- Items for lab LB001
INSERT INTO claim_items (id, claim_id, code, label, quantity, unit_price, line_total, covered_amount, copay_amount, reimbursement_rate, is_generic) VALUES
('01DEMO_ITM_LB001A', '01DEMO_CLM_LB001', 'LAB-001', 'Hémogramme complet (NFS)', 1, 15000, 15000, 11250, 3750, 0.75, 0),
('01DEMO_ITM_LB001B', '01DEMO_CLM_LB001', 'LAB-002', 'Glycémie à jeun', 1, 8000, 8000, 6000, 2000, 0.75, 0),
('01DEMO_ITM_LB001C', '01DEMO_CLM_LB001', 'LAB-003', 'Bilan lipidique complet', 1, 25000, 25000, 18750, 6250, 0.75, 0),
('01DEMO_ITM_LB001D', '01DEMO_CLM_LB001', 'LAB-010', 'TSH (Thyroïde)', 1, 17000, 17000, 12750, 4250, 0.75, 0);
