# SoinFlow - Spécifications Techniques
## Plateforme Unifiée Santé BH Assurance

**Version** : 2.0 (Unifiée)  
**Date** : 2026-02-26  
**Client** : BH Assurance  
**Prestataire** : Beta-Methods / DevFactory

---

## 🎯 Vision Produit

**Plateforme unique supportant 2 workflows simultanés** :

### Module 1 : Traitement Bulletins Papier
- Adhérents scannent/uploadent bulletins papier via app mobile
- Gestionnaires BH traitent manuellement les demandes
- Calcul garanties assisté par plateforme
- Workflow : Upload → Validation manuelle → Approbation → Virement J+3-5

### Module 2 : Workflow 100% Digital  
- Praticiens créent demandes directement en ligne
- **Conventionnés** : Tiers-payant (adhérent paie reste à charge, BH paie praticien)
- **Non-conventionnés** : Adhérent paie tout, remboursement automatique <24h
- Workflow : Praticien crée acte → Traitement auto → Paiement rapide

**Note** : OCR/IA pour extraction automatique bulletins reporté à phase ultérieure

---

## 📊 Métriques Projet

| Métrique | Valeur |
|----------|--------|
| **Total tâches** | 125 |
| **Estimation** | 500-600 heures |
| **Durée** | 4-5 mois |
| **Équipe** | 4-5 développeurs |
| **Sprints** | 8 sprints de 2 semaines |

---

## 🏗️ Architecture Technique

### Stack

**Mobile** : React Native + TypeScript  
**Web** : React + Vite + TailwindCSS  
**Backend** : Cloudflare Workers + TypeScript  
**Database** : Cloudflare D1 (SQLite)  
**Storage** : Cloudflare R2  
**Cache** : Cloudflare KV  
**Queue** : Cloudflare Queues  
**Real-time** : Durable Objects (WebSocket)

### Modules

```
soinflow/
├── mobile/           # React Native (iOS + Android)
├── web/              # React Vite (Adhérents, Gestionnaires, Praticiens)
├── workers/          # Cloudflare Workers (APIs backend)
│   ├── modules/
│   │   ├── core/     # Auth, utils partagés
│   │   ├── dhamen/   # Module Dhamen existant
│   │   └── sante/    # Module SoinFlow (nouveau)
│   └── migrations/   # D1 database migrations
└── docs/             # Documentation
```

---

## 📋 Liste des Tâches

### Répartition par Domaine

| Domaine | Tâches | Estimation |
|---------|--------|------------|
| Infrastructure | 4 | 11-15h |
| Backend | 24 | 85-100h |
| Database | 8 | 22-28h |
| Storage R2 | 6 | 14-19h |
| Mobile | 26 | 110-130h |
| Web | 32 | 130-160h |
| Praticiens | 3 | 12-15h |
| Testing | 10 | 78-98h |
| Deployment | 12 | 38-48h |
| **TOTAL** | **125** | **500-600h** |

### Ordre d'Exécution Recommandé

**Sprint 1 : Fondations**
- INFRA-001 à INFRA-004 (Cloudflare setup)
- DB-001, DB-003, DB-005 (Schemas + seed)
- DEPLOY-001, DEPLOY-006 (Environments)

**Sprint 2 : Backend Core**
- BACK-001 à BACK-004 (Structure + router + auth)
- BACK-015 à BACK-018 (Utils)
- DB-006, DB-007 (Migration + triggers)
- R2-001 à R2-003 (Storage)
- DEPLOY-002, DEPLOY-003, DEPLOY-005 (CI/CD)

**Sprint 3 : Backend Demandes + Web/Mobile Setup**
- BACK-005 à BACK-009 (Endpoints adhérents + demandes)
- WEB-001 à WEB-005 (Setup web)
- MOBILE-001 à MOBILE-008 (Setup mobile)

**Sprint 4 : Backend Documents + UI Core**
- BACK-010 à BACK-014 (Documents + WebSocket + Queue)
- BACK-019, BACK-020 (Rate limiting + logging)
- WEB-006 à WEB-011, WEB-017 à WEB-020 (Pages adhérent + gestionnaire)
- MOBILE-009 à MOBILE-011, MOBILE-022 (Screens core)
- DEPLOY-009 (Health checks)

**Sprint 5 : Praticiens + Demandes Complètes**
- BACK-021 à BACK-024 (Praticiens + tiers-payant)
- DB-002 (Schema praticiens)
- WEB-012 à WEB-014, WEB-028 à WEB-032 (Gestionnaire + Praticien)
- MOBILE-012 à MOBILE-016 (Nouvelle demande complète)
- PRAT-003 (Tarifs)

**Sprint 6 : Features Avancées**
- WEB-015, WEB-016, WEB-031 (Reporting + Agent + Paiements)
- MOBILE-017 à MOBILE-021, MOBILE-023 (Garanties, QR, PDF, notifications)
- R2-006, DB-004, DB-008 (Optimisations)
- PRAT-001, PRAT-002 (Admin praticiens)
- DEPLOY-004, DEPLOY-007, DEPLOY-008, DEPLOY-010 (Mobile CI/CD + monitoring)

**Sprint 7 : Testing**
- TEST-001 à TEST-006, TEST-009 (Tests critiques)

**Sprint 8 : Finalisation**
- WEB-023 à WEB-027 (Styling + accessibilité + SEO + perf)
- MOBILE-024 à MOBILE-026 (Perf + accessibilité + i18n)
- R2-005 (Multipart si temps)
- TEST-007, TEST-008, TEST-010 (Accessibilité + UAT)
- DEPLOY-011, DEPLOY-012 (Documentation + feature flags)

---

## 🚀 Démarrage Rapide

### Pour Claude Code

