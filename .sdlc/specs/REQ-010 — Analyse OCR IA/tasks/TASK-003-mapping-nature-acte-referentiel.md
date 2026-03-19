---
id: TASK-003
title: Mapping intelligent nature_acte -> codes referentiel
status: done
priority: must
requires: [TASK-001]
ref: ADR-003
---

# TASK-003 — Mapping intelligent nature_acte -> codes referentiel

## Objective

Implementer une fonction de mapping qui associe les termes libres retournes par l'OCR (`nature_acte`) aux codes actes du referentiel Dhamen. Le mapping enrichit la reponse OCR cote backend.

## Why

L'OCR retourne des termes comme "Psychiatre", "Generaliste", "Pharmacie" dans le champ `nature_acte`. Ces termes ne correspondent pas aux codes du referentiel (C1, C2, PH1...). Sans mapping, l'agent doit identifier manuellement le code acte.

## Files to modify

| File | Change |
|------|--------|
| `apps/api/src/routes/bulletins-agent.ts` | Ajout fonction `mapNatureActeToCode()` + enrichissement dans le proxy |
| `apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx` | Utiliser `matched_code` et `matched_label` de la reponse |

## Table de mapping

| Mots-cles OCR | Code | Label referentiel |
|---------------|------|-------------------|
| generaliste, medecin general, medecin de famille | C1 | Consultation generaliste |
| specialiste, psychiatre, cardiologue, dermatologue, gyneco, ORL, pneumo, gastro, neuro, uro, endocrino, ophtalmologue, rhumato | C2 | Consultation specialiste |
| professeur, prof | C3 | Consultation professeur |
| pharmacie, medicament, pharmaceut | PH1 | Frais pharmaceutiques |
| analyse, biolog, sang, labo, bilan | AN | Analyses biologiques |
| radio, radiograph, radiologie | R | Radiologie |
| echograph, echo | E | Echographie |
| scanner, IRM, imagerie | TS | Traitements speciaux |
| dentaire, dent, dentist | SD | Soins dentaires |
| kine, physiother, reeducation | PC | Pratiques courantes |
| clinique, hospitalisation | CL | Hospitalisation clinique |
| hopital | HP | Hospitalisation hopital |
| chirurg, operation, bloc | FCH | Frais chirurgicaux |
| optique, lunettes, verres | OPT | Optique |
| accouchement, maternite | ACC | Accouchement |
| orthodont | ODF | Soins orthodontiques |

## Implementation details

### Fonction mapping (backend)

```typescript
interface ActeMapping {
  code: string;
  label: string;
}

const NATURE_ACTE_MAPPINGS: Array<{ keywords: string[]; code: string; label: string }> = [
  { keywords: ['generaliste', 'medecin general', 'medecin de famille'], code: 'C1', label: 'Consultation generaliste' },
  { keywords: ['specialiste', 'psychiatre', 'cardiologue', 'dermatologue', 'gynecologue', 'orl', 'pneumologue', 'gastro', 'neurologue', 'urologue', 'endocrinologue', 'ophtalmologue', 'rhumatologue'], code: 'C2', label: 'Consultation specialiste' },
  { keywords: ['professeur', 'prof'], code: 'C3', label: 'Consultation professeur' },
  { keywords: ['pharmacie', 'medicament', 'pharmaceut'], code: 'PH1', label: 'Frais pharmaceutiques' },
  { keywords: ['analyse', 'biolog', 'sang', 'labo', 'bilan'], code: 'AN', label: 'Analyses biologiques' },
  { keywords: ['radio', 'radiograph', 'radiologie'], code: 'R', label: 'Radiologie' },
  { keywords: ['echograph', 'echo'], code: 'E', label: 'Echographie' },
  { keywords: ['scanner', 'irm', 'imagerie'], code: 'TS', label: 'Traitements speciaux' },
  { keywords: ['dentaire', 'dent', 'dentist'], code: 'SD', label: 'Soins dentaires' },
  { keywords: ['kine', 'physiother', 'reeducation'], code: 'PC', label: 'Pratiques courantes' },
  { keywords: ['clinique', 'hospitalisation'], code: 'CL', label: 'Hospitalisation clinique' },
  { keywords: ['hopital'], code: 'HP', label: 'Hospitalisation hopital' },
  { keywords: ['chirurg', 'operation', 'bloc'], code: 'FCH', label: 'Frais chirurgicaux' },
  { keywords: ['optique', 'lunettes', 'verres'], code: 'OPT', label: 'Optique' },
  { keywords: ['accouchement', 'maternite'], code: 'ACC', label: 'Accouchement' },
  { keywords: ['orthodont'], code: 'ODF', label: 'Soins orthodontiques' },
];

function mapNatureActeToCode(natureActe: string): ActeMapping | null {
  const text = natureActe.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const mapping of NATURE_ACTE_MAPPINGS) {
    if (mapping.keywords.some(kw => text.includes(kw))) {
      return { code: mapping.code, label: mapping.label };
    }
  }
  return null;
}
```

### Enrichissement dans le proxy

Apres le nettoyage de la reponse OCR, enrichir chaque acte du `volet_medical` :

```typescript
if (Array.isArray(parsed.volet_medical)) {
  for (const acte of parsed.volet_medical) {
    const match = mapNatureActeToCode(acte.nature_acte || '');
    acte.matched_code = match?.code || null;
    acte.matched_label = match?.label || acte.nature_acte || null;
  }
}
```

### Frontend : utiliser les champs enrichis

```typescript
setValue('actes.0.code', acte.matched_code || '');
setValue('actes.0.label', acte.matched_label || acte.nature_acte || '');
```

## Tests

- "Psychiatre" -> C2
- "Generaliste" -> C1
- "Pharmacie" -> PH1
- "Analyse sang" -> AN
- "Inconnu XYZ" -> null (fallback label OCR)

## Acceptance criteria

- [ ] Fonction `mapNatureActeToCode` implementee
- [ ] Reponse proxy enrichie avec `matched_code` et `matched_label`
- [ ] "Psychiatre" mappe vers C2 dans le formulaire
- [ ] Termes non reconnus conserves en label sans code
