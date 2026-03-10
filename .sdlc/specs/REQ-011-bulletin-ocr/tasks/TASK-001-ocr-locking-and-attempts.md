---
id: TASK-001
title: OCR locking and attempt limiting
status: done
priority: must
requires: []
ref: ADR-003, ADR-006
---

# TASK-001 — OCR locking and attempt limiting

## Objective

Implement concurrency locking (one OCR processing at a time per document) and limit OCR attempts to 5 per document.

## Why

- F-003 requires that only one OCR treatment runs at a time per document to avoid duplicate processing and inconsistent results.
- F-053 requires limiting retries to prevent infinite loops on unreadable images.
- AC-4 validates that concurrent requests are rejected with `OCR_ALREADY_PROCESSING`.

## Files to modify

| File | Change |
|------|--------|
| `packages/db/migrations/00XX_add_ocr_attempts.sql` | New migration — add `ocr_attempts` column |
| `packages/db/src/queries/sante-documents.ts` | Add `incrementOcrAttempts()` query |
| `apps/api/src/routes/sante/documents.ts` | Add locking check and attempt limit in POST /:id/ocr |

## Implementation details

### 1. Migration

```sql
-- Add OCR attempt counter to sante_documents
ALTER TABLE sante_documents ADD COLUMN ocr_attempts INTEGER NOT NULL DEFAULT 0;
```

### 2. Query helper (`sante-documents.ts`)

```typescript
export async function incrementOcrAttempts(db: D1Database, id: string): Promise<void> {
  await db.prepare('UPDATE sante_documents SET ocr_attempts = ocr_attempts + 1, updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), id)
    .run();
}
```

### 3. Route guard (`documents.ts` — POST /:id/ocr)

Add before existing processing logic:

```typescript
// Locking: reject if already processing
if (doc.ocrStatus === 'processing') {
  return c.json({ success: false, error: { code: 'OCR_ALREADY_PROCESSING', message: 'Un traitement OCR est déjà en cours pour ce document' } }, 409);
}

// Attempt limit
if (doc.ocrAttempts >= 5) {
  return c.json({ success: false, error: { code: 'OCR_MAX_ATTEMPTS_REACHED', message: 'Nombre maximum de tentatives OCR atteint (5). Veuillez saisir les données manuellement.' } }, 429);
}

// Increment attempts
await incrementOcrAttempts(db, doc.id);
```

### 4. Stale processing cleanup

Add a utility function for cleanup of stale `processing` statuses (documents stuck for > 60s):

```typescript
export async function resetStaleOcrProcessing(db: D1Database): Promise<number> {
  const threshold = new Date(Date.now() - 60_000).toISOString();
  const result = await db.prepare(
    'UPDATE sante_documents SET ocr_status = ? WHERE ocr_status = ? AND updated_at < ?'
  ).bind('pending', 'processing', threshold).run();
  return result.meta.changes ?? 0;
}
```

## Tests

- Unit test: verify `OCR_ALREADY_PROCESSING` returned when status is `processing`
- Unit test: verify `OCR_MAX_ATTEMPTS_REACHED` returned when attempts >= 5
- Unit test: verify attempts counter increments on each OCR call
- Unit test: verify `resetStaleOcrProcessing` resets old processing documents

## Acceptance criteria

- [ ] Column `ocr_attempts` exists on `sante_documents` with default 0
- [ ] Concurrent OCR request returns 409 with `OCR_ALREADY_PROCESSING`
- [ ] 6th OCR attempt returns 429 with `OCR_MAX_ATTEMPTS_REACHED`
- [ ] Counter increments on each POST /:id/ocr call
- [ ] Stale processing cleanup utility is available
