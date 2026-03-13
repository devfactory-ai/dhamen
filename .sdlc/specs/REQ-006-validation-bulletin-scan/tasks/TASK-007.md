---
id: TASK-007
parent: REQ-006
status: done
dependencies:
  - TASK-004
  - TASK-005
files:
  - apps/web/src/features/bulletins/pages/BulletinsValidationPage.tsx
  - apps/web/src/features/bulletins/components/scan-upload.tsx
  - apps/web/src/hooks/use-bulletin-scan.ts
---

## Objective

Ajouter le composant d'upload de scan et la visualisation du scan dans la page de validation agent.

## Context

L'agent peut optionnellement attacher un scan du bulletin papier (image ou PDF) pour archivage. Le composant doit permettre de sélectionner un fichier, l'uploader via l'API, et afficher un aperçu ou un lien de téléchargement. Le scan peut être ajouté avant ou après la validation.

## Acceptance Criteria

- AC1 : composant d'upload accepte JPEG, PNG, PDF (max 10 Mo)
- AC2 : drag-and-drop ou clic pour sélectionner le fichier
- AC3 : barre de progression pendant l'upload
- AC4 : après upload, affichage d'un aperçu miniature (images) ou icône PDF
- AC5 : bouton de téléchargement du scan existant (appelle GET `/agent/:id/scan`)
- AC6 : si un scan existe déjà, possibilité de le remplacer
- AC7 : validation côté client du type et de la taille avant envoi

## Implementation Steps

1. Créer le hook `use-bulletin-scan.ts` avec mutations upload et query download
2. Créer le composant `scan-upload.tsx` avec zone de drop et preview
3. Intégrer dans `BulletinsValidationPage.tsx` au niveau du détail bulletin
4. Gérer l'affichage conditionnel : upload si pas de scan, preview + remplacement si scan existant
5. Validation côté client avant appel API

## Tests

- Upload d'une image JPEG affiche un aperçu
- Upload d'un PDF affiche une icône PDF avec le nom du fichier
- Fichier trop volumineux affiche une erreur avant envoi
- Type de fichier invalide affiche une erreur avant envoi
- Clic sur le bouton télécharger ouvre le fichier
- Remplacement d'un scan existant fonctionne
