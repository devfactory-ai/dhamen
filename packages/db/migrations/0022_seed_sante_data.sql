-- Migration: Seed SoinFlow test data
-- Description: Sample data for development and testing

-- ============================================
-- Seed: Garanties Formules (Insurance Plans)
-- ============================================
INSERT INTO sante_garanties_formules (id, code, nom, description, taux_couverture_json, plafonds_json, plafond_global, tarif_mensuel, effective_from)
VALUES
  (
    'form_01HWESSENTIEL',
    'ESSENTIEL',
    'Formule Essentielle',
    'Couverture de base pour les soins courants',
    '{"pharmacie": 70, "consultation": 70, "hospitalisation": 80, "optique": 50, "dentaire": 50, "laboratoire": 70, "kinesitherapie": 60}',
    '{"pharmacie": 300000, "optique": 200000, "dentaire": 200000, "kinesitherapie": 150000}',
    2000000,
    50000,
    '2026-01-01'
  ),
  (
    'form_02HWCONFORT',
    'CONFORT',
    'Formule Confort',
    'Couverture élargie avec meilleurs taux',
    '{"pharmacie": 80, "consultation": 80, "hospitalisation": 90, "optique": 70, "dentaire": 70, "laboratoire": 80, "kinesitherapie": 75}',
    '{"pharmacie": 500000, "optique": 400000, "dentaire": 400000, "kinesitherapie": 300000}',
    5000000,
    100000,
    '2026-01-01'
  ),
  (
    'form_03HWPREMIUM',
    'PREMIUM',
    'Formule Premium',
    'Couverture maximale tous soins',
    '{"pharmacie": 100, "consultation": 100, "hospitalisation": 100, "optique": 90, "dentaire": 90, "laboratoire": 100, "kinesitherapie": 100}',
    '{"pharmacie": 1000000, "optique": 800000, "dentaire": 800000, "kinesitherapie": 600000}',
    10000000,
    200000,
    '2026-01-01'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Seed: Sample Praticiens (Healthcare Practitioners)
-- ============================================
INSERT INTO sante_praticiens (id, nom, prenom, specialite, type_praticien, est_conventionne, telephone, adresse, ville, numero_ordre)
VALUES
  (
    'prat_01HWDRMEJRI',
    'Mejri',
    'Mohamed',
    'Médecine générale',
    'medecin',
    1,
    '+216 71 234 567',
    '45 Avenue Habib Bourguiba',
    'Tunis',
    'MG-2024-001'
  ),
  (
    'prat_02HWDRBENALI',
    'Ben Ali',
    'Fatma',
    'Cardiologie',
    'medecin',
    1,
    '+216 71 345 678',
    '12 Rue de la Liberté',
    'Sousse',
    'CA-2024-002'
  ),
  (
    'prat_03HWPHHAMDI',
    'Hamdi',
    'Ahmed',
    'Pharmacie',
    'pharmacien',
    1,
    '+216 71 456 789',
    '78 Avenue de France',
    'Tunis',
    'PH-2024-003'
  ),
  (
    'prat_04HWDTBOUAZIZ',
    'Bouaziz',
    'Sonia',
    'Dentisterie générale',
    'dentiste',
    0,
    '+216 71 567 890',
    '23 Rue Ibn Khaldoun',
    'Sfax',
    'DT-2024-004'
  ),
  (
    'prat_05HWOPKHELIL',
    'Khelil',
    'Hedi',
    'Optique',
    'opticien',
    1,
    '+216 71 678 901',
    '56 Avenue de la République',
    'Bizerte',
    'OP-2024-005'
  ),
  (
    'prat_06HWLBTOUNSI',
    'Tounsi',
    'Mariem',
    'Laboratoire d''analyses',
    'laborantin',
    1,
    '+216 71 789 012',
    '34 Rue de Marseille',
    'Tunis',
    'LB-2024-006'
  )
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- Note: Sample demandes and actes should be created dynamically
-- through the API during testing, not seeded here to avoid
-- referential integrity issues with adherents
-- ============================================
