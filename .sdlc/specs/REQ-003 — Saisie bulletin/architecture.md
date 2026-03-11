# Architecture — Saisie bulletin

## Frontend

React + Vite

Formulaire dynamique :

- matricule adhérent
- actes médicaux (liste dynamique, ajouter/supprimer)
- montant par acte
- montant total calculé automatiquement (somme des actes)

## Backend

Endpoint API existant adapté :

POST /api/v1/bulletins-soins/agent/create

Body (multipart form) :
- champs bulletin existants (date, adhérent, praticien, etc.)
- batch_id (du lot actif)
- actes[] : tableau JSON d'actes `[{ code, label, amount }]`

## Database (D1)

Table `bulletins_soins` (existante, colonnes ajoutées via migrations 0065-0067) :
- batch_id → lien vers bulletin_batches
- created_by → agent qui a saisi
- adherent_matricule, adherent_first_name, etc.

Table `actes_bulletin` (nouvelle) :
- id TEXT PRIMARY KEY
- bulletin_id TEXT REFERENCES bulletins_soins(id)
- code TEXT (code acte médical, ex: CS, V, KB)
- label TEXT (libellé de l'acte)
- amount REAL (montant TND)
- created_at TEXT

## Validation

- matricule requis
- au moins un acte
- chaque acte doit avoir un code/libellé et un montant > 0
- total_amount = somme des montants des actes

## Flux

```
Frontend (formulaire dynamique)
   ↓
POST /bulletins-soins/agent/create
   ↓
validation Zod (bulletin + actes)
   ↓
INSERT bulletins_soins + INSERT actes_bulletin (batch D1)
```

---

## Problèmes corrigés (TASK-001 à TASK-004)

- ✅ Page saisie connectée au contexte agent (company + batch)
- ✅ batch_id envoyé à la création, statut `in_batch`
- ✅ API accepte et insère batch_id
- ✅ Guard de route redirige agents sans contexte
- ✅ Colonnes manquantes ajoutées (migrations 0066, 0067)
