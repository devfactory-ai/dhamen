---
id: TASK-004
parent: REQ-006
status: done
dependencies:
  - TASK-001
  - TASK-002
files:
  - apps/api/src/routes/bulletins-agent.ts
---

## Objective

Créer l'endpoint `POST /bulletins-soins/agent/:id/upload-scan` pour permettre à l'agent d'attacher un scan (image ou PDF) à un bulletin.

## Context

Après validation, l'agent peut optionnellement attacher un scan du bulletin papier pour archivage. Le fichier est stocké dans R2. Un endpoint similaire existe côté adhérent (`POST /bulletins-soins/me/:id/upload-scan` dans `bulletins-soins.ts`), mais celui-ci est pour l'agent et n'a pas la même logique d'autorisation.

## Acceptance Criteria

- AC1 : endpoint accepte un fichier en `multipart/form-data`
- AC2 : validation du type MIME : JPEG, PNG, PDF uniquement
- AC3 : validation de la taille : max 10 Mo
- AC4 : fichier stocké dans R2 avec clé `bulletins/{bulletin_id}/{filename}`
- AC5 : colonnes `scan_url` et `scan_filename` mises à jour sur le bulletin
- AC6 : audit log créé avec action `scan_uploaded`
- AC7 : accessible aux rôles `INSURER_AGENT`, `INSURER_ADMIN`
- AC8 : retourne l'URL du scan et le nom du fichier

## Implementation Steps

1. Ajouter la route POST `/agent/:id/upload-scan` dans `bulletins-agent.ts`
2. Parser le FormData et extraire le fichier
3. Valider type MIME et taille
4. Vérifier que le bulletin existe et appartient à l'assureur de l'agent
5. Upload vers R2 avec `c.env.STORAGE.put()`
6. UPDATE `bulletins_soins` SET `scan_url`, `scan_filename`
7. INSERT audit_logs
8. Retourner la réponse avec URL et filename

## Tests

- Upload JPEG réussi : scan_url et scan_filename enregistrés
- Upload PDF réussi
- Fichier trop volumineux (>10 Mo) : erreur 400 FILE_TOO_LARGE
- Type MIME invalide (.exe) : erreur 400 INVALID_FILE_TYPE
- Bulletin inexistant : erreur 404
- Remplacement d'un scan existant : ancien scan écrasé, nouvelles valeurs en base
