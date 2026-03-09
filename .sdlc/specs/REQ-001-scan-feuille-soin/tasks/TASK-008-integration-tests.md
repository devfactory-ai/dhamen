---
id: TASK-008
title: Integration tests for scan feuille de soin flow
status: done
priority: must
requires: [TASK-001, TASK-002, TASK-004]
ref: AC-1, AC-2, AC-3, AC-4, AC-5, AC-6
---

# TASK-008 — Integration tests for scan feuille de soin flow

## Objective

Write integration tests covering the full API flow: brouillon creation → document upload → OCR extraction → demande finalization → push notification.

## Why

Each acceptance criterion must be verified. The API-side logic (brouillon lifecycle, OCR trigger, RBAC, audit) needs automated test coverage (80% minimum per CLAUDE.md).

## Files to create/modify

| File | Change |
|------|--------|
| `apps/api/tests/integration/scan-feuille-soin.test.ts` | New integration test file |
| `apps/api/src/agents/ocr/ocr.test.ts` | Add field confidence tests (covered by TASK-002) |

## Test structure

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('REQ-001: Scan feuille de soin', () => {

  describe('AC-1: Capture et upload réussis', () => {
    it('creates a brouillon demande with montantDemande=0', async () => {
      // POST /sante/demandes { statut: 'brouillon', montantDemande: 0, ... }
      // Assert: 201, statut === 'brouillon'
    });

    it('uploads a document linked to the brouillon demande', async () => {
      // POST /sante/documents/upload (multipart with demandeId)
      // Assert: 201, ocrStatus === 'pending', r2Key matches pattern
    });

    it('rejects upload of file > 10 Mo', async () => {
      // POST with oversized file
      // Assert: 400, error message about size
    });

    it('rejects upload of non-JPEG/PNG file', async () => {
      // POST with file.type = 'application/pdf' (not in JPEG/PNG)
      // Note: documents.ts ALLOWED_MIME_TYPES includes PDF — verify requirement F-011 scope
      // Assert: depends on final allowed types
    });

    it('rejects upload to a demande not owned by the adherent', async () => {
      // POST with demandeId belonging to another adherent
      // Assert: 403
    });
  });

  describe('AC-2: Extraction OCR complète', () => {
    it('triggers OCR and returns extracted data with confidence score', async () => {
      // POST /sante/documents/:id/ocr
      // Assert: ocrStatus === 'completed', ocrResultJson stored, confidence >= 0
    });

    it('returns completed result if OCR already done', async () => {
      // POST /sante/documents/:id/ocr (second call)
      // Assert: returns cached result without re-processing
    });

    it('handles OCR failure gracefully', async () => {
      // Mock AI.run to throw
      // POST /sante/documents/:id/ocr
      // Assert: ocrStatus === 'failed', error message returned
    });

    it('returns per-field confidence scores', async () => {
      // POST /sante/documents/:id/ocr
      // Assert: data.fieldConfidences exists with expected keys
    });
  });

  describe('AC-4: Soumission avec notification', () => {
    it('finalizes a brouillon demande to soumise with updated fields', async () => {
      // PATCH /sante/demandes/:id { statut: 'soumise', montantDemande: 50000, ... }
      // Assert: 200, statut === 'soumise', numeroDemande present
    });

    it('sends push notification on submission', async () => {
      // PATCH brouillon → soumise
      // Assert: sendSanteNotification called with 'SANTE_DEMANDE_SOUMISE'
    });

    it('rejects finalization of a non-brouillon demande', async () => {
      // Create demande as 'soumise', then PATCH
      // Assert: 400 or 409
    });

    it('rejects finalization by non-owner', async () => {
      // PATCH with different user
      // Assert: 403
    });
  });

  describe('AC-6: Sécurité et audit', () => {
    it('creates audit log on document upload', async () => {
      // POST upload
      // Assert: audit_logs contains entry with action 'sante_documents.upload'
    });

    it('creates audit log on demande submission', async () => {
      // PATCH brouillon → soumise
      // Assert: audit_logs contains entry with action 'sante_demandes.submit'
    });

    it('blocks access to documents of other adherents', async () => {
      // GET /sante/documents/:id with different user
      // Assert: 403
    });
  });
});
```

## Test utilities needed

- Mock Workers AI binding (`c.env.AI.run` returns fixture data)
- Mock R2 binding (`c.env.STORAGE.put/get`)
- Test user fixtures for ADHERENT role
- FormData builder helper for multipart uploads

## Acceptance criteria

- [ ] All 6 acceptance criteria have at least one integration test
- [ ] RBAC enforcement tested (owner-only access)
- [ ] Audit trail creation verified
- [ ] OCR success and failure paths covered
- [ ] Push notification trigger verified (mocked)
- [ ] Tests run with `pnpm test` and pass
