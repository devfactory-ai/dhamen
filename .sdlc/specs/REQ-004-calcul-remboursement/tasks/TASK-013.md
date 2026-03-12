---
id: TASK-013
parent: REQ-004
status: done
dependencies: [TASK-009]
files:
  - apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx
---

## Objective

Améliorer la section totaux du **bulletin de soins** pour afficher le détail complet : montant déclaré, remboursement brut, remboursement final.

## Context

Le total actuel affiche seulement "Déclaré" et "Remboursé". L'**agent assurance** doit voir le remboursement brut (avant plafond) vs final (après plafond) pour comprendre l'impact du plafond sur le total.

## Acceptance Criteria

- AC1 : afficher "Montant déclaré total" = somme des montants actes
- AC2 : afficher "Remboursement brut total" = somme des remboursement_brut (avant plafond)
- AC3 : afficher "Remboursement final total" = reimbursed_amount (après plafond)
- AC4 : si brut ≠ final, afficher la différence en rouge "Réduction plafond: -X DT"
- AC5 : mise en forme claire avec séparation visuelle (bordure, fond)

## Implementation Steps

1. Calculer le total brut depuis les actes (`remboursement_brut`)
2. Remplacer le footer actuel par un bloc récapitulatif 3 lignes
3. Ajouter la ligne de différence conditionnelle si plafond appliqué
4. Appliquer un style distinct (fond, bordure arrondie)

## Tests

- Bulletin sans plafond atteint : brut = final, pas de ligne différence
- Bulletin avec plafond atteint : brut > final, ligne rouge affichée
- Bulletin avec plafond épuisé : final = 0, différence = brut total
