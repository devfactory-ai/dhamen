-- Fix individual contract dates to match their linked group contract dates
-- Bug: contracts were created with today's date instead of group contract effective_date
UPDATE contracts
SET
  start_date = (SELECT gc.effective_date FROM group_contracts gc WHERE gc.id = contracts.group_contract_id),
  end_date = (
    SELECT COALESCE(gc.annual_renewal_date, gc.end_date)
    FROM group_contracts gc
    WHERE gc.id = contracts.group_contract_id
  ),
  updated_at = datetime('now')
WHERE group_contract_id IS NOT NULL
  AND status = 'active'
  AND start_date != (SELECT gc.effective_date FROM group_contracts gc WHERE gc.id = contracts.group_contract_id);
