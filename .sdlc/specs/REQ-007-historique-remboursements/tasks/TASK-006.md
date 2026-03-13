---
id: TASK-006
parent: REQ-007
status: pending
dependencies:
  - TASK-002
  - TASK-005
files:
  - apps/web/src/features/bulletins/pages/BulletinsHistoryPage.tsx
  - apps/web/src/hooks/use-bulletin-history.ts
---

## Objective

Creer le dialog de detail bulletin dans la page historique, avec onglets informations, actes et scan.

## Context

Quand l'agent clique sur "Voir details" dans le tableau historique, un dialog s'ouvre avec le detail complet du bulletin. Le dialog contient 3 onglets : Informations (adherent, dates, statut), Actes (liste des actes avec montants et indicateur plafond), et Scan (apercu ou lien de telechargement si un scan est attache).

## Acceptance Criteria

- AC1 : dialog s'ouvre au clic sur "Voir details" avec chargement du detail via GET /history/:id
- AC2 : onglet "Informations" affiche : adherent (nom, matricule, national_id), beneficiaire si present, prestataire, dates (bulletin, validation, paiement), statut, raison de rejet si rejected
- AC3 : onglet "Actes" affiche un tableau : code, libelle, montant declare, taux, montant rembourse, badge "Plafond depasse" si plafond_depasse=1
- AC4 : onglet "Actes" affiche les totaux en bas : total declare, total rembourse
- AC5 : onglet "Scan" affiche un apercu de l'image ou une icone PDF avec bouton telecharger si scan_url est present
- AC6 : onglet "Scan" affiche "Aucun scan attache" si scan_url est null
- AC7 : section plafond adherent : plafond global, consomme, restant avec barre de progression
- AC8 : loading skeleton pendant le chargement du detail

## Implementation Steps

1. Ajouter la mutation/query dans use-bulletin-history.ts pour GET /history/:id
2. Creer le composant Dialog avec Tabs (Informations, Actes, Scan)
3. Onglet Informations : grille 2 colonnes avec les champs
4. Onglet Actes : tableau avec totaux et badges plafond
5. Onglet Scan : affichage conditionnel image/PDF/vide
6. Section plafond : barre de progression avec couleurs (vert/orange/rouge)
7. Integrer dans BulletinsHistoryPage au clic sur le bouton details

## Tests

- Le dialog s'ouvre et affiche le detail correct
- Les 3 onglets sont accessibles et affichent les bonnes donnees
- Le tableau des actes affiche les montants et le badge plafond
- Le scan s'affiche ou le message "Aucun scan" selon le cas
- La barre de progression du plafond est correcte
- Loading skeleton s'affiche pendant le chargement
