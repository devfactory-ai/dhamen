# Architecture — REQ-010 Analyse OCR IA

## ADR-001 : Proxy backend obligatoire pour l'appel OCR

### Decision

Creer un endpoint `POST /bulletins-soins/agent/analyse-bulletin` dans le backend API qui sert de proxy vers le service OCR externe, plutot que d'appeler l'API OCR directement depuis le navigateur.

### Rationale

- Le service OCR est heberge sur un domaine ngrok (`grady-semistiff-willia.ngrok-free.dev`) qui ne configure pas les headers CORS pour autoriser les appels cross-origin depuis le portail web.
- Le proxy backend (Cloudflare Worker) n'est pas soumis aux restrictions CORS du navigateur.
- Cela permet de centraliser le nettoyage de la reponse et le mapping des actes cote serveur.
- L'URL OCR est configurable via `OCR_URL` dans les bindings, permettant de changer le service sans modifier le frontend.

### Impact

- **API** : Ajout d'un endpoint dans `bulletins-agent.ts` (~50 lignes)
- **Frontend** : Modification de `analyzeWithOCR()` pour utiliser `apiClient.upload()` au lieu de `fetch()` direct
- **Risque** : Faible — pattern proxy standard

---

## ADR-002 : Nettoyage de la reponse OCR cote backend

### Decision

Le backend nettoie la reponse OCR avant de la renvoyer au frontend. Le champ `raw_response` contient un bloc markdown JSON qu'il faut extraire.

### Rationale

- La reponse OCR est wrappee : `{"raw_response": "```json\n{...}\n```"}`
- Plutot que de dupliquer la logique de nettoyage dans chaque client, le backend parse et retourne directement l'objet JSON propre.
- Methode de nettoyage : `raw.replace(/```json/g, '').replace(/```/g, '').trim()` puis `JSON.parse()`

### Impact

- **API** : Logique de nettoyage dans le handler du proxy (~5 lignes)
- **Frontend** : Recoit directement `{ success: true, data: { infos_adherent: {...}, volet_medical: [...] } }`
- **Risque** : Faible

---

## ADR-003 : Mapping nature_acte -> code referentiel cote backend

### Decision

Le mapping des termes libres OCR (`nature_acte`) vers les codes du referentiel d'actes se fait cote backend dans le proxy. Le backend enrichit chaque acte du `volet_medical` avec les champs `matched_code` et `matched_label`.

### Rationale

- Le referentiel d'actes est en base D1, accessible cote backend.
- Le mapping par mots-cles est plus fiable cote serveur (normalisation unicode, acces au referentiel complet).
- Le frontend n'a pas besoin de connaitre la logique de mapping — il recoit directement le code et le label.
- Le mapping est extensible : on peut ajouter de nouveaux mots-cles sans deployer le frontend.

### Impact

- **API** : Ajout de la fonction `mapNatureActeToCode()` (~60 lignes) et enrichissement dans le handler proxy
- **Frontend** : Utilise `matched_code` et `matched_label` si presents, sinon fallback sur `nature_acte`
- **Risque** : Faible — mapping additif, ne casse pas le flux existant

---

## ADR-004 : Ajout du champ adresse adherent au formulaire et a la DB

### Decision

Ajouter un champ `adherent_address` au formulaire de saisie, au schema Zod, au backend et a la table `bulletins_soins`.

### Rationale

- L'OCR retourne l'adresse de l'adherent (`infos_adherent.adresse`) mais il n'y a pas de champ correspondant dans le formulaire.
- L'adresse est utile pour les bordereaux et la correspondance avec l'adherent.
- Migration simple : `ALTER TABLE bulletins_soins ADD COLUMN adherent_address TEXT`

### Impact

- **DB** : Migration `0083_add_adherent_address.sql`
- **API** : Extraction et stockage du champ dans le handler `/create`
- **Frontend** : Champ Input dans la section "Informations Adherent"
- **Risque** : Faible — ajout additif

---

## Synthese des fichiers impactes

| Fichier | Type de changement |
|---------|-------------------|
| `apps/api/src/routes/bulletins-agent.ts` | Ajout endpoint proxy + fonction mapping |
| `apps/api/src/types.ts` | Ajout `OCR_URL` aux Bindings |
| `apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx` | Modification analyzeWithOCR + ajout champs |
| `packages/db/migrations/0083_add_adherent_address.sql` | Nouvelle migration |

## Diagramme de flux

```
[Frontend]                              [API Backend]                    [OCR Service]
   |                                         |                               |
   |-- 1. POST /analyse-bulletin ----------->|                               |
   |   (multipart: files + auth token)       |                               |
   |                                         |-- 2. POST /analyse-bulletin ->|
   |                                         |   (forward files)             |
   |                                         |                               |
   |                                         |<-- 3. raw_response (md JSON) -|
   |                                         |                               |
   |                                         |-- 4. Nettoyage markdown       |
   |                                         |-- 5. Mapping nature_acte      |
   |                                         |                               |
   |<-- 6. { success, data: parsed+enrichi } |                               |
   |                                         |                               |
   |-- 7. Pre-remplissage formulaire         |                               |
   |-- 8. Correction manuelle agent          |                               |
   |-- 9. POST /create (soumission) -------->|                               |
```
