-- Migration: Add validated_by column to bulletins_soins
-- Column already exists on remote (added manually), using no-op to sync migration state
SELECT 1; -- validated_by already exists
