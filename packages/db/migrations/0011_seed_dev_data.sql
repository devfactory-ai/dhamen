-- Migration: Seed development data
-- Description: Realistic Tunisian test data for development

-- ============================================
-- INSURERS (4 major Tunisian insurance companies)
-- ============================================

INSERT INTO insurers (id, name, code, tax_id, address, phone, email, config_json, is_active) VALUES
('01JCVMK8R7P2N3X4Y5Z6A7B8C9', 'Société Tunisienne d''Assurances et de Réassurances', 'STAR', '1234567ABC', 'Rue Khereddine Pacha, Tunis', '+21671840840', 'contact@star.com.tn', '{"reconciliation":{"cycle":"monthly","dayOfMonth":1,"retentionRate":0.02,"autoGenerate":true,"pdfTemplate":"standard"},"fraudThresholds":{"reviewThreshold":31,"blockThreshold":71},"defaultReimbursementRate":0.8}', 1),
('01JCVMK8R7P2N3X4Y5Z6A7B8D0', 'GAT Assurances', 'GAT', '2345678BCD', 'Avenue Habib Bourguiba, Tunis', '+21671350350', 'contact@gat.com.tn', '{"reconciliation":{"cycle":"biweekly","dayOfWeek":1,"retentionRate":0.015,"autoGenerate":true,"pdfTemplate":"standard"},"fraudThresholds":{"reviewThreshold":35,"blockThreshold":75},"defaultReimbursementRate":0.75}', 1),
('01JCVMK8R7P2N3X4Y5Z6A7B8E1', 'Compagnie Méditerranéenne d''Assurances et de Réassurances', 'COMAR', '3456789CDE', 'Avenue Mohamed V, Tunis', '+21671790790', 'contact@comar.com.tn', '{"reconciliation":{"cycle":"monthly","dayOfMonth":15,"retentionRate":0.02,"autoGenerate":true,"pdfTemplate":"standard"},"fraudThresholds":{"reviewThreshold":30,"blockThreshold":70},"defaultReimbursementRate":0.8}', 1),
('01JCVMK8R7P2N3X4Y5Z6A7B8F2', 'Assurances Maghrebia', 'AMI', '4567890DEF', 'Rue de Palestine, Tunis', '+21671284284', 'contact@ami.com.tn', '{"reconciliation":{"cycle":"weekly","dayOfWeek":5,"retentionRate":0.025,"autoGenerate":false,"pdfTemplate":"standard"},"fraudThresholds":{"reviewThreshold":40,"blockThreshold":80},"defaultReimbursementRate":0.7}', 1);

-- ============================================
-- PROVIDERS (12 healthcare providers)
-- ============================================

-- Pharmacies (4)
INSERT INTO providers (id, type, name, license_no, speciality, address, city, lat, lng, phone, email, is_active) VALUES
('01JCVMK9A1P2N3X4Y5Z6A7B8C9', 'pharmacist', 'Pharmacie Centrale Tunis', 'PH-TN-001', NULL, '12 Avenue Habib Bourguiba', 'Tunis', 36.8065, 10.1815, '+21671240001', 'pharma.centrale@email.tn', 1),
('01JCVMK9A2P2N3X4Y5Z6A7B8D0', 'pharmacist', 'Pharmacie du Sahel', 'PH-SF-002', NULL, '45 Avenue Farhat Hached', 'Sfax', 34.7406, 10.7603, '+21674225002', 'pharma.sahel@email.tn', 1),
('01JCVMK9A3P2N3X4Y5Z6A7B8E1', 'pharmacist', 'Pharmacie Sousse Centre', 'PH-SS-003', NULL, '78 Rue de la République', 'Sousse', 35.8245, 10.6346, '+21673226003', 'pharma.sousse@email.tn', 1),
('01JCVMK9A4P2N3X4Y5Z6A7B8F2', 'pharmacist', 'Pharmacie Monastir', 'PH-MN-004', NULL, '23 Avenue de l''Environnement', 'Monastir', 35.7643, 10.8113, '+21673461004', 'pharma.monastir@email.tn', 1);

-- Doctors (4)
INSERT INTO providers (id, type, name, license_no, speciality, address, city, lat, lng, phone, email, is_active) VALUES
('01JCVMK9B1P2N3X4Y5Z6A7B8C9', 'doctor', 'Cabinet Dr. Ben Ali', 'MD-TN-001', 'Médecine Générale', '56 Rue de Marseille', 'Tunis', 36.8002, 10.1857, '+21671330001', 'dr.benali@email.tn', 1),
('01JCVMK9B2P2N3X4Y5Z6A7B8D0', 'doctor', 'Cabinet Dr. Trabelsi', 'MD-TN-002', 'Cardiologie', '89 Avenue de la Liberté', 'Tunis', 36.8089, 10.1657, '+21671440002', 'dr.trabelsi@email.tn', 1),
('01JCVMK9B3P2N3X4Y5Z6A7B8E1', 'doctor', 'Cabinet Dr. Bouazizi', 'MD-SF-003', 'Médecine Générale', '34 Rue Mongi Slim', 'Sfax', 34.7350, 10.7550, '+21674550003', 'dr.bouazizi@email.tn', 1),
('01JCVMK9B4P2N3X4Y5Z6A7B8F2', 'doctor', 'Cabinet Dr. Hammami', 'MD-SS-004', 'Pédiatrie', '67 Avenue du 14 Janvier', 'Sousse', 35.8280, 10.6400, '+21673660004', 'dr.hammami@email.tn', 1);

