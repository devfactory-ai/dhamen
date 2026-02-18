# PROJECT.md — Dhamen (ضامن)

## Phase 1 — MVP avec Portail Prestataire Unifié

**Durée** : 12 semaines (6 sprints de 2 semaines)
**Charge** : 304 j/h
**Budget** : 79 770 TND
**Objectif** : Flux tiers payant pharmacie complet avec portail prestataire unifié (4 profils) et portail assureur

---

## Sprint Planning

### Sprint 1 — Fondations (Semaines 1-2)

**Objectif** : Infrastructure opérationnelle, API CRUD, modèle multi-profil, authentification

| Tâche | Assignation | Points | Priorité |
|---|---|---|---|
| Setup monorepo Turborepo + pnpm + Biome | Tech Lead | 3 | P0 |
| Config Wrangler (D1, KV, R2, Queues) + 3 envs | Tech Lead | 5 | P0 |
| CI/CD GitHub Actions (lint, test, deploy staging) | Tech Lead | 5 | P0 |
| Schéma D1 : tables core (insurers, adherents, providers, contracts) | Tech Lead + Dev Senior | 8 | P0 |
| Package shared : types, schemas Zod, constantes métier | Dev Senior | 5 | P0 |
| Routes CRUD Hono : providers (multi-type), adherents, contracts | Dev Senior | 8 | P0 |
| Middleware auth JWT + RBAC (8 rôles) | Tech Lead | 8 | P0 |
| Middleware audit trail | Tech Lead | 3 | P0 |
| Middleware rate limiting (Durable Objects) | Tech Lead | 3 | P1 |
| Setup Vitest + premiers tests unitaires | Dev Senior | 3 | P0 |
| Setup projet React (Vite + Tailwind + Router) | Dev Confirmé | 5 | P0 |
| Page login + intégration auth JWT | Dev Confirmé | 5 | P0 |
| Design tokens + Tailwind config (couleurs, typo, spacing) | UX | 5 | P0 |
| Maquettes portail : layout, nav, dashboard shells (4 profils) | UX | 8 | P0 |

**Jalon S1** : Env opérationnel, API CRUD fonctionnelle, auth JWT + RBAC actif

**Critères de validation** :
- [ ] `pnpm dev` lance API + web sans erreur
- [ ] CRUD providers/adherents/contracts fonctionne en staging
- [ ] Login + JWT + refresh token opérationnel
- [ ] RBAC bloque les accès non autorisés (tests)
- [ ] CI/CD déploie automatiquement sur staging
- [ ] Audit trail enregistre les mutations

---

### Sprint 2 — Core TP + Portail v0 (Semaines 3-4)

**Objectif** : Agent éligibilité, design system, première vue métier (pharmacien)

| Tâche | Assignation | Points | Priorité |
|---|---|---|---|
| Agent Éligibilité : rules engine (6 règles) | Dev Senior | 8 | P0 |
| Agent Éligibilité : cache KV + SLA <100ms | Dev Senior | 5 | P0 |
| Agent Éligibilité : tests unitaires (20+ cas) | Dev Senior | 5 | P0 |
| Route `POST /api/v1/eligibility/check` | Dev Senior | 3 | P0 |
| Schéma D1 : tables claims, claim_items | Tech Lead | 5 | P0 |
| API claims : create, read, list (avec pagination) | Tech Lead | 5 | P0 |
| Design system React : Button, Input, Card, Table, Badge, Modal | Dev Confirmé + UX | 8 | P0 |
| Layout portail unifié : sidebar adaptative par rôle | Dev Confirmé | 5 | P0 |
| Vue Pharmacien v0 : dashboard, vérification éligibilité | Dev Confirmé | 8 | P0 |
| Maquettes vues médecin + labo | UX | 5 | P0 |
| Intégration API éligibilité dans le portail | Dev Confirmé | 3 | P0 |
| Tests intégration agent éligibilité | QA | 5 | P0 |

**Jalon S2** : Éligibilité fonctionnelle end-to-end, portail pharmacien v0

**Critères de validation** :
- [ ] Vérification éligibilité < 100ms (cache hit)
- [ ] 6 règles métier testées et validées
- [ ] Design system : 6+ composants documentés
- [ ] Vue pharmacien affiche le résultat éligibilité
- [ ] Sidebar s'adapte selon le rôle connecté

---

### Sprint 3 — Délivrance + Vues médecin/labo (Semaines 5-6)

