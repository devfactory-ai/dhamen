-- Enrichir actes_referentiel avec les champs du format assureur
ALTER TABLE actes_referentiel ADD COLUMN famille_id TEXT REFERENCES familles_actes(id);
ALTER TABLE actes_referentiel ADD COLUMN type_calcul TEXT NOT NULL DEFAULT 'taux'
  CHECK (type_calcul IN ('taux', 'forfait'));
ALTER TABLE actes_referentiel ADD COLUMN valeur_base REAL;
ALTER TABLE actes_referentiel ADD COLUMN code_assureur TEXT;

CREATE INDEX IF NOT EXISTS idx_actes_referentiel_famille ON actes_referentiel(famille_id);
CREATE INDEX IF NOT EXISTS idx_actes_referentiel_code_assureur ON actes_referentiel(code_assureur);

-- Mapper les anciens codes génériques vers les codes assureur
UPDATE actes_referentiel SET code_assureur = 'CONS-GEN', famille_id = 'fa-001', type_calcul = 'forfait', valeur_base = 45000 WHERE code = 'CONS-GEN';
UPDATE actes_referentiel SET code_assureur = 'CONS-SPE', famille_id = 'fa-001', type_calcul = 'forfait', valeur_base = 55000 WHERE code = 'CONS-SPE';
UPDATE actes_referentiel SET code_assureur = 'RADIO', famille_id = 'fa-017', type_calcul = 'taux' WHERE code = 'RADIO';
UPDATE actes_referentiel SET code_assureur = 'ECHO', famille_id = 'fa-009', type_calcul = 'taux' WHERE code = 'ECHO';
UPDATE actes_referentiel SET code_assureur = 'ANALYSE', famille_id = 'fa-004', type_calcul = 'taux' WHERE code = 'ANALYSE';
UPDATE actes_referentiel SET code_assureur = 'DENT-CONS', famille_id = 'fa-011', type_calcul = 'forfait', valeur_base = 45000 WHERE code = 'DENT-CONS';
UPDATE actes_referentiel SET code_assureur = 'DENT-SOIN', famille_id = 'fa-011', type_calcul = 'taux' WHERE code = 'DENT-SOIN';
UPDATE actes_referentiel SET code_assureur = 'PHARMA', famille_id = 'fa-003', type_calcul = 'taux' WHERE code = 'PHARMA';
UPDATE actes_referentiel SET code_assureur = 'KINE', famille_id = 'fa-009', type_calcul = 'taux' WHERE code = 'KINE';
UPDATE actes_referentiel SET code_assureur = 'HOSP', famille_id = 'fa-007', type_calcul = 'taux' WHERE code = 'HOSP';
UPDATE actes_referentiel SET code_assureur = 'CHIR', famille_id = 'fa-010', type_calcul = 'taux' WHERE code = 'CHIR';
UPDATE actes_referentiel SET code_assureur = 'OPTIQUE', famille_id = 'fa-006', type_calcul = 'taux' WHERE code = 'OPTIQUE';
UPDATE actes_referentiel SET code_assureur = 'MATERNITE', famille_id = 'fa-012', type_calcul = 'taux' WHERE code = 'MATERNITE';
UPDATE actes_referentiel SET code_assureur = 'LABO-SPE', famille_id = 'fa-009', type_calcul = 'taux' WHERE code = 'LABO-SPE';

