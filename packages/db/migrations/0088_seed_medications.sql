-- Seed medications courantes en Tunisie (source: PCT / officines)
-- Prices in millimes (1 DT = 1000 millimes)

INSERT OR IGNORE INTO medications (id, code_pct, code_cnam, dci, brand_name, dosage, form, packaging, family_id, laboratory, country_origin, price_public, price_hospital, price_reference, is_generic, is_reimbursable, reimbursement_rate, requires_prescription, is_controlled, is_active, created_at, updated_at)
VALUES
-- ATB - Antibiotiques (mf_001)
('med_001', 'PCT-AMX500', 'CNAM-001', 'Amoxicilline', 'Clamoxyl', '500mg', 'gelule', 'Boite de 12', 'mf_001', 'Sanofi', 'France', 8500, 6800, 7500, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_002', 'PCT-AMX1G', 'CNAM-002', 'Amoxicilline', 'Clamoxyl', '1g', 'comprime', 'Boite de 12', 'mf_001', 'Sanofi', 'France', 12500, 10000, 11000, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_003', 'PCT-AMXCLV', 'CNAM-003', 'Amoxicilline/Ac. clavulanique', 'Augmentin', '1g/125mg', 'comprime', 'Boite de 12', 'mf_001', 'GSK', 'France', 18900, 15000, 16000, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_004', 'PCT-AZT500', 'CNAM-004', 'Azithromycine', 'Zithromax', '500mg', 'comprime', 'Boite de 3', 'mf_001', 'Pfizer', 'USA', 15200, 12000, 13000, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_005', 'PCT-CIPRO', 'CNAM-005', 'Ciprofloxacine', 'Ciproxine', '500mg', 'comprime', 'Boite de 10', 'mf_001', 'Bayer', 'Allemagne', 14800, 11800, 13000, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_006', 'PCT-AMXG', NULL, 'Amoxicilline', 'Amoxil', '500mg', 'gelule', 'Boite de 12', 'mf_001', 'Medis', 'Tunisie', 4200, 3400, 3800, 1, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_007', 'PCT-METRO', 'CNAM-007', 'Metronidazole', 'Flagyl', '500mg', 'comprime', 'Boite de 20', 'mf_001', 'Sanofi', 'France', 6800, 5400, 6000, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),

