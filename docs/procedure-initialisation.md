# Procedure d'initialisation et import des donnees

## Vue d'ensemble

Cette procedure permet d'initialiser un nouveau tenant (assureur) et d'importer les donnees legacy du systeme Acorad/RIADH.

## Pre-requis

- Node.js 18+
- pnpm installe
- Wrangler CLI (`npx wrangler`)
- Acces au compte Cloudflare (pour le mode remote)
- Fichiers Excel Acorad (MAJSPROLS, SPROLS, CTRL)

## Fichiers Excel attendus

| Fichier | Contenu | Obligatoire |
|---------|---------|-------------|
| `MAJSPROLS_*.xlsx` | Adherents + ayants-droit (famille) | Oui |
| `SPROLS_*.xlsx` | Historique bulletins/bordereaux | Non |
| `CTRL_SPROLS_*.xlsx` | Controle/reconciliation | Non |

## Procedure pas a pas

### Etape 1 : Preparer les fichiers

Placer les fichiers Excel dans un dossier (ex: `./dossier/client-x/`).

### Etape 2 : Initialisation complete (automatique)

```bash
# Mode local (dev)
npx tsx scripts/init-tenant.ts \
  --tenant AMI \
  --company-name "SPROLS SA" \
  --company-code SPROLS \
  --contract-num 202670100008 \
  --import-dir ./dossier

# Mode remote (staging/production)
npx tsx scripts/init-tenant.ts \
  --tenant AMI \
  --remote \
  --company-name "SPROLS SA" \
  --company-code SPROLS \
  --contract-num 202670100008 \
  --import-dir ./dossier
```

Cette commande execute automatiquement :
1. Migrations D1
2. Seed des donnees de reference (familles d'actes, actes referentiel)
3. Creation des utilisateurs admin
4. Creation de la societe et du contrat groupe
5. Import des adherents et bulletins depuis les fichiers Excel

### Etape 3 : Verification

```bash
# Verifier les adherents importes
npx wrangler d1 execute dhamen-ami --local \
  --command "SELECT COUNT(*) as total FROM adherents WHERE deleted_at IS NULL"

# Verifier les familles
npx wrangler d1 execute dhamen-ami --local \
  --command "SELECT COUNT(*) as total, code_type FROM adherents GROUP BY code_type"

# Verifier les bulletins
npx wrangler d1 execute dhamen-ami --local \
  --command "SELECT COUNT(*) as total FROM bulletins_soins"
```

## Procedure manuelle (etape par etape)

### 2a. Migrations seules

```bash
cd apps/api
npx wrangler d1 migrations apply dhamen-ami --local
```

### 2b. Import adherents seul

```bash
# Dry run d'abord (validation sans insertion)
npx tsx scripts/import-acorad.ts \
  --tenant AMI \
  --dir ./dossier \
  --dry-run

# Import reel
npx tsx scripts/import-acorad.ts \
  --tenant AMI \
  --dir ./dossier \
  --company 01JCVMKC3EP2N3X4Y5Z6A7B8G3
```

### 2c. Creer une base D1 remote

```bash
npx tsx scripts/init-tenant.ts --tenant AMI --remote --create-db
```

## Mapping des donnees Acorad

### Adherents (MAJSPROLS)

| Champ Acorad | Champ Dhamen | Notes |
|---|---|---|
| Wmat | matricule | Numero employe |
| Wcode_Type | code_type | A=adherent, C=conjoint, E=enfant |
| Wrang_Prest | rang_pres | 00=principal, 01-98=enfants, 99=conjoint |
| Wnom_Pren_Prest | last_name + first_name | Separe automatiquement |
| Wnum_Piece_Identite | national_id_encrypted | Prefixe LEGACY_ (a re-chiffrer) |
| Wdat_Nais | date_of_birth | Converti dd/mm/yyyy -> yyyy-mm-dd |
| Wcod_Sexe | gender | M ou F |
| Wcode_Situation_Fam | code_situation_fam | M=marie, C=celibataire, D=divorce, V=veuf |
| WMALADIE_CRONIQUE | maladie_chronique | O/N -> 1/0 |
| WHANDICAP | handicap | O/N -> 1/0 |
| Wrib | rib_encrypted | Prefixe LEGACY_ (a re-chiffrer) |

### Bulletins (SPROLS)

| Champ Acorad | Champ Dhamen | Notes |
|---|---|---|
| Ref_Bs_Phys_Ass | ref_bs_phys_ass | Reference physique assureur |
| Cod_Act | code_acte (actes_bulletin) | Code acte Acorad |
| Frais_Engag | montant_engage | En millimes |
| Mnt_Act_Remb | montant_rembourse | En millimes |
| Ref_Prof_Sant | ref_prof_sant | Reference praticien |
| Nom_Prof_Sant | nom_prof_sant | Nom praticien |

## Donnees sensibles

Les champs sensibles importes depuis Acorad sont prefixes `LEGACY_` :
- `national_id_encrypted` : `LEGACY_12345678`
- `phone_encrypted` : `LEGACY_+21698123456`
- `rib_encrypted` : `LEGACY_10234567890123456789`

Ces valeurs doivent etre re-chiffrees avec AES-256-GCM via un script de migration post-import (a executer quand la cle `ENCRYPTION_KEY` est configuree en production).

## Utilisateurs par defaut

| Role | Email | Mot de passe |
|---|---|---|
| INSURER_ADMIN | admin@{code}.com.tn | Dhamen@{ANNEE}! |
| INSURER_AGENT | agent@{code}.com.tn | Dhamen@{ANNEE}! |
| INSURER_AGENT | gestionnaire@{code}.com.tn | Dhamen@{ANNEE}! |

## Tenants disponibles

| Code | Base D1 | Assureur |
|---|---|---|
| STAR | dhamen-star | STAR Assurances |
| GAT | dhamen-gat | GAT Assurances |
| COMAR | dhamen-comar | COMAR Assurances |
| AMI | dhamen-ami | AMI Assurances |

## Troubleshooting

### Erreur "ENCRYPTION_KEY is not configured"
Ajouter dans `apps/api/wrangler.toml` section `[vars]` :
```toml
ENCRYPTION_KEY = "votre-cle-hex-64-chars"
```

### Erreur "table not found"
Les migrations n'ont pas ete executees. Lancer :
```bash
cd apps/api && npx wrangler d1 migrations apply dhamen-ami --local
```

### Doublons a l'import
Le script ignore automatiquement les adherents dont le matricule existe deja (par entreprise). Pour forcer la re-importation, supprimer d'abord les anciens :
```bash
npx wrangler d1 execute dhamen-ami --local \
  --command "UPDATE adherents SET deleted_at = datetime('now') WHERE company_id = 'xxx'"
```
