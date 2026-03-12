---
id: TASK-006
parent: REQ-005
status: done
dependencies: [TASK-004, TASK-005]
files:
  - apps/web/src/features/adherents/pages/AgentAdherentsPage.tsx
---

## Objective

Créer le dialog de détail adhérent affichant les informations complètes, le plafond et les ayants droit.

## Context

L'**agent assurance** doit voir le détail complet d'un **adhérent** : informations personnelles, entreprise, formule d'assurance, **plafond** annuel (global, consommé, restant) et **ayants droit** (US2, US4). Le plafond est affiché avec une barre de progression segmentée comme dans la vue bulletin (REQ-004).

## Acceptance Criteria

- AC1 : dialog s'ouvre au clic sur un adhérent dans la liste
- AC2 : section "Informations" : nom, prénom, matricule, date de naissance, sexe, email, téléphone, ville
- AC3 : section "Entreprise" : nom entreprise, matricule fiscal
- AC4 : section "Plafond" : plafond global, plafond consommé, plafond restant + barre de progression
- AC5 : section "Ayants droit" : liste des bénéficiaires depuis ayants_droit_json (nom, lien de parenté)
- AC6 : bouton "Voir historique" pour naviguer vers les bulletins

## Implementation Steps

1. Ajouter un état `viewAdherent` dans la page pour le dialog
2. Créer le dialog avec les 4 sections (grille responsive)
3. Calculer plafond_restant = plafond_global - plafond_consomme
4. Afficher la barre de progression avec le % consommé
5. Parser `ayants_droit_json` et afficher la liste

## Tests

- Dialog affiche toutes les informations de l'adhérent
- Plafond à 50% consommé affiche la barre à moitié
- Adhérent sans ayants droit affiche "Aucun ayant droit"
- Bouton "Voir historique" navigue correctement
