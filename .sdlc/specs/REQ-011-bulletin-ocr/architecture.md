# Architecture — REQ-011 Bulletin OCR — Extraction automatique

## ADR-001 : Réutiliser l'agent OCR existant (`ocr.agent.ts`) et son pipeline complet

### Decision

Réutiliser intégralement le pipeline OCR existant dans `apps/api/src/agents/ocr/` — agent, rules, types — pour l'extraction des bulletins de soin. Le type `BulletinExtractedData` et les fonctions `extractBulletinData()` / `processOCRRequest()` couvrent déjà les champs requis par REQ-011.

### Rationale

- `ocr.agent.ts` utilise déjà le modèle `@cf/meta/llama-3.2-11b-vision-instruct` avec un prompt structuré pour les documents médicaux tunisiens (français + arabe).
- `BulletinExtractedData` dans `ocr.types.ts` couvre tous les champs F-010 à F-017 : `dateSoin`, `praticien.nom`, `praticien.specialite`, `lignes[]` (actes avec libellé, montant, quantité), `montantTotal`, `adherentNom`, `adherentMatricule`, `typeSoin`, `numeroPrescription`.
- `ocr.rules.ts` implémente déjà : parsing montants TND/millimes (`parseAmount`), parsing dates multi-format (`parseDate`), détection du type de soin (`detectCareType`), calcul de confiance global (`calculateConfidence`) et par champ (`calculateFieldConfidences`), validation métier (`validateExtractedData`).
- Le score de confiance par champ (F-020 à F-023) est déjà implémenté via `FieldConfidence` dans `ocr.types.ts`.

### Impact

- **Aucune modification structurelle** de l'agent OCR.
- Améliorations incrémentales possibles : enrichir les patterns de parsing, ajuster les poids de confiance.
- **Risque** : Nul — réutilisation à l'identique d'un composant testé (`ocr.test.ts`).

---

## ADR-002 : Exploiter les routes API existantes sans créer de nouveaux endpoints

### Decision

Utiliser les routes existantes dans `apps/api/src/routes/sante/documents.ts` pour l'ensemble du flux OCR bulletin :

- `POST /api/v1/sante/documents/upload` — upload image vers R2
- `POST /api/v1/sante/documents/:id/ocr` — déclenchement OCR (avec support `?force=true` pour réextraction)
- `GET /api/v1/sante/documents/:id/ocr` — récupération du résultat (à ajouter si absent)
- `GET /api/v1/sante/documents/demande/:demandeId` — liste des documents d'une demande

### Rationale

- La route upload gère déjà : validation MIME (JPEG, PNG, WebP, PDF — F-006/NF-006), validation taille (10 Mo — NF-007), stockage R2 avec clé `sante/documents/{demandeId}/{id}.{ext}`, métadonnées custom, audit trail.
- La route OCR gère déjà : verrouillage (statut `processing` — F-003), cache résultat (skip si confiance > 0 sauf `force=true`), mise à jour statut (`pending` → `processing` → `completed`/`failed` — F-004), stockage résultat JSON dans `ocr_result_json` (F-040), audit trail (NF-010).
- Le contrôle d'accès RBAC est en place : adhérent limité à ses propres demandes, praticien limité à ses demandes liées.

### Impact

- **API** : Ajout d'une route `GET /api/v1/sante/documents/:id/ocr` si elle n'existe pas encore (F-042).
- **Risque** : Faible — extension mineure d'un ensemble de routes existant.

---

## ADR-003 : Verrouillage OCR via statut en base (pas de Durable Object)

### Decision

Implémenter le verrouillage F-003 (un seul traitement OCR à la fois par document) via le champ `ocr_status` en base D1, sans utiliser de Durable Object.

### Rationale

- Le pattern est déjà en place dans la route `POST /:id/ocr` : vérification du statut avant traitement, mise à jour atomique vers `processing`, puis `completed`/`failed`.
- Un Durable Object serait sur-dimensionné pour ce cas : le verrouillage sert uniquement à éviter les requêtes concurrentes sur un même document, pas à gérer un état complexe.
- En cas de crash pendant le traitement (statut bloqué sur `processing`), un job de nettoyage peut réinitialiser les documents en `processing` depuis plus de 60 secondes.
- La requête concurrente est rejetée avec `OCR_ALREADY_PROCESSING` (AC-4).

### Impact

- **API** : Ajout de la vérification `if (doc.ocrStatus === 'processing') return 409` dans la route OCR.
- **DB** : Aucun changement — le champ `ocr_status` existe déjà.
- **Risque** : Faible — race condition théorique sur D1 en écriture concurrente, mais négligeable vu l'usage (un adhérent = un document à la fois).

---

## ADR-004 : Émission d'événements OCR via Cloudflare Queues

### Decision

Émettre des événements `OCR_COMPLETED` et `OCR_FAILED` (F-005) via le binding Cloudflare Queues (`QUEUE`) existant, après chaque traitement OCR.

### Rationale