-- Laboratories (2)
INSERT INTO providers (id, type, name, license_no, speciality, address, city, lat, lng, phone, email, is_active) VALUES
('01JCVMK9C1P2N3X4Y5Z6A7B8C9', 'lab', 'Laboratoire Central d''Analyses', 'LB-TN-001', 'Analyses Médicales', '100 Avenue de Paris', 'Tunis', 36.7950, 10.1750, '+21671770001', 'labo.central@email.tn', 1),
('01JCVMK9C2P2N3X4Y5Z6A7B8D0', 'lab', 'Laboratoire El Manar', 'LB-TN-002', 'Analyses Médicales', '22 Rue El Manar', 'Tunis', 36.8400, 10.1600, '+21671880002', 'labo.elmanar@email.tn', 1);

-- Clinics (2)
INSERT INTO providers (id, type, name, license_no, speciality, address, city, lat, lng, phone, email, is_active) VALUES
('01JCVMK9D1P2N3X4Y5Z6A7B8C9', 'clinic', 'Clinique Les Oliviers', 'CL-TN-001', 'Polyclinique', '150 Avenue Habib Thameur', 'Tunis', 36.8100, 10.1700, '+21671990001', 'clinique.oliviers@email.tn', 1),
('01JCVMK9D2P2N3X4Y5Z6A7B8D0', 'clinic', 'Clinique El Amen', 'CL-SS-002', 'Polyclinique', '88 Boulevard du 7 Novembre', 'Sousse', 35.8300, 10.6200, '+21673110002', 'clinique.elamen@email.tn', 1);

-- ============================================
-- ADHERENTS (20 insured persons)
-- ============================================

