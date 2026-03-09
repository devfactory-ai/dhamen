---
id: TASK-002
title: OCR agent — Arabic support and per-field confidence scores
status: pending
priority: must
requires: []
ref: ADR-003, ADR-006
---

# TASK-002 — OCR agent: Arabic support and per-field confidence scores

## Objective

Enhance the OCR agent to (1) explicitly support Arabic documents in the extraction prompt, and (2) return per-field confidence scores alongside the global score.

## Why

- F-024 requires French + Arabic support. The current prompt is French-only. LLaMA 3.2 vision is multilingual but the prompt must instruct it to handle Arabic text.
- F-032 requires visual marking of low-confidence fields (< 0.7). The current `confidence` is global only — a field at 0.3 can be hidden by a global 0.8.

## Files to modify

| File | Change |
|------|--------|
| `apps/api/src/agents/ocr/ocr.types.ts` | Add `FieldConfidence` type and `fieldConfidences` to `BulletinExtractedData` |
| `apps/api/src/agents/ocr/ocr.agent.ts` | Update `EXTRACTION_PROMPT` for Arabic support |
| `apps/api/src/agents/ocr/ocr.rules.ts` | Add `calculateFieldConfidences()` function |
| `apps/api/src/agents/ocr/ocr.test.ts` | Add tests for field confidence calculation |

## Implementation details

### 1. Types (`ocr.types.ts`)

Add after `BulletinExtractedData`:

```typescript
/**
 * Per-field confidence scores for OCR extraction
 */
export type FieldConfidence = Record<string, number>;

// Update BulletinExtractedData:
export interface BulletinExtractedData {
  // ... existing fields ...

  // Metadata
  confidence: number;
  fieldConfidences?: FieldConfidence;  // <-- ADD
  warnings: string[];
  rawText?: string;
}
```

Fields tracked in `fieldConfidences`:
- `dateSoin` — 1.0 if valid date format, 0.5 if parseable but unusual, 0.0 if absent
- `typeSoin` — 1.0 if matched from known patterns, 0.3 if inferred, 0.0 if absent
- `montantTotal` — 1.0 if > 0 and reasonable range, 0.5 if suspicious, 0.0 if absent
- `praticienNom` — 1.0 if present + length > 2, 0.0 if absent
- `praticienSpecialite` — 1.0 if present and known specialty, 0.5 if present but unknown, 0.0 if absent
- `lignes` — 1.0 if count > 0 and totals match, 0.7 if count > 0 but totals mismatch, 0.0 if empty
- `adherentMatricule` — 1.0 if matches Tunisian format (`\d{8}[A-Z]?`), 0.5 if present but bad format, 0.0 if absent

### 2. Prompt update (`ocr.agent.ts`)

Update `EXTRACTION_PROMPT` — add Arabic instruction block:

```typescript
const EXTRACTION_PROMPT = `Vous etes un assistant specialise dans l'analyse de documents medicaux tunisiens.
Analysez cette image d'un bulletin de soins ou d'une facture medicale tunisienne.

IMPORTANT: Le document peut etre en francais, en arabe, ou bilingue (francais/arabe).
Si le document est en arabe, extrayez les informations et retournez-les en francais dans le JSON.
Les noms propres (praticien, adherent) doivent etre translitteres en caracteres latins si necessaire.

Extrayez les informations suivantes au format JSON:
// ... rest of existing prompt unchanged ...
`;
```

### 3. Field confidence calculation (`ocr.rules.ts`)

Add new exported function:

