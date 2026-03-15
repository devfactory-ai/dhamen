---
id: TASK-004
parent: REQ-008
status: done
dependencies:
  - TASK-003
files:
  - apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx
---

## Objective

Ajouter un bouton "Exporter CSV" sur la page de saisie des bulletins, visible quand un lot est selectionne, pour permettre a l'agent de telecharger le CSV du lot courant.

## Context

La page BulletinsSaisiePage affiche les bulletins d'un lot selectionne. Apres saisie et validation des bulletins, l'agent doit pouvoir exporter le lot en CSV. Le bouton doit etre desactive si le lot est vide ou deja exporte. Si le lot est deja exporte, un bouton secondaire "Re-exporter" doit permettre le re-export avec force=true.

## Acceptance Criteria

- AC1 : le bouton "Exporter CSV" apparait quand un lot est selectionne dans le contexte agent
- AC2 : le bouton est desactive si le lot n'a aucun bulletin
- AC3 : au clic, le fichier CSV est telecharge via le hook useExportBatchCSV
- AC4 : un toast succes s'affiche apres le telechargement ("Export CSV telecharge")
- AC5 : un toast erreur s'affiche en cas d'echec
- AC6 : un spinner s'affiche pendant le telechargement (isExporting)
- AC7 : si le lot a le statut 'exported', afficher "Re-exporter" au lieu de "Exporter CSV"
- AC8 : le bouton "Re-exporter" utilise force=true

## Implementation Steps

1. Importer useExportBatchCSV depuis use-batches.ts
2. Ajouter le bouton dans la section actions de la page, conditionne par la presence d'un batchId
3. Gerer les etats : loading (spinner), disabled (lot vide), texte conditionnel (exported)
4. Afficher les toasts succes/erreur via toast de sonner
5. Rafraichir la liste des lots apres export (le hook invalide deja le cache)

## Tests

- Le bouton n'apparait pas si aucun lot n'est selectionne
- Le bouton est desactive si le lot est vide
- Le clic declenche le telechargement du CSV
- Le toast succes s'affiche apres un export reussi
- Le toast erreur s'affiche en cas d'echec
- Le texte change en "Re-exporter" pour un lot deja exporte
