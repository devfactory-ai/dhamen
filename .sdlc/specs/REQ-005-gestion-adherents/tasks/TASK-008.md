---
id: TASK-008
parent: REQ-005
status: done
dependencies: [TASK-003, TASK-004]
files:
  - apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx
---

## Objective

Intégrer la recherche adhérent (autocomplete) dans le formulaire de saisie bulletin.

## Context

Actuellement l'agent saisit le matricule adhérent manuellement dans le formulaire de **bulletin de soins**. Il faut ajouter un champ de recherche autocomplete qui permet de trouver l'**adhérent** par nom ou matricule et de remplir automatiquement les champs (US5, AC7).

## Acceptance Criteria

- AC1 : champ de recherche avec autocomplete dans le formulaire de création bulletin
- AC2 : recherche par matricule ou nom (min 2 caractères)
- AC3 : dropdown affiche max 10 suggestions avec : matricule, nom prénom, entreprise
- AC4 : sélection d'un adhérent remplit automatiquement le champ matricule
- AC5 : affichage du plafond restant de l'adhérent sélectionné sous le champ

## Implementation Steps

1. Ajouter un état `adherentSearch` et `selectedAdherent` dans le formulaire
2. Appeler `useSearchAdherents(adherentSearch)` pour les suggestions
3. Afficher un dropdown avec les résultats sous le champ de saisie
4. Au clic sur un résultat, remplir le matricule et afficher le plafond restant
5. Permettre de vider la sélection pour une saisie manuelle

## Tests

- Saisie "MOH" affiche les adhérents correspondants
- Sélection d'un adhérent remplit le matricule automatiquement
- Le plafond restant est affiché après sélection
- Effacement du champ réinitialise la sélection