INSERT INTO adherents (id, national_id_encrypted, first_name, last_name, date_of_birth, gender, phone_encrypted, email, address, city, lat, lng) VALUES
('01JCVMKA1AP2N3X4Y5Z6A7B8C9', 'ENC_08123456', 'Mohamed', 'Ben Salah', '1985-03-15', 'M', 'ENC_21698765432', 'mohamed.bensalah@email.tn', '15 Rue de Tunis', 'Tunis', 36.8065, 10.1815),
('01JCVMKA1BP2N3X4Y5Z6A7B8D0', 'ENC_08234567', 'Fatma', 'Trabelsi', '1990-07-22', 'F', 'ENC_21697654321', 'fatma.trabelsi@email.tn', '28 Avenue de France', 'Tunis', 36.7990, 10.1780),
('01JCVMKA1CP2N3X4Y5Z6A7B8E1', 'ENC_08345678', 'Ahmed', 'Bouazizi', '1978-11-08', 'M', 'ENC_21696543210', 'ahmed.bouazizi@email.tn', '42 Rue Mongi Slim', 'Sfax', 34.7400, 10.7600),
('01JCVMKA1DP2N3X4Y5Z6A7B8F2', 'ENC_08456789', 'Leila', 'Hammami', '1995-02-14', 'F', 'ENC_21695432109', 'leila.hammami@email.tn', '67 Boulevard Principal', 'Sousse', 35.8250, 10.6350),
('01JCVMKA1EP2N3X4Y5Z6A7B8G3', 'ENC_08567890', 'Karim', 'Jebali', '1982-09-30', 'M', 'ENC_21694321098', 'karim.jebali@email.tn', '89 Avenue de la Liberté', 'Monastir', 35.7650, 10.8100),
('01JCVMKA1FP2N3X4Y5Z6A7B8H4', 'ENC_08678901', 'Sonia', 'Chahed', '1988-12-05', 'F', 'ENC_21693210987', 'sonia.chahed@email.tn', '12 Rue El Jazira', 'Tunis', 36.8020, 10.1800),
('01JCVMKA1GP2N3X4Y5Z6A7B8I5', 'ENC_08789012', 'Youssef', 'Mekni', '1975-05-18', 'M', 'ENC_21692109876', 'youssef.mekni@email.tn', '34 Avenue Bourguiba', 'Sfax', 34.7380, 10.7580),
('01JCVMKA1HP2N3X4Y5Z6A7B8J6', 'ENC_08890123', 'Amira', 'Saidi', '1992-08-25', 'F', 'ENC_21691098765', 'amira.saidi@email.tn', '56 Rue de la République', 'Sousse', 35.8230, 10.6330),
('01JCVMKA1IP2N3X4Y5Z6A7B8K7', 'ENC_08901234', 'Hichem', 'Ferchichi', '1980-01-12', 'M', 'ENC_21690987654', 'hichem.ferchichi@email.tn', '78 Avenue du 7 Novembre', 'Tunis', 36.8100, 10.1850),
('01JCVMKA1JP2N3X4Y5Z6A7B8L8', 'ENC_09012345', 'Nadia', 'Ghannouchi', '1987-04-08', 'F', 'ENC_21689876543', 'nadia.ghannouchi@email.tn', '90 Rue Farhat Hached', 'Sfax', 34.7420, 10.7620),
('01JCVMKA1KP2N3X4Y5Z6A7B8M9', 'ENC_09123456', 'Walid', 'Baccouche', '1993-06-20', 'M', 'ENC_21688765432', 'walid.baccouche@email.tn', '11 Boulevard Mohamed V', 'Tunis', 36.8050, 10.1770),
('01JCVMKA1LP2N3X4Y5Z6A7B8N0', 'ENC_09234567', 'Salma', 'Essebsi', '1996-10-30', 'F', 'ENC_21687654321', 'salma.essebsi@email.tn', '23 Avenue de Carthage', 'Tunis', 36.8080, 10.1820),
('01JCVMKA1MP2N3X4Y5Z6A7B8O1', 'ENC_09345678', 'Ridha', 'Belhadj', '1970-02-28', 'M', 'ENC_21686543210', 'ridha.belhadj@email.tn', '45 Rue de Marseille', 'Tunis', 36.8000, 10.1860),
('01JCVMKA1NP2N3X4Y5Z6A7B8P2', 'ENC_09456789', 'Ines', 'Marzouki', '1989-07-16', 'F', 'ENC_21685432109', 'ines.marzouki@email.tn', '67 Avenue de l''UMA', 'Sousse', 35.8200, 10.6300),
('01JCVMKA1OP2N3X4Y5Z6A7B8Q3', 'ENC_09567890', 'Bassem', 'Kallel', '1984-11-22', 'M', 'ENC_21684321098', 'bassem.kallel@email.tn', '89 Rue Ibn Khaldoun', 'Monastir', 35.7680, 10.8050),
('01JCVMKA1PP2N3X4Y5Z6A7B8R4', 'ENC_09678901', 'Hela', 'Sfar', '1991-03-09', 'F', 'ENC_21683210987', 'hela.sfar@email.tn', '12 Boulevard du 14 Janvier', 'Sfax', 34.7360, 10.7560),
('01JCVMKA1QP2N3X4Y5Z6A7B8S5', 'ENC_09789012', 'Amine', 'Kchaou', '1977-08-05', 'M', 'ENC_21682109876', 'amine.kchaou@email.tn', '34 Avenue de la Corniche', 'Sousse', 35.8280, 10.6380),
('01JCVMKA1RP2N3X4Y5Z6A7B8T6', 'ENC_09890123', 'Rim', 'Mahjoub', '1994-12-18', 'F', 'ENC_21681098765', 'rim.mahjoub@email.tn', '56 Rue de Palestine', 'Tunis', 36.8040, 10.1790),
('01JCVMKA1SP2N3X4Y5Z6A7B8U7', 'ENC_09901234', 'Fares', 'Zouari', '1986-05-25', 'M', 'ENC_21680987654', 'fares.zouari@email.tn', '78 Avenue de Paris', 'Tunis', 36.7980, 10.1760),
('01JCVMKA1TP2N3X4Y5Z6A7B8V8', 'ENC_00012345', 'Maha', 'Nemri', '1998-09-12', 'F', 'ENC_21679876543', 'maha.nemri@email.tn', '90 Rue de Rome', 'Tunis', 36.8070, 10.1830);

-- ============================================
-- CONTRACTS (25 insurance contracts)
-- ============================================

