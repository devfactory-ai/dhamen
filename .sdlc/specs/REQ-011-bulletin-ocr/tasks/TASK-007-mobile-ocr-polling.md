---
id: TASK-007
title: Mobile OCR result polling and pre-fill
status: done
priority: must
requires: [TASK-002]
ref: ADR-001, ADR-005
---

# TASK-007 — Mobile OCR result polling and pre-fill

## Objective

Implement client-side polling of the OCR result endpoint and auto-fill the demande form with extracted data, highlighting low-confidence fields.

## Why

- F-030/F-031 require pre-filling the form with OCR data and allowing manual correction.
- F-032 requires visual marking of fields with confidence < 0.7.
- AC-5 validates the complete flow: GET result → pre-fill → highlight low confidence.

## Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/(main)/demandes/nouvelle.tsx` | Add polling logic, pre-fill form, confidence indicators |
| `apps/mobile/src/lib/api-client.ts` | Add `getOcrResult(documentId)` method |

## Implementation details

### API client method

```typescript
async getOcrResult(documentId: string): Promise<OcrResultResponse> {
  return this.get(`/sante/documents/${documentId}/ocr`);
}
```

### Polling hook (in `nouvelle.tsx` or extracted hook)

```typescript
async function pollOcrResult(documentId: string, maxAttempts = 15, intervalMs = 2000): Promise<OcrResultResponse> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await apiClient.getOcrResult(documentId);
    if (result.data.status !== 'processing') return result;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error('OCR_TIMEOUT');
}
```

### Pre-fill logic

After OCR completes, map `BulletinExtractedData` to form fields:
- `dateSoin` → date picker
- `typeSoin` → care type selector
- `praticien.nom` → practitioner name
- `montantTotal` → amount (convert millimes → TND for display)
- `lignes[]` → line items list

### Low-confidence indicators

For each field, check `fieldConfidences[fieldName] < 0.7`:
- Orange border on the input
- Warning icon with tooltip "Vérifiez ce champ"
- Field is editable regardless of confidence

### Skip/fallback button

"Passer et remplir manuellement" button visible during polling and on OCR failure.

## Tests

- Unit test: polling stops when status is `completed`
- Unit test: polling stops when status is `failed`
- Unit test: timeout after maxAttempts
- Unit test: form fields pre-filled from OCR data
- Unit test: low-confidence fields have warning indicator

## Acceptance criteria

- [ ] OCR result is polled every 2s until completed/failed
- [ ] Form is pre-filled with extracted data on success
- [ ] Fields with confidence < 0.7 are visually marked
- [ ] User can manually edit all pre-filled fields
- [ ] "Skip" button allows manual entry on timeout or failure
- [ ] Loading screen shown during OCR processing
