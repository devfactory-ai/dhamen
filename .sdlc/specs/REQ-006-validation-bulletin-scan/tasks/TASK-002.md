---
id: TASK-002
parent: REQ-006
status: done
dependencies: []
files:
  - packages/db/migrations/0XXX_add_validation_columns_to_bulletins_soins.sql
---

## Objective

Ajouter les colonnes de validation manquantes à la table `bulletins_soins` si elles n'existent pas déjà : `validated_at`, `validated_by`, `scan_uploaded_by`.

## Context

Le workflow de validation par l'agent nécessite de tracer qui a validé le bulletin et quand. Les colonnes `validated_by` et certains champs de scan existent peut-être déjà (vérifier les migrations existantes 0044, 0052, 0067). Ajouter uniquement ce qui manque. La colonne `scan_url` et `scan_filename` existent déjà dans la migration 0044.

## Acceptance Criteria

- AC1 : colonne `validated_at` (DATETIME) ajoutée si absente
- AC2 : colonne `validated_by` (TEXT) ajoutée si absente — référence à l'ID de l'agent
- AC3 : index sur `validated_at` pour les requêtes d'historique
- AC4 : migration appliquée sans erreur sur les DBs existantes

## Implementation Steps

1. Vérifier les colonnes existantes dans les migrations 0044, 0052, 0067
2. Créer la migration avec les ALTER TABLE nécessaires
3. Tester l'application de la migration

## Tests

- Migration s'applique sans erreur sur une DB existante
- Les colonnes sont bien présentes après migration
- Les valeurs par défaut sont NULL (compatibilité avec les bulletins existants)
