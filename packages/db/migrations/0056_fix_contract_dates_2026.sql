-- Migration: Fix contract dates for 2026 demo
-- Description: Update all seed contract dates so they are active in 2026

-- Update active contracts: extend to 2026-12-31
UPDATE contracts SET
  start_date = '2025-07-01',
  end_date = '2026-12-31',
  updated_at = datetime('now')
WHERE status = 'active';

-- Update suspended contracts: make them recent
UPDATE contracts SET
  start_date = '2025-07-01',
  end_date = '2026-12-31',
  updated_at = datetime('now')
WHERE status = 'suspended';

-- Keep expired contracts but make them recent-ish expired
UPDATE contracts SET
  start_date = '2024-07-01',
  end_date = '2025-06-30',
  updated_at = datetime('now')
WHERE status = 'expired';
