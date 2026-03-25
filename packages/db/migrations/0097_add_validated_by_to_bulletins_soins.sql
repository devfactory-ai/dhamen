-- Migration: Add validated_by column to bulletins_soins
-- This column was referenced in code but never created by migration 0052
ALTER TABLE bulletins_soins ADD COLUMN validated_by TEXT;
