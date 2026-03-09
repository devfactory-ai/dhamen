---
id: REQ-001
title: Scan feuille de soin
status: draft
---

# REQ-001 — Scan feuille de soin

## 1. Description

L'adhérent doit pouvoir scanner une **feuille de soin** (bulletin de soin papier) depuis l'application mobile Dhamen afin de soumettre une demande de remboursement. Le flux couvre la capture photo du document, son upload sécurisé vers le stockage R2, le déclenchement de l'extraction OCR via Workers AI, et le pré-remplissage automatique du formulaire de demande avec les données extraites.

### 1.1 Contexte métier

En Tunisie, les adhérents reçoivent une feuille de soin papier après chaque acte médical (consultation, pharmacie, hospitalisation, etc.). Ce document contient les informations nécessaires au remboursement : identité du patient, praticien, actes réalisés, montants. Aujourd'hui, l'adhérent doit se déplacer ou envoyer le document par courrier. Cette fonctionnalité permet une soumission 100 % digitale depuis le mobile.

### 1.2 Utilisateurs cibles

- **Rôle** : `ADHERENT` (mobile uniquement)
- **Persona** : Adhérent d'une assurance santé tunisienne, utilisant l'application mobile pour gérer ses remboursements.

### 1.3 Flux principal

```
[Adhérent ouvre "Nouvelle demande"]
    → Sélection du type de soin
    → Capture photo (caméra) ou sélection galerie
    → Aperçu + recadrage optionnel
    → Upload vers R2 (multipart/form-data)
    → Extraction OCR déclenchée (asynchrone)
    → Pré-remplissage du formulaire avec les données extraites
    → Vérification / correction manuelle par l'adhérent
    → Soumission de la demande
```

## 2. Exigences fonctionnelles

### 2.1 Capture du document

| ID | Exigence | Priorité |
|----|----------|----------|
| F-001 | L'adhérent peut capturer une photo via la caméra du device | Must |
| F-002 | L'adhérent peut sélectionner une image depuis la galerie | Must |
| F-003 | Un aperçu plein écran de l'image est affiché avant envoi | Must |
| F-004 | L'adhérent peut reprendre la photo si la qualité est insuffisante | Must |
| F-005 | Un guide visuel (overlay rectangle) aide au cadrage du document | Should |
| F-006 | L'adhérent peut capturer plusieurs pages pour un même document | Should |

### 2.2 Upload du document

| ID | Exigence | Priorité |
|----|----------|----------|
| F-010 | L'image est uploadée vers R2 via `POST /api/v1/sante/documents/upload` | Must |
| F-011 | Formats acceptés : JPEG, PNG (max 10 Mo) | Must |
| F-012 | Un indicateur de progression est affiché pendant l'upload | Must |
| F-013 | Le type de document `bulletin_soin` est assigné automatiquement | Must |
| F-014 | L'upload est réessayé automatiquement en cas d'échec réseau (max 3 tentatives) | Should |
| F-015 | L'image est sauvegardée localement (offline) si le réseau est indisponible, puis envoyée à la reconnexion | Could |

### 2.3 Extraction OCR

| ID | Exigence | Priorité |
|----|----------|----------|
| F-020 | L'OCR est déclenché automatiquement après upload via `POST /api/v1/sante/documents/:id/ocr` | Must |
| F-021 | Le modèle Workers AI (`@cf/meta/llama-3.2-11b-vision-instruct`) extrait les champs structurés | Must |
| F-022 | Champs extraits : date du soin, nom du praticien, spécialité, actes, montants (TND), matricule patient | Must |
| F-023 | Un score de confiance (0–1) est retourné avec chaque extraction | Must |
| F-024 | L'extraction supporte les documents en **français** et en **arabe** | Must |
| F-025 | Le statut OCR est suivi : `pending` → `processing` → `completed` / `failed` | Must |
| F-026 | Le résultat OCR est stocké en JSON dans `sante_documents.ocr_result_json` | Must |

### 2.4 Pré-remplissage du formulaire

| ID | Exigence | Priorité |
|----|----------|----------|
| F-030 | Les champs du formulaire de demande sont pré-remplis avec les données OCR | Must |
| F-031 | L'adhérent peut corriger manuellement chaque champ pré-rempli | Must |
| F-032 | Les champs avec un score de confiance < 0.7 sont marqués visuellement (alerte) | Should |
| F-033 | Le type de soin est déduit automatiquement du contenu OCR | Should |
| F-034 | Un récapitulatif affiche les données extraites vs. les données corrigées avant soumission | Could |

### 2.5 Soumission de la demande

| ID | Exigence | Priorité |
|----|----------|----------|
| F-040 | La demande est créée via l'API existante avec le document attaché | Must |
| F-041 | Un numéro de demande unique est généré et affiché à l'adhérent | Must |
| F-042 | Une notification push confirme la soumission (`SANTE_DEMANDE_SOUMISE`) | Must |
| F-043 | La demande apparaît dans la liste "Mes demandes" avec le statut `soumise` | Must |

## 3. Exigences non fonctionnelles

