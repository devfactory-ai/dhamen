# REQ-009 — Architecture : Alignement format données assureur

## Vue d'ensemble

Ce REQ modifie le modèle de données existant pour le rendre compatible avec les formats de données utilisés par les assureurs tunisiens. Les changements touchent principalement : les actes médicaux, la structure des contrats, le modèle famille, et les champs bulletin.

---

## 1. Schéma D1 — Migrations

### Migration 0076 : Table `familles_actes`

```sql
CREATE TABLE familles_actes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,        -- FA0001, FA0002, ...
  label TEXT NOT NULL,              -- "Consultations et Visites"
  ordre INTEGER NOT NULL DEFAULT 0, -- Pour tri affichage
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Migration 0077 : Refonte `actes_referentiel` + seed codes assureur

```sql
ALTER TABLE actes_referentiel ADD COLUMN famille_id TEXT REFERENCES familles_actes(id);
ALTER TABLE actes_referentiel ADD COLUMN type_calcul TEXT NOT NULL DEFAULT 'taux'
  CHECK (type_calcul IN ('taux', 'forfait'));
ALTER TABLE actes_referentiel ADD COLUMN valeur_base REAL;  -- Montant forfaitaire en millimes (si forfait)
ALTER TABLE actes_referentiel ADD COLUMN code_assureur TEXT;  -- Code court assureur (C1, PH1, etc.)

-- Mapping ancien → nouveau
UPDATE actes_referentiel SET code_assureur = 'CONS-GEN', ... WHERE code = 'CONS-GEN';
-- + INSERT des nouveaux codes assureur manquants
```

Codes à seeder :
| code_assureur | code | label | famille | type_calcul | taux | valeur_base |
|-------------|------|-------|---------|-------------|------|-------------|
| C1 | C1 | Consultation généraliste | FA0001 | forfait | - | 45000 |
| C2 | C2 | Consultation spécialiste | FA0001 | forfait | - | 55000 |
| C3 | C3 | Consultation professeur | FA0001 | forfait | - | 55000 |
| V1 | V1 | Visite généraliste | FA0001 | forfait | - | 50000 |
| V2 | V2 | Visite spécialiste | FA0001 | forfait | - | 55000 |
| V3 | V3 | Visite professeur | FA0001 | forfait | - | 55000 |
| PH1 | PH1 | Frais pharmaceutiques | FA0003 | taux | 0.90 | - |
| AN | AN | Analyses biologiques | FA0004 | taux | 0.80 | - |
| R | R | Radiologie | FA0017 | taux | 0.80 | - |
| SD | SD | Soins dentaires | FA0011 | taux | 0.80 | - |
| CL | CL | Hospitalisation clinique | FA0007 | forfait | - | 120000 |
| FCH | FCH | Frais chirurgicaux | FA0010 | taux | 0.80 | - |
| ANE | ANE | Anesthésie | FA0010 | taux | 1.00 | - |
| SO | SO | Soins opératoires | FA0010 | taux | 1.00 | - |
| TS | TS | Traitements spéciaux (scanner/IRM) | FA0009 | taux | 1.00 | - |
| ODF | ODF | Soins orthodontiques | FA0014 | taux | 0.80 | - |
| KC | KC | Coefficient chirurgical | FA0010 | forfait | - | 10000 |
| PUU | PUU | Produits usage unique | FA0010 | taux | 0.90 | - |

### Migration 0078 : Table `contrat_periodes` et `contrat_baremes`

```sql
CREATE TABLE contrat_periodes (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  numero INTEGER NOT NULL DEFAULT 1,  -- N°APP
  date_debut TEXT NOT NULL,
  date_fin TEXT NOT NULL,
  ref_periode TEXT,                    -- N°APP REF (duplication)
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(contract_id, numero)
);

