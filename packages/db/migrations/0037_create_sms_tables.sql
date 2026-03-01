-- SMS Messages table
-- Stores all outgoing SMS messages with tracking
CREATE TABLE IF NOT EXISTS sms_messages (
  id TEXT PRIMARY KEY,
  phone_to TEXT NOT NULL,
  body TEXT NOT NULL,
  sender TEXT,
  template_code TEXT,
  provider TEXT, -- 'ooredoo', 'tt', 'orange', 'twilio', 'vonage', 'mock'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'queued', 'sent', 'delivered', 'failed', 'rejected', 'expired'
  provider_message_id TEXT,
  cost REAL, -- Cost in TND
  segments INTEGER DEFAULT 1,
  sent_at TEXT,
  delivered_at TEXT,
  failed_reason TEXT,
  retry_count INTEGER DEFAULT 0,
  next_retry_at TEXT,
  metadata TEXT, -- JSON
  user_id TEXT, -- Optional: link to user
  entity_type TEXT, -- Optional: 'demande', 'adherent', etc.
  entity_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for SMS messages
CREATE INDEX IF NOT EXISTS idx_sms_messages_phone ON sms_messages(phone_to);
CREATE INDEX IF NOT EXISTS idx_sms_messages_status ON sms_messages(status);
CREATE INDEX IF NOT EXISTS idx_sms_messages_template ON sms_messages(template_code);
CREATE INDEX IF NOT EXISTS idx_sms_messages_provider ON sms_messages(provider);
CREATE INDEX IF NOT EXISTS idx_sms_messages_created ON sms_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_sms_messages_user ON sms_messages(user_id);

-- SMS Delivery Log
-- Detailed tracking of each delivery attempt
CREATE TABLE IF NOT EXISTS sms_delivery_log (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL, -- 'sending', 'sent', 'delivered', 'failed'
  error_message TEXT,
  provider_response TEXT, -- JSON response from provider
  latency_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (message_id) REFERENCES sms_messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sms_delivery_log_message ON sms_delivery_log(message_id);
CREATE INDEX IF NOT EXISTS idx_sms_delivery_log_created ON sms_delivery_log(created_at);

-- SMS Templates (for admin-managed templates)
CREATE TABLE IF NOT EXISTS sms_templates (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  body_template TEXT NOT NULL,
  variables TEXT NOT NULL, -- JSON array of variable names
  max_length INTEGER DEFAULT 160,
  category TEXT, -- 'otp', 'notification', 'marketing', 'alert'
  is_active INTEGER DEFAULT 1,
  usage_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sms_templates_code ON sms_templates(code);
CREATE INDEX IF NOT EXISTS idx_sms_templates_category ON sms_templates(category);

-- SMS Provider Config
-- Store provider credentials and settings
CREATE TABLE IF NOT EXISTS sms_providers (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL, -- 'ooredoo', 'tt', 'orange', 'twilio', 'vonage'
  name TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  is_primary INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0, -- Lower = higher priority
  config TEXT, -- JSON: API keys (encrypted), URLs, etc.
  cost_per_sms REAL,
  cost_per_segment REAL,
  daily_limit INTEGER,
  monthly_limit INTEGER,
  current_daily_count INTEGER DEFAULT 0,
  current_monthly_count INTEGER DEFAULT 0,
  last_reset_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- SMS Stats (daily aggregates)
CREATE TABLE IF NOT EXISTS sms_daily_stats (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  provider TEXT,
  template_code TEXT,
  total_sent INTEGER DEFAULT 0,
  total_delivered INTEGER DEFAULT 0,
  total_failed INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0,
  avg_latency_ms REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(date, provider, template_code)
);

CREATE INDEX IF NOT EXISTS idx_sms_daily_stats_date ON sms_daily_stats(date);

-- Insert default templates
INSERT OR IGNORE INTO sms_templates (id, code, name, body_template, variables, category) VALUES
  ('tpl-otp-login', 'OTP_LOGIN', 'Code de connexion', 'Dhamen: Votre code de verification est {code}. Valide 5 minutes.', '["code"]', 'otp'),
  ('tpl-otp-reset', 'OTP_RESET', 'Reinitialisation mot de passe', 'Dhamen: Code de reinitialisation: {code}. Ne partagez jamais ce code.', '["code"]', 'otp'),
  ('tpl-claim-submitted', 'CLAIM_SUBMITTED', 'Demande soumise', 'Dhamen: Votre demande {numero} a ete soumise. Montant: {montant} TND.', '["numero", "montant"]', 'notification'),
  ('tpl-claim-approved', 'CLAIM_APPROVED', 'Demande approuvee', 'Dhamen: Bonne nouvelle! Demande {numero} approuvee. Remb: {montant} TND.', '["numero", "montant"]', 'notification'),
  ('tpl-claim-rejected', 'CLAIM_REJECTED', 'Demande rejetee', 'Dhamen: Demande {numero} non approuvee. Motif: {motif}. Contactez-nous.', '["numero", "motif"]', 'notification'),
  ('tpl-payment-sent', 'PAYMENT_SENT', 'Paiement effectue', 'Dhamen: Virement de {montant} TND effectue sur votre compte. Ref: {ref}.', '["montant", "ref"]', 'notification'),
  ('tpl-fraud-alert', 'FRAUD_ALERT', 'Alerte fraude', 'URGENT Dhamen: Activite suspecte detectee. Demande {numero}. Verifiez.', '["numero"]', 'alert'),
  ('tpl-card-activated', 'CARD_ACTIVATED', 'Carte activee', 'Dhamen: Votre carte virtuelle est active. Code PIN: {pin}. Gardez-le secret.', '["pin"]', 'notification'),
  ('tpl-eligibility', 'ELIGIBILITY_VERIFIED', 'Eligibilite verifiee', 'Dhamen: {adherent} eligible. Couverture: {taux}%. Plafond dispo: {plafond} TND.', '["adherent", "taux", "plafond"]', 'notification'),
  ('tpl-bordereau', 'BORDEREAU_READY', 'Bordereau disponible', 'Dhamen: Bordereau {numero} pret. Montant: {montant} TND. Consultez portail.', '["numero", "montant"]', 'notification');

-- Insert default providers
INSERT OR IGNORE INTO sms_providers (id, code, name, is_active, is_primary, priority, cost_per_sms) VALUES
  ('prov-mock', 'mock', 'Mock (Dev)', 1, 1, 0, 0.00),
  ('prov-ooredoo', 'ooredoo', 'Ooredoo Tunisia', 0, 0, 1, 0.08),
  ('prov-tt', 'tt', 'Tunisie Telecom', 0, 0, 2, 0.07),
  ('prov-orange', 'orange', 'Orange Tunisia', 0, 0, 3, 0.09),
  ('prov-twilio', 'twilio', 'Twilio', 0, 0, 10, 0.15),
  ('prov-vonage', 'vonage', 'Vonage (Nexmo)', 0, 0, 11, 0.12);
