---
id: TASK-005
title: Implement full OCR scan flow in nouvelle demande screen
status: pending
priority: must
requires: [TASK-001, TASK-002, TASK-003]
ref: ADR-001, ADR-002, ADR-005
---

# TASK-005 — Implement full OCR scan flow in nouvelle demande screen

## Objective

Rewrite the `nouvelle.tsx` screen to implement the complete scan → upload → OCR → pre-fill → correct → submit flow, following the proven pattern from `nouveau.tsx` (bulletins).

## Why

The current `nouvelle.tsx` has an incomplete OCR flow: it fires OCR in the background after submission without pre-filling. F-030 requires pre-filling the form with OCR data before submission.

## Files to modify

| File | Change |
|------|--------|
| `apps/mobile/src/app/(main)/demandes/nouvelle.tsx` | Major rewrite — full OCR flow |

## Current state

The existing `nouvelle.tsx` has:
- Step flow: `select-type` → `capture` → `preview` (3 steps)
- Camera capture + gallery picker (working)
- Frame overlay guide (working)
- OCR triggered post-submission (fire-and-forget, broken for pre-fill)
- Manual amount/date input fields (working)
- Submission via `POST /sante/demandes` then `POST /sante/documents/upload` (working)

## Target state

New step flow: `select-type` → `capture` → `extracting` → `ocr-review` (4 steps)

### Step 1: Select type (`select-type`) — KEEP AS-IS
- Type grid selection
- "Continuer" button

### Step 2: Camera capture (`capture`) — KEEP AS-IS
- Camera permission handling
- CameraView with frame overlay (F-005)
- Capture button + Gallery button
- Photo quality: 0.8

### Step 3: OCR extraction (`extracting`) — NEW
Modeled after `nouveau.tsx` lines 327-355:

```
[Captured image preview (small, dimmed)]
[ActivityIndicator]
"Extraction des informations..."
"Analyse du bulletin de soins en cours."
[Button: "Passer et remplir manuellement"]
```

Logic:
1. Create brouillon demande: `POST /sante/demandes` with `{ typeSoin, montantDemande: 0, dateSoin: today, statut: 'brouillon' }`
2. Upload document: `apiClient.upload('/sante/documents/upload', formData)` with `demandeId` and `typeDocument: 'bulletin_soin'`
3. Trigger OCR: `apiClient.post(`/sante/documents/${docId}/ocr`)`
4. On success: pre-fill form fields, advance to `ocr-review`
5. On failure/timeout (15s): advance to `ocr-review` with empty OCR data (manual entry)
6. "Passer" button: skip to `ocr-review` immediately

### Step 4: Review and submit (`ocr-review`) — ENHANCED
Modeled after `nouveau.tsx` lines 429-553:

Display form with pre-filled fields:
- **Type de soin** — from step 1, can be overridden by OCR (`typeSoin`)
- **Date du soin** — from OCR `dateSoin`, editable TextInput
- **Montant total (TND)** — from OCR `montantTotal` (converted from millimes), editable
- **Praticien** — from OCR `praticien.nom` + `praticien.specialite`, editable
- **Articles/Actes** — from OCR `lignes[]`, read-only list

**Low-confidence field marking (F-032):**
For each field, check `ocrData.fieldConfidences[fieldName]`. If < 0.7:
- Orange left border on the field container
- Warning icon next to the label
- Helper text: "Confiance faible — vérifiez cette valeur"

```typescript
const isLowConfidence = (field: string) =>
  ocrData?.fieldConfidences?.[field] !== undefined &&
  ocrData.fieldConfidences[field] < 0.7;
```

**Submit action:**
1. `PATCH /sante/demandes/${demandeId}` with `{ statut: 'soumise', montantDemande, dateSoin, typeSoin }`
2. On success: show Alert with `numeroDemande`, invalidate queries, navigate back
3. On error: show error Alert

## Key implementation patterns (from `nouveau.tsx`)

