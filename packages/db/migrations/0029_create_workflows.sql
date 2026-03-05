-- Create sante_workflows table for managing workflow instances
CREATE TABLE IF NOT EXISTS sante_workflows (
  id TEXT PRIMARY KEY,
  demande_id TEXT NOT NULL REFERENCES sante_demandes(id),
  type TEXT NOT NULL CHECK (type IN ('info_request', 'escalation', 'multi_validation')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled', 'expired')) DEFAULT 'pending',
  current_step INTEGER NOT NULL DEFAULT 1,
  steps_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_sante_workflows_demande ON sante_workflows(demande_id);
CREATE INDEX IF NOT EXISTS idx_sante_workflows_status ON sante_workflows(status);
CREATE INDEX IF NOT EXISTS idx_sante_workflows_type ON sante_workflows(type);

-- Add escalation/validation columns to sante_demandes
ALTER TABLE sante_demandes ADD COLUMN is_escalated INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sante_demandes ADD COLUMN escalation_level INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sante_demandes ADD COLUMN validation_level INTEGER NOT NULL DEFAULT 0;

-- Create index for escalated demandes
CREATE INDEX IF NOT EXISTS idx_sante_demandes_escalated ON sante_demandes(is_escalated);