- Le binding `QUEUE` (queue `dhamen-events`) est déjà configuré dans `wrangler.toml`.
- Les événements permettent : notification temps réel au client (via polling ou WebSocket futur), déclenchement de traitements aval (vérification anti-fraude, matching tarif), audit asynchrone.
- Alternative considérée : WebSocket via Durable Object — rejetée car ajoute de la complexité pour un premier déploiement. Le polling côté client est suffisant.

### Impact

- **API** : Ajout d'un `await c.env.QUEUE.send({ type: 'OCR_COMPLETED', documentId, demandeId, confidence })` dans le handler OCR.
- **Risque** : Faible — intégration d'un service déjà provisionné.

---

## ADR-005 : Support multi-pages via documents multiples (relation 1:N existante)

### Decision

Pour les bulletins multi-pages (F-006, NF-002), chaque page est uploadée comme un document séparé lié à la même demande. L'OCR est exécuté indépendamment sur chaque page. La fusion des résultats est réalisée côté client.

### Rationale

- La relation `sante_documents` → `sante_demandes` est déjà 1:N. La route `GET /sante/documents/demande/:demandeId` retourne tous les documents d'une demande.
- L'OCR par page est plus fiable que l'OCR multi-image : chaque page est traitée individuellement avec son propre score de confiance.
- La fusion côté client est simple : concaténer les actes (`lignes[]`), sommer les montants, prendre le score de confiance minimum.
- La fusion côté serveur ajouterait de la complexité (gestion d'ordre des pages, logique de déduplication) pour un gain limité.

### Impact

- **Mobile** : Bouton "Ajouter une page" dans le flux de capture. Boucle upload + OCR par page.
- **API** : Aucun changement.
- **Risque** : Faible — extension additive côté mobile uniquement.

---

## ADR-006 : Limitation des tentatives OCR via compteur en base

### Decision

Limiter le nombre de tentatives OCR par document à 5 (F-053) via un compteur `ocr_attempts` ajouté à la table `sante_documents`.

### Rationale

- Protège contre les boucles infinies de retry sur des images systématiquement illisibles.
- Le compteur en base est simple, persistant, et ne nécessite pas de service externe (rate limiter, Redis).
- Au-delà de 5 tentatives, la route OCR retourne `OCR_MAX_ATTEMPTS_REACHED` et redirige vers la saisie manuelle.

### Impact

- **DB** : Migration pour ajouter la colonne `ocr_attempts INTEGER DEFAULT 0` à `sante_documents`.
- **API** : Vérification `if (doc.ocrAttempts >= 5) return 429` dans la route OCR. Incrémentation à chaque appel.
- **Risque** : Faible — migration additive, pas de changement destructif.

---

## ADR-007 : Endpoint dédié GET pour le résultat OCR

### Decision

Ajouter `GET /api/v1/sante/documents/:id/ocr` pour récupérer le résultat OCR structuré d'un document (F-042), distinct du `GET /api/v1/sante/documents/:id` qui retourne les métadonnées du document.

### Rationale

- Sépare les préoccupations : métadonnées document vs. résultat extraction.
- Permet au client de poller uniquement le résultat OCR sans re-télécharger les métadonnées complètes.
- La réponse inclut : `status` (pending/processing/completed/failed), `data` (BulletinExtractedData si completed), `error` (si failed), `processingTimeMs`.
- Le client peut implémenter un polling simple : appel toutes les 2 secondes jusqu'à `status !== 'processing'`.

### Impact

- **API** : Nouvelle route dans `documents.ts` — ~20 lignes.
- **Risque** : Nul — ajout d'une route en lecture seule.

---

## ADR-008 : Codes erreur métier dédiés OCR

### Decision

Définir des codes erreur métier spécifiques au module OCR dans `packages/shared` :

| Code | Description | HTTP |
|------|-------------|------|
| `OCR_IMAGE_UNREADABLE` | Image illisible (floue, trop sombre, tronquée) | 422 |
| `OCR_INVALID_DOCUMENT_TYPE` | Document détecté non bulletin de soin | 422 |
| `OCR_ALREADY_PROCESSING` | Traitement en cours sur ce document | 409 |
| `OCR_MAX_ATTEMPTS_REACHED` | 5 tentatives épuisées | 429 |
| `OCR_AI_UNAVAILABLE` | Workers AI temporairement indisponible | 503 |
| `OCR_EXTRACTION_FAILED` | Échec extraction (erreur interne) | 500 |

### Rationale

- Les conventions CLAUDE.md imposent des codes erreur métier explicites.
- Ces codes permettent au client mobile de gérer chaque cas avec un message d'erreur spécifique et une action adaptée (reprendre photo, saisie manuelle, réessayer plus tard).
- Le pattern `{ success: false, error: { code: string, message: string } }` est déjà en place dans l'API.

### Impact

- **Shared** : Ajout des constantes dans `packages/shared/src/types/` ou `packages/shared/src/constants/`.
- **API** : Utilisation dans les handlers OCR.
- **Risque** : Nul — ajout de constantes.

---

## ADR-009 : Qualité d'image évaluée par le modèle vision (pas de pré-traitement dédié)

### Decision

Évaluer la qualité de l'image (F-023) via le modèle vision lui-même (score de confiance bas = mauvaise qualité), plutôt que d'implémenter un module de pré-traitement d'image séparé (contraste, orientation, netteté).

### Rationale

- Le modèle `llama-3.2-11b-vision-instruct` détecte implicitement la qualité : une image floue produit des extractions partielles avec des scores bas.
- L'ajout de `metadata.imageQuality` (good/acceptable/poor) est déduit du score global : >= 0.8 → good, >= 0.5 → acceptable, < 0.5 → poor.
- Un pré-traitement dédié (OpenCV, Sharp) n'est pas compatible avec Cloudflare Workers (pas de bindings natifs pour le traitement d'image).
- Alternative future : utiliser un Worker dédié avec WebAssembly pour le pré-traitement si la précision s'avère insuffisante.

