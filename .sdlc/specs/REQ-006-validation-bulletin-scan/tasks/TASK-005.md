---
id: TASK-005
parent: REQ-006
status: done
dependencies:
  - TASK-004
files:
  - apps/api/src/routes/bulletins-agent.ts
---

## Objective

Créer l'endpoint `GET /bulletins-soins/agent/:id/scan` pour permettre à l'agent de télécharger le scan attaché à un bulletin.

## Context

L'agent doit pouvoir consulter le scan archivé depuis la fiche bulletin. Un endpoint similaire existe côté adhérent (`GET /bulletins-soins/me/:id/scan` dans `bulletins-soins.ts`) et côté gestionnaire (`GET /bulletins-soins/manage/:id/scan`). Celui-ci utilise la même logique R2 mais avec les autorisations agent.

## Acceptance Criteria

- AC1 : endpoint retourne le fichier binaire avec le bon `Content-Type`
- AC2 : header `Content-Disposition` avec le nom de fichier original
- AC3 : si pas de scan attaché, retourne 404 avec code `SCAN_NOT_FOUND`
- AC4 : accessible aux rôles `INSURER_AGENT`, `INSURER_ADMIN`, `ADMIN`
- AC5 : le fichier est streamé depuis R2 (pas de mise en mémoire complète)

## Implementation Steps

1. Ajouter la route GET `/agent/:id/scan` dans `bulletins-agent.ts`
2. Vérifier que le bulletin existe et est accessible par l'agent
3. Récupérer `scan_url` depuis la base
4. Extraire la clé R2 avec `extractR2Key()`
5. Récupérer l'objet R2 et streamer la réponse
6. Gérer le cas où le fichier n'existe plus dans R2

## Tests

- Téléchargement réussi : bon Content-Type, bon Content-Disposition
- Bulletin sans scan : erreur 404 SCAN_NOT_FOUND
- Bulletin inexistant : erreur 404
- Fichier supprimé de R2 mais URL en base : erreur 500 STORAGE_ERROR
