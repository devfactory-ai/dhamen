---
id: TASK-006
parent: REQ-004
status: done
dependencies: [TASK-002, TASK-003, TASK-004]
files:
  - apps/api/src/routes/bulletins-agent.ts
  - packages/db/src/queries/actes-referentiel.ts
---

## Objective

Intégrer le calcul de remboursement dans le flux de validation des bulletins de soins.

## Context

Le workflow du domaine (REQ-000) : **Bulletin de soins** → **Actes médicaux** → **Calcul remboursement** → **Vérification plafond** → **Validation**.

Lors de la création d'un bulletin via `bulletins-agent.ts`, le système doit :
1. Résoudre le taux de chaque **acte médical** via le référentiel (`actes_referentiel`)
2. Récupérer le `plafond_restant` de l'**adhérent** (`plafond_global - plafond_consomme`)
3. Appeler le service de calcul
4. Persister les montants sur `actes_bulletin` et `bulletins_soins.reimbursed_amount`
5. Mettre à jour `adherents.plafond_consomme`

## Acceptance Criteria

- AC1 : query helper `findActeRefByCode(db, code)` dans `packages/db/src/queries/actes-referentiel.ts`
- AC2 : lors de la création d'un bulletin, chaque acte est enrichi avec `taux_remboursement` depuis le référentiel
- AC3 : `montant_rembourse` est calculé et stocké pour chaque `actes_bulletin`
- AC4 : `reimbursed_amount` total est calculé et stocké sur `bulletins_soins`
- AC5 : `plafond_consomme` de l'adhérent est incrémenté du total remboursé
- AC6 : si le plafond est dépassé, le calcul plafonne sans erreur (AC2 du requirement)

## Implementation Steps

1. Créer `packages/db/src/queries/actes-referentiel.ts` avec les helpers
2. Modifier la route de création dans `bulletins-agent.ts`
3. Appeler `calculateRemboursementBulletin()` et persister les résultats
4. UPDATE `adherents SET plafond_consomme = plafond_consomme + totalRembourse`