-- Active contracts (15)
INSERT INTO contracts (id, insurer_id, adherent_id, contract_number, plan_type, start_date, end_date, carence_days, annual_limit, coverage_json, exclusions_json, status) VALUES
('01JCVMKB1AP2N3X4Y5Z6A7B8C9', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', '01JCVMKA1AP2N3X4Y5Z6A7B8C9', 'STAR-2024-00001', 'individual', '2024-01-01', '2024-12-31', 30, 5000000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.8,"annualLimit":1000000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.7,"annualLimit":500000,"specialities":["general","cardiology","pediatrics"]},"hospitalization":{"enabled":true,"reimbursementRate":0.9,"annualLimit":3000000,"roomType":"standard"},"lab":{"enabled":true,"reimbursementRate":0.75,"annualLimit":500000}}', '[]', 'active'),
('01JCVMKB1BP2N3X4Y5Z6A7B8D0', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', '01JCVMKA1BP2N3X4Y5Z6A7B8D0', 'STAR-2024-00002', 'family', '2024-01-01', '2024-12-31', 15, 10000000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.85,"annualLimit":2000000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.8,"annualLimit":1000000,"specialities":["general","cardiology","pediatrics","dermatology"]},"hospitalization":{"enabled":true,"reimbursementRate":0.95,"annualLimit":6000000,"roomType":"private"},"lab":{"enabled":true,"reimbursementRate":0.8,"annualLimit":1000000}}', '[]', 'active'),
('01JCVMKB1CP2N3X4Y5Z6A7B8E1', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', '01JCVMKA1CP2N3X4Y5Z6A7B8E1', 'GAT-2024-00001', 'individual', '2024-02-01', '2025-01-31', 30, 4000000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.75,"annualLimit":800000,"genericOnly":true},"consultation":{"enabled":true,"reimbursementRate":0.7,"annualLimit":400000,"specialities":["general"]},"hospitalization":{"enabled":true,"reimbursementRate":0.85,"annualLimit":2500000,"roomType":"standard"},"lab":{"enabled":true,"reimbursementRate":0.7,"annualLimit":300000}}', '["dental","optical"]', 'active'),
('01JCVMKB1DP2N3X4Y5Z6A7B8F2', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', '01JCVMKA1DP2N3X4Y5Z6A7B8F2', 'GAT-2024-00002', 'corporate', '2024-01-15', '2025-01-14', 0, 8000000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.8,"annualLimit":1500000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.75,"annualLimit":800000,"specialities":["general","cardiology","pediatrics"]},"hospitalization":{"enabled":true,"reimbursementRate":0.9,"annualLimit":5000000,"roomType":"any"},"lab":{"enabled":true,"reimbursementRate":0.75,"annualLimit":700000}}', '[]', 'active'),
('01JCVMKB1EP2N3X4Y5Z6A7B8G3', '01JCVMK8R7P2N3X4Y5Z6A7B8E1', '01JCVMKA1EP2N3X4Y5Z6A7B8G3', 'COMAR-2024-00001', 'individual', '2024-03-01', '2025-02-28', 45, 6000000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.8,"annualLimit":1200000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.75,"annualLimit":600000,"specialities":["general","cardiology"]},"hospitalization":{"enabled":true,"reimbursementRate":0.9,"annualLimit":4000000,"roomType":"standard"},"lab":{"enabled":true,"reimbursementRate":0.8,"annualLimit":600000}}', '["cosmetic"]', 'active'),
('01JCVMKB1FP2N3X4Y5Z6A7B8H4', '01JCVMK8R7P2N3X4Y5Z6A7B8E1', '01JCVMKA1FP2N3X4Y5Z6A7B8H4', 'COMAR-2024-00002', 'family', '2024-01-01', '2024-12-31', 30, 12000000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.85,"annualLimit":2500000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.8,"annualLimit":1200000,"specialities":["general","cardiology","pediatrics","gynecology"]},"hospitalization":{"enabled":true,"reimbursementRate":0.95,"annualLimit":7000000,"roomType":"private"},"lab":{"enabled":true,"reimbursementRate":0.85,"annualLimit":1300000}}', '[]', 'active'),
('01JCVMKB1GP2N3X4Y5Z6A7B8I5', '01JCVMK8R7P2N3X4Y5Z6A7B8F2', '01JCVMKA1GP2N3X4Y5Z6A7B8I5', 'AMI-2024-00001', 'individual', '2024-02-15', '2025-02-14', 60, 3500000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.7,"annualLimit":700000,"genericOnly":true},"consultation":{"enabled":true,"reimbursementRate":0.65,"annualLimit":350000,"specialities":["general"]},"hospitalization":{"enabled":true,"reimbursementRate":0.8,"annualLimit":2200000,"roomType":"standard"},"lab":{"enabled":true,"reimbursementRate":0.65,"annualLimit":250000}}', '["dental","optical","cosmetic"]', 'active'),
('01JCVMKB1HP2N3X4Y5Z6A7B8J6', '01JCVMK8R7P2N3X4Y5Z6A7B8F2', '01JCVMKA1HP2N3X4Y5Z6A7B8J6', 'AMI-2024-00002', 'corporate', '2024-01-01', '2024-12-31', 15, 7500000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.75,"annualLimit":1400000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.7,"annualLimit":700000,"specialities":["general","cardiology"]},"hospitalization":{"enabled":true,"reimbursementRate":0.85,"annualLimit":4500000,"roomType":"any"},"lab":{"enabled":true,"reimbursementRate":0.7,"annualLimit":600000}}', '[]', 'active'),
('01JCVMKB1IP2N3X4Y5Z6A7B8K7', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', '01JCVMKA1IP2N3X4Y5Z6A7B8K7', 'STAR-2024-00003', 'individual', '2024-04-01', '2025-03-31', 30, 5500000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.8,"annualLimit":1100000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.75,"annualLimit":550000,"specialities":["general","cardiology","pediatrics"]},"hospitalization":{"enabled":true,"reimbursementRate":0.9,"annualLimit":3500000,"roomType":"standard"},"lab":{"enabled":true,"reimbursementRate":0.8,"annualLimit":550000}}', '[]', 'active'),
('01JCVMKB1JP2N3X4Y5Z6A7B8L8', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', '01JCVMKA1JP2N3X4Y5Z6A7B8L8', 'STAR-2024-00004', 'family', '2024-01-01', '2024-12-31', 15, 11000000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.85,"annualLimit":2200000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.8,"annualLimit":1100000,"specialities":["general","cardiology","pediatrics","dermatology"]},"hospitalization":{"enabled":true,"reimbursementRate":0.95,"annualLimit":6500000,"roomType":"private"},"lab":{"enabled":true,"reimbursementRate":0.85,"annualLimit":1100000}}', '[]', 'active'),
('01JCVMKB1KP2N3X4Y5Z6A7B8M9', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', '01JCVMKA1KP2N3X4Y5Z6A7B8M9', 'GAT-2024-00003', 'individual', '2024-05-01', '2025-04-30', 30, 4500000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.75,"annualLimit":900000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.7,"annualLimit":450000,"specialities":["general","cardiology"]},"hospitalization":{"enabled":true,"reimbursementRate":0.85,"annualLimit":2800000,"roomType":"standard"},"lab":{"enabled":true,"reimbursementRate":0.75,"annualLimit":350000}}', '[]', 'active'),
('01JCVMKB1LP2N3X4Y5Z6A7B8N0', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', '01JCVMKA1LP2N3X4Y5Z6A7B8N0', 'GAT-2024-00004', 'corporate', '2024-01-01', '2024-12-31', 0, 9000000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.8,"annualLimit":1800000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.75,"annualLimit":900000,"specialities":["general","cardiology","pediatrics"]},"hospitalization":{"enabled":true,"reimbursementRate":0.9,"annualLimit":5500000,"roomType":"any"},"lab":{"enabled":true,"reimbursementRate":0.8,"annualLimit":800000}}', '[]', 'active'),
('01JCVMKB1MP2N3X4Y5Z6A7B8O1', '01JCVMK8R7P2N3X4Y5Z6A7B8E1', '01JCVMKA1MP2N3X4Y5Z6A7B8O1', 'COMAR-2024-00003', 'individual', '2024-06-01', '2025-05-31', 45, 5000000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.8,"annualLimit":1000000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.75,"annualLimit":500000,"specialities":["general"]},"hospitalization":{"enabled":true,"reimbursementRate":0.9,"annualLimit":3200000,"roomType":"standard"},"lab":{"enabled":true,"reimbursementRate":0.8,"annualLimit":500000}}', '[]', 'active'),
('01JCVMKB1NP2N3X4Y5Z6A7B8P2', '01JCVMK8R7P2N3X4Y5Z6A7B8E1', '01JCVMKA1NP2N3X4Y5Z6A7B8P2', 'COMAR-2024-00004', 'family', '2024-01-01', '2024-12-31', 30, 13000000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.85,"annualLimit":2600000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.8,"annualLimit":1300000,"specialities":["general","cardiology","pediatrics","gynecology"]},"hospitalization":{"enabled":true,"reimbursementRate":0.95,"annualLimit":7500000,"roomType":"private"},"lab":{"enabled":true,"reimbursementRate":0.85,"annualLimit":1400000}}', '[]', 'active'),
('01JCVMKB1OP2N3X4Y5Z6A7B8Q3', '01JCVMK8R7P2N3X4Y5Z6A7B8F2', '01JCVMKA1OP2N3X4Y5Z6A7B8Q3', 'AMI-2024-00003', 'individual', '2024-07-01', '2025-06-30', 60, 4000000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.7,"annualLimit":800000,"genericOnly":true},"consultation":{"enabled":true,"reimbursementRate":0.65,"annualLimit":400000,"specialities":["general"]},"hospitalization":{"enabled":true,"reimbursementRate":0.8,"annualLimit":2500000,"roomType":"standard"},"lab":{"enabled":true,"reimbursementRate":0.7,"annualLimit":300000}}', '["dental","optical"]', 'active');

