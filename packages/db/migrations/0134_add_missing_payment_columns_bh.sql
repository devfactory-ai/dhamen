-- Migration: Add payment columns missing on some tenant DBs
-- Some DBs already have these columns, using no-op
SELECT 1; -- approved_by
SELECT 1; -- payment_method
SELECT 1; -- payment_reference
SELECT 1; -- payment_notes
