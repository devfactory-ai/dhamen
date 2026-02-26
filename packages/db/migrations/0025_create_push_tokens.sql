-- Push Notification Tokens Migration
-- Stores device tokens for sending push notifications to mobile apps

-- Push tokens table
CREATE TABLE IF NOT EXISTS sante_push_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_name TEXT,
  device_info TEXT, -- JSON with device metadata
  is_active INTEGER DEFAULT 1,
  last_used_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON sante_push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON sante_push_tokens(is_active) WHERE is_active = 1;
CREATE INDEX IF NOT EXISTS idx_push_tokens_platform ON sante_push_tokens(platform);

-- SoinFlow specific notification templates (extends existing templates)
INSERT INTO notification_templates (id, code, type, event_type, subject_template, body_template, variables) VALUES
-- Push notifications for SoinFlow
('tmpl_sante_demande_soumise', 'SANTE_DEMANDE_SOUMISE_PUSH', 'PUSH', 'SANTE_DEMANDE_SOUMISE',
  'Demande soumise',
  'Votre demande {numeroDemande} a été soumise avec succès.',
  '["numeroDemande"]'),

('tmpl_sante_demande_approuvee', 'SANTE_DEMANDE_APPROUVEE_PUSH', 'PUSH', 'SANTE_DEMANDE_APPROUVEE',
  'Demande approuvée',
  'Bonne nouvelle ! Votre demande {numeroDemande} a été approuvée. Montant remboursé: {montantRembourse} TND.',
  '["numeroDemande", "montantRembourse"]'),

('tmpl_sante_demande_rejetee', 'SANTE_DEMANDE_REJETEE_PUSH', 'PUSH', 'SANTE_DEMANDE_REJETEE',
  'Demande rejetée',
  'Votre demande {numeroDemande} a été rejetée. Motif: {motifRejet}.',
  '["numeroDemande", "motifRejet"]'),

('tmpl_sante_info_requise', 'SANTE_INFO_REQUISE_PUSH', 'PUSH', 'SANTE_INFO_REQUISE',
  'Information requise',
  'Des informations supplémentaires sont requises pour votre demande {numeroDemande}.',
  '["numeroDemande"]'),

('tmpl_sante_paiement_effectue', 'SANTE_PAIEMENT_EFFECTUE_PUSH', 'PUSH', 'SANTE_PAIEMENT_EFFECTUE',
  'Paiement effectué',
  'Le paiement de {montant} TND pour votre demande {numeroDemande} a été effectué.',
  '["numeroDemande", "montant"]'),

('tmpl_sante_bordereau_genere', 'SANTE_BORDEREAU_GENERE_PUSH', 'PUSH', 'SANTE_BORDEREAU_GENERE',
  'Bordereau généré',
  'Un nouveau bordereau {numeroBordereau} a été généré avec {nombreDemandes} demande(s).',
  '["numeroBordereau", "nombreDemandes"]')
ON CONFLICT(id) DO NOTHING;
