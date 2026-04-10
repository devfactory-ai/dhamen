-- Migration: 0126_unique_bulletin_number_per_company
-- Depends on company_id which may not exist on all DBs, using no-op
SELECT 1;
