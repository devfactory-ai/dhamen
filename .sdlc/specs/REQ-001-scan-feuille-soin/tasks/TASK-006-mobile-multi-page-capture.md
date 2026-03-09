---
id: TASK-006
title: Multi-page document capture support
status: done
priority: should
requires: [TASK-005]
ref: ADR-010
---

# TASK-006 — Multi-page document capture support

## Objective

Allow the adherent to capture multiple pages for a single feuille de soin, uploading each as a separate document linked to the same demande, with merged OCR results.

## Why

F-006 ("Should"): Some bulletins de soins span multiple pages. The adherent should be able to scan all pages before submitting.

## Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/(main)/demandes/nouvelle.tsx` | Add multi-page capture loop and OCR result merging |

## Implementation details

### State changes

```typescript
const [capturedImages, setCapturedImages] = useState<string[]>([]);
const [documentIds, setDocumentIds] = useState<string[]>([]);
```

Replace single `capturedImage` with `capturedImages` array.

### Capture step changes

After capturing a photo, show a mini-preview with two buttons:
- "Ajouter une page" → return to camera for another capture
- "Continuer" → proceed to extracting step

```typescript
// After capture:
setCapturedImages(prev => [...prev, photo.uri]);
setStep('page-review'); // New intermediate step
```

### New step: `page-review`

Shows thumbnails of all captured pages with:
- Page count badge: "Page 1/N"
- "Ajouter une page" button → back to `capture`
- "Supprimer" button per page
- "Continuer vers l'extraction" button → `extracting`

### Extracting step changes

Upload and OCR each page sequentially:

```typescript
for (const imageUri of capturedImages) {
  // Upload each page
  const formData = new FormData();
  formData.append('file', { uri: imageUri, type: 'image/jpeg', name: `page_${i}.jpg` });
  formData.append('demandeId', demandeId);
  formData.append('typeDocument', 'bulletin_soin');

  const uploadResp = await apiClient.upload('/sante/documents/upload', formData);
  // Trigger OCR per page
  const ocrResp = await apiClient.post(`/sante/documents/${docId}/ocr`);
  ocrResults.push(ocrResp.data);
}
```

### OCR result merging (client-side)

```typescript
function mergeOcrResults(results: BulletinExtractedData[]): BulletinExtractedData {
  const merged: BulletinExtractedData = {
    dateSoin: results.find(r => r.dateSoin)?.dateSoin,
    typeSoin: results.find(r => r.typeSoin)?.typeSoin,
    montantTotal: results.reduce((sum, r) => sum + r.montantTotal, 0),
    praticien: results.find(r => r.praticien?.nom)?.praticien,
    lignes: results.flatMap(r => r.lignes),
    adherentNom: results.find(r => r.adherentNom)?.adherentNom,
    adherentMatricule: results.find(r => r.adherentMatricule)?.adherentMatricule,
    confidence: Math.min(...results.map(r => r.confidence)),
    warnings: results.flatMap(r => r.warnings),
    fieldConfidences: mergeFieldConfidences(results),
  };
  return merged;
}
```

Merge strategy:
- **dateSoin, typeSoin, praticien, adherentNom, adherentMatricule**: take first non-null value
- **montantTotal**: sum across all pages (but display warning if multiple pages have amounts)
- **lignes**: concatenate all line items
- **confidence**: take minimum (most conservative)
- **fieldConfidences**: take minimum per field across pages

### Loading progress

Show page-by-page progress: "Extraction page 1/3..."

## Acceptance criteria

- [ ] Adherent can capture multiple pages before proceeding
- [ ] Each page is uploaded as a separate `sante_documents` record
- [ ] OCR runs on each page
- [ ] OCR results are merged client-side
- [ ] Single-page flow still works without changes
- [ ] Page thumbnails shown during review
- [ ] Pages can be removed individually
