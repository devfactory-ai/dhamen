---
id: TASK-009
title: Integration tests for OCR bulletin pipeline
status: done
priority: must
requires: [TASK-001, TASK-002, TASK-003]
ref: ADR-001, ADR-003, ADR-007
---

# TASK-009 — Integration tests for OCR bulletin pipeline

## Objective

Write integration tests covering the complete OCR pipeline: upload → trigger OCR → retrieve result, including error scenarios and RBAC.

## Why

- CLAUDE.md requires 80% coverage on business code.
- AC-1 to AC-6 define specific acceptance scenarios that must be validated.
- The OCR pipeline involves multiple layers (route → agent → rules → DB) that need end-to-end validation.

## Files to create/modify

| File | Change |
|------|--------|
| `apps/api/tests/integration/ocr-bulletin.test.ts` | New integration test file |
| `apps/api/tests/fixtures/bulletin-sample.jpg` | Test fixture — sample bulletin image |

## Test scenarios

### 1. Happy path — French bulletin (AC-1)
```typescript
it('extracts data from a French bulletin with high confidence', async () => {
  // Upload image → trigger OCR → verify completed status
  // Verify fields: dateSoin, praticien, actes, montants
  // Verify confidence >= 0.7
  // Verify ocr_result_json stored in DB
});
```

### 2. Arabic bulletin (AC-2)
```typescript
it('extracts data from an Arabic bulletin with language detection', async () => {
  // Upload Arabic bulletin → trigger OCR
  // Verify language === 'ar'
  // Verify confidence >= 0.6
});
```

### 3. Bad image quality (AC-3)
```typescript
it('returns failed or low confidence for blurry image', async () => {
  // Upload blurry image → trigger OCR
  // Verify status === 'failed' OR confidence < 0.7
});
```

### 4. Concurrent processing lock (AC-4)
```typescript
it('rejects concurrent OCR request with 409', async () => {
  // Set document status to 'processing'
  // Trigger OCR → expect 409 OCR_ALREADY_PROCESSING
});
```

### 5. Attempt limit
```typescript
it('rejects OCR after 5 attempts with 429', async () => {
  // Set ocr_attempts to 5
  // Trigger OCR → expect 429 OCR_MAX_ATTEMPTS_REACHED
});
```

### 6. GET result polling (AC-5)
```typescript
it('returns structured result via GET /:id/ocr', async () => {
  // Complete OCR → GET result
  // Verify response includes BulletinExtractedData with fieldConfidences
});
```

### 7. RBAC enforcement (AC-6)
```typescript
it('prevents adherent from accessing another user document OCR', async () => {
  // Create doc for user A → try GET as user B → expect 403
});
```

### 8. Audit trail (AC-6)
```typescript
it('creates audit log entry on OCR completion', async () => {
  // Trigger OCR → verify audit record exists with userId, action, timestamp
});
```

## Acceptance criteria

- [ ] All 8 test scenarios pass
- [ ] Tests use realistic Tunisian data fixtures
- [ ] Tests run in < 30 seconds (mocked Workers AI)
- [ ] RBAC scenarios cover ADHERENT, INSURER_AGENT, ADMIN roles
- [ ] No flaky tests — deterministic mocking of AI responses
