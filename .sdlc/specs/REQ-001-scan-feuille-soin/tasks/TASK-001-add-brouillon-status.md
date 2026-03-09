---
id: TASK-001
title: Add 'brouillon' status to sante demandes
status: pending
priority: must
requires: []
ref: ADR-005, ADR-009
---

# TASK-001 — Add 'brouillon' status to sante demandes

## Objective

Add a `brouillon` (draft) status to the sante demande lifecycle so that a demande can be created early (before upload/OCR) and finalized after the adherent reviews OCR results.

## Why

The document upload endpoint (`POST /sante/documents/upload`) requires a `demandeId`. The demande must exist before upload. Currently, creating a demande immediately sets it to `soumise`, but the new flow needs a draft state that allows the adherent to review/correct OCR data before final submission.

## Files to modify

| File | Change |
|------|--------|
| `packages/shared/src/types/sante.ts` | Add `'brouillon'` to `SANTE_STATUTS_DEMANDE` array (before `'soumise'`) |
| `packages/shared/src/schemas/sante.ts` | No code change needed — `santeStatutDemandeSchema` derives from `SANTE_STATUTS_DEMANDE` automatically |
| `packages/db/migrations/0063_add_brouillon_status.sql` | New migration — update CHECK constraint on `sante_demandes.statut` |
| `apps/api/src/routes/sante/demandes.ts` | Allow `montantDemande: 0` when statut is `brouillon`; allow ADHERENT to PATCH own demande from `brouillon` → `soumise` |

## Implementation details

### 1. Shared types (`packages/shared/src/types/sante.ts`)

```typescript
export const SANTE_STATUTS_DEMANDE = [
  'brouillon',   // <-- ADD THIS
  'soumise',
  'en_examen',
  'info_requise',
  'approuvee',
  'en_paiement',
  'payee',
  'rejetee',
] as const;
```

### 2. Migration (`packages/db/migrations/0063_add_brouillon_status.sql`)

```sql
-- Add 'brouillon' status to sante_demandes
-- SQLite does not support ALTER CHECK CONSTRAINT, so we rely on the application layer.
-- This migration documents the intent and ensures forward compatibility.

-- Update any existing check constraint comment
-- The application-level Zod schema is the source of truth for valid statuts.

-- No structural change needed: D1/SQLite stores statut as TEXT without CHECK constraint.
-- The Zod validation in the API layer enforces allowed values.
```

Verify the actual D1 schema: if `sante_demandes.statut` has a `CHECK` constraint, update it. If not (TEXT column validated by Zod), the migration is a no-op documentation marker.

### 3. Demandes route (`apps/api/src/routes/sante/demandes.ts`)

**POST handler changes:**
- Accept `montantDemande: 0` — currently the Zod schema requires `min(1)`. Add a new schema variant `santeDemandeCreateBrouillonSchema` that allows `montantDemande >= 0`, or make the existing schema accept 0.
- Set initial statut to `'brouillon'` instead of `'soumise'` when the request includes `statut: 'brouillon'` or a `draft: true` flag.

**New PATCH endpoint for adherent finalization:**
```
PATCH /api/v1/sante/demandes/:id
```
- Allowed roles: `ADHERENT`
- Only allowed when current statut is `'brouillon'`
- Accepts: `{ statut: 'soumise', montantDemande, dateSoin, typeSoin, praticienId? }`
- Validates ownership: `demande.adherentId === user.sub`
- Logs audit: `sante_demandes.submit`

### 4. Zod schema update (`packages/shared/src/schemas/sante.ts`)

Update `santeDemandeCreateSchema` to allow `montantDemande: 0`:

```typescript
export const santeDemandeCreateSchema = z.object({
  adherentId: z.string().min(1),
  typeSoin: santeTypeSoinSchema,
  montantDemande: z.number().min(0),  // Changed from min(1) to min(0)
  dateSoin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)'),
  praticienId: z.string().optional(),
  notes: z.string().max(1000).optional(),
  statut: z.enum(['brouillon', 'soumise']).optional().default('soumise'),
});
```

## Tests

- Unit test: verify `brouillon` is in `SANTE_STATUTS_DEMANDE`
- Integration test: create demande with `statut: brouillon`, then PATCH to `soumise`
- Integration test: verify ADHERENT cannot PATCH a demande they don't own
- Integration test: verify PATCH only works when current statut is `brouillon`

## Acceptance criteria

- [ ] `brouillon` appears in shared types and schema
- [ ] A demande can be created with `montantDemande: 0` and `statut: brouillon`
- [ ] An ADHERENT can PATCH their own brouillon demande to `soumise` with updated fields
- [ ] Audit trail logged on both create (brouillon) and submit (soumise)
- [ ] Existing flows (direct `soumise` creation) still work
