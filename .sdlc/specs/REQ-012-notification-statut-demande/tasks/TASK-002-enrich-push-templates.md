---
id: TASK-002
title: Enrich push notification templates with contextual data
status: done
priority: must
requires: [TASK-001]
ref: ADR-003
---

# TASK-002 — Enrich push notification templates with contextual data

## Objective

Update push notification templates in `push-notification.service.ts` to include detailed contextual information: type de soin, date du soin, montant rembourse, motif de rejet.

## Files to modify

| File | Change |
|------|--------|
| `apps/api/src/services/push-notification.service.ts` | Enrich SANTE_DEMANDE_* templates |

## Implementation details

### Updated templates

```typescript
SANTE_DEMANDE_APPROUVEE: {
  title: 'Demande {numeroDemande} approuvee',
  body: 'Votre demande de {typeSoin} du {dateSoin} a ete approuvee. Montant rembourse : {montantRembourse} TND.',
},
SANTE_DEMANDE_REJETEE: {
  title: 'Demande {numeroDemande} rejetee',
  body: 'Votre demande de {typeSoin} du {dateSoin} a ete rejetee. Motif : {motifRejet}.',
},
SANTE_DEMANDE_EN_EXAMEN: {
  title: 'Demande {numeroDemande} en cours d\'examen',
  body: 'Votre demande de {typeSoin} est en cours de traitement par votre assureur.',
},
SANTE_INFO_REQUISE: {
  title: 'Information requise pour {numeroDemande}',
  body: 'Votre assureur a besoin d\'informations supplementaires pour votre demande de {typeSoin}. {notes}',
},
SANTE_DEMANDE_EN_PAIEMENT: {
  title: 'Paiement en cours pour {numeroDemande}',
  body: 'Le remboursement de {montantRembourse} TND pour votre demande de {typeSoin} est en cours de traitement.',
},
SANTE_PAIEMENT_EFFECTUE: {
  title: 'Paiement effectue pour {numeroDemande}',
  body: 'Le montant de {montantRembourse} TND a ete verse pour votre demande de {typeSoin} du {dateSoin}.',
},
```

### Data payload for navigation

```typescript
data: {
  type: eventType,
  demandeId: payload.demandeId,
  entityId: payload.demandeId,
  entityType: 'demande',
}
```

## Tests

- Unit test: each template renders with all variables filled
- Unit test: missing optional variables don't break rendering

## Acceptance criteria

- [ ] All 6 templates enriched with typeSoin, dateSoin, montant
- [ ] Rejection template includes motifRejet
- [ ] Data payload includes demandeId for navigation
- [ ] Build passes
