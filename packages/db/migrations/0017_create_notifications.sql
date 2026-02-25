-- Notifications System Migration
-- Tables for managing user notifications and preferences

-- Notification templates for different event types
CREATE TABLE IF NOT EXISTS notification_templates (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('EMAIL', 'SMS', 'PUSH', 'IN_APP')),
  event_type TEXT NOT NULL,
  subject_template TEXT,
  body_template TEXT NOT NULL,
  variables TEXT, -- JSON array of available template variables
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- User notification preferences
CREATE TABLE IF NOT EXISTS notification_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Email notifications
  email_claims INTEGER DEFAULT 1,
  email_bordereaux INTEGER DEFAULT 1,
  email_reconciliation INTEGER DEFAULT 1,
  email_system INTEGER DEFAULT 1,
  -- SMS notifications
  sms_claims INTEGER DEFAULT 0,
  sms_urgent INTEGER DEFAULT 1,
  -- Push notifications (for future mobile app)
  push_enabled INTEGER DEFAULT 1,
  -- In-app notifications
  in_app_enabled INTEGER DEFAULT 1,
  -- Quiet hours
  quiet_hours_enabled INTEGER DEFAULT 0,
  quiet_hours_start TEXT, -- HH:MM format
  quiet_hours_end TEXT,   -- HH:MM format
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id)
);

-- Notifications sent to users
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  template_id TEXT REFERENCES notification_templates(id),
  type TEXT NOT NULL CHECK (type IN ('EMAIL', 'SMS', 'PUSH', 'IN_APP')),
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata TEXT, -- JSON with additional context
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ')),
  sent_at TEXT,
  delivered_at TEXT,
  read_at TEXT,
  failed_reason TEXT,
  -- Retry handling
  retry_count INTEGER DEFAULT 0,
  next_retry_at TEXT,
  -- References
  entity_type TEXT, -- 'CLAIM', 'BORDEREAU', 'RECONCILIATION', etc.
  entity_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Notification delivery log for debugging and analytics
CREATE TABLE IF NOT EXISTS notification_delivery_log (
  id TEXT PRIMARY KEY,
  notification_id TEXT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('SENDING', 'SENT', 'DELIVERED', 'FAILED')),
  provider TEXT, -- 'TWILIO', 'SENDGRID', 'FCM', etc.
  provider_message_id TEXT,
  response_code TEXT,
  response_body TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_entity ON notifications(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, status) WHERE status != 'READ';
CREATE INDEX IF NOT EXISTS idx_notification_prefs_user ON notification_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_templates_code ON notification_templates(code);
CREATE INDEX IF NOT EXISTS idx_notification_delivery_notification ON notification_delivery_log(notification_id);

-- Insert default notification templates
INSERT INTO notification_templates (id, code, type, event_type, subject_template, body_template, variables) VALUES
-- Email templates
('tmpl_claim_created', 'CLAIM_CREATED_EMAIL', 'EMAIL', 'CLAIM_CREATED',
  'Nouvelle PEC #{claimNumber}',
  'Bonjour {firstName},\n\nUne nouvelle prise en charge a été créée :\n- Numéro: {claimNumber}\n- Adhérent: {adherentName}\n- Montant: {amount} TND\n\nCordialement,\nL''équipe Dhamen',
  '["claimNumber", "firstName", "adherentName", "amount"]'),

('tmpl_claim_approved', 'CLAIM_APPROVED_EMAIL', 'EMAIL', 'CLAIM_APPROVED',
  'PEC #{claimNumber} approuvée',
  'Bonjour {firstName},\n\nLa prise en charge {claimNumber} a été approuvée.\n- Montant couvert: {coveredAmount} TND\n- Ticket modérateur: {copayAmount} TND\n\nCordialement,\nL''équipe Dhamen',
  '["claimNumber", "firstName", "coveredAmount", "copayAmount"]'),

('tmpl_claim_rejected', 'CLAIM_REJECTED_EMAIL', 'EMAIL', 'CLAIM_REJECTED',
  'PEC #{claimNumber} rejetée',
  'Bonjour {firstName},\n\nLa prise en charge {claimNumber} a été rejetée.\nMotif: {rejectionReason}\n\nVeuillez contacter le support pour plus d''informations.\n\nCordialement,\nL''équipe Dhamen',
  '["claimNumber", "firstName", "rejectionReason"]'),

('tmpl_bordereau_ready', 'BORDEREAU_READY_EMAIL', 'EMAIL', 'BORDEREAU_READY',
  'Bordereau {bordereauNumber} prêt',
  'Bonjour {firstName},\n\nLe bordereau {bordereauNumber} est prêt pour validation.\n- Période: {periodStart} - {periodEnd}\n- Nombre de PEC: {claimCount}\n- Montant total: {totalAmount} TND\n\nCordialement,\nL''équipe Dhamen',
  '["bordereauNumber", "firstName", "periodStart", "periodEnd", "claimCount", "totalAmount"]'),

('tmpl_bordereau_paid', 'BORDEREAU_PAID_EMAIL', 'EMAIL', 'BORDEREAU_PAID',
  'Bordereau {bordereauNumber} payé',
  'Bonjour {firstName},\n\nLe bordereau {bordereauNumber} a été payé.\n- Montant: {paidAmount} TND\n- Date de paiement: {paidDate}\n\nCordialement,\nL''équipe Dhamen',
  '["bordereauNumber", "firstName", "paidAmount", "paidDate"]'),

('tmpl_reconciliation_alert', 'RECONCILIATION_ALERT_EMAIL', 'EMAIL', 'RECONCILIATION_MISMATCH',
  'Alerte réconciliation - {period}',
  'Bonjour {firstName},\n\nDes écarts ont été détectés lors de la réconciliation de la période {period}.\n- Écarts non rapprochés: {unmatchedCount}\n- Montant total en écart: {unmatchedAmount} TND\n\nVeuillez vérifier dans le portail.\n\nCordialement,\nL''équipe Dhamen',
  '["period", "firstName", "unmatchedCount", "unmatchedAmount"]'),

-- SMS templates
('tmpl_claim_urgent_sms', 'CLAIM_URGENT_SMS', 'SMS', 'CLAIM_URGENT',
  NULL,
  'Dhamen: PEC urgente #{claimNumber} - {amount} TND. Action requise.',
  '["claimNumber", "amount"]'),

('tmpl_fraud_alert_sms', 'FRAUD_ALERT_SMS', 'SMS', 'FRAUD_DETECTED',
  NULL,
  'Dhamen ALERTE: Fraude potentielle détectée sur PEC #{claimNumber}. Score: {fraudScore}. Vérifiez immédiatement.',
  '["claimNumber", "fraudScore"]'),

-- In-app templates
('tmpl_claim_created_app', 'CLAIM_CREATED_IN_APP', 'IN_APP', 'CLAIM_CREATED',
  'Nouvelle PEC',
  'PEC #{claimNumber} créée pour {adherentName}',
  '["claimNumber", "adherentName"]'),

('tmpl_system_maintenance', 'SYSTEM_MAINTENANCE_IN_APP', 'IN_APP', 'SYSTEM_MAINTENANCE',
  'Maintenance programmée',
  'Une maintenance est programmée le {maintenanceDate} de {startTime} à {endTime}.',
  '["maintenanceDate", "startTime", "endTime"]');
