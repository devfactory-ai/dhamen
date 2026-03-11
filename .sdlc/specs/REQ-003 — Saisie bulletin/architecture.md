# Architecture — Saisie bulletin

## Frontend

React + Vite

Formulaire dynamique :

- matricule adhérent
- actes médicaux (liste)
- montant par acte

## Backend

Endpoint API :

POST /api/v1/remboursements

## Database (D1)

Table remboursements

id
lot_id
adherent_id
created_at

Table actes_remboursement

id
remboursement_id
acte
montant

## Validation

- matricule requis
- au moins un acte
- montant > 0

## Flux

Frontend
   ↓
POST /remboursements
   ↓
validation
   ↓
insert D1

---

## Problèmes existants à corriger (identifiés lors du test REQ-002)

### 1. Page saisie déconnectée du contexte agent

`BulletinsSaisiePage.tsx` (952 lignes) existe déjà mais n'importe pas
`useAgentContext`. Les bulletins créés ne sont pas liés au lot sélectionné.

**Correction** : connecter le store Zustand `agent-context` à la page saisie,
afficher l'entreprise et le lot actif en en-tête.

### 2. Pas de `batch_id` envoyé à la création

Le formulaire POST `/bulletins-soins/agent/create` ne transmet pas le
`batch_id` du lot actif. Les bulletins sont créés en statut `draft` sans
lien avec un lot.

**Correction** : envoyer `batch_id` dans le formulaire, insérer avec
statut `in_batch` quand un lot est sélectionné.

### 3. API n'insère pas `batch_id`

Le endpoint POST `/create` dans `bulletins-agent.ts` n'accepte pas et
n'insère pas `batch_id` dans la table `bulletins_soins`.

**Correction** : accepter `batch_id` optionnel, l'insérer dans le INSERT,
adapter le statut en conséquence.

### 4. Pas de garde de route

Si un agent accède directement à `/bulletins/saisie` sans contexte
(company + batch), rien ne le redirige vers `/select-context`.

**Correction** : ajouter un guard qui vérifie `isContextReady()` et
redirige vers `/select-context` si le contexte est incomplet.
