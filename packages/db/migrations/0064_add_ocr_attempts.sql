-- Add OCR attempt counter to sante_documents
-- Tracks the number of OCR extraction attempts per document (max 5)
ALTER TABLE sante_documents ADD COLUMN ocr_attempts INTEGER NOT NULL DEFAULT 0;
