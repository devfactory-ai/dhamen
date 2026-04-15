-- ============================================
-- 0135: Async bulletin processing with Queue
-- Adds validation tracking to bulletins_soins
-- and a new table for OCR batch jobs
-- ============================================

-- New columns on bulletins_soins for async validation
ALTER TABLE bulletins_soins ADD COLUMN validation_status TEXT DEFAULT NULL;
ALTER TABLE bulletins_soins ADD COLUMN validation_errors TEXT DEFAULT NULL;
ALTER TABLE bulletins_soins ADD COLUMN validation_attempts INTEGER DEFAULT 0;
ALTER TABLE bulletins_soins ADD COLUMN ocr_job_id TEXT DEFAULT NULL;
ALTER TABLE bulletins_soins ADD COLUMN source TEXT DEFAULT 'manual';

-- Index for fast lookup of pending corrections
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_validation_status ON bulletins_soins(validation_status);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_ocr_job_id ON bulletins_soins(ocr_job_id);

-- OCR batch jobs table
CREATE TABLE IF NOT EXISTS bulletin_ocr_jobs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  batch_id TEXT,
  status TEXT NOT NULL DEFAULT 'uploading',
  total_files INTEGER DEFAULT 0,
  total_bulletins_extracted INTEGER DEFAULT 0,
  bulletins_ready INTEGER DEFAULT 0,
  bulletins_pending INTEGER DEFAULT 0,
  file_urls TEXT,
  error_message TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_bulletin_ocr_jobs_status ON bulletin_ocr_jobs(status);
CREATE INDEX IF NOT EXISTS idx_bulletin_ocr_jobs_created_by ON bulletin_ocr_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_bulletin_ocr_jobs_company ON bulletin_ocr_jobs(company_id);