-- Suspended contracts (5)
INSERT INTO contracts (id, insurer_id, adherent_id, contract_number, plan_type, start_date, end_date, carence_days, annual_limit, coverage_json, exclusions_json, status) VALUES
('01JCVMKB1PP2N3X4Y5Z6A7B8R4', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', '01JCVMKA1PP2N3X4Y5Z6A7B8R4', 'STAR-2024-00005', 'individual', '2024-01-01', '2024-12-31', 30, 5000000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.8,"annualLimit":1000000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.7,"annualLimit":500000,"specialities":["general"]},"hospitalization":{"enabled":true,"reimbursementRate":0.9,"annualLimit":3000000,"roomType":"standard"},"lab":{"enabled":true,"reimbursementRate":0.75,"annualLimit":500000}}', '[]', 'suspended'),
('01JCVMKB1QP2N3X4Y5Z6A7B8S5', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', '01JCVMKA1QP2N3X4Y5Z6A7B8S5', 'GAT-2024-00005', 'individual', '2024-02-01', '2025-01-31', 30, 4000000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.75,"annualLimit":800000,"genericOnly":true},"consultation":{"enabled":true,"reimbursementRate":0.7,"annualLimit":400000,"specialities":["general"]},"hospitalization":{"enabled":true,"reimbursementRate":0.85,"annualLimit":2500000,"roomType":"standard"},"lab":{"enabled":true,"reimbursementRate":0.7,"annualLimit":300000}}', '[]', 'suspended');

