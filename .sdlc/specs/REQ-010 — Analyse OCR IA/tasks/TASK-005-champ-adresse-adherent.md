---
id: TASK-005
title: Ajout champ adresse adherent
status: todo
priority: should
requires: []
ref: ADR-004
---

# TASK-005 — Ajout champ adresse adherent

## Objective

Ajouter le champ `adherent_address` au formulaire de saisie, au schema Zod, au backend et a la base de donnees pour stocker l'adresse extraite par l'OCR.

## Why

L'OCR retourne l'adresse de l'adherent (`infos_adherent.adresse`) mais il n'y a pas de champ correspondant dans le formulaire actuel. L'adresse est utile pour les bordereaux et la correspondance.

## Files to modify

| File | Change |
|------|--------|
| `packages/db/migrations/0083_add_adherent_address.sql` | Nouvelle migration |
| `apps/api/src/routes/bulletins-agent.ts` | Extraction et INSERT du champ |
| `apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx` | Schema Zod + champ UI |

## Implementation details

### 1. Migration

```sql
ALTER TABLE bulletins_soins ADD COLUMN adherent_address TEXT;
```

### 2. Backend (bulletins-agent.ts)

```typescript
const adherentAddress = (formData['adherent_address'] as string) || null;
// ... inclure dans l'INSERT
```

### 3. Frontend

Schema :
```typescript
adherent_address: z.string().optional(),
```

UI (dans la section "Informations Adherent") :
```tsx
<div className="space-y-2">
  <Label>Adresse</Label>
  <Input {...register('adherent_address')} placeholder="Adresse de l'adherent" />
</div>
```

## Acceptance criteria

- [ ] Migration executee sans erreur
- [ ] Champ visible dans le formulaire
- [ ] Valeur sauvegardee en base
- [ ] Pre-rempli par l'OCR quand disponible
