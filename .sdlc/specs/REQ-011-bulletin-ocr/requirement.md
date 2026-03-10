---
id: REQ-011
title: Bulletin OCR — Extraction automatique des bulletins de soin
status: draft
---

# REQ-011 — Bulletin OCR — Extraction automatique des bulletins de soin

## 1. Description

Le système doit permettre l'extraction automatique des données structurées à partir d'un **bulletin de soin** scanné ou photographié, via OCR (Optical Character Recognition) alimenté par Workers AI. Cette fonctionnalité couvre l'ensemble du pipeline : réception de l'image, pré-traitement, extraction des champs, structuration des résultats, et restitution au client (mobile ou web).

### 1.1 Contexte métier

Le bulletin de soin est le document central du circuit de remboursement en Tunisie. Il est émis par le prestataire (médecin, pharmacien, clinique, laboratoire) et contient toutes les informations nécessaires au traitement d'une demande de prise en charge ou de remboursement : identité du patient, identité et spécialité du praticien, nature des actes, montants facturés, date de soin, et éventuellement le numéro de matricule de l'adhérent. L'extraction OCR permet de supprimer la saisie manuelle, de réduire les erreurs, et d'accélérer le traitement des demandes.

### 1.2 Utilisateurs cibles

- **Rôle principal** : `ADHERENT` (mobile) — soumet un bulletin scanné pour remboursement
- **Rôle secondaire** : `INSURER_AGENT` (web) — vérifie et corrige les données extraites
- **Rôle secondaire** : `PHARMACIST`, `DOCTOR` (web) — peut soumettre un bulletin pour le compte de l'adhérent

### 1.3 Flux principal

```
[Document uploadé vers R2]
    → Déclenchement OCR (auto ou manuel)
    → Pré-traitement image (orientation, contraste)
    → Envoi au modèle Workers AI Vision
    → Extraction des champs structurés (JSON)
    → Calcul du score de confiance par champ
    → Stockage du résultat OCR en base D1
    → Restitution au client pour pré-remplissage
    → Correction manuelle si nécessaire
    → Validation finale
```

## 2. Exigences fonctionnelles

### 2.1 Déclenchement de l'OCR

| ID | Exigence | Priorité |
|----|----------|----------|
| F-001 | L'OCR est déclenché automatiquement après upload d'un document de type `bulletin_soin` | Must |
| F-002 | L'OCR peut être redéclenché manuellement via `POST /api/v1/sante/documents/:id/ocr` | Must |
| F-003 | Un seul traitement OCR à la fois par document (verrouillage) | Must |
| F-004 | Le statut OCR suit le cycle : `pending` → `processing` → `completed` / `failed` | Must |
| F-005 | Un webhook/event est émis à la fin du traitement (`OCR_COMPLETED` / `OCR_FAILED`) | Should |

### 2.2 Extraction des champs