-- AIF - Anti-inflammatoires (mf_003)
('med_010', 'PCT-IBU400', 'CNAM-010', 'Ibuprofene', 'Brufen', '400mg', 'comprime', 'Boite de 30', 'mf_003', 'Abbott', 'UK', 7200, 5800, 6400, 0, 1, 0.9, 0, 0, 1, datetime('now'), datetime('now')),
('med_011', 'PCT-DICLO', 'CNAM-011', 'Diclofenac', 'Voltarene', '50mg', 'comprime', 'Boite de 30', 'mf_003', 'Novartis', 'Suisse', 8900, 7100, 7800, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_012', 'PCT-KETOP', 'CNAM-012', 'Ketoprofene', 'Profenid', '100mg', 'comprime', 'Boite de 20', 'mf_003', 'Sanofi', 'France', 9500, 7600, 8400, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_013', 'PCT-PRED', 'CNAM-013', 'Prednisolone', 'Solupred', '20mg', 'comprime', 'Boite de 20', 'mf_003', 'Sanofi', 'France', 6500, 5200, 5800, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_014', 'PCT-IBUG', NULL, 'Ibuprofene', 'Ibumed', '400mg', 'comprime', 'Boite de 30', 'mf_003', 'Medis', 'Tunisie', 3500, 2800, 3200, 1, 1, 0.9, 0, 0, 1, datetime('now'), datetime('now')),

-- ANT - Antalgiques (mf_004)
('med_020', 'PCT-PARA500', 'CNAM-020', 'Paracetamol', 'Doliprane', '500mg', 'comprime', 'Boite de 16', 'mf_004', 'Sanofi', 'France', 3200, 2600, 2800, 0, 1, 0.9, 0, 0, 1, datetime('now'), datetime('now')),
('med_021', 'PCT-PARA1G', 'CNAM-021', 'Paracetamol', 'Doliprane', '1g', 'comprime', 'Boite de 8', 'mf_004', 'Sanofi', 'France', 4500, 3600, 4000, 0, 1, 0.9, 0, 0, 1, datetime('now'), datetime('now')),
('med_022', 'PCT-PARAG', NULL, 'Paracetamol', 'Paramed', '500mg', 'comprime', 'Boite de 16', 'mf_004', 'Medis', 'Tunisie', 1800, 1400, 1600, 1, 1, 0.9, 0, 0, 1, datetime('now'), datetime('now')),
('med_023', 'PCT-TRAMA', 'CNAM-023', 'Tramadol', 'Contramal', '50mg', 'gelule', 'Boite de 20', 'mf_004', 'Grunenthal', 'Allemagne', 11500, 9200, 10000, 0, 1, 0.9, 1, 1, 1, datetime('now'), datetime('now')),
('med_024', 'PCT-CODOL', 'CNAM-024', 'Paracetamol/Codeine', 'Dafalgan Codeine', '500mg/30mg', 'comprime', 'Boite de 16', 'mf_004', 'UPSA', 'France', 8700, 7000, 7600, 0, 1, 0.9, 1, 1, 1, datetime('now'), datetime('now')),

-- CVS - Cardiovasculaire (mf_005)
('med_030', 'PCT-AMLO5', 'CNAM-030', 'Amlodipine', 'Amlor', '5mg', 'gelule', 'Boite de 30', 'mf_005', 'Pfizer', 'France', 16800, 13400, 14800, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_031', 'PCT-LOSAR', 'CNAM-031', 'Losartan', 'Cozaar', '50mg', 'comprime', 'Boite de 28', 'mf_005', 'MSD', 'USA', 22500, 18000, 20000, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_032', 'PCT-ATOR', 'CNAM-032', 'Atorvastatine', 'Tahor', '20mg', 'comprime', 'Boite de 28', 'mf_005', 'Pfizer', 'France', 28500, 22800, 25000, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_033', 'PCT-BISOP', 'CNAM-033', 'Bisoprolol', 'Concor', '5mg', 'comprime', 'Boite de 30', 'mf_005', 'Merck', 'Allemagne', 14200, 11400, 12500, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_034', 'PCT-ASPIR', 'CNAM-034', 'Acide acetylsalicylique', 'Aspegic', '100mg', 'sachet', 'Boite de 30', 'mf_005', 'Sanofi', 'France', 6200, 5000, 5500, 0, 1, 0.9, 0, 0, 1, datetime('now'), datetime('now')),

-- DIA - Antidiabetiques (mf_006)
('med_040', 'PCT-METF500', 'CNAM-040', 'Metformine', 'Glucophage', '500mg', 'comprime', 'Boite de 30', 'mf_006', 'Merck', 'France', 5800, 4600, 5200, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_041', 'PCT-METF850', 'CNAM-041', 'Metformine', 'Glucophage', '850mg', 'comprime', 'Boite de 30', 'mf_006', 'Merck', 'France', 8200, 6600, 7200, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_042', 'PCT-GLIC', 'CNAM-042', 'Gliclazide', 'Diamicron MR', '60mg', 'comprime', 'Boite de 30', 'mf_006', 'Servier', 'France', 19500, 15600, 17000, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_043', 'PCT-INSLN', 'CNAM-043', 'Insuline Glargine', 'Lantus', '100UI/ml', 'injectable', 'Stylo 3ml x5', 'mf_006', 'Sanofi', 'France', 85000, 68000, 75000, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),

-- GAS - Gastro-enterologie (mf_007)
('med_050', 'PCT-OMEP', 'CNAM-050', 'Omeprazole', 'Mopral', '20mg', 'gelule', 'Boite de 14', 'mf_007', 'AstraZeneca', 'France', 12800, 10200, 11200, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_051', 'PCT-ESOME', 'CNAM-051', 'Esomeprazole', 'Inexium', '40mg', 'comprime', 'Boite de 14', 'mf_007', 'AstraZeneca', 'France', 18500, 14800, 16200, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_052', 'PCT-DOMPE', 'CNAM-052', 'Domperidone', 'Motilium', '10mg', 'comprime', 'Boite de 30', 'mf_007', 'Janssen', 'Belgique', 7500, 6000, 6600, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_053', 'PCT-SMECT', 'CNAM-053', 'Diosmectite', 'Smecta', '3g', 'sachet', 'Boite de 30', 'mf_007', 'Ipsen', 'France', 9200, 7400, 8100, 0, 1, 0.9, 0, 0, 1, datetime('now'), datetime('now')),

-- PNE - Pneumologie (mf_008)
('med_060', 'PCT-SALBU', 'CNAM-060', 'Salbutamol', 'Ventoline', '100mcg', 'aerosol', 'Flacon 200 doses', 'mf_008', 'GSK', 'UK', 8500, 6800, 7500, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_061', 'PCT-BECLO', 'CNAM-061', 'Beclometasone', 'Becotide', '250mcg', 'aerosol', 'Flacon 200 doses', 'mf_008', 'GSK', 'UK', 14500, 11600, 12800, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_062', 'PCT-DESLO', 'CNAM-062', 'Desloratadine', 'Aerius', '5mg', 'comprime', 'Boite de 30', 'mf_008', 'MSD', 'USA', 16200, 13000, 14200, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),

-- NEU - Neurologie-Psychiatrie (mf_009)
('med_070', 'PCT-ALPRA', 'CNAM-070', 'Alprazolam', 'Xanax', '0.25mg', 'comprime', 'Boite de 30', 'mf_009', 'Pfizer', 'France', 7800, 6200, 6900, 0, 1, 0.9, 1, 1, 1, datetime('now'), datetime('now')),
('med_071', 'PCT-SERT', 'CNAM-071', 'Sertraline', 'Zoloft', '50mg', 'comprime', 'Boite de 28', 'mf_009', 'Pfizer', 'France', 22800, 18200, 20000, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_072', 'PCT-GABAP', 'CNAM-072', 'Gabapentine', 'Neurontin', '300mg', 'gelule', 'Boite de 30', 'mf_009', 'Pfizer', 'France', 25500, 20400, 22400, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),

-- DER - Dermatologie (mf_010)
('med_080', 'PCT-FUSI', 'CNAM-080', 'Acide fusidique', 'Fucidine', '2%', 'creme', 'Tube 15g', 'mf_010', 'LEO Pharma', 'Danemark', 9800, 7800, 8600, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),
('med_081', 'PCT-BETA', 'CNAM-081', 'Betamethasone', 'Diprosone', '0.05%', 'creme', 'Tube 30g', 'mf_010', 'MSD', 'France', 7200, 5800, 6400, 0, 1, 0.9, 1, 0, 1, datetime('now'), datetime('now')),

-- VIT - Vitamines (mf_017)
('med_090', 'PCT-VITD', 'CNAM-090', 'Cholecalciferol', 'Uvedose', '100000UI', 'ampoule', 'Boite de 1', 'mf_017', 'Crinex', 'France', 5500, 4400, 4800, 0, 1, 0.9, 0, 0, 1, datetime('now'), datetime('now')),
('med_091', 'PCT-FER', 'CNAM-091', 'Fer + Acide folique', 'Tardyferon', '80mg', 'comprime', 'Boite de 30', 'mf_017', 'Pierre Fabre', 'France', 8900, 7100, 7800, 0, 1, 0.9, 0, 0, 1, datetime('now'), datetime('now')),
('med_092', 'PCT-VITC', NULL, 'Acide ascorbique', 'Vitamine C', '500mg', 'comprime effervescent', 'Tube de 20', 'mf_017', 'UPSA', 'France', 4800, 3800, 4200, 0, 1, 0.9, 0, 0, 1, datetime('now'), datetime('now')),

-- NON REMBOURSABLES (produits hors convention)
('med_100', 'PCT-LAIT', NULL, 'Lait infantile', 'Guigoz', NULL, 'poudre', 'Boite 800g', NULL, 'Nestle', 'France', 35000, NULL, NULL, 0, 0, 0, 0, 0, 1, datetime('now'), datetime('now')),
('med_101', 'PCT-HYGEL', NULL, 'Gel hydroalcoolique', 'Baccide', NULL, 'gel', 'Flacon 300ml', NULL, 'Cooper', 'France', 12000, NULL, NULL, 0, 0, 0, 0, 0, 1, datetime('now'), datetime('now')),
('med_102', 'PCT-SERING', NULL, 'Seringue usage unique', 'BD Plastipak', '5ml', 'seringue', 'Boite de 100', NULL, 'BD', 'USA', 25000, NULL, NULL, 0, 0, 0, 0, 0, 1, datetime('now'), datetime('now')),
('med_103', 'PCT-THERMO', NULL, 'Thermometre digital', 'Hartmann', NULL, 'dispositif', 'Unite', NULL, 'Hartmann', 'Allemagne', 15000, NULL, NULL, 0, 0, 0, 0, 0, 1, datetime('now'), datetime('now')),
('med_104', 'PCT-CONTRC', NULL, 'Levonorgestrel/Ethinylestradiol', 'Minidril', '0.15mg/0.03mg', 'comprime', 'Plaquette 21', 'mf_013', 'Pfizer', 'France', 4500, 3600, NULL, 0, 0, 0, 1, 0, 1, datetime('now'), datetime('now'));
