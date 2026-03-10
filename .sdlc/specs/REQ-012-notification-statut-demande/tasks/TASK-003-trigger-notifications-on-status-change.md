---
id: TASK-003
title: Trigger notifications on demande status change
status: done
priority: must
requires: [TASK-001, TASK-002]
ref: ADR-001, ADR-002
---

# TASK-003 — Trigger notifications on demande status change

## Objective

Wire the notification services into `PATCH /sante/demandes/:id/statut` to send push, in-app, and realtime notifications to the adherent on every status transition.

## Why

This is the core missing piece. The endpoint updates status but never notifies the adherent.

## Files to modify

| File | Change |
|------|--------|
| `apps/api/src/routes/sante/demandes.ts` | Add notification triggers after status update |

## Implementation details

### After successful status update, fire-and-forget:

```typescript
// After: await updateSanteDemandeStatut(...)

const notifPayload = {
  demandeId: demande.id,
  numeroDemande: demande.numeroDemande,
  adherentId: demande.adherentId,
  typeSoin: demande.typeSoin,
  dateSoin: demande.dateSoin,
  statut: newStatut,
  montantDemande: demande.montantDemande,
  montantRembourse: body.montantRembourse,
  motifRejet: body.motifRejet,
  notes: body.notes,
};

// Map statut to notification type
const notifTypeMap: Record<string, SanteNotificationType> = {
  approuvee: 'SANTE_DEMANDE_APPROUVEE',
  rejetee: 'SANTE_DEMANDE_REJETEE',
  en_examen: 'SANTE_DEMANDE_EN_EXAMEN',
  info_requise: 'SANTE_INFO_REQUISE',
  en_paiement: 'SANTE_DEMANDE_EN_PAIEMENT',
  payee: 'SANTE_PAIEMENT_EFFECTUE',
};

const notifType = notifTypeMap[newStatut];
if (notifType) {
  // 1. Push notification
  pushService.sendSanteNotification(demande.adherentId, notifType, {
    demandeId: demande.id,
    numeroDemande: demande.numeroDemande,
    typeSoin: demande.typeSoin,
    dateSoin: demande.dateSoin,
    montantRembourse: formatAmount(body.montantRembourse),
    motifRejet: body.motifRejet || '',
    notes: body.notes || '',
  }).catch(() => {});

  // 2. In-app notification
  notificationService.send({
    userId: demande.adherentId,
    type: 'IN_APP',
    eventType: notifType,
    title: `Demande ${demande.numeroDemande}`,
    body: buildNotificationBody(notifType, notifPayload),
    entityId: demande.id,
    entityType: 'demande',
  }).catch(() => {});

  // 3. Realtime (WebSocket)
  realtimeService.sendToUser(demande.adherentId, {
    type: 'notification',
    eventType: notifType,
    data: notifPayload,
  }).catch(() => {});
}
```

### Status transitions that trigger notifications

| Status | Push | In-app | Realtime |
|--------|------|--------|----------|
| approuvee | Yes | Yes | Yes |
| rejetee | Yes | Yes | Yes |
| en_examen | No | Yes | Yes |
| info_requise | Yes | Yes | Yes |
| en_paiement | No | Yes | Yes |
| payee | Yes | Yes | Yes |

## Tests

- Integration test: approval triggers all 3 notification channels
- Integration test: rejection includes motifRejet in notification
- Integration test: notification failure doesn't block status update
- Integration test: en_examen only triggers in-app + realtime (no push)

## Acceptance criteria

- [ ] All status transitions trigger appropriate notifications
- [ ] Push notifications include contextual data
- [ ] In-app notifications stored in DB
- [ ] Realtime notifications sent via WebSocket
- [ ] Fire-and-forget — failures don't block the response
- [ ] Audit trail preserved
