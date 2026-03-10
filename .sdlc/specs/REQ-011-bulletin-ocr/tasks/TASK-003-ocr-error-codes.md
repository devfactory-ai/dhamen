---
id: TASK-003
title: Define OCR-specific business error codes
status: done
priority: must
requires: []
ref: ADR-008
---

# TASK-003 — Define OCR-specific business error codes

## Objective

Define and export OCR-specific error codes in `packages/shared` for consistent error handling across API and clients.

## Why

- CLAUDE.md conventions require explicit business error codes.
- F-050/F-051 require specific error codes for unreadable images and invalid document types.
- The mobile client needs distinct codes to display appropriate messages and actions (retry photo, manual input, wait).

## Files to modify

| File | Change |
|------|--------|
| `packages/shared/src/constants/errors.ts` (or equivalent) | Add OCR error code constants |
| `apps/api/src/routes/sante/documents.ts` | Use new error codes in OCR handlers |

## Implementation details

### Error codes

```typescript
export const OCR_ERROR_CODES = {
  /** Image too blurry, dark, or truncated to extract data */
  OCR_IMAGE_UNREADABLE: 'OCR_IMAGE_UNREADABLE',
  /** Document is not a bulletin de soin */
  OCR_INVALID_DOCUMENT_TYPE: 'OCR_INVALID_DOCUMENT_TYPE',
  /** Another OCR processing is already running on this document */
  OCR_ALREADY_PROCESSING: 'OCR_ALREADY_PROCESSING',
  /** Maximum OCR attempts (5) reached for this document */
  OCR_MAX_ATTEMPTS_REACHED: 'OCR_MAX_ATTEMPTS_REACHED',
  /** Workers AI service temporarily unavailable */
  OCR_AI_UNAVAILABLE: 'OCR_AI_UNAVAILABLE',
  /** Internal extraction failure */
  OCR_EXTRACTION_FAILED: 'OCR_EXTRACTION_FAILED',
} as const;

export type OcrErrorCode = typeof OCR_ERROR_CODES[keyof typeof OCR_ERROR_CODES];
```

### HTTP status mapping

| Code | HTTP Status | Client action |
|------|-------------|---------------|
| `OCR_IMAGE_UNREADABLE` | 422 | Invite user to retake photo |
| `OCR_INVALID_DOCUMENT_TYPE` | 422 | Invite user to select correct document |
| `OCR_ALREADY_PROCESSING` | 409 | Wait and poll |
| `OCR_MAX_ATTEMPTS_REACHED` | 429 | Redirect to manual input |
| `OCR_AI_UNAVAILABLE` | 503 | Retry later or manual input |
| `OCR_EXTRACTION_FAILED` | 500 | Retry or manual input |

## Tests

- Unit test: all error codes are exported and have correct string values
- Integration test: API returns correct HTTP status for each error scenario

## Acceptance criteria

- [ ] Error codes exported from `packages/shared`
- [ ] Each code maps to an appropriate HTTP status
- [ ] API handlers use these codes consistently
- [ ] Mobile client can differentiate error types for UX