### Impact

- **Agent** : Ajout du calcul `imageQuality` dans `ocr.agent.ts` basé sur le score global.
- **Types** : Le champ `metadata.imageQuality` existe déjà dans la structure cible (REQ-011 section 6).
- **Risque** : Faible — approche pragmatique, améliorable itérativement.

---

## ADR-010 : Historique des extractions stocké dans une table dédiée (optionnel, "Could")

### Decision

Reporter l'historique des extractions OCR successives (F-044, priorité "Could") à une phase ultérieure. Pour l'instant, seul le dernier résultat est stocké dans `sante_documents.ocr_result_json`.

### Rationale

- F-044 est un "Could" — non critique pour le MVP.
- Stocker l'historique nécessiterait une table `ocr_extraction_history` avec `document_id`, `attempt_number`, `result_json`, `created_at`.
- Le compteur `ocr_attempts` (ADR-006) suffit pour tracer le nombre de tentatives sans stocker chaque résultat intermédiaire.
- Le résultat final (le plus récent) est le seul pertinent pour le pré-remplissage du formulaire.

### Impact

- **Aucun** pour le MVP.
- Migration et table additionnelle si implémenté ultérieurement.
- **Risque** : Nul — feature reportée.

---

## Synthèse des fichiers impactés

| Fichier | Type de changement |
|---------|-------------------|
| `apps/api/src/routes/sante/documents.ts` | Modification — ajout GET OCR result, verrouillage, limite tentatives |
| `apps/api/src/agents/ocr/ocr.agent.ts` | Modification mineure — ajout `imageQuality` dans metadata |
| `apps/api/src/agents/ocr/ocr.rules.ts` | Aucun changement (déjà complet) |
| `apps/api/src/agents/ocr/ocr.types.ts` | Modification mineure — ajout `imageQuality` dans metadata |
| `packages/shared/src/types/sante.ts` | Modification mineure — codes erreur OCR |
| `packages/db/migrations/00XX_add_ocr_attempts.sql` | Nouvelle migration — colonne `ocr_attempts` |
| `apps/mobile/src/app/(main)/demandes/nouvelle.tsx` | Modification — multi-pages, polling résultat OCR |
| `apps/mobile/src/app/(main)/bulletins/nouveau.tsx` | Référence pattern (pas de changement) |

## Diagramme de flux

```
[Client]                                     [API]                              [Workers AI / R2]
   |                                           |                                      |
   |-- 1. POST /sante/documents/upload ------->|-- put R2 sante/documents/... -------->|
   |<-- { id, ocrStatus: "pending" } ----------|                                      |
   |                                           |                                      |
   |-- 2. POST /sante/documents/:id/ocr ----->|                                      |
   |                                           |-- check: status != processing        |
   |                                           |-- check: attempts < 5                |
   |                                           |-- update status → "processing"       |
   |                                           |-- fetch image from R2 <--------------|
   |                                           |-- AI.run(vision model) ------------->|
   |                                           |<-- extracted JSON -------------------|
   |                                           |-- calculateConfidence()              |
   |                                           |-- calculateFieldConfidences()        |
   |                                           |-- validateExtractedData()            |
   |                                           |-- update status → "completed"        |
   |                                           |-- store ocr_result_json              |
   |                                           |-- QUEUE.send(OCR_COMPLETED) -------->|
   |<-- { success, data: BulletinExtractedData }|                                      |
   |                                           |                                      |
   |-- 3. GET /sante/documents/:id/ocr ------->|  (polling si async)                  |
   |<-- { status, data, confidence } ----------|                                      |
   |                                           |                                      |
   |   [Pré-remplissage formulaire]            |                                      |
   |   [Correction manuelle]                   |                                      |
   |   [Soumission demande]                    |                                      |
```

## Diagramme des états OCR

```
                    ┌─────────┐
     upload ───────>│ pending │
                    └────┬────┘
                         │ POST /:id/ocr
                         ▼
                    ┌────────────┐
                    │ processing │──── requête concurrente → 409 OCR_ALREADY_PROCESSING
                    └────┬───────┘
                    ┌────┴────┐
                    ▼         ▼
             ┌───────────┐ ┌────────┐
             │ completed │ │ failed │
             └───────────┘ └───┬────┘
                               │ retry (si attempts < 5)
                               ▼
                          ┌─────────┐
                          │ pending │ → boucle
                          └─────────┘
```