-- Insérer les codes actes réels du secteur assurance santé tunisien
INSERT INTO actes_referentiel (id, code, label, taux_remboursement, plafond_acte, famille_id, type_calcul, valeur_base, code_assureur) VALUES
  -- FA0001 : Consultations et Visites
  ('acte-c1',  'C1',  'Consultation généraliste',   0.00, 45000,  'fa-001', 'forfait', 45000,  'C1'),
  ('acte-c2',  'C2',  'Consultation spécialiste',   0.00, 55000,  'fa-001', 'forfait', 55000,  'C2'),
  ('acte-c3',  'C3',  'Consultation professeur',    0.00, 55000,  'fa-001', 'forfait', 55000,  'C3'),
  ('acte-v1',  'V1',  'Visite généraliste',         0.00, 50000,  'fa-001', 'forfait', 50000,  'V1'),
  ('acte-v2',  'V2',  'Visite spécialiste',         0.00, 55000,  'fa-001', 'forfait', 55000,  'V2'),
  ('acte-v3',  'V3',  'Visite professeur',          0.00, 55000,  'fa-001', 'forfait', 55000,  'V3'),
  -- FA0003 : Frais pharmaceutiques
  ('acte-ph1', 'PH1', 'Frais pharmaceutiques',      0.90, NULL,   'fa-003', 'taux',    NULL,   'PH1'),
  -- FA0004 : Analyses
  ('acte-an',  'AN',  'Analyses biologiques',        0.80, NULL,   'fa-004', 'taux',    NULL,   'AN'),
  -- FA0005 : Orthopédie et prothèses
  ('acte-orp', 'ORP', 'Orthopédie et prothèses',    1.00, 600000, 'fa-005', 'taux',    NULL,   'ORP'),
  -- FA0006 : Optique
  ('acte-opt', 'OPT', 'Optique (monture + verres)',  1.00, NULL,   'fa-006', 'taux',    NULL,   'OPT'),
  -- FA0007 : Hospitalisation clinique
  ('acte-cl',  'CL',  'Hospitalisation clinique',    1.00, 120000, 'fa-007', 'forfait', 120000, 'CL'),
  -- FA0008 : Hospitalisation hôpital
  ('acte-hp',  'HP',  'Hospitalisation hôpital',     1.00, 45000,  'fa-008', 'forfait', 45000,  'HP'),
  -- FA0009 : Actes de spécialistes
  ('acte-ts',  'TS',  'Traitements spéciaux (scanner/IRM)', 1.00, 200000, 'fa-009', 'taux', NULL, 'TS'),
  ('acte-pc',  'PC',  'Pratiques courantes',         0.00, NULL,   'fa-009', 'forfait', 1500,   'PC'),
  ('acte-am',  'AM',  'Auxiliaires médicaux',        0.00, NULL,   'fa-009', 'forfait', 1500,   'AM'),
  ('acte-amm', 'AMM', 'Injection d''insuline',      0.00, NULL,   'fa-009', 'forfait', 10000,  'AMM'),
  ('acte-e',   'E',   'Échographie',                 0.00, NULL,   'fa-009', 'forfait', 7000,   'E'),
  ('acte-z',   'Z',   'Acte radio diagnostique',     0.00, NULL,   'fa-009', 'forfait', 2000,   'Z'),
  -- FA0010 : Frais chirurgicaux
  ('acte-fch', 'FCH', 'Frais chirurgicaux',          0.80, NULL,   'fa-010', 'taux',    NULL,   'FCH'),
  ('acte-ane', 'ANE', 'Anesthésie',                  1.00, 300000, 'fa-010', 'taux',    NULL,   'ANE'),
  ('acte-so',  'SO',  'Frais salle d''opération',    1.00, 300000, 'fa-010', 'taux',    NULL,   'SO'),
  ('acte-kc',  'KC',  'Coefficient chirurgical',     0.00, NULL,   'fa-010', 'forfait', 10000,  'KC'),
  ('acte-puu', 'PUU', 'Produits à usage unique',     0.90, 300000, 'fa-010', 'taux',    NULL,   'PUU'),
  -- FA0011 : Soins dentaires
  ('acte-sd',  'SD',  'Soins et prothèses dentaires', 0.80, 1200000, 'fa-011', 'taux', NULL,   'SD'),
  -- FA0012 : Maternité / Accouchement
  ('acte-acc', 'ACC', 'Accouchement',                 1.00, 200000, 'fa-012', 'taux',    NULL,   'ACC'),
  ('acte-ig',  'IG',  'Interruption involontaire grossesse', 1.00, 100000, 'fa-012', 'taux', NULL, 'IG'),
  -- FA0013 : Cures thermales
  ('acte-ct',  'CT',  'Cures thermales',              1.00, NULL,   'fa-013', 'taux',    NULL,   'CT'),
  -- FA0014 : Soins orthodontiques
  ('acte-odf', 'ODF', 'Soins orthodontiques',         0.80, 600000, 'fa-014', 'taux',    NULL,   'ODF'),
  -- FA0015 : Circoncision
  ('acte-cir', 'CIR', 'Circoncision',                 0.00, NULL,   'fa-015', 'forfait', 200000, 'CIR'),
  -- FA0016 : Transport du malade
  ('acte-tr',  'TR',  'Transport du malade',           1.00, 100000, 'fa-016', 'taux',    NULL,   'TR'),
  -- FA0017 : Radiologie
  ('acte-r',   'R',   'Radiologie',                    0.80, NULL,   'fa-017', 'taux',    NULL,   'R'),
  -- FA0019 : Frais funéraires
  ('acte-ff',  'FF',  'Frais funéraires',              0.00, NULL,   'fa-019', 'forfait', 200000, 'FF');