-- Expired contracts (5)
INSERT INTO contracts (id, insurer_id, adherent_id, contract_number, plan_type, start_date, end_date, carence_days, annual_limit, coverage_json, exclusions_json, status) VALUES
('01JCVMKB1RP2N3X4Y5Z6A7B8T6', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', '01JCVMKA1RP2N3X4Y5Z6A7B8T6', 'STAR-2023-00001', 'individual', '2023-01-01', '2023-12-31', 30, 4500000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.75,"annualLimit":900000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.65,"annualLimit":450000,"specialities":["general"]},"hospitalization":{"enabled":true,"reimbursementRate":0.85,"annualLimit":2700000,"roomType":"standard"},"lab":{"enabled":true,"reimbursementRate":0.7,"annualLimit":450000}}', '[]', 'expired'),
('01JCVMKB1SP2N3X4Y5Z6A7B8U7', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', '01JCVMKA1SP2N3X4Y5Z6A7B8U7', 'GAT-2023-00001', 'family', '2023-01-01', '2023-12-31', 15, 9000000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.8,"annualLimit":1800000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.75,"annualLimit":900000,"specialities":["general","cardiology"]},"hospitalization":{"enabled":true,"reimbursementRate":0.9,"annualLimit":5400000,"roomType":"private"},"lab":{"enabled":true,"reimbursementRate":0.75,"annualLimit":900000}}', '[]', 'expired'),
('01JCVMKB1TP2N3X4Y5Z6A7B8V8', '01JCVMK8R7P2N3X4Y5Z6A7B8E1', '01JCVMKA1TP2N3X4Y5Z6A7B8V8', 'COMAR-2023-00001', 'individual', '2023-03-01', '2024-02-28', 45, 5500000, '{"pharmacy":{"enabled":true,"reimbursementRate":0.8,"annualLimit":1100000,"genericOnly":false},"consultation":{"enabled":true,"reimbursementRate":0.75,"annualLimit":550000,"specialities":["general"]},"hospitalization":{"enabled":true,"reimbursementRate":0.9,"annualLimit":3600000,"roomType":"standard"},"lab":{"enabled":true,"reimbursementRate":0.8,"annualLimit":550000}}', '[]', 'expired');

-- ============================================
-- USERS (15 system users)
-- Note: Password hash is for "dhamen123" - bcrypt compatible
-- ============================================

INSERT INTO users (id, email, password_hash, role, provider_id, insurer_id, first_name, last_name, phone, mfa_enabled, is_active) VALUES
-- Admin
('01JCVMKC1AP2N3X4Y5Z6A7B8C9', 'admin@dhamen.tn', '$2a$10$rQnM1vPpPuTKpKqKpKqKpuK1vPpPuTKpKqKpKqKpuK1vPpPuTKpKq', 'ADMIN', NULL, NULL, 'Admin', 'Dhamen', '+21671000000', 0, 1),

-- Insurer Admins (4)
('01JCVMKC1BP2N3X4Y5Z6A7B8D0', 'admin@star.com.tn', '$2a$10$rQnM1vPpPuTKpKqKpKqKpuK1vPpPuTKpKqKpKqKpuK1vPpPuTKpKq', 'INSURER_ADMIN', NULL, '01JCVMK8R7P2N3X4Y5Z6A7B8C9', 'Kamel', 'Ben Amor', '+21671840841', 0, 1),
('01JCVMKC1CP2N3X4Y5Z6A7B8E1', 'admin@gat.com.tn', '$2a$10$rQnM1vPpPuTKpKqKpKqKpuK1vPpPuTKpKqKpKqKpuK1vPpPuTKpKq', 'INSURER_ADMIN', NULL, '01JCVMK8R7P2N3X4Y5Z6A7B8D0', 'Sami', 'Gharbi', '+21671350351', 0, 1),
('01JCVMKC1DP2N3X4Y5Z6A7B8F2', 'admin@comar.com.tn', '$2a$10$rQnM1vPpPuTKpKqKpKqKpuK1vPpPuTKpKqKpKqKpuK1vPpPuTKpKq', 'INSURER_ADMIN', NULL, '01JCVMK8R7P2N3X4Y5Z6A7B8E1', 'Riadh', 'Mejri', '+21671790791', 0, 1),
('01JCVMKC1EP2N3X4Y5Z6A7B8G3', 'admin@ami.com.tn', '$2a$10$rQnM1vPpPuTKpKqKpKqKpuK1vPpPuTKpKqKpKqKpuK1vPpPuTKpKq', 'INSURER_ADMIN', NULL, '01JCVMK8R7P2N3X4Y5Z6A7B8F2', 'Mourad', 'Chaabane', '+21671284285', 0, 1),

