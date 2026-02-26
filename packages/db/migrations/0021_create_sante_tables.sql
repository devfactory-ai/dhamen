-- Migration: Create SoinFlow tables
-- Description: Tables for the SoinFlow health reimbursement module

-- ============================================
-- Table: sante_garanties_formules
-- Description: Insurance formulas/plans (Essentiel/Confort/Premium)
-- ============================================
CREATE TABLE IF NOT EXISTS sante_garanties_formules (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  nom TEXT NOT NULL,
  description TEXT,

  -- Coverage rates per care type (stored as JSON for flexibility)
  -- Format: {"pharmacie": 80, "consultation": 70, "hospitalisation": 100, ...}
  taux_couverture_json TEXT NOT NULL DEFAULT '{}',

  -- Annual ceilings per care type (in millimes)
  -- Format: {"pharmacie": 500000, "optique": 300000, ...}
  plafonds_json TEXT NOT NULL DEFAULT '{}',

  -- Global annual ceiling (in millimes)
  plafond_global INTEGER,

  -- Price per month in millimes
  tarif_mensuel INTEGER NOT NULL,

  -- Active status and validity
  is_active INTEGER NOT NULL DEFAULT 1,
  effective_from TEXT NOT NULL,
  effective_to TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sante_formules_code ON sante_garanties_formules(code);
CREATE INDEX IF NOT EXISTS idx_sante_formules_active ON sante_garanties_formules(is_active);

-- ============================================
-- Table: sante_praticiens
-- Description: Registered healthcare practitioners for SoinFlow
-- ============================================
CREATE TABLE IF NOT EXISTS sante_praticiens (
  id TEXT PRIMARY KEY,

  -- Link to providers table if exists
  provider_id TEXT REFERENCES providers(id),

  -- Basic info
  nom TEXT NOT NULL,
  prenom TEXT,
  specialite TEXT NOT NULL,

  -- Types: 'medecin', 'pharmacien', 'dentiste', 'opticien', 'laborantin', 'kinesitherapeute'
  type_praticien TEXT NOT NULL CHECK (type_praticien IN (
    'medecin', 'pharmacien', 'dentiste', 'opticien', 'laborantin', 'kinesitherapeute', 'infirmier', 'autre'
  )),

  -- Conventionnement status
  est_conventionne INTEGER NOT NULL DEFAULT 0,
  convention_numero TEXT,
  convention_debut TEXT,
  convention_fin TEXT,

  -- Contact
  telephone TEXT,
  email TEXT,
  adresse TEXT,
  ville TEXT,
  code_postal TEXT,
  lat REAL,
  lng REAL,

  -- Credentials
  numero_ordre TEXT, -- Professional registration number
  numero_cnam TEXT, -- CNAM registration (Tunisia)

  -- Status
  is_active INTEGER NOT NULL DEFAULT 1,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sante_praticiens_type ON sante_praticiens(type_praticien);
CREATE INDEX IF NOT EXISTS idx_sante_praticiens_conventionne ON sante_praticiens(est_conventionne);
CREATE INDEX IF NOT EXISTS idx_sante_praticiens_ville ON sante_praticiens(ville);
CREATE INDEX IF NOT EXISTS idx_sante_praticiens_provider ON sante_praticiens(provider_id);
CREATE INDEX IF NOT EXISTS idx_sante_praticiens_active ON sante_praticiens(is_active);

-- ============================================
-- Table: sante_demandes
-- Description: Reimbursement requests (both paper and digital workflows)
-- ============================================
CREATE TABLE IF NOT EXISTS sante_demandes (
  id TEXT PRIMARY KEY,
  numero_demande TEXT NOT NULL UNIQUE,

  -- Links
  adherent_id TEXT NOT NULL REFERENCES adherents(id),
  praticien_id TEXT REFERENCES sante_praticiens(id),
  formule_id TEXT REFERENCES sante_garanties_formules(id),

  -- Source: 'adherent' (paper upload) or 'praticien' (digital workflow)
  source TEXT NOT NULL DEFAULT 'adherent' CHECK (source IN ('adherent', 'praticien')),

  -- Type of care
  type_soin TEXT NOT NULL CHECK (type_soin IN (
    'pharmacie', 'consultation', 'hospitalisation', 'optique', 'dentaire', 'laboratoire', 'kinesitherapie', 'autre'
  )),

  -- Workflow status
  statut TEXT NOT NULL DEFAULT 'soumise' CHECK (statut IN (
    'soumise', 'en_examen', 'info_requise', 'approuvee', 'en_paiement', 'payee', 'rejetee'
  )),

  -- Amounts (in millimes)
  montant_demande INTEGER NOT NULL,
  montant_rembourse INTEGER,
  montant_reste_charge INTEGER, -- Adhérent's share (ticket modérateur)

  -- For tiers-payant (conventionné workflow)
  est_tiers_payant INTEGER NOT NULL DEFAULT 0,
  montant_praticien INTEGER, -- Amount to be paid to practitioner

  -- Date of care
  date_soin TEXT NOT NULL,

  -- Processing info
  traite_par TEXT REFERENCES users(id), -- Gestionnaire who processed
  date_traitement TEXT,
  motif_rejet TEXT,
  notes_internes TEXT,

  -- Fraud score (0-100)
  score_fraude INTEGER,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sante_demandes_numero ON sante_demandes(numero_demande);
CREATE INDEX IF NOT EXISTS idx_sante_demandes_adherent ON sante_demandes(adherent_id);
CREATE INDEX IF NOT EXISTS idx_sante_demandes_praticien ON sante_demandes(praticien_id);
CREATE INDEX IF NOT EXISTS idx_sante_demandes_statut ON sante_demandes(statut);
CREATE INDEX IF NOT EXISTS idx_sante_demandes_type ON sante_demandes(type_soin);
CREATE INDEX IF NOT EXISTS idx_sante_demandes_source ON sante_demandes(source);
CREATE INDEX IF NOT EXISTS idx_sante_demandes_date ON sante_demandes(date_soin);
CREATE INDEX IF NOT EXISTS idx_sante_demandes_created ON sante_demandes(created_at);

-- ============================================
-- Table: sante_documents
-- Description: Documents attached to requests (R2 metadata)
-- ============================================
CREATE TABLE IF NOT EXISTS sante_documents (
  id TEXT PRIMARY KEY,
  demande_id TEXT NOT NULL REFERENCES sante_demandes(id) ON DELETE CASCADE,

  -- Document type
  type_document TEXT NOT NULL CHECK (type_document IN (
    'bulletin_soin', 'ordonnance', 'facture', 'devis', 'compte_rendu', 'autre'
  )),

  -- R2 storage info
  r2_key TEXT NOT NULL,
  r2_bucket TEXT NOT NULL DEFAULT 'dhamen-files',

  -- File metadata
  nom_fichier TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  taille_octets INTEGER NOT NULL,

  -- For OCR/processing (future)
  ocr_status TEXT DEFAULT 'pending' CHECK (ocr_status IN ('pending', 'processing', 'completed', 'failed', 'skipped')),
  ocr_result_json TEXT,

  -- Upload info
  uploaded_by TEXT REFERENCES users(id),

  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sante_documents_demande ON sante_documents(demande_id);
CREATE INDEX IF NOT EXISTS idx_sante_documents_type ON sante_documents(type_document);
CREATE INDEX IF NOT EXISTS idx_sante_documents_r2 ON sante_documents(r2_key);

-- ============================================
-- Table: sante_actes_praticiens
-- Description: Digital acts created by practitioners (tiers-payant workflow)
-- ============================================
CREATE TABLE IF NOT EXISTS sante_actes_praticiens (
  id TEXT PRIMARY KEY,

  -- Links
  praticien_id TEXT NOT NULL REFERENCES sante_praticiens(id),
  adherent_id TEXT NOT NULL REFERENCES adherents(id),
  demande_id TEXT REFERENCES sante_demandes(id), -- Auto-created demande

  -- Act details
  code_acte TEXT NOT NULL,
  libelle_acte TEXT NOT NULL,

  -- Amounts (in millimes)
  montant_acte INTEGER NOT NULL,
  taux_couverture INTEGER NOT NULL, -- Percentage (0-100)
  montant_couvert INTEGER NOT NULL, -- Amount covered by insurance
  montant_patient INTEGER NOT NULL, -- Amount paid by patient (ticket modérateur)

  -- Status
  statut TEXT NOT NULL DEFAULT 'cree' CHECK (statut IN (
    'cree', 'valide', 'paye', 'annule'
  )),

  -- Date
  date_acte TEXT NOT NULL,

  -- Signature QR code verification
  qr_code_adherent TEXT,
  signature_adherent INTEGER DEFAULT 0, -- Was signed by adherent

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sante_actes_praticien ON sante_actes_praticiens(praticien_id);
CREATE INDEX IF NOT EXISTS idx_sante_actes_adherent ON sante_actes_praticiens(adherent_id);
CREATE INDEX IF NOT EXISTS idx_sante_actes_demande ON sante_actes_praticiens(demande_id);
CREATE INDEX IF NOT EXISTS idx_sante_actes_statut ON sante_actes_praticiens(statut);
CREATE INDEX IF NOT EXISTS idx_sante_actes_date ON sante_actes_praticiens(date_acte);

-- ============================================
-- Table: sante_plafonds_consommes
-- Description: Annual ceiling consumption tracking per adherent
-- ============================================
CREATE TABLE IF NOT EXISTS sante_plafonds_consommes (
  id TEXT PRIMARY KEY,
  adherent_id TEXT NOT NULL REFERENCES adherents(id),

  -- Year of tracking
  annee INTEGER NOT NULL,

  -- Type of ceiling
  type_soin TEXT NOT NULL CHECK (type_soin IN (
    'pharmacie', 'consultation', 'hospitalisation', 'optique', 'dentaire', 'laboratoire', 'kinesitherapie', 'global'
  )),

  -- Consumption (in millimes)
  montant_consomme INTEGER NOT NULL DEFAULT 0,
  montant_plafond INTEGER NOT NULL, -- Ceiling for this year/type

  -- Computed percentage
  pourcentage_consomme REAL GENERATED ALWAYS AS (
    CASE WHEN montant_plafond > 0 THEN (montant_consomme * 100.0 / montant_plafond) ELSE 0 END
  ) STORED,

  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sante_plafonds_unique ON sante_plafonds_consommes(adherent_id, annee, type_soin);
CREATE INDEX IF NOT EXISTS idx_sante_plafonds_adherent ON sante_plafonds_consommes(adherent_id);
CREATE INDEX IF NOT EXISTS idx_sante_plafonds_annee ON sante_plafonds_consommes(annee);

-- ============================================
-- Table: sante_paiements
-- Description: Payment tracking for reimbursements
-- ============================================
CREATE TABLE IF NOT EXISTS sante_paiements (
  id TEXT PRIMARY KEY,

  -- Link to request
  demande_id TEXT NOT NULL REFERENCES sante_demandes(id),

  -- Payment recipient
  type_beneficiaire TEXT NOT NULL CHECK (type_beneficiaire IN ('adherent', 'praticien')),
  beneficiaire_id TEXT NOT NULL, -- adherent_id or praticien_id

  -- Amount (in millimes)
  montant INTEGER NOT NULL,

  -- Payment method
  methode TEXT NOT NULL DEFAULT 'virement' CHECK (methode IN ('virement', 'cheque', 'especes')),

  -- Bank details (encrypted)
  rib_encrypted TEXT,

  -- Status
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN (
    'en_attente', 'initie', 'execute', 'echoue', 'annule'
  )),

  -- Processing
  date_initiation TEXT,
  date_execution TEXT,
  reference_paiement TEXT,
  motif_echec TEXT,

  -- Idempotency key for payment safety
  idempotency_key TEXT UNIQUE,

  -- Audit
  initie_par TEXT REFERENCES users(id),

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sante_paiements_demande ON sante_paiements(demande_id);
CREATE INDEX IF NOT EXISTS idx_sante_paiements_beneficiaire ON sante_paiements(type_beneficiaire, beneficiaire_id);
CREATE INDEX IF NOT EXISTS idx_sante_paiements_statut ON sante_paiements(statut);
CREATE INDEX IF NOT EXISTS idx_sante_paiements_date ON sante_paiements(date_execution);
