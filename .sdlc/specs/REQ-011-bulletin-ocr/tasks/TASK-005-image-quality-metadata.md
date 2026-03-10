---
id: TASK-005
title: Add image quality metadata to OCR result
status: done
priority: should
requires: []
ref: ADR-009
---

# TASK-005 — Add image quality metadata to OCR result

## Objective

Add `metadata.imageQuality` (good/acceptable/poor) and `metadata.imageResolution` to the OCR result, derived from the confidence score and image properties.

## Why

- F-023 requires the confidence score to account for image quality.
- The `BulletinOcrResult` structure in REQ-011 specifies a `metadata` block with `imageQuality`, `imageResolution`, `processingTimeMs`, `modelVersion`.
- Clients use `imageQuality` to suggest the user retake the photo.

## Files to modify

| File | Change |
|------|--------|
| `apps/api/src/agents/ocr/ocr.types.ts` | Add `OcrMetadata` interface, add `metadata` to `BulletinExtractedData` |
| `apps/api/src/agents/ocr/ocr.agent.ts` | Populate metadata after extraction |
| `apps/api/src/agents/ocr/ocr.test.ts` | Add tests for quality derivation |

## Implementation details

### Types (`ocr.types.ts`)

```typescript
export interface OcrMetadata {
  imageQuality: 'good' | 'acceptable' | 'poor';
  processingTimeMs: number;
  modelVersion: string;
}

// Add to BulletinExtractedData:
export interface BulletinExtractedData {
  // ... existing fields ...
  metadata?: OcrMetadata;
}
```

### Quality derivation (`ocr.agent.ts`)

```typescript
function deriveImageQuality(confidence: number): 'good' | 'acceptable' | 'poor' {
  if (confidence >= 0.8) return 'good';
  if (confidence >= 0.5) return 'acceptable';
  return 'poor';
}
```

Populate after extraction:
```typescript
extractedData.metadata = {
  imageQuality: deriveImageQuality(extractedData.confidence),
  processingTimeMs: Date.now() - startTime,
  modelVersion: '@cf/meta/llama-3.2-11b-vision-instruct',
};
```

## Tests

- Unit test: confidence >= 0.8 → `good`
- Unit test: confidence 0.5–0.79 → `acceptable`
- Unit test: confidence < 0.5 → `poor`
- Unit test: metadata includes processingTimeMs > 0

## Acceptance criteria

- [ ] `OcrMetadata` type defined in `ocr.types.ts`
- [ ] `metadata` field populated in extraction result
- [ ] `imageQuality` correctly derived from confidence score
- [ ] `processingTimeMs` accurately measured
- [ ] `modelVersion` matches the Workers AI model used
