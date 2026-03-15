---
id: TASK-005
parent: REQ-008
status: done
dependencies:
  - TASK-001
  - TASK-002
files:
  - apps/api/src/routes/bulletins-agent.ts
  - apps/api/tests/integration/bulletins-agent-export.test.ts
---

## Objective

Ecrire les tests d'integration pour l'endpoint GET /bulletins-soins/batches/:id/export couvrant tous les cas definis dans TASK-001 et TASK-002.

## Context

Les tests d'integration doivent couvrir le flux complet : creation d'un lot, ajout de bulletins avec differents statuts, export CSV, verification du contenu du fichier, verification de l'audit trail et du changement de statut du lot. Utiliser les fixtures existantes pour creer les donnees de test (adherents avec matricules, bulletins avec montants).

## Acceptance Criteria

- AC1 : test export lot avec bulletins valides → CSV 2 colonnes correct
- AC2 : test export lot vide → CSV avec header seul
- AC3 : test export lot deja exporte → 409
- AC4 : test export lot deja exporte avec force=true → 200
- AC5 : test export avec bulletins sans matricule → fallback INCONNU
- AC6 : test verification audit_logs apres export
- AC7 : test verification statut lot = exported apres export
- AC8 : test acces INSURER_ADMIN sur lot d'un autre agent du meme assureur → 200
- AC9 : test acces INSURER_AGENT sur lot d'un autre agent → 404
- AC10 : test acces role non autorise (ADHERENT, DOCTOR) → 403

## Implementation Steps

1. Creer le fichier de test avec les helpers de setup (db seed, auth tokens)
2. Ecrire les fixtures : lot, bulletins (approved, rejected, draft), adherents
3. Ecrire les tests pour chaque AC
4. Verifier le contenu CSV ligne par ligne (parse du body de la reponse)
5. Verifier les side effects (statut lot, audit_logs)

## Tests

- Chaque AC correspond a un test case distinct
- Les tests sont independants (chaque test seed ses propres donnees)
- Les tests verifient le status HTTP, le Content-Type, le Content-Disposition et le body CSV
