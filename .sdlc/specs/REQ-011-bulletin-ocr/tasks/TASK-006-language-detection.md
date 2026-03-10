---
id: TASK-006
title: Add language detection to OCR extraction
status: done
priority: should
requires: []
ref: ADR-001
---

# TASK-006 — Add language detection to OCR extraction

## Objective

Detect and return the language of the scanned bulletin (`fr`, `ar`, or `fr-ar`) in the OCR result.

## Why

- F-030 to F-033 require French, Arabic, and bilingual support with language detection.
- AC-2 validates that Arabic bulletins return `language: "ar"`.
- The detected language helps the client display appropriate UI direction (RTL for Arabic).

## Files to modify

| File | Change |
|------|--------|
| `apps/api/src/agents/ocr/ocr.types.ts` | Add `language` field to `BulletinExtractedData` |
| `apps/api/src/agents/ocr/ocr.agent.ts` | Update prompt to request language detection, parse response |
| `apps/api/src/agents/ocr/ocr.rules.ts` | Add `detectLanguage()` fallback function |
| `apps/api/src/agents/ocr/ocr.test.ts` | Add language detection tests |

## Implementation details

### Types (`ocr.types.ts`)

```typescript
export type DocumentLanguage = 'fr' | 'ar' | 'fr-ar';

// Add to BulletinExtractedData:
export interface BulletinExtractedData {
  // ... existing fields ...
  language?: DocumentLanguage;
}
```

### Prompt update (`ocr.agent.ts`)

Add to the extraction prompt JSON output format:
```
"language": "fr" ou "ar" ou "fr-ar" (langue principale du document)
```

### Fallback detection (`ocr.rules.ts`)

```typescript
const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;

export function detectLanguage(text: string): DocumentLanguage {
  if (!text) return 'fr';
  const hasArabic = ARABIC_REGEX.test(text);
  const hasLatin = /[a-zA-ZÀ-ÿ]/.test(text);
  if (hasArabic && hasLatin) return 'fr-ar';
  if (hasArabic) return 'ar';
  return 'fr';
}
```

Used as fallback if the model doesn't return a `language` field.

## Tests

- Unit test: pure French text → `fr`
- Unit test: pure Arabic text → `ar`
- Unit test: mixed French/Arabic text → `fr-ar`
- Unit test: empty text → `fr` (default)
- Integration test: Arabic bulletin returns `language: "ar"` in OCR result

## Acceptance criteria

- [ ] `language` field present in `BulletinExtractedData`
- [ ] Model prompt requests language detection
- [ ] Fallback `detectLanguage()` works with regex when model omits field
- [ ] AC-2 passes: Arabic bulletin returns `language: "ar"`
