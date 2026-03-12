---
id: TASK-001
parent: REQ-005
status: done
dependencies: []
files:
  - apps/api/src/routes/adherents.ts
---

## Objective

Ajouter le filtrage par entreprise (companyId) et par assureur dans la route GET `/adherents` existante.

## Context

La route GET `/adherents` liste tous les adhérents sans filtrage par entreprise. L'**agent assurance** ne doit voir que les adhérents des entreprises rattachées à son assureur. Le champ `company_id` existe déjà sur la table `adherents` (migration 0020).

## Acceptance Criteria

- AC1 : GET `/adherents` accepte le query param `companyId` pour filtrer par entreprise
- AC2 : si l'utilisateur a un `insurerId`, les résultats sont restreints aux adhérents dont la `company_id` appartient à une entreprise rattachée à cet assureur
- AC3 : les filtres existants (search, city, pagination) continuent de fonctionner
- AC4 : les rôles INSURER_AGENT et INSURER_ADMIN ont accès

## Implementation Steps

1. Ajouter `companyId` au schema de validation des query params
2. Ajouter une clause WHERE sur `company_id` si le param est présent
3. Ajouter une jointure avec `companies` pour vérifier `insurer_id = user.insurerId`
4. Tester avec les données seed existantes

## Tests

- Appel sans companyId retourne tous les adhérents accessibles
- Appel avec companyId retourne uniquement les adhérents de cette entreprise
- Agent d'un assureur ne peut pas voir les adhérents d'un autre assureur
- Pagination fonctionne avec le filtre companyId
