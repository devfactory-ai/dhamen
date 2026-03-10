---
id: TASK-002
title: GET endpoint for OCR result retrieval
status: done
priority: must
requires: []
ref: ADR-007
---

# TASK-002 — GET endpoint for OCR result retrieval

## Objective

Add `GET /api/v1/sante/documents/:id/ocr` to retrieve the structured OCR result of a document, enabling client-side polling and pre-filling.

## Why

- F-042 requires an API to retrieve OCR results.
- F-043 requires polling support — the client calls this endpoint every 2s until `status !== 'processing'`.
- AC-5 validates that the client can retrieve structured data with confidence scores.

## Files to modify

| File | Change |
|------|--------|
| `apps/api/src/routes/sante/documents.ts` | Add GET /:id/ocr route |

## Implementation details

### Route (`documents.ts`)

```typescript
// GET /api/v1/sante/documents/:id/ocr — Retrieve OCR result
documents.get('/:id/ocr', async (c) => {
  const { id } = c.req.param();
  const user = c.get('user');
  const db = c.env.DB;

  const doc = await findDocumentById(db, id);
  if (!doc) {
    return c.json({ success: false, error: { code: 'DOCUMENT_NOT_FOUND', message: 'Document introuvable' } }, 404);
  }

  // RBAC: adherent can only access own documents
  // (reuse existing access check pattern from GET /:id)

  const response: Record<string, unknown> = {
    success: true,
    data: {
      documentId: doc.id,
      status: doc.ocrStatus,
      completedAt: doc.ocrCompletedAt,
    },
  };

  if (doc.ocrStatus === 'completed' && doc.ocrResultJson) {
    response.data = {
      ...response.data as Record<string, unknown>,
      result: JSON.parse(doc.ocrResultJson),
    };
  }

  if (doc.ocrStatus === 'failed') {
    response.data = {
      ...response.data as Record<string, unknown>,
      error: { code: 'OCR_EXTRACTION_FAILED', message: 'L\'extraction OCR a échoué' },
    };
  }

  return c.json(response);
});
```

### Response format

**Processing:**
```json
{ "success": true, "data": { "documentId": "...", "status": "processing" } }
```

**Completed:**
```json
{
  "success": true,
  "data": {
    "documentId": "...",
    "status": "completed",
    "completedAt": "2026-03-10T12:00:00Z",
    "result": { /* BulletinExtractedData */ }
  }
}
```

**Failed:**
```json
{
  "success": true,
  "data": {
    "documentId": "...",
    "status": "failed",
    "error": { "code": "OCR_EXTRACTION_FAILED", "message": "..." }
  }
}
```

## Tests

- Integration test: GET returns `pending` status for freshly uploaded document
- Integration test: GET returns `completed` with parsed OCR result after extraction
- Integration test: GET returns `failed` with error code on failed extraction
- Integration test: RBAC — adherent cannot access another user's document OCR result

## Acceptance criteria

- [ ] `GET /api/v1/sante/documents/:id/ocr` returns status + result
- [ ] Response includes parsed `BulletinExtractedData` when completed
- [ ] Response includes error code when failed
- [ ] RBAC enforced — only owner and assigned agents can access
- [ ] 404 returned for non-existent document