```typescript
export function calculateFieldConfidences(data: BulletinExtractedData): FieldConfidence {
  const confidences: FieldConfidence = {};

  // dateSoin
  if (data.dateSoin) {
    const date = new Date(data.dateSoin);
    const now = new Date();
    const isValid = !isNaN(date.getTime()) && date <= now;
    confidences.dateSoin = isValid ? 1.0 : 0.5;
  } else {
    confidences.dateSoin = 0.0;
  }

  // typeSoin
  if (data.typeSoin) {
    confidences.typeSoin = 1.0;
  } else {
    confidences.typeSoin = 0.0;
  }

  // montantTotal
  if (data.montantTotal > 0 && data.montantTotal <= 10_000_000) {
    confidences.montantTotal = 1.0;
  } else if (data.montantTotal > 0) {
    confidences.montantTotal = 0.5;
  } else {
    confidences.montantTotal = 0.0;
  }

  // praticienNom
  confidences.praticienNom = data.praticien?.nom && data.praticien.nom.length > 2 ? 1.0 : 0.0;

  // praticienSpecialite
  confidences.praticienSpecialite = data.praticien?.specialite ? 1.0 : 0.0;

  // lignes
  if (data.lignes.length > 0) {
    const itemsTotal = data.lignes.reduce((sum, l) => sum + l.montantTotal, 0);
    const matchesTotal = Math.abs(itemsTotal - data.montantTotal) <= 1000;
    confidences.lignes = matchesTotal ? 1.0 : 0.7;
  } else {
    confidences.lignes = 0.0;
  }

  // adherentMatricule
  if (data.adherentMatricule) {
    confidences.adherentMatricule = /^\d{8}[A-Z]?$/.test(data.adherentMatricule) ? 1.0 : 0.5;
  } else {
    confidences.adherentMatricule = 0.0;
  }

  return confidences;
}
```

Call this function in `ocr.agent.ts` after `calculateConfidence()`:

```typescript
extractedData.fieldConfidences = calculateFieldConfidences(extractedData);
```

### 4. Update `parseAIResponse()` in `ocr.agent.ts`

Ensure the `BulletinExtractedData` returned includes `fieldConfidences: {}` placeholder that gets filled after parsing.

## Tests (`ocr.test.ts`)

Add new `describe('calculateFieldConfidences')` block:

```typescript
describe('calculateFieldConfidences', () => {
  it('returns 1.0 for all fields when data is complete and valid', () => {
    const data: BulletinExtractedData = {
      dateSoin: '2026-01-15',
      typeSoin: 'pharmacie',
      montantTotal: 50000,
      praticien: { nom: 'Dr. Ben Ali', specialite: 'generaliste' },
      lignes: [{ libelle: 'Doliprane', quantite: 1, prixUnitaire: 50000, montantTotal: 50000 }],
      adherentMatricule: '12345678A',
      confidence: 1.0,
      warnings: [],
    };
    const result = calculateFieldConfidences(data);
    expect(result.dateSoin).toBe(1.0);
    expect(result.montantTotal).toBe(1.0);
    expect(result.praticienNom).toBe(1.0);
    expect(result.adherentMatricule).toBe(1.0);
  });

  it('returns 0.0 for missing fields', () => {
    const data: BulletinExtractedData = {
      montantTotal: 0,
      lignes: [],
      confidence: 0,
      warnings: [],
    };
    const result = calculateFieldConfidences(data);
    expect(result.dateSoin).toBe(0.0);
    expect(result.typeSoin).toBe(0.0);
    expect(result.montantTotal).toBe(0.0);
    expect(result.praticienNom).toBe(0.0);
  });

  it('returns 0.5 for suspicious matricule format', () => {
    const data: BulletinExtractedData = {
      montantTotal: 50000,
      lignes: [],
      adherentMatricule: 'ABC123',
      confidence: 0.5,
      warnings: [],
    };
    const result = calculateFieldConfidences(data);
    expect(result.adherentMatricule).toBe(0.5);
  });
});
```

## Acceptance criteria

- [ ] `EXTRACTION_PROMPT` explicitly mentions Arabic/bilingual support
- [ ] `BulletinExtractedData` includes optional `fieldConfidences: FieldConfidence`
- [ ] `calculateFieldConfidences()` returns a score (0–1) for each key field
- [ ] Global `confidence` calculation remains unchanged
- [ ] All existing OCR tests still pass
- [ ] New field confidence tests pass
