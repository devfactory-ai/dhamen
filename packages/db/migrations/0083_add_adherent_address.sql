-- REQ-010 / TASK-005: Add adherent address to bulletins_soins (from OCR scan)
ALTER TABLE bulletins_soins ADD COLUMN adherent_address TEXT;
