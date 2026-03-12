---
id: REQ-005
title: Gestion des adhérents par l'agent assurance
status: draft
priority: must
---

# Description

L'agent assurance doit pouvoir consulter, rechercher et gérer les
adhérents de son portefeuille (entreprises rattachées à son assureur).

Le backend CRUD existe déjà (routes, types, queries, encryption).
Cette REQ se concentre sur l'interface agent : page dédiée de gestion
des adhérents avec recherche, détail complet, historique bulletins,
et vue plafond.

---

# Acteurs

Agent assurance, Admin assureur

---

# User Stories

US1 : En tant qu'agent, je veux rechercher un adhérent par matricule
ou nom afin de le retrouver rapidement pour traiter un bulletin.

US2 : En tant qu'agent, je veux voir le détail complet d'un adhérent
(infos personnelles, entreprise, plafond, ayants droit) afin de
vérifier sa couverture.

US3 : En tant qu'agent, je veux voir l'historique des bulletins d'un
adhérent afin de vérifier les remboursements passés.

US4 : En tant qu'agent, je veux voir le plafond consommé et restant
d'un adhérent afin de savoir si un nouveau bulletin sera remboursé.

US5 : En tant qu'agent, je veux pouvoir sélectionner un adhérent
directement depuis la page de saisie bulletin afin d'accélérer
la saisie.

---

# Acceptance Criteria

AC1 : page liste adhérents avec recherche par nom, matricule ou entreprise

AC2 : filtrage par entreprise (sociétés rattachées à l'assureur de l'agent)

AC3 : vue détail adhérent avec informations personnelles, entreprise,
      formule, plafond global / consommé / restant

AC4 : section ayants droit dans le détail adhérent

AC5 : historique des bulletins de soins de l'adhérent avec montants

AC6 : barre de progression plafond (consommé vs restant)

AC7 : recherche adhérent intégrée dans le formulaire de saisie bulletin

AC8 : pagination et tri sur la liste des adhérents
