-- Seed medications avec des médicaments courants en Tunisie (source: PCT)
-- Prix en millimes (1 DT = 1000 millimes)

INSERT OR IGNORE INTO medications (id, code_pct, dci, brand_name, dosage, form, packaging, family_id, laboratory, country_origin, price_public, price_hospital, is_generic, is_reimbursable, reimbursement_rate, requires_prescription, is_controlled, is_active, created_at, updated_at)
VALUES
-- Antalgiques (mf_004)
('med_001', 'PCT0001', 'Paracétamol', 'Doliprane', '500mg', 'Comprimé', 'Boîte de 16', 'mf_004', 'Sanofi', 'France', 3200, 2500, 0, 1, 0.7, 0, 0, 1, datetime('now'), datetime('now')),
('med_002', 'PCT0002', 'Paracétamol', 'Efferalgan', '1000mg', 'Comprimé effervescent', 'Boîte de 8', 'mf_004', 'UPSA', 'France', 4500, 3500, 0, 1, 0.7, 0, 0, 1, datetime('now'), datetime('now')),
('med_003', 'PCT0003', 'Paracétamol', 'Paramol', '500mg', 'Comprimé', 'Boîte de 20', 'mf_004', 'Medis', 'Tunisie', 1800, 1200, 1, 1, 0.7, 0, 0, 1, datetime('now'), datetime('now')),
('med_004', 'PCT0004', 'Ibuprofène', 'Brufen', '400mg', 'Comprimé', 'Boîte de 30', 'mf_004', 'Abbott', 'UK', 5600, 4200, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_005', 'PCT0005', 'Ibuprofène', 'Ibuphar', '200mg', 'Comprimé', 'Boîte de 20', 'mf_004', 'Pharmaghreb', 'Tunisie', 2400, 1800, 1, 1, 0.7, 0, 0, 1, datetime('now'), datetime('now')),
('med_006', 'PCT0006', 'Paracétamol + Codéine', 'Codoliprane', '400mg/20mg', 'Comprimé', 'Boîte de 16', 'mf_004', 'Sanofi', 'France', 6800, 5200, 0, 1, 0.7, 1, 1, 1, datetime('now'), datetime('now')),

-- Antibiotiques (mf_001)
('med_007', 'PCT0007', 'Amoxicilline', 'Clamoxyl', '500mg', 'Gélule', 'Boîte de 12', 'mf_001', 'GSK', 'France', 5200, 4000, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_008', 'PCT0008', 'Amoxicilline', 'Gramidil', '500mg', 'Gélule', 'Boîte de 12', 'mf_001', 'Medis', 'Tunisie', 3100, 2400, 1, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_009', 'PCT0009', 'Amoxicilline + Acide clavulanique', 'Augmentin', '1g/125mg', 'Comprimé', 'Boîte de 12', 'mf_001', 'GSK', 'France', 12500, 9800, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_010', 'PCT0010', 'Azithromycine', 'Zithromax', '500mg', 'Comprimé', 'Boîte de 3', 'mf_001', 'Pfizer', 'USA', 15200, 12000, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_011', 'PCT0011', 'Ciprofloxacine', 'Ciproxine', '500mg', 'Comprimé', 'Boîte de 10', 'mf_001', 'Bayer', 'Allemagne', 8900, 7000, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_012', 'PCT0012', 'Céfixime', 'Oroken', '200mg', 'Comprimé', 'Boîte de 8', 'mf_001', 'Sanofi', 'France', 14800, 11500, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),

-- Anti-inflammatoires (mf_003)
('med_013', 'PCT0013', 'Diclofénac', 'Voltarène', '50mg', 'Comprimé', 'Boîte de 30', 'mf_003', 'Novartis', 'Suisse', 6200, 4800, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_014', 'PCT0014', 'Diclofénac', 'Dicloged', '50mg', 'Comprimé', 'Boîte de 20', 'mf_003', 'Unimed', 'Tunisie', 3500, 2700, 1, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_015', 'PCT0015', 'Kétoprofène', 'Profénid', '100mg', 'Comprimé', 'Boîte de 14', 'mf_003', 'Sanofi', 'France', 7800, 6000, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_016', 'PCT0016', 'Prednisolone', 'Solupred', '20mg', 'Comprimé', 'Boîte de 20', 'mf_003', 'Sanofi', 'France', 5400, 4200, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),

-- Cardiovasculaire (mf_005)
('med_017', 'PCT0017', 'Amlodipine', 'Amlor', '5mg', 'Gélule', 'Boîte de 30', 'mf_005', 'Pfizer', 'France', 12800, 10000, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_018', 'PCT0018', 'Losartan', 'Cozaar', '50mg', 'Comprimé', 'Boîte de 28', 'mf_005', 'MSD', 'USA', 18500, 14500, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_019', 'PCT0019', 'Atorvastatine', 'Tahor', '20mg', 'Comprimé', 'Boîte de 30', 'mf_005', 'Pfizer', 'France', 22000, 17000, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_020', 'PCT0020', 'Acide acétylsalicylique', 'Aspégic', '100mg', 'Sachet', 'Boîte de 30', 'mf_005', 'Sanofi', 'France', 4200, 3200, 0, 1, 0.7, 0, 0, 1, datetime('now'), datetime('now')),
('med_021', 'PCT0021', 'Bisoprolol', 'Concor', '5mg', 'Comprimé', 'Boîte de 30', 'mf_005', 'Merck', 'Allemagne', 15600, 12000, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),

-- Antidiabétiques (mf_006)
('med_022', 'PCT0022', 'Metformine', 'Glucophage', '850mg', 'Comprimé', 'Boîte de 30', 'mf_006', 'Merck', 'France', 5800, 4500, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_023', 'PCT0023', 'Metformine', 'Diaformine', '500mg', 'Comprimé', 'Boîte de 30', 'mf_006', 'Saiph', 'Tunisie', 2900, 2200, 1, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_024', 'PCT0024', 'Glimépéride', 'Amarel', '2mg', 'Comprimé', 'Boîte de 30', 'mf_006', 'Sanofi', 'France', 11200, 8800, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_025', 'PCT0025', 'Insuline Glargine', 'Lantus', '100UI/ml', 'Stylo pré-rempli', 'Boîte de 5 stylos', 'mf_006', 'Sanofi', 'France', 85000, 68000, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),

-- Gastro-entérologie (mf_007)
('med_026', 'PCT0026', 'Oméprazole', 'Mopral', '20mg', 'Gélule', 'Boîte de 14', 'mf_007', 'AstraZeneca', 'Suède', 9800, 7500, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_027', 'PCT0027', 'Oméprazole', 'Omepral', '20mg', 'Gélule', 'Boîte de 14', 'mf_007', 'Saiph', 'Tunisie', 4500, 3500, 1, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_028', 'PCT0028', 'Dompéridone', 'Motilium', '10mg', 'Comprimé', 'Boîte de 30', 'mf_007', 'Janssen', 'Belgique', 6400, 5000, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_029', 'PCT0029', 'Lopéramide', 'Imodium', '2mg', 'Gélule', 'Boîte de 20', 'mf_007', 'Janssen', 'Belgique', 4800, 3700, 0, 1, 0.7, 0, 0, 1, datetime('now'), datetime('now')),

-- Pneumologie (mf_008)
('med_030', 'PCT0030', 'Salbutamol', 'Ventoline', '100µg/dose', 'Aérosol', 'Flacon 200 doses', 'mf_008', 'GSK', 'UK', 7200, 5600, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_031', 'PCT0031', 'Ambroxol', 'Mucosolvan', '30mg', 'Comprimé', 'Boîte de 20', 'mf_008', 'Boehringer', 'Allemagne', 5100, 4000, 0, 1, 0.7, 0, 0, 1, datetime('now'), datetime('now')),
('med_032', 'PCT0032', 'Acétylcystéine', 'Fluimucil', '200mg', 'Sachet', 'Boîte de 30', 'mf_008', 'Zambon', 'Italie', 8600, 6700, 0, 1, 0.7, 0, 0, 1, datetime('now'), datetime('now')),

-- Neurologie-Psychiatrie (mf_009)
('med_033', 'PCT0033', 'Alprazolam', 'Xanax', '0.25mg', 'Comprimé', 'Boîte de 30', 'mf_009', 'Pfizer', 'France', 6500, 5000, 0, 1, 0.7, 1, 1, 1, datetime('now'), datetime('now')),
('med_034', 'PCT0034', 'Amitriptyline', 'Laroxyl', '25mg', 'Comprimé', 'Boîte de 30', 'mf_009', 'Sanofi', 'France', 4800, 3700, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),

-- Dermatologie (mf_010)
('med_035', 'PCT0035', 'Bétaméthasone', 'Diprosone', '0.05%', 'Crème', 'Tube 30g', 'mf_010', 'MSD', 'France', 5900, 4600, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),
('med_036', 'PCT0036', 'Acide fusidique', 'Fucidine', '2%', 'Crème', 'Tube 15g', 'mf_010', 'LEO Pharma', 'Danemark', 7300, 5700, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),

-- Ophtalmologie (mf_011)
('med_037', 'PCT0037', 'Tobramycine', 'Tobrex', '0.3%', 'Collyre', 'Flacon 5ml', 'mf_011', 'Novartis', 'Suisse', 8200, 6400, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),

-- ORL (mf_012)
('med_038', 'PCT0038', 'Pseudoéphédrine + Triprolidine', 'Actifed', '', 'Comprimé', 'Boîte de 15', 'mf_012', 'GSK', 'France', 5100, 4000, 0, 1, 0.7, 0, 0, 1, datetime('now'), datetime('now')),

-- Vitamines-Suppléments (mf_017)
('med_039', 'PCT0039', 'Vitamine D3', 'Uvesterol D', '100000UI', 'Ampoule', 'Boîte de 1', 'mf_017', 'Crinex', 'France', 3800, 2900, 0, 1, 0.7, 0, 0, 1, datetime('now'), datetime('now')),
('med_040', 'PCT0040', 'Fer + Acide folique', 'Tardyferon', '80mg', 'Comprimé', 'Boîte de 30', 'mf_017', 'Pierre Fabre', 'France', 9200, 7200, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),

-- Rhumatologie (mf_015)
('med_041', 'PCT0041', 'Colchicine', 'Colchimax', '1mg', 'Comprimé', 'Boîte de 20', 'mf_015', 'Sanofi', 'France', 4600, 3500, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),

-- Antiviraux (mf_002)
('med_042', 'PCT0042', 'Aciclovir', 'Zovirax', '200mg', 'Comprimé', 'Boîte de 25', 'mf_002', 'GSK', 'UK', 18900, 14800, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),

-- Gynécologie (mf_013)
('med_043', 'PCT0043', 'Progestérone', 'Utrogestan', '200mg', 'Capsule', 'Boîte de 15', 'mf_013', 'Besins', 'France', 14500, 11200, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),

-- Urologie (mf_014)
('med_044', 'PCT0044', 'Tamsulosine', 'Omix', '0.4mg', 'Gélule LP', 'Boîte de 30', 'mf_014', 'Astellas', 'Japon', 25000, 19500, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now')),

-- Hématologie (mf_016)
('med_045', 'PCT0045', 'Enoxaparine', 'Lovenox', '4000UI', 'Seringue', 'Boîte de 2', 'mf_016', 'Sanofi', 'France', 32000, 25000, 0, 1, 0.7, 1, 0, 1, datetime('now'), datetime('now'));
