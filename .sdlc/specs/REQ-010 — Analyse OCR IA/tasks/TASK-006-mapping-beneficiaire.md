---
id: TASK-006
title: Mapping beneficiaire_coche -> lien de parente
status: done
priority: should
requires: []
ref: ADR-001
---

# TASK-006 — Mapping beneficiaire_coche -> lien de parente

## Objective

Mapper automatiquement le champ `beneficiaire_coche` de la reponse OCR vers le select "Lien de parente" du formulaire, et ameliorer le composant Select pour supporter le pre-remplissage.

## Why

L'OCR retourne qui est le beneficiaire (Adherent, Conjoint, Enfant) mais cette information n'est pas mappee dans le formulaire actuel. De plus, le Select n'est pas controle (pas de `value`), donc le pre-remplissage programmatique via `setValue` ne se reflete pas visuellement.

## Files to modify

| File | Change |
|------|--------|
| `apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx` | Select controle + mapping OCR |

## Implementation details

### 1. Rendre le Select controle

```tsx
<Select
  value={watch('beneficiary_relationship') || ''}
  onValueChange={(v) => setValue('beneficiary_relationship', v)}
>
```

### 2. Ajouter option "Adherent lui-meme"

```tsx
<SelectItem value="self">Adherent lui-meme</SelectItem>
<SelectItem value="spouse">Conjoint(e)</SelectItem>
<SelectItem value="child">Enfant</SelectItem>
<SelectItem value="parent">Parent</SelectItem>
```

### 3. Mapping OCR

```typescript
if (info.beneficiaire_coche) {
  const benef = info.beneficiaire_coche.toLowerCase().trim();
  if (benef.includes('conjoint')) {
    setValue('beneficiary_relationship', 'spouse');
  } else if (benef.includes('enfant')) {
    setValue('beneficiary_relationship', 'child');
  } else if (benef.includes('parent') || benef.includes('ascendant')) {
    setValue('beneficiary_relationship', 'parent');
  } else if (benef.includes('adh')) {
    setValue('beneficiary_relationship', 'self');
  }
}
```

## Acceptance criteria

- [ ] Select est controle et reflete la valeur pre-remplie
- [ ] "Adherent" -> option "Adherent lui-meme" selectionnee
- [ ] "Conjoint" -> option "Conjoint(e)" selectionnee
- [ ] "Enfant" -> option "Enfant" selectionnee