### OCR extraction function
```typescript
const runOcrExtraction = async (imageUri: string) => {
  setOcrLoading(true);
  try {
    // 1. Create brouillon demande
    const demandeResp = await apiClient.post<{ id: string; numeroDemande: string }>(
      '/sante/demandes',
      { typeSoin: selectedType, montantDemande: 0, dateSoin: new Date().toISOString().split('T')[0] }
    );
    if (!demandeResp.success || !demandeResp.data) throw new Error('Failed to create demande');
    setDemandeId(demandeResp.data.id);

    // 2. Upload document
    const formData = new FormData();
    formData.append('file', { uri: imageUri, type: 'image/jpeg', name: 'feuille_soin.jpg' } as unknown as Blob);
    formData.append('demandeId', demandeResp.data.id);
    formData.append('typeDocument', 'bulletin_soin');

    const uploadResp = await apiClient.upload<{ id: string }>('/sante/documents/upload', formData);
    if (!uploadResp.success || !uploadResp.data) throw new Error('Upload failed');

    // 3. Trigger OCR
    const ocrResp = await apiClient.post<{ data: BulletinExtractedData }>(
      `/sante/documents/${uploadResp.data.id}/ocr`
    );

    if (ocrResp.success && ocrResp.data) {
      const extracted = ocrResp.data.data;
      setOcrData(extracted);
      // Pre-fill form fields
      if (extracted.dateSoin) setEditedDate(extracted.dateSoin);
      if (extracted.typeSoin) setSelectedType(extracted.typeSoin);
      if (extracted.montantTotal > 0) {
        setEditedAmount((extracted.montantTotal / 1000).toFixed(3));
      }
      if (extracted.praticien?.nom) setPraticienName(extracted.praticien.nom);
    }
  } catch (error) {
    console.warn('OCR extraction failed, continuing with manual entry:', error);
  } finally {
    setOcrLoading(false);
    setStep('ocr-review');
  }
};
```

### Submit function
```typescript
const handleSubmit = () => {
  if (!demandeId || !selectedType || !editedAmount) return;

  const montant = parseFloat(editedAmount.replace(',', '.'));
  if (isNaN(montant) || montant <= 0) {
    Alert.alert('Erreur', 'Montant invalide');
    return;
  }

  submitDemande.mutate({
    demandeId,
    statut: 'soumise',
    montantDemande: Math.round(montant * 1000), // TND → millimes
    dateSoin: editedDate || new Date().toISOString().split('T')[0],
    typeSoin: selectedType,
  });
};
```

## New state variables

```typescript
const [demandeId, setDemandeId] = useState<string | null>(null);
const [ocrLoading, setOcrLoading] = useState(false);
const [praticienName, setPraticienName] = useState('');
// Remove: isOcrLoading (replaced by ocrLoading)
// Keep: capturedImage, selectedType, step, ocrData, editedAmount, editedDate
```

## Step transitions

```
select-type ──[Continuer]──> capture
capture ──[takePicture/pickImage]──> extracting
extracting ──[OCR success/fail/skip]──> ocr-review
ocr-review ──[Envoyer]──> (navigate back)
ocr-review ──[Reprendre]──> capture (reset all)
```

## Acceptance criteria

- [ ] Capture photo via camera (F-001) and gallery (F-002)
- [ ] Full-screen preview before upload (F-003)
- [ ] Retake option (F-004)
- [ ] Frame overlay guide in camera view (F-005)
- [ ] Upload to R2 with progress indication (F-010, F-012)
- [ ] `bulletin_soin` type auto-assigned (F-013)
- [ ] OCR triggered after upload, results awaited (F-020)
- [ ] Form pre-filled with OCR data (F-030)
- [ ] All fields editable (F-031)
- [ ] Low-confidence fields marked visually (F-032)
- [ ] Type de soin deduced from OCR when available (F-033)
- [ ] OCR failure → manual entry fallback (AC-5)
- [ ] Demande created with `numeroDemande` displayed (F-041)
- [ ] Query cache invalidated, demande appears in "Mes demandes" (F-043)
