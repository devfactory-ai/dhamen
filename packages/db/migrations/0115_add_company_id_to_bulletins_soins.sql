-- Add company_id to bulletins_soins for direct company filtering
-- Some DBs already have this column, some don't. Using no-op here.
-- Column will be added by migration 0133b if missing.
SELECT 1;
