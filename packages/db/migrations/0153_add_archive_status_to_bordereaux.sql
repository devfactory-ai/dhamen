-- Migration 0153: Add 'archive' status to sante_bordereaux
-- SQLite doesn't support ALTER CHECK, so we recreate the table

CREATE TABLE sante_bordereaux_new (
  id TEXT PRIMARY KEY,
  numero_bordereau TEXT NOT NULL UNIQUE,
  periode_debut TEXT NOT NULL,
  periode_fin TEXT NOT NULL,
  nombre_demandes INTEGER NOT NULL DEFAULT 0,
  montant_total INTEGER NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'genere' CHECK (statut IN ('genere', 'valide', 'envoye', 'paye', 'annule', 'archive')),
  date_generation TEXT NOT NULL,
  date_validation TEXT,
  date_envoi TEXT,
  date_paiement TEXT,
  genere_par TEXT NOT NULL REFERENCES users(id),
  valide_par TEXT REFERENCES users(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO sante_bordereaux_new SELECT * FROM sante_bordereaux;

DROP TABLE sante_bordereaux;

ALTER TABLE sante_bordereaux_new RENAME TO sante_bordereaux;
