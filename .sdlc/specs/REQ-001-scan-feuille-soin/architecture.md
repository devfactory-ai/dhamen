# Architecture — REQ-001 Scan Feuille de Soin

## ADR-001 : Réutiliser le flux `nouvelle.tsx` existant plutôt que créer un nouvel écran

### Decision

Enrichir l'écran existant `apps/mobile/src/app/(main)/demandes/nouvelle.tsx` en y intégrant le flux OCR complet (upload → extraction → pré-remplissage → correction → soumission), en s'inspirant du pattern établi dans `bulletins/nouveau.tsx`.

### Rationale

- `nouvelle.tsx` contient déjà la sélection du type de soin, la capture caméra, la sélection galerie, l'aperçu, et la soumission via l'API sante/demandes. Le flux OCR y est amorcé mais incomplet (l'OCR est déclenché en fire-and-forget post-soumission sans pré-remplissage).
- `nouveau.tsx` (bulletins) implémente déjà le pattern complet : capture → écran "extraction en cours" → pré-remplissage → correction manuelle → soumission. Ce pattern est validé et fonctionne.
- Créer un nouvel écran introduirait de la duplication et de la confusion dans la navigation Expo Router.

### Impact

- **Mobile** : Modification de `demandes/nouvelle.tsx` — ajout de l'étape `extracting`, appel OCR synchrone avant soumission, affichage des champs à faible confiance.
- **API** : Aucune nouvelle route nécessaire. Les routes `POST /sante/documents/upload` et `POST /sante/documents/:id/ocr` existent déjà.
- **Risque** : Faible — enrichissement d'un écran existant avec un pattern déjà prouvé dans le codebase.

---

## ADR-002 : OCR synchrone pré-soumission (pas fire-and-forget)

### Decision

Déclencher l'OCR de manière synchrone après l'upload, **avant** la soumission de la demande. Le mobile attend le résultat OCR pour pré-remplir le formulaire, avec un timeout de 15 secondes et un bouton "Passer et remplir manuellement" (pattern `nouveau.tsx`).

### Rationale

- L'exigence F-030 impose que les champs soient pré-remplis avec les données OCR **avant** soumission. Le flux actuel de `nouvelle.tsx` déclenche l'OCR après soumission (`apiClient.post(...).catch(console.error)`), ce qui empêche le pré-remplissage.
- Le pattern synchrone est déjà implémenté et fonctionnel dans `nouveau.tsx` via `runOcrExtraction()`.
- Workers AI `@cf/meta/llama-3.2-11b-vision-instruct` a un SLA < 10 secondes (NF-002), compatible avec un appel synchrone.
- Le fallback manuel est essentiel : si l'OCR échoue ou dépasse le timeout, l'adhérent doit pouvoir saisir manuellement (AC-5).

### Impact

- **Mobile** : Le flux passe de `capture → preview → submit` à `capture → upload → OCR (loading screen) → pré-remplissage → review/correct → submit`.
- **UX** : Ajout d'un écran de chargement "Extraction en cours..." avec option de skip. Temps d'attente typique : 5-10 secondes.
- **Risque** : Moyen — dépendance sur la latence Workers AI. Mitigé par le timeout + fallback manuel.

---

## ADR-003 : Utiliser l'OCR Agent existant (`ocr.agent.ts`) avec le modèle vision

### Decision

Réutiliser `apps/api/src/agents/ocr/ocr.agent.ts` et sa fonction `extractBulletinData()` pour l'extraction OCR des feuilles de soin. Le type de document `bulletin_soin` est déjà supporté par cet agent.

### Rationale

- L'agent OCR est déjà configuré avec le modèle `@cf/meta/llama-3.2-11b-vision-instruct` (F-021) et un prompt structuré pour les documents médicaux tunisiens.
- Le type `BulletinExtractedData` dans `ocr.types.ts` couvre exactement les champs requis par F-022 : `dateSoin`, `praticien.nom`, `praticien.specialite`, `lignes[]` (actes), `montantTotal`, `adherentMatricule`.
- Les règles de parsing (`ocr.rules.ts`) gèrent déjà la conversion TND/millimes, la détection du type de soin, et le calcul du score de confiance (F-023).
- Le support français est natif dans le prompt. Le support arabe (F-024) est implicite via le modèle LLaMA 3.2 vision qui est multilingue, mais le prompt devra être enrichi pour explicitement mentionner le support arabe.

### Impact

- **API** : Mise à jour mineure du prompt dans `ocr.agent.ts` pour mentionner explicitement le support arabe.
- **Types** : Aucun changement — `BulletinExtractedData` est déjà complet.
- **Risque** : Faible — réutilisation d'un composant existant et testé.

---

## ADR-004 : Stockage R2 avec clé `sante/documents/{demandeId}/{docId}.{ext}`

### Decision

Conserver le schéma de clé R2 existant défini dans `documents.ts:211` : `sante/documents/${demandeId}/${id}.${extension}`. Ce schéma correspond exactement au format attendu par AC-1.

### Rationale

- La route `POST /sante/documents/upload` utilise déjà ce format de clé R2 et gère : validation MIME (JPEG, PNG — F-011), validation taille (10 Mo — NF-004), métadonnées custom (demandeId, typeDocument, uploadedBy), et audit trail (NF-008).
- Le chiffrement au repos (NF-006) est géré au niveau bucket R2 (AES-256 natif Cloudflare), pas au niveau applicatif.
- Le contrôle d'accès RBAC (NF-007) est implémenté dans chaque handler via la vérification `demande.adherentId !== user.sub`.

### Impact

- **Infrastructure** : Aucun changement R2 ou D1.
- **API** : Aucun changement — le flux upload existant est complet.
- **Risque** : Nul — réutilisation à l'identique.

---

## ADR-005 : Créer la demande AVANT l'upload (demande comme conteneur)

### Decision

Maintenir le flux existant de `nouvelle.tsx` : créer d'abord la demande via `POST /sante/demandes`, puis uploader le document en référençant le `demandeId` obtenu, puis déclencher l'OCR. Modifier l'ordre pour : (1) sélection type → (2) capture → (3) créer demande draft → (4) upload document → (5) OCR → (6) pré-remplir → (7) corriger → (8) soumettre demande finale.

### Rationale

- L'upload requiert un `demandeId` (champ obligatoire dans `POST /sante/documents/upload`). La demande doit donc exister avant l'upload.
- Introduire un statut "brouillon" (`brouillon`) dans `SANTE_STATUTS_DEMANDE` permettrait de créer la demande tôt sans la considérer comme soumise, puis de la finaliser après OCR et correction.
- Alternative rejetée : uploader sans `demandeId` nécessiterait de modifier la route upload et le schéma D1 `sante_documents` (colonne `demande_id NOT NULL`), ajoutant de la complexité pour un gain marginal.

### Impact

- **Shared types** : Ajout de `'brouillon'` à `SANTE_STATUTS_DEMANDE` dans `packages/shared/src/types/sante.ts`.
- **DB** : Migration pour accepter le statut `brouillon`. Les demandes brouillon sont nettoyées après 24h par un job batch.
- **API** : Modification de `POST /sante/demandes` pour accepter `montantDemande: 0` en mode brouillon, mise à jour via `PATCH /sante/demandes/:id` après correction OCR.
- **Risque** : Faible — ajout d'un statut dans un enum existant, pas de refactoring structurel.

---

## ADR-006 : Score de confiance par champ (pas uniquement global)

### Decision

Étendre `BulletinExtractedData` pour inclure un score de confiance par champ en plus du score global, afin de permettre le marquage visuel des champs à faible confiance (F-032, seuil < 0.7).

### Rationale

- F-032 exige que les champs avec un score < 0.7 soient marqués visuellement. Le score global existant ne suffit pas : un score global de 0.8 peut masquer un champ individuel à 0.3.
- Le modèle vision ne retourne pas de scores par champ nativement. La confiance par champ sera calculée par `ocr.rules.ts` via des heuristiques : présence/absence du champ, format validé (date, montant), longueur raisonnable.
- Le score global restera la moyenne pondérée des scores par champ.

### Impact

- **Types** : Ajout d'un type `FieldConfidence` dans `ocr.types.ts` et d'un champ `fieldConfidences: Record<string, number>` dans `BulletinExtractedData`.
- **Agent** : Mise à jour de `ocr.rules.ts` pour calculer les scores par champ.
- **Mobile** : Affichage conditionnel d'un indicateur d'alerte sur les champs < 0.7 (bordure orange, icone avertissement).
- **Risque** : Faible — extension additive des types existants.

---

## ADR-007 : Notification push post-soumission via le service existant

### Decision

Utiliser `apps/api/src/services/push-notification.service.ts` pour envoyer la notification `SANTE_DEMANDE_SOUMISE` (F-042) après soumission réussie de la demande.

### Rationale

- Le service push est déjà opérationnel et utilisé par d'autres fonctionnalités (bulletins, paiements).
- Les tokens Expo sont stockés dans `push_tokens` (migration 0025).
- Le hook `usePushNotifications.ts` côté mobile est déjà en place pour la réception.
- Le type de notification `SANTE_DEMANDE_SOUMISE` doit être ajouté au registre des types si absent.

### Impact

- **API** : Appel `sendPushNotification()` dans le handler de finalisation de la demande (passage de `brouillon` → `soumise`).
- **Mobile** : Aucun changement — le listener push est déjà configuré.
- **Risque** : Nul — intégration d'un service existant.

---

## ADR-008 : Retry upload côté mobile avec expo-file-system

### Decision

Implémenter le retry d'upload (F-014, max 3 tentatives) dans le `api-client.ts` existant au niveau de la méthode `upload()`, avec backoff exponentiel (1s, 2s, 4s).

### Rationale

- `api-client.ts` gère déjà les retries pour le refresh token (401). Le pattern est extensible aux erreurs réseau (timeout, network error).
- F-015 (sauvegarde offline) est un "Could" — hors scope pour cette itération. Le retry réseau couvre le cas le plus fréquent.
- Pas besoin d'installer de dépendance supplémentaire — le retry est implémentable avec un simple wrapper async.

### Impact

- **Mobile** : Modification de `api-client.ts` — ajout d'un wrapper retry sur `upload()`.
- **Risque** : Faible — modification isolée dans le client HTTP.

---

## ADR-009 : Pas de nouvelle migration D1 pour le schéma documents

### Decision

Ne pas créer de nouvelles tables D1. La table `sante_documents` (migration 0021) contient déjà toutes les colonnes nécessaires : `id`, `demande_id`, `type_document`, `r2_key`, `r2_bucket`, `nom_fichier`, `mime_type`, `taille_octets`, `ocr_status`, `ocr_result_json`, `ocr_completed_at`, `uploaded_by`, `created_at`.

### Rationale

- Le schéma existant couvre 100% des besoins de REQ-001.
- Les statuts OCR (`pending` → `processing` → `completed` / `failed`) sont déjà modélisés dans le type `SanteDocument.ocrStatus`.
- Le résultat OCR JSON est stocké dans `ocr_result_json` (F-026).
- Seule migration nécessaire : ajout du statut `brouillon` dans le check constraint de `sante_demandes.statut` (voir ADR-005).

### Impact

- **DB** : Une seule migration mineure pour le statut `brouillon`.
- **Risque** : Nul — pas de changement de schéma structurel.

---

## ADR-010 : Multi-pages document — gestion séquentielle simple

### Decision

Pour le support multi-pages (F-006, "Should"), permettre à l'adhérent de capturer plusieurs images séquentiellement. Chaque image est uploadée comme un document séparé lié à la même demande. L'OCR est exécuté sur chaque page et les résultats sont fusionnés côté mobile.

### Rationale

- La relation `sante_documents` → `sante_demandes` est déjà 1:N (une demande peut avoir plusieurs documents).
- La route `GET /sante/documents/demande/:demandeId` retourne déjà tous les documents d'une demande.
- La fusion OCR côté mobile est simple : concaténer les lignes d'actes, sommer les montants, prendre la confiance minimale.
- Alternative rejetée : fusion côté API ajouterait de la complexité serveur pour un cas d'usage secondaire ("Should").

### Impact

- **Mobile** : Ajout d'un bouton "Ajouter une page" dans l'écran de preview. Boucle de capture jusqu'à confirmation.
- **API** : Aucun changement.
- **Risque** : Faible — extension additive du flux mobile.

---

## Synthèse des fichiers impactés

| Fichier | Type de changement |
|---------|-------------------|
| `apps/mobile/src/app/(main)/demandes/nouvelle.tsx` | Modification majeure — flux OCR complet |
| `apps/mobile/src/lib/api-client.ts` | Modification mineure — retry upload |
| `apps/api/src/agents/ocr/ocr.agent.ts` | Modification mineure — prompt arabe |
| `apps/api/src/agents/ocr/ocr.types.ts` | Modification mineure — `fieldConfidences` |
| `apps/api/src/agents/ocr/ocr.rules.ts` | Modification mineure — scores par champ |
| `packages/shared/src/types/sante.ts` | Modification mineure — statut `brouillon` |
| `packages/shared/src/schemas/sante.ts` | Modification mineure — enum update |
| `packages/db/migrations/0063_add_brouillon_status.sql` | Nouvelle migration |
| `apps/api/src/routes/sante/demandes.ts` | Modification mineure — accepter brouillon |

## Diagramme de flux

```
[Mobile]                                    [API]                           [R2/AI]
   |                                          |                                |
   |-- 1. POST /sante/demandes (brouillon) -->|                                |
   |<-- { id: demandeId } -------------------|                                |
   |                                          |                                |
   |-- 2. POST /sante/documents/upload ------>|-- put R2 key ----------------->|
   |<-- { id: docId, ocrStatus: pending } ----|                                |
   |                                          |                                |
   |-- 3. POST /sante/documents/:id/ocr ----->|-- AI.run(vision model) ------->|
   |                                          |<-- extracted JSON -------------|
   |<-- { data: BulletinExtractedData } ------|                                |
   |                                          |                                |
   |   [Pré-remplissage formulaire]           |                                |
   |   [Correction manuelle adhérent]         |                                |
   |                                          |                                |
   |-- 4. PATCH /sante/demandes/:id --------->|                                |
   |      (statut: soumise, montant, date)    |                                |
   |<-- { success, numeroDemande } -----------|-- push notification ---------->|
   |                                          |-- audit log ------------------>|
```
