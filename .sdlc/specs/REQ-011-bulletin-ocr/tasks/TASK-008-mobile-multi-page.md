---
id: TASK-008
title: Mobile multi-page bulletin capture
status: done
priority: should
requires: [TASK-007]
ref: ADR-005
---

# TASK-008 — Mobile multi-page bulletin capture

## Objective

Allow the adherent to capture multiple pages for a single bulletin, with independent OCR per page and client-side result fusion.

## Why

- F-006 requires multi-page support for bulletins that span 2-3 pages.
- NF-002 targets < 15 seconds for multi-page extraction.
- The existing 1:N relation `sante_documents → sante_demandes` supports this natively.

## Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/(main)/demandes/nouvelle.tsx` | Add "Ajouter une page" button, loop capture, merge results |

## Implementation details

### Capture loop

After first photo preview, show "Ajouter une page" button:
```
[Preview page 1] → [Ajouter une page] / [Continuer]
[Preview page 2] → [Ajouter une page] / [Continuer]
...
[Continuer] → Upload all → OCR all → Merge → Pre-fill
```

### Upload and OCR per page

Each page is uploaded independently as a separate `sante_document` linked to the same `demandeId`. OCR is triggered on each. Results are collected.

### Client-side fusion

```typescript
function mergeOcrResults(results: BulletinExtractedData[]): BulletinExtractedData {
  const primary = results[0]; // First page has patient/practitioner info
  return {
    ...primary,
    lignes: results.flatMap(r => r.lignes),
    montantTotal: results.reduce((sum, r) => sum + r.montantTotal, 0),
    confidence: Math.min(...results.map(r => r.confidence)),
    warnings: results.flatMap(r => r.warnings),
  };
}
```

### Page indicators

Show page count badge: "Page 1/3", "Page 2/3", etc. Allow removing a page before upload.

## Tests

- Unit test: `mergeOcrResults` concatenates line items
- Unit test: `mergeOcrResults` sums montantTotal
- Unit test: `mergeOcrResults` uses minimum confidence
- Unit test: single page returns unchanged result

## Acceptance criteria

- [ ] "Ajouter une page" button visible after first capture
- [ ] Each page is uploaded and OCR'd independently
- [ ] Results are merged client-side before pre-filling
- [ ] Total amount is sum of all pages
- [ ] Minimum confidence across pages is used as global confidence
- [ ] User can remove a page before uploading
