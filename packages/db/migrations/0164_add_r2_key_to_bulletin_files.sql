-- Add r2_key, mime_type, file_size to bulletin_files for file retrieval and display
ALTER TABLE bulletin_files ADD COLUMN r2_key TEXT;
ALTER TABLE bulletin_files ADD COLUMN mime_type TEXT;
ALTER TABLE bulletin_files ADD COLUMN file_size INTEGER;
