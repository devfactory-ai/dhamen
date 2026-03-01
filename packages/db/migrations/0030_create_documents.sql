-- Migration: Create documents table for R2 document management
-- Created: 2024-03-XX

-- Documents table for R2 file metadata
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'ordonnance', 'facture', 'carte_assurance', 'justificatif',
        'rapport_medical', 'convention', 'bordereau', 'autre'
    )),
    entity_type TEXT NOT NULL CHECK (entity_type IN (
        'claim', 'adherent', 'provider', 'contract', 'insurer', 'bordereau', 'user'
    )),
    entity_id TEXT NOT NULL,
    uploaded_by TEXT NOT NULL REFERENCES users(id),
    uploaded_at TEXT NOT NULL,
    expires_at TEXT,
    tags TEXT, -- JSON array
    checksum TEXT,
    is_encrypted INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    previous_version_id TEXT REFERENCES documents(id),
    deleted_at TEXT,
    deleted_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    updated_by TEXT REFERENCES users(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_by ON documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_documents_uploaded_at ON documents(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_expires_at ON documents(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_deleted ON documents(deleted_at) WHERE deleted_at IS NULL;
