---
id: TASK-001
parent: REQ-007
status: pending
dependencies: []
files:
  - apps/api/src/routes/bulletins-soins.ts
---

## Objective

Creer l'endpoint GET /bulletins-soins/history pour lister les bulletins avec statut final (approved, reimbursed, rejected) avec filtres et pagination.

## Context

L'historique doit afficher tous les bulletins traites. L'endpoint supporte la pagination, le tri et des filtres multiples. Les donnees proviennent de bulletins_soins avec jointure adherents pour le nom/matricule et un sous-select COUNT sur actes_bulletin. L'agent ne voit que les bulletins lies a son assureur (filtre via user_id ou created_by).

## Acceptance Criteria

- AC1 : retourne uniquement les bulletins avec statut IN ('approved', 'reimbursed', 'rejected')
- AC2 : filtre par adherentId (exact match sur adherent_id)
- AC3 : filtre par periode (dateFrom, dateTo sur bulletin_date)
- AC4 : filtre par careType (exact match sur care_type)
- AC5 : filtre par status (exact match parmi les 3 statuts)
- AC6 : pagination (page, limit) avec meta {page, limit, total, totalPages}
- AC7 : tri par sortBy (bulletin_date, total_amount, reimbursed_amount, status) et sortOrder (asc, desc)
- AC8 : jointure LEFT JOIN adherents pour first_name, last_name, matricule
- AC9 : sous-requete COUNT(*) FROM actes_bulletin pour chaque bulletin
- AC10 : accessible aux roles INSURER_AGENT et INSURER_ADMIN

## Implementation Steps

1. Ajouter la route GET /history dans bulletins-soins.ts (avant les routes avec parametre :id)
2. Parser et valider les query params avec valeurs par defaut (page=1, limit=20, sortBy=bulletin_date, sortOrder=desc)
3. Construire la clause WHERE dynamique avec les filtres optionnels
4. Executer le COUNT pour la pagination
5. Executer la requete principale avec jointure et sous-select actes
6. Mapper les resultats en camelCase et retourner la reponse paginee

## Tests

- Retourne uniquement les bulletins approved/reimbursed/rejected (pas draft, processing)
- Filtre par adherentId retourne uniquement les bulletins de cet adherent
- Filtre par periode (dateFrom/dateTo) fonctionne correctement
- Filtre par careType retourne uniquement le type demande
- Pagination retourne le bon nombre de resultats et les bonnes meta
- Tri par date DESC par defaut
- Sans filtres, retourne tous les bulletins avec statut final
- Jointure adherent retourne le nom et matricule
