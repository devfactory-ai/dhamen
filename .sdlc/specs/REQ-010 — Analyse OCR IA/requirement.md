---
id: REQ-010
title: Analyse OCR / IA des bulletins de soins (portail agent)
status: draft
---

# REQ-010 — Analyse OCR / IA des bulletins de soins

## 1. Description

L'agent assureur doit pouvoir analyser automatiquement les scans de bulletins de soins papier via un service OCR/IA externe, afin de pre-remplir le formulaire de saisie et reduire les erreurs de saisie manuelle.

### 1.1 Contexte metier

Les agents assureurs recoivent des bulletins de soins papier qu'ils doivent saisir manuellement dans le portail web Dhamen. Ce processus est lent (~5 min/bulletin) et source d'erreurs (matricule, montants, noms). Un service OCR/IA externe est disponible pour extraire automatiquement les informations des scans.

### 1.2 Utilisateurs cibles

- **Role** : `INSURER_ADMIN`, `INSURER_AGENT`, `ADMIN`
- **Persona** : Agent assureur utilisant le portail web pour saisir les bulletins de soins

### 1.3 Flux principal

```
[Agent uploade scan(s) du bulletin]
    -> Clic "Analyser avec IA"
    -> Upload fichiers vers proxy backend
    -> Backend forward vers service OCR externe
    -> Nettoyage reponse (markdown -> JSON)
    -> Mapping intelligent nature_acte -> codes referentiel
    -> Retour donnees structurees au frontend
    -> Pre-remplissage automatique du formulaire
    -> Verification / correction manuelle par l'agent
    -> Soumission du bulletin
```

## 2. Exigences fonctionnelles

### 2.1 Proxy backend OCR

| ID | Exigence | Priorite |
|----|----------|----------|
| F-001 | Le backend expose un endpoint `POST /bulletins-soins/agent/analyse-bulletin` servant de proxy vers le service OCR | Must |
| F-002 | L'URL du service OCR est configurable via variable d'environnement `OCR_URL` | Must |
| F-003 | Si l'endpoint `/analyse-bulletin` n'existe pas deja, le creer ; sinon conserver `/analyse-ocr` existant | Must |
| F-004 | Le proxy nettoie la reponse OCR : extraction du JSON depuis le bloc markdown | Must |

### 2.2 Integration frontend

