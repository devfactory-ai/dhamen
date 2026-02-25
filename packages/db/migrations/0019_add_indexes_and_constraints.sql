-- Migration: Add missing indexes for performance optimization
-- Note: SQLite doesn't support ADD CONSTRAINT for foreign keys after table creation
-- So we focus on adding indexes for better query performance

-- Claims indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_claims_insurer_created ON claims(insurer_id, created_at);
CREATE INDEX IF NOT EXISTS idx_claims_contract ON claims(contract_id);
CREATE INDEX IF NOT EXISTS idx_claims_bordereau ON claims(bordereau_id);
CREATE INDEX IF NOT EXISTS idx_claims_fraud_score ON claims(fraud_score) WHERE fraud_score >= 50;

-- Contracts composite index for lookups
CREATE INDEX IF NOT EXISTS idx_contracts_insurer_adherent ON contracts(insurer_id, adherent_id);
CREATE INDEX IF NOT EXISTS idx_contracts_dates ON contracts(start_date, end_date);

-- Reconciliations period index for date range queries
CREATE INDEX IF NOT EXISTS idx_reconciliations_period ON reconciliations(period_start, period_end);

-- Bordereaux indexes
CREATE INDEX IF NOT EXISTS idx_bordereaux_insurer_status ON bordereaux(insurer_id, status);
CREATE INDEX IF NOT EXISTS idx_bordereaux_provider_status ON bordereaux(provider_id, status);
CREATE INDEX IF NOT EXISTS idx_bordereaux_period ON bordereaux(period_start, period_end);

-- Partial indexes for active records (improves WHERE is_active = 1 queries)
CREATE INDEX IF NOT EXISTS idx_users_active ON users(role, insurer_id, provider_id) WHERE is_active = 1 AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_providers_active ON providers(type, city) WHERE is_active = 1 AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_insurers_active ON insurers(code) WHERE is_active = 1 AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contracts_active ON contracts(status) WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_conventions_active ON conventions(insurer_id, provider_id) WHERE is_active = 1;

-- Audit logs indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_date ON audit_logs(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, created_at);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_user_date ON notifications(user_id, created_at);

-- Baremes composite index for tariff lookups
CREATE INDEX IF NOT EXISTS idx_baremes_lookup ON baremes(insurer_id, care_type, effective_from) WHERE is_active = 1;

-- Care coverage rules lookup index
CREATE INDEX IF NOT EXISTS idx_coverage_rules_lookup ON care_coverage_rules(insurer_id, care_type, plan_type, effective_from) WHERE is_active = 1;

-- Fraud rules lookup index
CREATE INDEX IF NOT EXISTS idx_fraud_rules_lookup ON fraud_rules_config(insurer_id, rule_type, care_type) WHERE is_active = 1;

-- Adherents search indexes (for name search)
CREATE INDEX IF NOT EXISTS idx_adherents_name ON adherents(last_name, first_name);

-- Drug incompatibilities lookup
CREATE INDEX IF NOT EXISTS idx_drug_incompatibilities_lookup ON drug_incompatibilities(drug_code_a, drug_code_b) WHERE is_active = 1;
