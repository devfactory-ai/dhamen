---
id: TASK-009
parent: REQ-004
status: done
dependencies: [TASK-008]
files:
  - apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx
---

## Objective

Afficher le détail du remboursement par **acte médical** : montant déclaré, taux, remboursement brut, remboursement final, et alerte si limité par plafond.

## Context

Règle de calcul (REQ-004, REQ-000) :
- `remboursement_brut = montant_acte × taux_remboursement`
- `remboursement_final = min(remboursement_brut, plafond_restant)`

L'**agent assurance** doit voir le détail complet pour chaque acte afin de comprendre comment le montant remboursé a été déterminé.

## Acceptance Criteria

- AC1 : chaque acte affiche montant déclaré, taux, remboursement brut, remboursement final
- AC2 : si `plafond_depasse = true`, afficher un indicateur orange/rouge avec le texte "Limité par plafond"
- AC3 : si `remboursement_final = 0` et `remboursement_brut > 0`, afficher "Plafond épuisé" en rouge
- AC4 : si `taux_remboursement = 0`, afficher "Acte non référencé" en gris

## Implementation Steps

1. Mettre à jour le type acte dans le state `viewBulletin` pour inclure `remboursement_brut` et `plafond_depasse`
2. Ajouter la colonne "Remb. brut" dans le tableau des actes
3. Ajouter un badge conditionnel par acte (limité / épuisé / non référencé)
4. Conserver la colonne "Remboursé" pour le montant final

## Tests

- Bulletin avec actes sans dépassement : pas de badge d'alerte
- Bulletin avec acte partiellement remboursé : badge "Limité par plafond"
- Bulletin avec plafond épuisé : badge "Plafond épuisé" sur les actes à 0
- Bulletin avec acte sans code référentiel : badge "Acte non référencé"
