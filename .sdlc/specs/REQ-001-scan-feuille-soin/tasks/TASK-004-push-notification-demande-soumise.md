---
id: TASK-004
title: Send push notification on demande submission
status: pending
priority: must
requires: [TASK-001]
ref: ADR-007
---

# TASK-004 — Send push notification on demande submission

## Objective

Send a `SANTE_DEMANDE_SOUMISE` push notification when an adherent's demande transitions from `brouillon` to `soumise`.

## Why

F-042 requires a push notification confirming submission. The push notification service already has a template for `SANTE_DEMANDE_SOUMISE` — it just needs to be wired into the demande finalization flow.

## Files to modify

| File | Change |
|------|--------|
| `apps/api/src/routes/sante/demandes.ts` | Call `sendSanteNotification()` after PATCH brouillon → soumise |

## Implementation details

In the new PATCH handler added by TASK-001 (adherent finalizing a brouillon demande), after the DB update succeeds:

```typescript
// After successful status update to 'soumise'
import { PushNotificationService } from '../../services/push-notification.service';

// Inside the PATCH handler:
const pushService = new PushNotificationService(c.env);

// Fire-and-forget (don't block the response)
c.executionCtx.waitUntil(
  pushService.sendSanteNotification(user.sub, 'SANTE_DEMANDE_SOUMISE', {
    demandeId: demande.id,
    numeroDemande: demande.numeroDemande,
    typeSoin: demande.typeSoin,
    montant: demande.montantDemande,
  })
);
```

The `sendSanteNotification` method already handles the `SANTE_DEMANDE_SOUMISE` template with title/body formatting. No changes needed in the push service itself.

## Verification

- The template already exists in `push-notification.service.ts` lines 271-296
- The mobile `usePushNotifications.ts` hook already listens for incoming notifications
- The `push_tokens` table (migration 0025) stores Expo tokens per user

## Tests

- Integration test: submit a demande, verify push notification was sent (mock `sendSanteNotification`)
- Verify `waitUntil` is used (non-blocking)

## Acceptance criteria

- [ ] Push notification sent when demande goes from `brouillon` → `soumise`
- [ ] Notification includes demande number and type of care
- [ ] Notification is fire-and-forget (does not block API response)
- [ ] Audit trail entry logged for the submission
