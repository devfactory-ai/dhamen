---
id: TASK-005
parent: REQ-004
status: done
dependencies: [TASK-004]
files:
  - apps/api/src/services/remboursement.service.test.ts
---

## Objective

Écrire les tests unitaires du service de calcul de remboursement.

## Context

Le calcul doit être déterministe et reproductible (AC4 du requirement). Les tests doivent couvrir la règle principale du domaine : `remboursement = min(montant × taux, plafond_restant)` appliquée à chaque **acte médical** d'un **bulletin de soins**, en respectant le **plafond annuel** de l'**adhérent**.

## Acceptance Criteria

- AC1 : test calcul simple — `montant × taux` sans dépassement de plafond
- AC2 : test plafond atteint — remboursement plafonné au restant
- AC3 : test plafond épuisé — remboursement = 0
- AC4 : test bulletin multi-actes — plafond décrémenté acte par acte
- AC5 : test bulletin multi-actes avec plafond atteint en cours de calcul (un acte partiellement remboursé)
- AC6 : test valeurs limites — montant 0, taux 0, taux 1, plafond 0
- AC7 : coverage ≥ 80% sur le service

## Implementation Steps

1. Créer `apps/api/src/services/remboursement.service.test.ts`
2. Implémenter les cas de test AC1 à AC6
3. Vérifier la coverage avec `vitest --coverage`