CREATE TABLE contrat_baremes (
  id TEXT PRIMARY KEY,
  periode_id TEXT NOT NULL REFERENCES contrat_periodes(id),
  acte_ref_id TEXT NOT NULL REFERENCES actes_referentiel(id),
  famille_id TEXT NOT NULL REFERENCES familles_actes(id),
  type_calcul TEXT NOT NULL CHECK (type_calcul IN ('taux', 'forfait')),
  valeur REAL NOT NULL,               -- Taux (0-1) ou montant forfaitaire en millimes
  plafond_acte REAL,                  -- Plafond par acte (millimes)
  plafond_famille_annuel REAL,        -- Plafond par famille/an/prestataire (millimes)
  limite TEXT,                        -- Contrainte texte libre
  contre_visite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Migration 0079 : Champs prestataire (famille) sur `adherents`

```sql
ALTER TABLE adherents ADD COLUMN code_type TEXT DEFAULT 'A'
  CHECK (code_type IN ('A', 'C', 'E'));
ALTER TABLE adherents ADD COLUMN parent_adherent_id TEXT REFERENCES adherents(id);
-- parent_adherent_id = NULL pour l'adhérent principal (code_type='A')
-- parent_adherent_id = id de l'adhérent pour conjoint (C) et enfants (E)
ALTER TABLE adherents ADD COLUMN rang_pres INTEGER NOT NULL DEFAULT 0;
-- 0 = adhérent, 1-98 = enfants, 99 = conjoint
ALTER TABLE adherents ADD COLUMN code_situation_fam TEXT
  CHECK (code_situation_fam IN ('C', 'M', 'D', 'V'));
-- C=célibataire, M=marié, D=divorcé, V=veuf
```

### Migration 0080 : Champs bulletin format assureur

```sql
-- Champs bulletin
ALTER TABLE bulletins_soins ADD COLUMN ref_bs_phys_ass TEXT;
ALTER TABLE bulletins_soins ADD COLUMN ref_bs_phys_clt TEXT;
ALTER TABLE bulletins_soins ADD COLUMN rang_bs INTEGER;
ALTER TABLE bulletins_soins ADD COLUMN rang_pres INTEGER;
ALTER TABLE bulletins_soins ADD COLUMN nom_adherent TEXT;

-- Champs acte bulletin
ALTER TABLE actes_bulletin ADD COLUMN nbr_cle REAL;
ALTER TABLE actes_bulletin ADD COLUMN mnt_revise REAL DEFAULT 0;
ALTER TABLE actes_bulletin ADD COLUMN mnt_red_if_avanc REAL DEFAULT 0;
ALTER TABLE actes_bulletin ADD COLUMN mnt_act_a_regl REAL;
ALTER TABLE actes_bulletin ADD COLUMN cod_msgr TEXT;
ALTER TABLE actes_bulletin ADD COLUMN lib_msgr TEXT;
ALTER TABLE actes_bulletin ADD COLUMN ref_prof_sant TEXT;
ALTER TABLE actes_bulletin ADD COLUMN nom_prof_sant TEXT;
```

### Migration 0081 : Table `plafonds_prestataire` (suivi consommation par prestataire)

```sql
CREATE TABLE plafonds_prestataire (
  id TEXT PRIMARY KEY,
  adherent_id TEXT NOT NULL REFERENCES adherents(id),
  -- adherent_id = le prestataire (adhérent, conjoint, ou enfant)
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  annee INTEGER NOT NULL,
  famille_acte_id TEXT REFERENCES familles_actes(id),
  -- NULL = plafond global
  montant_plafond REAL NOT NULL,      -- Plafond configuré
  montant_consomme REAL NOT NULL DEFAULT 0,
  type_maladie TEXT DEFAULT 'ordinaire'
    CHECK (type_maladie IN ('ordinaire', 'chronique')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(adherent_id, contract_id, annee, famille_acte_id, type_maladie)
);
```

---

## 2. Endpoints Hono

### Nouveaux endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/v1/familles-actes` | Liste des familles d'actes |
| GET | `/api/v1/actes-referentiel` | Actes avec codes assureur, filtrable par famille |
| GET | `/api/v1/contracts/:id/periodes` | Périodes d'application d'un contrat |
| GET | `/api/v1/contracts/:id/baremes` | Barèmes par période/famille |
| POST | `/api/v1/contracts/:id/periodes` | Créer une période |
| POST | `/api/v1/contracts/:id/baremes` | Créer/modifier des barèmes |
| GET | `/api/v1/lots/:id/export-detail.csv` | Export bordereau détaillé (toutes colonnes) |
| GET | `/api/v1/adherents/:id/famille` | Liste prestataires (adhérent + ayants-droit) |
| GET | `/api/v1/adherents/:id/plafonds` | Consommation plafonds par prestataire/famille |

### Endpoints modifiés

| Route | Modification |
|-------|-------------|
| `POST /api/v1/agent/bulletins/create` | Accepter codes assureur, rang_pres, champs observation |
| `GET /api/v1/lots/:id/export.csv` | Enrichir avec colonnes CTRL (Num_Contrat, Souscripteur, etc.) |
| `POST /api/v1/agent/bulletins/calculate` | Utiliser contrat_baremes + plafonds_prestataire |

---

## 3. Calcul de remboursement — Nouveau flux

```
1. Agent saisit : code_acte (ex: "C2"), frais_engages, date_acte, rang_pres
2. Système cherche le contrat actif pour l'adhérent
3. Système cherche la période d'application couvrant date_acte
4. Système cherche le barème pour code_acte dans cette période
5. Calcul :
   - Si type_calcul = "forfait" → remb = min(frais_engages, valeur_base)
   - Si type_calcul = "taux"   → remb = frais_engages × valeur
6. Vérification plafond par acte : remb = min(remb, plafond_acte)
7. Vérification plafond famille/an : remb = min(remb, plafond_famille_restant)
8. Vérification plafond global/an : remb = min(remb, plafond_global_restant)
9. Mise à jour plafonds_prestataire (famille + global)
```

---

## 4. Structure R2 (inchangée)

Les scans restent dans R2 comme avant. Pas de changement.

---

## 5. Frontend — Modifications

- Sélecteur d'actes : remplacer les codes génériques par les codes assureur groupés par famille
- Formulaire bulletin : ajouter champ professionnel de santé, observations
- Vue lot : ajouter bouton "Export détaillé" en plus de l'export récap
- Vue adhérent : afficher les ayants-droit avec rang et consommation plafonds
