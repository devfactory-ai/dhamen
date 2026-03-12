---
id: TASK-002
parent: REQ-005
status: done
dependencies: []
files:
  - apps/api/src/routes/adherents.ts
---

## Objective

Créer un endpoint GET `/adherents/:id/bulletins` pour retourner l'historique des bulletins de soins d'un adhérent.

## Context

L'**agent assurance** doit consulter les remboursements passés d'un **adhérent** pour vérifier son historique avant de traiter un nouveau **bulletin de soins** (US3). La table `bulletins_soins` a un champ `adherent_id` qui lie chaque bulletin à un adhérent.

## Acceptance Criteria

- AC1 : GET `/adherents/:id/bulletins` retourne la liste des bulletins de soins de l'adhérent
- AC2 : chaque bulletin inclut : id, date_soins, status, declared_amount, reimbursed_amount, nombre d'actes
- AC3 : résultats triés par date décroissante
- AC4 : pagination supportée (page, limit)
- AC5 : accès restreint aux rôles INSURER_AGENT, INSURER_ADMIN, ADMIN

## Implementation Steps

1. Ajouter la route GET `/:id/bulletins` dans adherents.ts (avant les routes `/:id`)
2. SELECT depuis `bulletins_soins` WHERE `adherent_id = ?` avec LEFT JOIN sur `actes_bulletin` pour le count
3. Ajouter pagination et tri par `date_soins DESC`
4. Retourner le format standardisé avec meta pagination

## Tests

- Adhérent avec 3 bulletins retourne les 3 triés par date DESC
- Adhérent sans bulletin retourne une liste vide
- Pagination : page 1 limit 2 retourne 2 résultats avec total = 3
- Agent d'un autre assureur reçoit 403
