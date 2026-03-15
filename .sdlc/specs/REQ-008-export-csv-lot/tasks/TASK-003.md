---
id: TASK-003
parent: REQ-008
status: done
dependencies:
  - TASK-001
files:
  - apps/web/src/features/agent/hooks/use-batches.ts
---

## Objective

Ajouter un hook useExportBatchCSV dans use-batches.ts pour appeler l'endpoint d'export CSV et declencher le telechargement du fichier.

## Context

Le frontend a besoin d'un hook pour appeler GET /bulletins-soins/agent/batches/:id/export et telecharger le fichier CSV resultant. Le hook doit gerer le telechargement via un Blob, creer un lien temporaire pour le download, et gerer les erreurs (lot non trouve, deja exporte). Il doit aussi invalider le cache des batches apres un export reussi car le statut du lot change.

## Acceptance Criteria

- AC1 : le hook appelle GET /bulletins-soins/agent/batches/:id/export avec le token d'auth
- AC2 : le fichier est telecharge via Blob + URL.createObjectURL + lien temporaire
- AC3 : le nom du fichier telecharge correspond au Content-Disposition de la reponse
- AC4 : les erreurs API (404, 409, 403) sont propagees avec un message lisible
- AC5 : le cache des batches est invalide apres un export reussi (queryClient.invalidateQueries)
- AC6 : le hook supporte le parametre force pour re-exporter un lot deja exporte
- AC7 : le hook expose un etat isExporting pour afficher un loader

## Implementation Steps

1. Ajouter la fonction exportBatchCSV dans use-batches.ts
2. Utiliser fetch directement (pas apiClient) car la reponse est un Blob, pas du JSON
3. Extraire le nom de fichier du header Content-Disposition
4. Creer un lien <a> temporaire pour declencher le telechargement
5. Ajouter useMutation pour wrapper l'appel avec les etats loading/error
6. Invalider les queries ['batches'] en onSuccess

## Tests

- Le hook appelle le bon endpoint avec le token Bearer
- Le fichier est telecharge avec le bon nom
- En cas d'erreur 409, le message 'Lot deja exporte' est retourne
- En cas d'erreur 404, le message 'Lot non trouve' est retourne
- Le cache batches est invalide apres un export reussi