**Objectif** : Agent tarification, flux délivrance pharmacie complet, vues médecin et labo

| Tâche | Assignation | Points | Priorité |
|---|---|---|---|
| Agent Tarification : moteur de calcul multi-barèmes | Dev Senior | 8 | P0 |
| Agent Tarification : gestion génériques vs princeps | Dev Senior | 5 | P0 |
| Agent Tarification : cache barèmes KV | Dev Senior | 3 | P0 |
| Agent Tarification : tests unitaires (15+ cas) | Dev Senior | 5 | P0 |
| Route `POST /api/v1/claims/pharmacy` (flux complet) | Tech Lead | 8 | P0 |
| Orchestrateur v1 : éligibilité → tarification → création claim | Tech Lead | 5 | P0 |
| Vue Pharmacien v1 : saisie ordonnance, calcul PEC live, confirmation | Dev Confirmé | 8 | P0 |
| Vue Pharmacien : historique délivrances, facturation TP | Dev Confirmé | 5 | P0 |
| Vue Médecin v0 : dashboard, liste patients, historique consultations | Dev Confirmé + UX | 8 | P1 |
| Vue Labo v0 : dashboard, liste résultats en attente | Dev Confirmé + UX | 5 | P1 |
| Tests intégration flux pharmacie end-to-end | QA | 5 | P0 |

**Jalon S3** : Flux TP pharmacie complet (scan → PEC → facture), 3 vues métier actives

**Critères de validation** :
- [ ] Flux pharmacie fonctionne end-to-end (éligibilité → tarification → claim créé)
- [ ] Calcul PEC correct sur 15+ cas de test (barèmes, franchises, plafonds)
- [ ] Vue médecin et labo accessibles avec données
- [ ] Orchestrateur coordonne les 2 agents en < 300ms

---

### Sprint 4 — Assureur + Vue clinique (Semaines 7-8)

**Objectif** : Agent réconciliation, portail assureur, vue clinique, bordereaux

| Tâche | Assignation | Points | Priorité |
|---|---|---|---|
| Agent Réconciliation : collecte claims, totalisation | Dev Confirmé | 8 | P0 |
| Agent Réconciliation : génération PDF bordereau | Dev Confirmé | 5 | P0 |
| Agent Réconciliation : stockage R2 + cycle configurable | Dev Confirmé | 5 | P0 |
| Agent Réconciliation : tests unitaires | Dev Confirmé | 3 | P0 |
| Queue worker pour réconciliation async | Tech Lead | 5 | P0 |
| Portail Assureur : dashboard KPIs (claims, montants, taux fraude) | Dev Confirmé + UX | 8 | P0 |
| Portail Assureur : liste claims, validation manuelle, filtres | Dev Confirmé | 5 | P0 |
| Portail Assureur : gestion réseau prestataires (liste, statut) | Dev Confirmé | 5 | P1 |
| Portail Assureur : consultation bordereaux + download PDF | Dev Confirmé | 3 | P0 |
| Vue Clinique v0 : dashboard, pré-admissions (shell) | Dev Confirmé + UX | 5 | P1 |
| API réconciliation + routes bordereaux | Tech Lead | 5 | P0 |
| Tests intégration réconciliation | QA | 5 | P0 |

**Jalon S4** : 4 vues prestataire actives, bordereaux générés, dashboard assureur

**Critères de validation** :
- [ ] Bordereau PDF généré correctement (totaux, détails, période)
- [ ] Dashboard assureur affiche KPIs en temps réel
- [ ] Assureur peut valider/rejeter des claims
- [ ] 4 vues prestataire fonctionnelles (pharma, médecin, labo, clinique)

---

### Sprint 5 — Anti-Fraude + Alertes (Semaines 9-10)

**Objectif** : Agent anti-fraude v1, scoring, alertes, reporting

