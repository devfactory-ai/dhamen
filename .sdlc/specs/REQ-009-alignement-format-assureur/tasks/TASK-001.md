---
id: TASK-001
parent: REQ-009
status: done
dependencies: []
files:
  - packages/db/migrations/0076_create_familles_actes.sql
  - packages/db/migrations/0077_refonte_actes_referentiel.sql
  - packages/shared/src/types/acte.ts
  - packages/shared/src/schemas/acte-referentiel.ts
---

## Objective

Creer la table `familles_actes` avec les 20 familles d'actes medicaux standard (FA0001 a FA0020), enrichir `actes_referentiel` avec les codes actes reels (C1, C2, PH1, AN, R, etc.) et mapper les codes generiques existants.

## Context

Le systeme actuel utilise des codes actes generiques (CONS-GEN, CONS-SPE, PHARMA, etc.) qui ne correspondent pas aux codes standards du secteur assurance sante en Tunisie. Les assureurs utilisent des codes specifiques (C1, C2, C3, V1, V2, V3, PH1, AN, R, SD, CL, FCH, ANE, SO, TS, ODF, KC, PUU) organises par familles d'actes (FA0001 a FA0020). Le modele doit supporter deux types de calcul : taux (pourcentage) et forfait (montant fixe).

## Acceptance Criteria

- AC1 : table `familles_actes` creee avec les 20 familles (FA0001 Consultations et Visites, FA0003 Frais pharmaceutiques, FA0004 Analyses, FA0007 Hospitalisation, FA0010 Frais chirurgicaux, FA0011 Soins dentaires, etc.)
- AC2 : colonnes ajoutees a `actes_referentiel` : `famille_id`, `type_calcul` (taux/forfait), `valeur_base` (montant forfaitaire en millimes), `code_assureur` (code court)
- AC3 : les 20+ codes actes reels sont inseres (C1, C2, C3, V1, V2, V3, PH1, AN, R, SD, CL, FCH, ANE, SO, TS, ODF, KC, PUU, PC, AM, AMM)
- AC4 : les anciens codes (CONS-GEN, PHARMA, etc.) conservent un mapping via `code_assureur`
- AC5 : les types et schemas Zod sont mis a jour dans packages/shared

## Implementation Steps

1. Creer migration 0076 : table `familles_actes` avec INSERT des 20 familles
2. Creer migration 0077 : ALTER TABLE `actes_referentiel` + INSERT des codes actes reels + UPDATE mapping anciens codes
3. Mettre a jour les types TypeScript dans packages/shared/src/types/acte.ts
4. Mettre a jour les schemas Zod dans packages/shared/src/schemas/acte-referentiel.ts

## Tests

- Requete par code retourne le bon acte avec sa famille
- Les 20 familles sont presentes et actives
- Les anciens codes sont toujours accessibles (retrocompatibilite)
- Le type_calcul est valide (taux ou forfait uniquement)
- Un acte forfaitaire a une valeur_base > 0
