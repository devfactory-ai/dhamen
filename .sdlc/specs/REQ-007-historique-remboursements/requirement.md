---
id: REQ-007
title: Historique des remboursements
status: draft
priority: must
---

# Description

Apres la validation d'un bulletin et l'enregistrement du remboursement,
l'agent et l'admin assureur doivent pouvoir consulter l'historique complet
des remboursements effectues.

L'historique permet de :

- consulter tous les bulletins valides avec leur statut de remboursement
- filtrer par adherent, periode, type de soin, statut
- voir le detail d'un bulletin (actes, montants, scan)
- exporter l'historique en CSV/Excel
- afficher des statistiques globales (total rembourse, nombre de bulletins, repartition par type)

Le système doit permettre de consulter l'historique des remboursements
d'un adhérent.

Cet historique est utilisé pour :

- vérifier les plafonds déjà consommés
- afficher les remboursements passés
- justifier le calcul d'un remboursement

---

# User Story

En tant qu'agent/admin assureur,

je veux consulter l'historique des remboursements effectues

afin de suivre les bulletins traites, verifier les montants et generer des rapports.

---

# Fonctionnalites

- Page historique avec tableau paginee et tri
- Filtres : adherent (recherche), periode (date debut/fin), type de soin, statut (approved, reimbursed, rejected)
- Vue detail bulletin : informations adherent, actes avec montants, scan attache, dates de traitement
- Statistiques : total rembourse, nombre de bulletins par statut, repartition par type de soin
- Export CSV de l'historique filtre
- Indicateur visuel du plafond consomme par adherent dans le detail

---
# Informations affichées

Chaque remboursement doit afficher :

- date
- numéro bulletin
- acte médical
- montant déclaré
- montant remboursé

---
# Acceptance Criteria

AC1 : la page historique affiche les bulletins valides/rembourses/rejetes avec pagination

AC2 : les filtres (adherent, periode, type de soin, statut) fonctionnent correctement

AC3 : le detail d'un bulletin affiche les actes, montants et le scan attache

AC4 : les statistiques globales sont calculees et affichees (totaux, repartition)

AC5 : l'export CSV genere un fichier avec les colonnes pertinentes

AC6 : l'historique est accessible aux roles INSURER_AGENT et INSURER_ADMIN