-- Pharmacists (4)
('01JCVMKC1FP2N3X4Y5Z6A7B8H4', 'pharma.centrale@email.tn', '$2a$10$rQnM1vPpPuTKpKqKpKqKpuK1vPpPuTKpKqKpKqKpuK1vPpPuTKpKq', 'PHARMACIST', '01JCVMK9A1P2N3X4Y5Z6A7B8C9', NULL, 'Nabil', 'Hamdouni', '+21698111001', 0, 1),
('01JCVMKC1GP2N3X4Y5Z6A7B8I5', 'pharma.sahel@email.tn', '$2a$10$rQnM1vPpPuTKpKqKpKqKpuK1vPpPuTKpKqKpKqKpuK1vPpPuTKpKq', 'PHARMACIST', '01JCVMK9A2P2N3X4Y5Z6A7B8D0', NULL, 'Olfa', 'Mansouri', '+21698222002', 0, 1),
('01JCVMKC1HP2N3X4Y5Z6A7B8J6', 'pharma.sousse@email.tn', '$2a$10$rQnM1vPpPuTKpKqKpKqKpuK1vPpPuTKpKqKpKqKpuK1vPpPuTKpKq', 'PHARMACIST', '01JCVMK9A3P2N3X4Y5Z6A7B8E1', NULL, 'Tarek', 'Fakhfakh', '+21698333003', 0, 1),
('01JCVMKC1IP2N3X4Y5Z6A7B8K7', 'pharma.monastir@email.tn', '$2a$10$rQnM1vPpPuTKpKqKpKqKpuK1vPpPuTKpKqKpKqKpuK1vPpPuTKpKq', 'PHARMACIST', '01JCVMK9A4P2N3X4Y5Z6A7B8F2', NULL, 'Wafa', 'Khelifi', '+21698444004', 0, 1),

-- Doctors (3)
('01JCVMKC1JP2N3X4Y5Z6A7B8L8', 'dr.benali@email.tn', '$2a$10$rQnM1vPpPuTKpKqKpKqKpuK1vPpPuTKpKqKpKqKpuK1vPpPuTKpKq', 'DOCTOR', '01JCVMK9B1P2N3X4Y5Z6A7B8C9', NULL, 'Mehdi', 'Ben Ali', '+21698555005', 0, 1),
('01JCVMKC1KP2N3X4Y5Z6A7B8M9', 'dr.trabelsi@email.tn', '$2a$10$rQnM1vPpPuTKpKqKpKqKpuK1vPpPuTKpKqKpKqKpuK1vPpPuTKpKq', 'DOCTOR', '01JCVMK9B2P2N3X4Y5Z6A7B8D0', NULL, 'Amel', 'Trabelsi', '+21698666006', 0, 1),
('01JCVMKC1LP2N3X4Y5Z6A7B8N0', 'dr.bouazizi@email.tn', '$2a$10$rQnM1vPpPuTKpKqKpKqKpuK1vPpPuTKpKqKpKqKpuK1vPpPuTKpKq', 'DOCTOR', '01JCVMK9B3P2N3X4Y5Z6A7B8E1', NULL, 'Sofien', 'Bouazizi', '+21698777007', 0, 1),

-- Lab Managers (2)
('01JCVMKC1MP2N3X4Y5Z6A7B8O1', 'labo.central@email.tn', '$2a$10$rQnM1vPpPuTKpKqKpKqKpuK1vPpPuTKpKqKpKqKpuK1vPpPuTKpKq', 'LAB_MANAGER', '01JCVMK9C1P2N3X4Y5Z6A7B8C9', NULL, 'Lamia', 'Jomaa', '+21698888008', 0, 1),
('01JCVMKC1NP2N3X4Y5Z6A7B8P2', 'labo.elmanar@email.tn', '$2a$10$rQnM1vPpPuTKpKqKpKqKpuK1vPpPuTKpKqKpKqKpuK1vPpPuTKpKq', 'LAB_MANAGER', '01JCVMK9C2P2N3X4Y5Z6A7B8D0', NULL, 'Bilel', 'Sassi', '+21698999009', 0, 1),