```bash
# 1. Charger le fichier JSON des tâches
cat soinflow-all-tasks.json

# 2. Demander génération complète
"Génère tous les fichiers de tâches markdown à partir du JSON fourni,
en créant un fichier détaillé pour chaque tâche avec objectifs, 
prérequis, critères d'acceptation, étapes d'implémentation et tests"

# 3. Commencer l'implémentation
"Commence par INFRA-001 : Configuration Cloudflare Account"
```

### Pour Développeurs

1. **Lire** : `soinflow-all-tasks.json` (vue d'ensemble)
2. **Planifier** : Sprints selon ordre recommandé
3. **Implémenter** : Suivre dépendances (INFRA → DB → BACK → Mobile/Web)
4. **Tester** : Tests continus (Sprint 7 dédié)

---

## 📦 Fichiers Fournis

| Fichier | Description |
|---------|-------------|
| `soinflow-all-tasks.json` | **Liste complète 125 tâches** avec détails (ESSENTIEL) |
| `README.md` | Ce fichier - guide principal |

---

## 🎯 Modules Clés

### Module Papier (Actuel BH)
**Acteurs** : Adhérents, Gestionnaires BH, Agents  
**Flow** :
```
1. Adhérent consulte médecin → paie → reçoit bulletin papier BH
2. Adhérent upload bulletin via app mobile (photo)
3. Gestionnaire BH voit demande dans file d'attente
4. Gestionnaire vérifie documents manuellement
5. Gestionnaire calcule remboursement (assistant garanties)
6. Gestionnaire approuve → queue paiement
7. Virement adhérent J+3-5
```

### Module Digital (Innovation)
**Acteurs** : Adhérents, Praticiens, BH  

**Flow Conventionné** :
```
1. Adhérent chez praticien conventionné BH
2. Praticien scan QR adhérent → vérifie garanties temps réel
3. Praticien crée acte digital (consultation 30 TND, taux 80%)
4. Système calcule : BH paie 24 TND, adhérent paie 6 TND
5. Adhérent paie 6 TND seulement (tiers-payant)
6. Demande créée auto dans SoinFlow
7. Validation BH automatique (praticien conventionné = confiance)
8. Queue paiement praticien → virement J+3
```

**Flow Non-Conventionné** :
```
1. Adhérent chez praticien non-conventionné
2. Praticien crée demande en ligne (montant libre 80 TND)
3. Adhérent paie 80 TND au praticien
4. Système calcule remboursement selon tarif référence BH (30 TND × 70% = 21 TND)
5. Validation automatique (pas de tiers-payant)
6. Virement adhérent 21 TND <24h
```

---

## 🔑 Concepts Clés

### Tables Principales D1

- `sante_adherents` : Adhérents santé BH (lien `client_dhamen_id`)
- `sante_demandes` : Demandes remboursement (papier OU digital)
- `sante_documents` : Métadonnées fichiers R2 (bulletins, factures)
- `sante_garanties_formules` : Grille garanties (Essentiel/Confort/Premium)
- `sante_plafonds_consommes` : Tracking consommation annuelle
- `sante_praticiens` : Praticiens de santé inscrits
- `sante_actes_praticiens` : Actes créés par praticiens (→ demandes auto)

### Workflow Unifié

```
                    ┌─────────────────┐
                    │   SOINFLOW      │
                    │   Plateforme    │
                    └────────┬────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼────┐        ┌─────▼──────┐      ┌─────▼──────┐
   │ Adhérent│        │Gestionnaire│      │ Praticien  │
   │ Mobile  │        │    Web     │      │    Web     │
   └────┬────┘        └─────┬──────┘      └─────┬──────┘
        │                   │                    │
        │ Upload            │ Traite             │ Crée acte
        │ bulletin          │ manuellement       │ digital
        │ papier            │                    │
        │                   │                    │
        └───────────────────┼────────────────────┘
                            │
                    ┌───────▼────────┐
                    │  Base Données  │
                    │  sante_demandes│
                    │                │
                    │  source:       │
                    │  'adherent' OU │
                    │  'praticien'   │
                    └────────────────┘
```

### Statuts Demande

- `soumise` : Créée par adhérent/praticien
- `en_examen` : Gestionnaire traite (papier) OU validation auto (digital)
- `info_requise` : Gestionnaire demande complément
- `approuvee` : Validée, en attente paiement
- `en_paiement` : Dans queue paiement
- `payee` : Virement effectué
- `rejetee` : Refusée (motif)

---

## 🧪 Testing Strategy

| Type | Framework | Sprint | Coverage Target |
|------|-----------|--------|-----------------|
| Unit Backend | Vitest | 7 | >80% |
| Integration | Vitest + Mocks | 7 | Endpoints critiques |
| E2E Mobile | Detox | 7 | Parcours principaux |
| E2E Web | Playwright | 7 | Adhérent + Gestionnaire + Praticien |
| Performance | k6 | 7 | <100ms latency, >1000 req/s |
| Security | npm audit + manual | 7 | 0 vulnérabilités critiques |
| UAT | Manuel | 8 | Vrais utilisateurs |

---

## 📞 Support & Contribution

**Architecture** : Yassine Techini (CTO)  
**Email** : yassine@beta-methods.tn  
**Repository** : [À définir]

### Contribution

1. Lire `soinflow-all-tasks.json`
2. Choisir tâche (respecter dépendances)
3. Créer branche `feature/TASK-ID`
4. Implémenter selon spécifications
5. Tests passent
6. Pull Request → Code Review
7. Merge vers `main`

---

## 📄 Licence

Propriétaire - BH Assurance / Beta-Methods  
Confidentiel - Usage interne uniquement

---

**Dernière mise à jour** : 2026-02-26  
**Version** : 2.0 - Plateforme Unifiée (Papier + Digital)
