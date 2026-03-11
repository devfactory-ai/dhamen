---
id: TASK-007
parent: REQ-003
status: done
dependencies: [TASK-004, TASK-006]
files:
  - apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx
---

## Objective

Transformer le formulaire de saisie pour permettre l'ajout dynamique de plusieurs actes médicaux avec montant individuel.

## Acceptance Criteria

- AC1 : section "Actes médicaux" avec liste dynamique (ajouter/supprimer des lignes)
- AC2 : chaque ligne d'acte contient : code acte, libellé, montant (TND)
- AC3 : bouton "Ajouter un acte" pour ajouter une nouvelle ligne
- AC4 : bouton supprimer (icône poubelle) sur chaque ligne sauf la première
- AC5 : montant total calculé et affiché automatiquement (somme des actes)
- AC6 : validation : au moins 1 acte, chaque montant > 0
- AC7 : les actes sont envoyés en JSON dans le champ `actes` du formulaire
- AC8 : le champ `total_amount` unique est remplacé par le calcul automatique

## Implementation Steps

1. Ajouter `useFieldArray` de react-hook-form pour gérer la liste d'actes
2. Mettre à jour le schema Zod du formulaire avec un tableau `actes`
3. Afficher les lignes dynamiques avec code, label, montant
4. Calculer et afficher le total en temps réel
5. Envoyer `actes` sérialisé en JSON dans le FormData au submit
