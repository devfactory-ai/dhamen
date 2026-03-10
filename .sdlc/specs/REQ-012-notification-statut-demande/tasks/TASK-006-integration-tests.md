---
id: TASK-006
title: Integration tests for notification on status change
status: done
priority: must
requires: [TASK-003]
ref: ADR-001
---

# TASK-006 — Integration tests for notification on status change

## Objective

Write integration tests validating the complete notification flow on demande status transitions.

## Files to create

| File | Change |
|------|--------|
| `apps/api/tests/integration/notification-statut.test.ts` | New integration test file |

## Test scenarios

### 1. Approval triggers all 3 channels
```typescript
it('sends push, in-app, and realtime on approval', async () => {
  // PATCH statut → approuvee
  // Verify push sent with montantRembourse
  // Verify in-app notification created in DB
  // Verify realtime message sent via WebSocket
});
```

### 2. Rejection includes motif
```typescript
it('sends rejection notification with motifRejet', async () => {
  // PATCH statut → rejetee, motifRejet: 'Document illegible'
  // Verify notification body contains motif
});
```

### 3. Fire-and-forget resilience
```typescript
it('status update succeeds even if notification fails', async () => {
  // Mock push service to throw
  // PATCH statut → approuvee
  // Verify 200 response
  // Verify status updated in DB
});
```

### 4. en_examen — no push
```typescript
it('does not send push for en_examen transition', async () => {
  // PATCH statut → en_examen
  // Verify no push sent
  // Verify in-app + realtime sent
});
```

### 5. Notification payload completeness
```typescript
it('includes all contextual data in notification payload', async () => {
  // PATCH statut → approuvee with montantRembourse
  // Verify payload has: numeroDemande, typeSoin, dateSoin, montantRembourse
});
```

### 6. No notification for invalid transition
```typescript
it('does not send notification if status update fails', async () => {
  // Try invalid transition
  // Verify no notification sent
});
```

## Acceptance criteria

- [ ] All 6 test scenarios pass
- [ ] Tests use mock notification services
- [ ] Tests run in < 10 seconds
- [ ] No flaky tests
