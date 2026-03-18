-- Migration: Add missing adherent fields from Acorad legacy system
-- Matching: Onglet Renseignement (type piece identite, date edition)
-- Matching: Onglet Adherent (num operande, contre visite, etat fiche)

-- Type de piece d'identite (CIN, Passeport, Carte sejour)
ALTER TABLE adherents ADD COLUMN type_piece_identite TEXT DEFAULT 'CIN'
  CHECK (type_piece_identite IN ('CIN', 'PASSEPORT', 'CARTE_SEJOUR', 'AUTRE'));

-- Date d'edition de la piece d'identite
ALTER TABLE adherents ADD COLUMN date_edition_piece TEXT;

-- Numero operande (reference Acorad pour tracabilite)
ALTER TABLE adherents ADD COLUMN num_operande TEXT;

-- Contre-visite obligatoire (flag)
ALTER TABLE adherents ADD COLUMN contre_visite_obligatoire INTEGER DEFAULT 0;

-- Etat de fiche (plus detaille que is_active)
ALTER TABLE adherents ADD COLUMN etat_fiche TEXT DEFAULT 'NON_TEMPORAIRE'
  CHECK (etat_fiche IN ('TEMPORAIRE', 'NON_TEMPORAIRE'));

-- Credit eventuel
ALTER TABLE adherents ADD COLUMN credit REAL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_adherents_num_operande ON adherents(num_operande);
