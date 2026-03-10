---
id: TASK-001
title: Add demande notification event types to shared package
status: done
priority: must
requires: []
ref: ADR-004
---

# TASK-001 — Add demande notification event types to shared package

## Objective

Define type-safe notification event types for demande status transitions in `packages/shared/src/types/events.ts`.

## Files to modify

| File | Change |
|------|--------|
| `packages/shared/src/types/events.ts` | Add demande notification event types |

## Implementation details

```typescript
export type SanteNotificationType =
  | 'SANTE_DEMANDE_SOUMISE'
  | 'SANTE_DEMANDE_APPROUVEE'
  | 'SANTE_DEMANDE_REJETEE'
  | 'SANTE_DEMANDE_EN_EXAMEN'
  | 'SANTE_INFO_REQUISE'
  | 'SANTE_DEMANDE_EN_PAIEMENT'
  | 'SANTE_PAIEMENT_EFFECTUE';

export interface DemandeNotificationPayload {
  demandeId: string;
  numeroDemande: string;
  adherentId: string;
  typeSoin: string;
  dateSoin: string;
  statut: string;
  montantDemande: number;
  montantRembourse?: number;
  motifRejet?: string;
  notes?: string;
}

export interface DemandeNotificationEvent {
  type: SanteNotificationType;
  payload: DemandeNotificationPayload;
  timestamp: string;
}
```

## Tests

- Unit test: all event type literals are valid strings
- Unit test: payload interface includes required fields

## Acceptance criteria

- [ ] `SanteNotificationType` type defined
- [ ] `DemandeNotificationPayload` interface defined
- [ ] `DemandeNotificationEvent` interface defined
- [ ] Exported from `packages/shared`
- [ ] Build passes
