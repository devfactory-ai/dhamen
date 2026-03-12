---
id: TASK-007
parent: REQ-005
status: done
dependencies: [TASK-002, TASK-004, TASK-006]
files:
  - apps/web/src/features/adherents/pages/AgentAdherentsPage.tsx
---

## Objective

Ajouter la section historique des bulletins de soins dans le détail adhérent.

## Context

L'**agent assurance** doit voir l'historique des **bulletins de soins** d'un **adhérent** avec les montants déclarés et remboursés (US3). Cela permet de vérifier les **remboursements** passés et le cumul de consommation du **plafond**.

## Acceptance Criteria

- AC1 : section "Historique bulletins" dans le dialog détail adhérent
- AC2 : tableau avec colonnes : Date, Statut, Montant déclaré, Montant remboursé, Nb actes
- AC3 : badge de statut coloré pour chaque bulletin (réutiliser bulletinStatusConfig de REQ-004)
- AC4 : ligne de total en bas : somme déclarée et somme remboursée
- AC5 : pagination si plus de 5 bulletins
- AC6 : message "Aucun bulletin" si l'adhérent n'a pas d'historique

## Implementation Steps

1. Appeler `useAdherentBulletins(adherentId)` dans le dialog
2. Afficher un tableau compact avec les colonnes
3. Réutiliser `bulletinStatusConfig` pour les badges de statut
4. Ajouter la ligne de total et la pagination
5. Gérer l'état vide

## Tests

- Adhérent avec bulletins affiche le tableau avec les totaux
- Adhérent sans bulletin affiche le message vide
- Pagination fonctionne avec plus de 5 bulletins
- Les montants sont formatés en DT