| ID | Exigence | Priorite |
|----|----------|----------|
| F-010 | Le bouton "Analyser avec IA" appelle le proxy backend (pas l'URL OCR directement) | Must |
| F-011 | L'appel utilise `apiClient.upload()` avec authentification automatique | Must |
| F-012 | Timeout de 120 secondes pour l'appel OCR | Must |
| F-013 | Indicateur de chargement pendant l'analyse | Must |
| F-014 | Message de succes/erreur apres l'analyse | Must |

### 2.3 Mapping OCR -> formulaire

| ID | Exigence | Priorite |
|----|----------|----------|
| F-020 | `infos_adherent.nom_prenom` -> nom + prenom de l'adherent | Must |
| F-021 | `infos_adherent.numero_contrat` -> matricule adherent + declenchement recherche | Must |
| F-022 | `infos_adherent.date_signature` -> date du bulletin (DD/MM/YYYY -> YYYY-MM-DD) | Must |
| F-023 | `infos_adherent.adresse` -> champ adresse adherent (nouveau champ) | Should |
| F-024 | `infos_adherent.beneficiaire_coche` -> lien de parente (Adherent/Conjoint/Enfant) | Should |
| F-025 | `volet_medical[].montant_honoraires` -> montant acte (gestion "80 D", "150,500") | Must |
| F-026 | `volet_medical[].nom_praticien` -> nom du praticien | Must |
| F-027 | `volet_medical[].matricule_fiscale` -> ref praticien | Must |

### 2.4 Mapping intelligent nature_acte -> codes referentiel

| ID | Exigence | Priorite |
|----|----------|----------|
| F-030 | `volet_medical[].nature_acte` est mappe vers un code acte du referentiel | Must |
| F-031 | "Psychiatre", "Cardiologue", "Dermatologue" etc. -> C2 (Consultation specialiste) | Must |
| F-032 | "Generaliste", "Medecin" -> C1 (Consultation generaliste) | Must |
| F-033 | "Pharmacie", "Medicaments" -> PH1 (Frais pharmaceutiques) | Must |
| F-034 | "Analyse", "Biologie", "Sang" -> AN (Analyses biologiques) | Must |
| F-035 | Si aucun match, le label OCR est conserve tel quel sans code | Must |
| F-036 | Le mapping se fait cote backend dans le proxy pour enrichir la reponse | Should |

## 3. Exigences non fonctionnelles

| ID | Exigence | Cible |
|----|----------|-------|
| NF-001 | Temps de reponse OCR | < 120 secondes |
| NF-002 | Pas d'erreur CORS dans le navigateur | Proxy backend obligatoire |
| NF-003 | Acces restreint aux roles agent/admin | RBAC enforced |
| NF-004 | Formats acceptes pour l'upload | PDF, JPG, JPEG, PNG |

## 4. Acceptance Criteria

### AC-1 : Analyse OCR reussie
```gherkin
Given l'agent a uploade un scan de bulletin
  And il clique sur "Analyser avec IA"
When le proxy backend forward les fichiers au service OCR
Then les champs du formulaire sont pre-remplis automatiquement
  And un message de succes est affiche
```

### AC-2 : Mapping nature_acte correct
```gherkin
Given l'OCR retourne nature_acte = "Psychiatre"
When le mapping est applique
Then le code acte est C2 (Consultation specialiste)
  And le label affiche est "Consultation specialiste"
```

### AC-3 : Pas d'erreur CORS
```gherkin
Given l'agent utilise le portail web
When il lance une analyse OCR
Then l'appel passe par le proxy backend /analyse-bulletin
  And aucune erreur CORS n'est levee
```

### AC-4 : Gestion des erreurs
```gherkin
Given le service OCR est indisponible ou retourne une erreur
When l'agent lance une analyse
Then un message d'erreur explicite est affiche
  And l'agent peut continuer la saisie manuelle
```

## 5. API OCR externe

- **Endpoint** : `POST https://grady-semistiff-willia.ngrok-free.dev/analyse-bulletin`
- **Input** : `multipart/form-data` avec champ `files` (images/PDF)
- **Output** :

```json
{
  "raw_response": "```json\n{\"infos_adherent\": {...}, \"volet_medical\": [...]}\n```"
}
```

Contenu parse apres nettoyage :

```json
{
  "infos_adherent": {
    "nom_prenom": "Houdou Asma",
    "numero_contrat": "14 331 078",
    "adresse": "Cite Ennaser, Tunis",
    "beneficiaire_coche": "Adherent",
    "date_signature": "25/12/2024"
  },
  "volet_medical": [
    {
      "date_acte": "25/12/2024",
      "nature_acte": "Psychiatre",
      "montant_honoraires": "80 D",
      "montant_facture": null,
      "nom_praticien": "Dr Imene Ben Romdhane Klibi",
      "matricule_fiscale": ""
    }
  ]
}
```

## 6. External Dependencies

| Dependance | Type | Description | Statut |
|------------|------|-------------|--------|
| **Service OCR externe** | API tierce | Endpoint ngrok pour l'analyse de bulletins | Disponible |
| **Cloudflare Workers** | Infrastructure | Proxy backend pour eviter CORS | Disponible |
| **actes_referentiel** | Donnees internes | Table des codes actes assurance (C1, C2, PH1...) | Disponible |

## 7. Elements existants reutilisables

- **`apps/api/src/routes/bulletins-agent.ts`** — routes agent bulletins (ajout du proxy)
- **`apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx`** — formulaire de saisie (modification analyzeWithOCR)
- **`apps/web/src/lib/api-client.ts`** — methode `upload()` pour multipart/form-data avec auth
- **`packages/db/src/queries/actes-referentiel.ts`** — lookup des codes actes

## 8. Hors perimetre (out of scope)

- OCR via Workers AI (Cloudflare) — cette fonctionnalite utilise un service OCR externe
- Support arabe — le service OCR externe gere les documents en francais uniquement
- Mode offline / upload differe
- Multi-pages fusion automatique
