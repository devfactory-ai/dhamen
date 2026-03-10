---
id: TASK-005
title: Enrich mobile notification display with contextual details
status: done
priority: should
requires: [TASK-003]
ref: ADR-003
---

# TASK-005 — Enrich mobile notification display with contextual details

## Objective

Update the notifications screen to display rich contextual information: montant rembourse for approvals, motif de rejet for rejections, with appropriate styling.

## Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/(main)/notifications.tsx` | Add detail rendering for demande notifications |

## Implementation details

### Parse notification metadata

The notification body contains the text, but the `metadata` JSON field can hold structured data:

```typescript
interface NotificationMetadata {
  montantRembourse?: number;
  motifRejet?: string;
  typeSoin?: string;
  dateSoin?: string;
  statut?: string;
}
```

### Enhanced notification card

For `SANTE_DEMANDE_APPROUVEE`:
- Green background
- Show montant: "Montant rembourse : 45.000 TND"
- Checkmark icon

For `SANTE_DEMANDE_REJETEE`:
- Red background
- Show motif: "Motif : {motifRejet}"
- Action hint: "Tapez pour voir les details"
- X icon

For `SANTE_INFO_REQUISE`:
- Yellow/amber background
- Show message with urgency indicator
- Info icon

### Amount formatting

```typescript
const formatTND = (millimes: number) => `${(millimes / 1000).toFixed(3)} TND`;
```

## Tests

- Unit test: approval notification shows montant
- Unit test: rejection notification shows motif
- Unit test: missing metadata gracefully degrades to basic display

## Acceptance criteria

- [ ] Approval notifications show montant rembourse
- [ ] Rejection notifications show motif de rejet
- [ ] Info requise notifications show details
- [ ] Color coding matches notification type
- [ ] Tap navigates to demande detail
- [ ] Graceful fallback if metadata is missing
