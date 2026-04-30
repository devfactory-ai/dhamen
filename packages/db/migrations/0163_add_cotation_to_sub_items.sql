-- Add cotation column to acte_sub_items for storing coefficient (e.g., B420, KC50)
ALTER TABLE acte_sub_items ADD COLUMN cotation TEXT;
