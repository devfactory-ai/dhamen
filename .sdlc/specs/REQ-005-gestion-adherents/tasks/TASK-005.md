---
id: TASK-005
parent: REQ-005
status: done
dependencies: [TASK-001, TASK-004]
files:
  - apps/web/src/features/adherents/pages/AgentAdherentsPage.tsx
---

## Objective

Créer la page liste adhérents pour l'agent assurance avec recherche, filtrage par entreprise et pagination.

## Context

L'**agent assurance** a besoin d'une page dédiée pour consulter les **adhérents** de ses entreprises (US1). La page existante `AdherentsPage.tsx` est pour les admins. Cette nouvelle page utilise le contexte agent (entreprise sélectionnée) et affiche une DataTable filtrée.

## Acceptance Criteria

- AC1 : page accessible depuis le menu agent via une route `/adherents/agent`
- AC2 : DataTable avec colonnes : Matricule, Nom, Prénom, Entreprise, Plafond global, Plafond consommé, Statut
- AC3 : champ de recherche filtrant par nom ou matricule
- AC4 : filtrage automatique par l'entreprise du contexte agent (selectedCompany)
- AC5 : pagination avec 20 éléments par page
- AC6 : clic sur une ligne ouvre le détail adhérent (dialog ou navigation)

## Implementation Steps

1. Créer `AgentAdherentsPage.tsx` dans `apps/web/src/features/adherents/pages/`
2. Utiliser `useAgentContext` pour récupérer `selectedCompany`
3. Appeler `useAdherents(page, 20, search, companyId)`
4. Afficher dans une DataTable avec les colonnes requises
5. Ajouter la route dans App.tsx

## Tests

- La page affiche uniquement les adhérents de l'entreprise sélectionnée
- La recherche filtre les résultats en temps réel
- La pagination navigue entre les pages
- Sans entreprise sélectionnée, redirection vers select-context