-- Clinic Admin (1)
('01JCVMKC1OP2N3X4Y5Z6A7B8Q3', 'clinique.oliviers@email.tn', '$2a$10$rQnM1vPpPuTKpKqKpKqKpuK1vPpPuTKpKqKpKqKpuK1vPpPuTKpKq', 'CLINIC_ADMIN', '01JCVMK9D1P2N3X4Y5Z6A7B8C9', NULL, 'Hajer', 'Slim', '+21698000010', 0, 1);

-- ============================================
-- CONVENTIONS (Provider-Insurer agreements)
-- ============================================

INSERT INTO conventions (id, insurer_id, provider_id, bareme_json, start_date, end_date, is_active) VALUES
-- STAR conventions
('01JCVMKD1AP2N3X4Y5Z6A7B8C9', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', '01JCVMK9A1P2N3X4Y5Z6A7B8C9', '{"version":"2024.1","defaultRate":0.8,"categoryRates":{"pharmacy":0.8,"consultation":0.7,"lab":0.75},"items":[],"caps":{"perCategory":{},"perEvent":500000,"annual":null},"franchise":10000}', '2024-01-01', NULL, 1),
('01JCVMKD1BP2N3X4Y5Z6A7B8D0', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', '01JCVMK9B1P2N3X4Y5Z6A7B8C9', '{"version":"2024.1","defaultRate":0.7,"categoryRates":{"consultation":0.7},"items":[],"caps":{"perCategory":{},"perEvent":200000,"annual":null},"franchise":5000}', '2024-01-01', NULL, 1),
('01JCVMKD1CP2N3X4Y5Z6A7B8E1', '01JCVMK8R7P2N3X4Y5Z6A7B8C9', '01JCVMK9C1P2N3X4Y5Z6A7B8C9', '{"version":"2024.1","defaultRate":0.75,"categoryRates":{"lab":0.75},"items":[],"caps":{"perCategory":{},"perEvent":300000,"annual":null},"franchise":0}', '2024-01-01', NULL, 1),
-- GAT conventions
('01JCVMKD1DP2N3X4Y5Z6A7B8F2', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', '01JCVMK9A2P2N3X4Y5Z6A7B8D0', '{"version":"2024.1","defaultRate":0.75,"categoryRates":{"pharmacy":0.75},"items":[],"caps":{"perCategory":{},"perEvent":400000,"annual":null},"franchise":15000}', '2024-01-01', NULL, 1),
('01JCVMKD1EP2N3X4Y5Z6A7B8G3', '01JCVMK8R7P2N3X4Y5Z6A7B8D0', '01JCVMK9B3P2N3X4Y5Z6A7B8E1', '{"version":"2024.1","defaultRate":0.7,"categoryRates":{"consultation":0.7},"items":[],"caps":{"perCategory":{},"perEvent":180000,"annual":null},"franchise":5000}', '2024-01-01', NULL, 1),
-- COMAR conventions
('01JCVMKD1FP2N3X4Y5Z6A7B8H4', '01JCVMK8R7P2N3X4Y5Z6A7B8E1', '01JCVMK9A3P2N3X4Y5Z6A7B8E1', '{"version":"2024.1","defaultRate":0.8,"categoryRates":{"pharmacy":0.8},"items":[],"caps":{"perCategory":{},"perEvent":450000,"annual":null},"franchise":10000}', '2024-01-01', NULL, 1),
('01JCVMKD1GP2N3X4Y5Z6A7B8I5', '01JCVMK8R7P2N3X4Y5Z6A7B8E1', '01JCVMK9D1P2N3X4Y5Z6A7B8C9', '{"version":"2024.1","defaultRate":0.9,"categoryRates":{"hospitalization":0.9},"items":[],"caps":{"perCategory":{},"perEvent":2000000,"annual":null},"franchise":50000}', '2024-01-01', NULL, 1),
-- AMI conventions
('01JCVMKD1HP2N3X4Y5Z6A7B8J6', '01JCVMK8R7P2N3X4Y5Z6A7B8F2', '01JCVMK9A4P2N3X4Y5Z6A7B8F2', '{"version":"2024.1","defaultRate":0.7,"categoryRates":{"pharmacy":0.7},"items":[],"caps":{"perCategory":{},"perEvent":350000,"annual":null},"franchise":20000}', '2024-01-01', NULL, 1),
('01JCVMKD1IP2N3X4Y5Z6A7B8K7', '01JCVMK8R7P2N3X4Y5Z6A7B8F2', '01JCVMK9D2P2N3X4Y5Z6A7B8D0', '{"version":"2024.1","defaultRate":0.85,"categoryRates":{"hospitalization":0.85},"items":[],"caps":{"perCategory":{},"perEvent":1800000,"annual":null},"franchise":40000}', '2024-01-01', NULL, 1);
