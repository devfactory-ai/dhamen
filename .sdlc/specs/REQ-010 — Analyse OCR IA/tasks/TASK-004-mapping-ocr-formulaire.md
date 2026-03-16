---
id: TASK-004
title: Mapping complet OCR -> champs formulaire
status: done
priority: must
requires: [TASK-002, TASK-003]
ref: ADR-001
---

# TASK-004 — Mapping complet OCR -> champs formulaire

## Objective

Completer le mapping de tous les champs de la reponse OCR vers les champs du formulaire de saisie, incluant adresse, beneficiaire, et les actes enrichis (code + label).

## Why

Le mapping actuel est partiel : nom, matricule, date et montants sont mappes, mais l'adresse, le beneficiaire et les codes actes ne le sont pas.

## Files to modify

| File | Change |
|------|--------|
| `apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx` | Mise a jour `analyzeWithOCR()` avec tous les mappings |

## Mapping complet

### infos_adherent

| Champ OCR | Champ formulaire | Transformation |
|-----------|-----------------|----------------|
| `nom_prenom` | `adherent_last_name` + `adherent_first_name` | Split sur espaces : premier mot = nom, reste = prenom |
| `numero_contrat` | `adherent_matricule` + recherche auto | Suppression espaces |
| `date_signature` | `bulletin_date` | DD/MM/YYYY -> YYYY-MM-DD |
| `adresse` | `adherent_address` | Tel quel (TASK-005) |
| `beneficiaire_coche` | `beneficiary_relationship` | Mapping : "Adherent" -> rien, "Conjoint" -> spouse, "Enfant" -> child (TASK-006) |

### volet_medical (par acte)

| Champ OCR | Champ formulaire | Transformation |
|-----------|-----------------|----------------|
| `matched_code` | `actes[i].code` | Utilise le code enrichi par TASK-003 |
| `matched_label` | `actes[i].label` | Utilise le label enrichi, fallback sur nature_acte |
| `montant_honoraires` / `montant_facture` | `actes[i].amount` | Strip non-numeriques, parse float |
| `nom_praticien` | `actes[i].nom_prof_sant` | Tel quel |
| `matricule_fiscale` | `actes[i].ref_prof_sant` | Tel quel |

## Implementation

```typescript
// infos_adherent
if (info.adresse) setValue('adherent_address', info.adresse);
if (info.beneficiaire_coche) {
  const benef = info.beneficiaire_coche.toLowerCase().trim();
  if (benef.includes('conjoint')) setValue('beneficiary_relationship', 'spouse');
  else if (benef.includes('enfant')) setValue('beneficiary_relationship', 'child');
  else if (benef.includes('parent') || benef.includes('ascendant')) setValue('beneficiary_relationship', 'parent');
}

// volet_medical — utiliser matched_code/matched_label
if (i === 0) {
  setValue('actes.0.code', acte.matched_code || '');
  setValue('actes.0.label', acte.matched_label || acte.nature_acte || '');
  // ... montant, praticien
} else {
  appendActe({
    code: acte.matched_code || '',
    label: acte.matched_label || acte.nature_acte || '',
    // ... montant, praticien
  });
}
```

## Acceptance criteria

- [ ] Tous les champs OCR sont mappes vers les champs formulaire
- [ ] Code acte enrichi (matched_code) utilise quand disponible
- [ ] Adresse pre-remplie (depend de TASK-005)
- [ ] Beneficiaire mappe correctement (depend de TASK-006)
