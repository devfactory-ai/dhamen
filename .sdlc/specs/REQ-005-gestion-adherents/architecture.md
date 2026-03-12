# Gestion adhérents — Architecture

## Existant (backend)

Le backend est déjà implémenté :

- Table `adherents` avec colonnes : matricule, first_name, last_name,
  plafond_global, plafond_consomme, company_id, formule_id, ayants_droit_json
- Routes CRUD : GET /adherents, GET /adherents/:id, POST, PUT, DELETE
- Queries : findAdherentById, listAdherents, createAdherent
- Types et schemas Zod partagés dans packages/shared
- Encryption AES-256-GCM sur national_id et phone

## À implémenter (frontend agent)

### Pages

- Page liste adhérents : recherche, filtres, pagination
- Dialog détail adhérent : infos, entreprise, plafond, ayants droit
- Historique bulletins par adhérent

### API complémentaire

- GET /adherents?companyId=X — filtrage par entreprise de l'agent
- GET /adherents/:id/bulletins — historique bulletins d'un adhérent
- GET /adherents/search?q=X — recherche rapide pour autocomplete

### Entités utilisées

adherents
companies
bulletins_soins
actes_bulletin
contracts

### Flux

1. Agent sélectionne une entreprise (contexte existant)
2. Agent consulte la liste des adhérents de cette entreprise
3. Agent recherche un adhérent par nom ou matricule
4. Agent ouvre le détail : infos, plafond, ayants droit
5. Agent consulte l'historique des bulletins
6. Agent peut lancer une saisie de bulletin depuis le détail

# Architecture gestion adhérents

## Entité principale

adherents

---

## Champs

id
matricule
nom
prenom
date_naissance
sexe
societe_id
date_adhesion
statut
plafond_annuel

---

## Relations

societes
   ↓
adherents
   ↓
bulletins

---

## Calcul plafond

plafond_restant = plafond_annuel - total_remboursements

---

## API nécessaires

GET /adherents

GET /adherents/:id

POST /adherents

PATCH /adherents/:id
