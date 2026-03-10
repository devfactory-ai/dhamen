---
id: TASK-004
title: Mobile realtime cache invalidation on status change
status: done
priority: should
requires: [TASK-003]
ref: ADR-006
---

# TASK-004 — Mobile realtime cache invalidation on status change

## Objective

Enhance `useRealtimeNotifications` to invalidate the specific demande detail query when a status change notification arrives, so the detail screen refreshes instantly.

## Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/hooks/useRealtimeNotifications.ts` | Add specific query invalidation for demande detail |

## Implementation details

Currently the hook invalidates `['sante-demandes']` (the list). Add invalidation of `['demande', demandeId]` for the detail screen:

```typescript
// In the notification handler:
if (notification.eventType?.startsWith('SANTE_DEMANDE_')) {
  queryClient.invalidateQueries({ queryKey: ['sante-demandes'] });
  queryClient.invalidateQueries({ queryKey: ['mes-demandes'] });

  // Also invalidate specific demande detail
  const demandeId = notification.data?.demandeId;
  if (demandeId) {
    queryClient.invalidateQueries({ queryKey: ['demande', demandeId] });
  }
}
```

## Tests

- Unit test: demande notification invalidates list + detail queries
- Unit test: notification without demandeId only invalidates list

## Acceptance criteria

- [ ] Demande list query invalidated on notification
- [ ] Demande detail query invalidated with specific demandeId
- [ ] Badge count updated
- [ ] No crash if demandeId is missing from payload
