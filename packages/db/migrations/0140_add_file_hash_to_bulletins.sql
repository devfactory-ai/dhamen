-- Add file_hash column for duplicate detection before OCR analysis
-- SHA-256 hash of uploaded file content, checked before calling Gemini to avoid wasting tokens
-- Column may already exist from a prior partial migration run
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_file_hash ON bulletins_soins(file_hash);