| ID | Exigence | Cible |
|----|----------|-------|
| NF-001 | Temps d'upload d'une image de 5 Mo | < 5 secondes (3G) |
| NF-002 | Temps d'extraction OCR | < 10 secondes |
| NF-003 | Disponibilité du service OCR | 99.5 % |
| NF-004 | Taille max par image | 10 Mo |
| NF-005 | Résolution min recommandée | 1280 x 960 px |
| NF-006 | Documents stockés chiffrés au repos dans R2 | AES-256 |
| NF-007 | Seul le propriétaire de la demande peut accéder à ses documents | RBAC enforced |
| NF-008 | Audit trail sur chaque upload et soumission | Obligatoire |

## 4. Acceptance Criteria

### AC-1 : Capture et upload réussis
```gherkin
Given l'adhérent est authentifié sur l'application mobile
  And il a accordé la permission caméra
When il capture une photo de sa feuille de soin
  And il confirme l'aperçu
Then l'image est uploadée vers R2 sous la clé "sante/documents/{demandeId}/{docId}.{ext}"
  And le document apparaît dans la base D1 avec le statut OCR "pending"
  And un indicateur de progression est affiché durant l'upload
```

### AC-2 : Extraction OCR complète
```gherkin
Given un document de type "bulletin_soin" a été uploadé
When l'OCR est déclenché automatiquement
Then les champs suivants sont extraits : date, praticien, actes, montants
  And un score de confiance global est calculé
  And le statut OCR passe à "completed"
  And le résultat JSON est stocké dans sante_documents.ocr_result_json
```

### AC-3 : Pré-remplissage et correction
```gherkin
Given l'extraction OCR est terminée avec succès
When l'adhérent accède au formulaire de demande
Then les champs sont pré-remplis avec les données extraites
  And les champs à faible confiance (< 0.7) sont signalés visuellement
  And l'adhérent peut modifier chaque champ manuellement
```

### AC-4 : Soumission avec notification
```gherkin
Given le formulaire est rempli (automatiquement ou manuellement)
When l'adhérent soumet la demande
Then une demande est créée avec le statut "soumise"
  And un numéro de demande unique est retourné
  And une notification push "SANTE_DEMANDE_SOUMISE" est envoyée
  And la demande est visible dans la liste "Mes demandes"
```

### AC-5 : Gestion des erreurs
```gherkin
Given l'adhérent tente d'uploader un document
When le fichier dépasse 10 Mo ou n'est pas JPEG/PNG
Then un message d'erreur explicite est affiché
  And l'upload est bloqué

Given l'extraction OCR échoue
When le statut passe à "failed"
Then l'adhérent est informé et peut saisir les données manuellement
  And la demande peut quand même être soumise
```

### AC-6 : Sécurité et audit
```gherkin
Given un adhérent est authentifié
When il uploade un document ou soumet une demande
Then un enregistrement d'audit est créé (userId, action, timestamp)
  And le document n'est accessible qu'au propriétaire et aux agents assureur assignés
```

## 5. External Dependencies

| Dépendance | Type | Description | Statut |
|------------|------|-------------|--------|
| **Cloudflare R2** | Infrastructure | Stockage objet pour les images uploadées | Disponible |
| **Cloudflare D1** | Infrastructure | Base de données pour métadonnées documents et demandes | Disponible |
| **Workers AI** | Service IA | Modèle `@cf/meta/llama-3.2-11b-vision-instruct` pour l'OCR | Disponible |
| **Expo Camera** | SDK Mobile | `expo-camera` v17 pour la capture photo | Installé |
| **Expo Image Picker** | SDK Mobile | `expo-image-picker` pour la sélection galerie | À vérifier |
| **Expo Push Notifications** | SDK Mobile | Notifications de confirmation post-soumission | Disponible |
| **API Sante Documents** | API interne | `POST /api/v1/sante/documents/upload`, `POST /:id/ocr` | Disponible |
| **API Sante Demandes** | API interne | Création de demandes de remboursement | Disponible |
| **OCR Agent** | Service interne | `apps/api/src/agents/ocr/` — extraction structurée | Disponible |

## 6. Éléments existants réutilisables

Les composants suivants existent déjà dans le codebase et doivent être réutilisés :

- **`apps/mobile/src/app/(main)/demandes/nouvelle.tsx`** — flux de nouvelle demande avec capture caméra (à enrichir)
- **`apps/mobile/src/app/(main)/bulletins/nouveau.tsx`** — flux bulletin avec OCR (pattern de référence)
- **`apps/mobile/src/lib/api-client.ts`** — client HTTP avec méthode `upload()` (FormData)
- **`apps/api/src/routes/sante/documents.ts`** — routes upload/OCR existantes
- **`apps/api/src/services/ocr.service.ts`** — service OCR avec Workers AI
- **`apps/api/src/agents/ocr/ocr.agent.ts`** — agent vision pour extraction structurée
- **`apps/api/src/services/push-notification.service.ts`** — notifications push Expo
- **`packages/shared/src/types/sante.ts`** — types `bulletin_soin`, types de soins, statuts
- **`packages/shared/src/schemas/sante.ts`** — schémas Zod de validation

## 7. Hors périmètre (out of scope)

- Scan de documents autres que feuille de soin (ordonnance, facture) — traité séparément
- Reconnaissance de QR code / code-barres sur la feuille de soin
- Signature électronique du document
- Intégration avec la CNAM (Caisse Nationale d'Assurance Maladie)
- Mode hors-ligne complet (upload différé uniquement en scope "Could")
