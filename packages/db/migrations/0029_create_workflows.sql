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

-- Note: Columns is_escalated, escalation_level, validation_level may already exist
-- SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we use a workaround
-- The columns are created via seed/migration if they don't exist

-- Create index for escalated demandes (safe with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_sante_demandes_escalated ON sante_demandes(is_escalated) WHERE is_escalated = 1;