| Tâche | Assignation | Points | Priorité |
|---|---|---|---|
| Agent Anti-Fraude v1 : 5 règles déterministes | Dev IA | 8 | P0 |
| Agent Anti-Fraude : scoring composite 0-100 | Dev IA | 5 | P0 |
| Agent Anti-Fraude : intégration dans l'orchestrateur | Dev IA + Tech Lead | 5 | P0 |
| Agent Anti-Fraude : tests unitaires (20+ scénarios) | Dev IA | 5 | P0 |
| Queue worker pour analyse fraude approfondie (async) | Tech Lead | 5 | P0 |
| Alertes fraude : notifications assureur (portail + queue) | Dev Confirmé | 5 | P0 |
| Portail Assureur : vue alertes fraude, détail scoring | Dev Confirmé | 5 | P0 |
| Reporting basique : exports CSV claims, bordereaux | Dev Confirmé | 3 | P1 |
| Intégration anti-fraude dans flux pharmacie existant | Dev Senior | 3 | P0 |
| Health check endpoint + monitoring basique | Tech Lead | 3 | P0 |
| Tests intégration anti-fraude (scoring, alertes) | QA | 8 | P0 |
| Tests de performance : éligibilité <100ms, flux <500ms | QA | 5 | P0 |

**Jalon S5** : Scoring anti-fraude actif, alertes remontées, monitoring OK

**Critères de validation** :
- [ ] Score fraude calculé sur chaque nouvelle claim
- [ ] Claims score > 70 bloquées automatiquement
- [ ] Alertes visibles dans le portail assureur
- [ ] SLA respectés : éligibilité < 100ms, flux complet < 500ms

---

### Sprint 6 — Validation & Pilote (Semaines 11-12)

**Objectif** : Tests E2E, pilote terrain, corrections, documentation

| Tâche | Assignation | Points | Priorité |
|---|---|---|---|
| Tests E2E Playwright : 10 parcours critiques | QA | 13 | P0 |
| Tests E2E : flux pharmacie complet (5 scénarios) | QA | 8 | P0 |
| Tests E2E : portail assureur (validation, bordereaux) | QA | 5 | P0 |
| Tests E2E : multi-profil (login pharma, médecin, labo, clinique) | QA | 5 | P0 |
| Fix bugs critiques et bloquants | Équipe | 13 | P0 |
| Seed data réaliste pour pilote (pharmacies, médecins, adhérents) | Dev Senior | 5 | P0 |
| Script de démo / pilote terrain | Chef de projet | 3 | P0 |
| Documentation API (OpenAPI / Swagger) | Dev Senior | 5 | P0 |
| Documentation déploiement + runbook | Tech Lead | 5 | P0 |
| Guide utilisateur prestataire (par profil) | UX + Chef de projet | 5 | P1 |
| Revue sécurité : audit RBAC, chiffrement, injection | Tech Lead | 5 | P0 |
| Déploiement production + configuration DNS | Tech Lead | 3 | P0 |

**Jalon S6 (J3)** : MVP validé avec prestataires pilotes (tous profils)

**Critères de validation** :
- [ ] 10 parcours E2E passent en CI
- [ ] Zéro bug critique en staging
- [ ] Documentation API complète et accessible
- [ ] Pilote avec au moins 2 pharmacies, 1 médecin, 1 labo
- [ ] Production déployée et accessible
- [ ] Revue sécurité OK

---

## Definition of Done (DoD)

Une tâche est considérée terminée quand :

1. ✅ Code écrit en TypeScript strict, lint OK (Biome)
2. ✅ Tests unitaires écrits et passent (coverage > 80% sur le métier)
3. ✅ Tests d'intégration si applicable
4. ✅ Validation Zod sur toutes les entrées
5. ✅ Audit trail sur les mutations
6. ✅ Code reviewé par au moins 1 pair
7. ✅ Déployé sur staging sans régression
8. ✅ Documentation mise à jour si nécessaire

## Cérémonies Scrum

| Cérémonie | Fréquence | Durée | Participants |
|---|---|---|---|
| Sprint Planning | Début de sprint | 2h | Toute l'équipe |
| Daily Standup | Quotidien | 15 min | Toute l'équipe |
| Sprint Review | Fin de sprint | 1h | Équipe + stakeholders |
| Rétrospective | Fin de sprint | 1h | Équipe dev |
| Backlog Grooming | Mi-sprint | 1h | Tech Lead + Chef de projet + PO |

## KPIs Phase 1

| KPI | Cible | Mesure |
|---|---|---|
| Vélocité moyenne | 60-70 pts/sprint | Story points livrés |
| Couverture tests métier | > 80% | Vitest coverage |
| Bugs critiques en prod | 0 | Bug tracker |
| SLA éligibilité | < 100ms p99 | Workers Analytics |
| SLA flux PEC | < 500ms p99 | Workers Analytics |
| Prestataires pilotes | ≥ 5 (multi-profil) | Comptage |
| Taux de disponibilité | > 99.5% | Uptime monitoring |
