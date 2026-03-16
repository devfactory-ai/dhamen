---
id: TASK-008
parent: REQ-009
status: done
dependencies: [TASK-001, TASK-004]
files:
  - apps/web/src/features/agent/bulletins/components/ActeSelector.tsx
  - apps/web/src/features/agent/bulletins/components/BulletinForm.tsx
  - apps/web/src/features/agent/hooks/use-actes.ts
---

## Objective

Mettre a jour le formulaire de saisie bulletin pour utiliser les codes actes reels groupes par famille et ajouter les champs observations et professionnel de sante.

## Context

Le formulaire de saisie bulletin utilise actuellement des codes generiques. Les agents d'assurance connaissent les codes standards (C1, C2, PH1, AN, R, etc.) et ont besoin de les retrouver dans le formulaire, groupes par famille d'actes. Le formulaire doit aussi permettre de saisir le professionnel de sante et les observations pour chaque acte.

## Acceptance Criteria

- AC1 : selecteur d'actes groupe par famille (FA0001 Consultations, FA0003 Pharmacie, etc.) avec codes reels
- AC2 : champ professionnel de sante (ref + nom) par acte
- AC3 : champ observations (cod_msgr + lib_msgr) par acte
- AC4 : affichage du plafond restant par famille et global lors de la saisie
- AC5 : le formulaire reste fonctionnel avec les anciens codes (retrocompatibilite)

## Implementation Steps

1. Creer le composant ActeSelector avec groupement par famille
2. Creer le hook use-actes pour charger les actes groupes par famille
3. Modifier BulletinForm pour integrer le selecteur et les nouveaux champs
4. Ajouter l'affichage des plafonds restants

## Tests

- Le selecteur affiche les actes groupes par famille
- La selection d'un acte remplit automatiquement le type de calcul et la valeur
- Les champs observations et professionnel de sante sont envoyes au backend
- L'affichage des plafonds se met a jour apres chaque acte ajoute
