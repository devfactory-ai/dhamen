---
id: TASK-006
parent: REQ-009
status: todo
dependencies: [TASK-001, TASK-002, TASK-005]
files:
  - apps/api/src/services/remboursement.service.ts
  - apps/api/src/services/remboursement.service.test.ts
  - apps/api/src/routes/bulletins-agent.ts
---

## Objective

Refondre le service de calcul de remboursement pour utiliser les baremes contrat (taux/forfait par periode) et les plafonds prestataire (3 niveaux : acte, famille, global).

## Context

Le calcul actuel applique un taux generique depuis `actes_referentiel` et verifie un seul plafond global. Le nouveau calcul doit : (1) chercher le bareme dans la periode d'application du contrat, (2) appliquer le type de calcul (taux ou forfait), (3) verifier le plafond par acte, puis par famille/an, puis global/an, (4) mettre a jour les compteurs dans `plafonds_prestataire`. Le calcul doit aussi distinguer maladies ordinaires vs chroniques pour la pharmacie.

## Acceptance Criteria

- AC1 : calcul forfait = min(frais_engages, valeur_base du bareme)
- AC2 : calcul taux = frais_engages * taux du bareme
- AC3 : verification plafond acte puis plafond famille/an puis plafond global/an (dans cet ordre)
- AC4 : mise a jour `plafonds_prestataire` apres validation
- AC5 : distinction maladie ordinaire/chronique pour la pharmacie (plafonds differents)
- AC6 : si aucun bareme trouve pour la periode/acte, retourner une erreur explicite

## Implementation Steps

1. Modifier `remboursement.service.ts` : nouveau flux avec lookup bareme par periode + calcul taux/forfait
2. Ajouter la verification des 3 niveaux de plafonds
3. Modifier `bulletins-agent.ts` pour utiliser le nouveau calcul
4. Mettre a jour les tests unitaires

## Tests

- Calcul forfait : C1 avec frais 60DT donne remb 45DT (plafonne au forfait)
- Calcul taux : PH1 avec frais 100DT donne remb 90DT (90%)
- Plafond acte : montant rembourse ne depasse pas le plafond acte
- Plafond famille : consommation progressive, alerte quand plafond atteint
- Plafond global : remboursement reduit quand plafond global presque atteint
- Pharmacie chronique : utilise le plafond 1500DT au lieu de 1000DT
- Erreur si aucun bareme pour la periode de l'acte