| ID | Exigence | Priorité |
|----|----------|----------|
| F-010 | Extraction du **nom complet du patient** | Must |
| F-011 | Extraction du **matricule adhérent** (numéro d'assuré) | Must |
| F-012 | Extraction du **nom du praticien** et de sa **spécialité** | Must |
| F-013 | Extraction de la **date du soin** (format `YYYY-MM-DD`) | Must |
| F-014 | Extraction de la **liste des actes** réalisés avec libellés | Must |
| F-015 | Extraction des **montants** par acte et du **montant total** (en TND) | Must |
| F-016 | Extraction du **type de soin** (consultation, pharmacie, hospitalisation, laboratoire) | Must |
| F-017 | Extraction du **numéro de bulletin** si présent | Should |
| F-018 | Extraction de l'**adresse du cabinet/établissement** | Could |
| F-019 | Extraction du **code APCI** (Affection Prise en Charge Intégrale) si mentionné | Could |

### 2.3 Score de confiance

| ID | Exigence | Priorité |
|----|----------|----------|
| F-020 | Un score de confiance global (0.0–1.0) est calculé pour chaque extraction | Must |
| F-021 | Un score de confiance individuel est attribué à chaque champ extrait | Must |
| F-022 | Les champs avec un score < 0.7 sont marqués comme nécessitant une vérification | Must |
| F-023 | Le score prend en compte la qualité de l'image (netteté, luminosité, orientation) | Should |

### 2.4 Support multilingue

| ID | Exigence | Priorité |
|----|----------|----------|
| F-030 | L'OCR supporte les bulletins rédigés en **français** | Must |
| F-031 | L'OCR supporte les bulletins rédigés en **arabe** | Must |
| F-032 | L'OCR supporte les bulletins bilingues (français + arabe) | Must |
| F-033 | La langue détectée est retournée dans le résultat (`fr`, `ar`, `fr-ar`) | Should |

### 2.5 Stockage et restitution des résultats

| ID | Exigence | Priorité |
|----|----------|----------|
| F-040 | Le résultat OCR est stocké en JSON dans `sante_documents.ocr_result_json` | Must |
| F-041 | Le résultat inclut les champs extraits, les scores de confiance et les métadonnées | Must |
| F-042 | L'API `GET /api/v1/sante/documents/:id/ocr` retourne le résultat OCR | Must |
| F-043 | Le résultat OCR peut être récupéré par polling ou via événement temps réel | Should |
| F-044 | L'historique des extractions OCR est conservé (réextractions successives) | Could |

### 2.6 Gestion des erreurs

| ID | Exigence | Priorité |
|----|----------|----------|
| F-050 | Si l'image est illisible, le statut passe à `failed` avec un code erreur `OCR_IMAGE_UNREADABLE` | Must |
| F-051 | Si le document n'est pas un bulletin de soin, le code erreur `OCR_INVALID_DOCUMENT_TYPE` est retourné | Must |
| F-052 | En cas d'échec, l'adhérent peut ressoumettre une meilleure image | Must |
| F-053 | Le nombre de tentatives OCR par document est limité à 5 | Should |
| F-054 | Un fallback vers la saisie manuelle complète est toujours disponible | Must |

## 3. Exigences non fonctionnelles

| ID | Exigence | Cible |
|----|----------|-------|
| NF-001 | Temps d'extraction OCR pour un bulletin standard (1 page) | < 8 secondes |
| NF-002 | Temps d'extraction OCR pour un bulletin multi-pages (2-3 pages) | < 15 secondes |
| NF-003 | Précision d'extraction sur bulletins français lisibles | > 90 % |
| NF-004 | Précision d'extraction sur bulletins arabes lisibles | > 85 % |
| NF-005 | Disponibilité du service OCR | 99.5 % |
| NF-006 | Formats d'image acceptés | JPEG, PNG |
| NF-007 | Taille max par image | 10 Mo |
| NF-008 | Résolution min recommandée | 1280 x 960 px |
| NF-009 | Données OCR chiffrées au repos | AES-256 |
| NF-010 | Audit trail sur chaque extraction OCR | Obligatoire |

## 4. Acceptance Criteria

### AC-1 : Extraction réussie d'un bulletin français
```gherkin
Given un bulletin de soin en français a été uploadé avec une résolution >= 1280x960
When l'OCR est déclenché automatiquement
Then les champs suivants sont extraits : nom patient, matricule, praticien, date, actes, montants
  And chaque champ a un score de confiance >= 0.0
  And le score global est >= 0.7
  And le statut OCR passe à "completed"
  And le résultat JSON est stocké dans sante_documents.ocr_result_json
```

### AC-2 : Extraction d'un bulletin arabe
```gherkin
Given un bulletin de soin en arabe a été uploadé
When l'OCR est déclenché
Then les champs sont extraits avec la même structure que pour un bulletin français
  And la langue détectée est "ar"
  And le score global est >= 0.6
```

### AC-3 : Image de mauvaise qualité
```gherkin
Given un bulletin de soin flou ou mal cadré a été uploadé
When l'OCR est déclenché
Then soit le statut passe à "failed" avec le code "OCR_IMAGE_UNREADABLE"
  Or les champs sont extraits avec des scores de confiance < 0.7
  And l'adhérent est informé de la qualité insuffisante
  And il peut reprendre la photo ou saisir manuellement
```

### AC-4 : Verrouillage et idempotence
```gherkin
Given un traitement OCR est en cours sur un document (statut "processing")
When un second appel OCR est déclenché sur le même document
Then la requête est rejetée avec le code "OCR_ALREADY_PROCESSING"
  And le traitement en cours n'est pas interrompu
```

### AC-5 : Pré-remplissage du formulaire
```gherkin
Given l'extraction OCR est terminée avec succès
When le client récupère le résultat via GET /api/v1/sante/documents/:id/ocr
Then la réponse contient les champs structurés, les scores, et les métadonnées
  And les champs avec confiance < 0.7 sont signalés
  And le formulaire côté client est pré-rempli avec ces données
```

### AC-6 : Audit et sécurité
```gherkin
Given un document est traité par l'OCR
When l'extraction est terminée (succès ou échec)
Then un enregistrement d'audit est créé (userId, documentId, action, timestamp, résultat)
  And le résultat OCR n'est accessible qu'au propriétaire et aux agents assureur assignés
  And les données sont chiffrées au repos dans D1
```

## 5. External Dependencies

| Dépendance | Type | Description | Statut |
|------------|------|-------------|--------|
| **Workers AI** | Service IA | Modèle `@cf/meta/llama-3.2-11b-vision-instruct` pour l'extraction vision | Disponible |
| **Cloudflare R2** | Infrastructure | Stockage des images source | Disponible |
| **Cloudflare D1** | Infrastructure | Stockage des métadonnées et résultats OCR | Disponible |
| **OCR Agent** | Service interne | `apps/api/src/agents/ocr/ocr.agent.ts` — pipeline d'extraction | Disponible |
| **OCR Service** | Service interne | `apps/api/src/services/ocr.service.ts` — interface Workers AI | Disponible |
| **API Documents** | API interne | `apps/api/src/routes/sante/documents.ts` — routes upload/OCR | Disponible |

## 6. Structure du résultat OCR

```typescript
interface BulletinOcrResult {
  documentId: string;
  language: 'fr' | 'ar' | 'fr-ar';
  confidence: number; // 0.0–1.0 global
  extractedAt: string; // ISO 8601
  fields: {
    patientName: OcrField<string>;
    patientMatricule: OcrField<string>;
    practitionerName: OcrField<string>;
    practitionerSpecialty: OcrField<string>;
    careDate: OcrField<string>; // YYYY-MM-DD
    careType: OcrField<'consultation' | 'pharmacie' | 'hospitalisation' | 'laboratoire'>;
    acts: OcrField<OcrAct[]>;
    totalAmount: OcrField<number>; // TND
    bulletinNumber: OcrField<string> | null;
  };
  metadata: {
    imageResolution: { width: number; height: number };
    imageQuality: 'good' | 'acceptable' | 'poor';
    processingTimeMs: number;
    modelVersion: string;
  };
}

interface OcrField<T> {
  value: T;
  confidence: number; // 0.0–1.0
  needsReview: boolean; // true if confidence < 0.7
}

interface OcrAct {
  label: string;
  amount: number; // TND
  quantity: number;
}
```

## 7. Hors perimetre (out of scope)

- OCR de documents autres que bulletins de soin (ordonnances, factures hospitalisation) — traités dans des REQ séparés
- Entraînement / fine-tuning du modèle Workers AI sur des bulletins tunisiens
- Reconnaissance de QR codes ou codes-barres
- Comparaison automatique avec la base de tarifs conventionnés
- Traduction automatique arabe → français des champs extraits
- Mode batch (traitement en lot de plusieurs bulletins)
