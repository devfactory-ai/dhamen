---
id: TASK-003
parent: REQ-005
status: done
dependencies: []
files:
  - apps/api/src/routes/adherents.ts
---

## Objective

Créer un endpoint GET `/adherents/search` pour la recherche rapide (autocomplete) par matricule ou nom.

## Context

L'**agent assurance** doit pouvoir rechercher rapidement un **adhérent** par matricule ou nom lors de la saisie d'un **bulletin de soins** (US5). L'endpoint doit retourner un nombre limité de résultats pour alimenter un champ autocomplete.

## Acceptance Criteria

- AC1 : GET `/adherents/search?q=X` retourne max 10 résultats
- AC2 : la recherche porte sur matricule, first_name et last_name (LIKE %q%)
- AC3 : chaque résultat retourne : id, matricule, firstName, lastName, companyName, plafondGlobal, plafondConsomme
- AC4 : si l'agent a un insurerId, seuls les adhérents de ses entreprises sont retournés
- AC5 : le param `q` doit avoir au moins 2 caractères

## Implementation Steps

1. Ajouter la route GET `/search` dans adherents.ts (avant `/:id` pour éviter conflit)
2. Construire une requête SELECT avec LIKE sur matricule, first_name, last_name
3. Joindre `companies` pour le nom d'entreprise et le filtrage par insurer
4. Limiter à 10 résultats, pas de pagination

## Tests

- Recherche "MOH" retourne les adhérents dont le nom/prénom commence par MOH
- Recherche "MAT-GAT" retourne l'adhérent avec ce matricule
- Recherche avec 1 caractère retourne erreur de validation
- Agent GAT ne voit pas les adhérents des entreprises STAR
