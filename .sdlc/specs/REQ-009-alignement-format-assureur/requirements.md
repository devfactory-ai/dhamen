# REQ-009 — Alignement format données assureur tunisien

## Contexte

L'implémentation actuelle de Dhamen utilise des codes actes génériques et un modèle de données simplifié qui ne correspondent pas aux standards du secteur de l'assurance santé en Tunisie. Les assureurs tunisiens utilisent des codes actes spécifiques (C1, C2, PH1, AN, R, etc.), un modèle famille avec rangs (adhérent/conjoint/enfants), des contrats avec périodes d'application et barèmes par famille d'actes, et des formats d'échange CSV normalisés pour les bordereaux.

Ce REQ corrige ces écarts **avant** de poursuivre avec P3 (migration) pour garantir que le modèle de données de Dhamen est compatible avec les données réelles du secteur.

## Objectif

Aligner le modèle de données, les codes actes, la structure des contrats et le calcul de remboursement de Dhamen avec les standards et formats utilisés par les assureurs tunisiens.

---

## US-1 : Codes actes médicaux alignés sur système assureur

**En tant qu'** agent d'assurance,
**je veux** retrouver les mêmes codes actes utilisés par les assureurs tunisiens (C1, C2, C3, V1, V2, V3, PH1, AN, R, SD, CL, FCH, ANE, SO, TS, ODF, etc.),
**afin de** saisir les bulletins avec les codes que je connais et que les bordereaux exportés soient compatibles avec le système existant.

### Critères d'acceptation
- [ ] La table `actes_referentiel` contient les 20+ codes actes réels du secteur assurance santé tunisien (pas les codes génériques CONS-GEN, PHARMA, etc.)
- [ ] Chaque code est rattaché à sa famille d'actes (FA0001 à FA0020)
- [ ] Les codes génériques actuels sont mappés/migrés vers les codes assureur
- [ ] Le formulaire de saisie bulletin propose les codes assureur dans un sélecteur

---

## US-2 : Structure contrat avec familles d'actes et périodes d'application

**En tant qu'** administrateur assureur,
**je veux** configurer un contrat avec des familles d'actes (FA), des tableaux de barèmes par famille, et des périodes d'application,
**afin que** le calcul de remboursement applique les bons taux selon le contrat en vigueur à la date de l'acte.

### Critères d'acceptation
- [ ] Un contrat a une ou plusieurs **périodes d'application** (date début, date fin)
- [ ] Chaque période contient des **tableaux de barèmes** par famille d'actes
- [ ] Chaque barème définit : code acte, libellé, type calcul (Taux/Forfait), valeur, plafond max, limite, période
- [ ] Le calcul de remboursement sélectionne le barème correct selon la date de l'acte et la période active
- [ ] Les taux d'un contrat type assurance groupe sont modélisables (C1=45DT, C2=55DT, PH1=90%, etc.)

---

## US-3 : Modèle prestataire (adhérent + famille) avec rang assureur

**En tant qu'** agent,
**je veux** que chaque membre de la famille d'un adhérent ait un **rang** (00=adhérent, 01-98=enfants, 99=conjoint) et un **type** (A/C/E),
**afin de** rattacher correctement les bulletins aux prestataires comme dans le système assureur.

### Critères d'acceptation
- [ ] Le modèle adhérent supporte le rang prestataire (`rang_pres`) : 00 (adhérent), 01-98 (enfants), 99 (conjoint)
- [ ] Le type prestataire (`code_type`) est stocké : A (adhérent), C (conjoint), E (enfant)
- [ ] Les ayants-droit sont des enregistrements avec leurs propres champs (CIN, date naissance, sexe, situation familiale, handicap, maladie chronique)
- [ ] Le champ `matricule_conjoint` permet de lier un conjoint à l'adhérent
- [ ] La recherche d'adhérent dans le formulaire bulletin affiche aussi les ayants-droit avec leur rang

---

## US-4 : Plafonds par famille d'acte et par prestataire

**En tant que** système de calcul,
**je veux** appliquer des plafonds à 3 niveaux : par acte, par famille d'actes/an/prestataire, et global/an/prestataire,
**afin que** le remboursement respecte les limites contractuelles réelles.

### Critères d'acceptation
- [ ] Plafond **par acte** : ex. C1 max 45 DT, salle d'opération max 300 DT/acte
- [ ] Plafond **par famille/an/prestataire** : ex. pharmacie ordinaire max 1000 DT/an, dentaire max 1200 DT/an
- [ ] Plafond **global/an/prestataire** : ex. 6000 DT/an par prestataire (adhérent ou ayant-droit)
- [ ] Le suivi de consommation est **par prestataire** (chaque membre de la famille a son propre compteur), pas par adhérent seul
- [ ] La distinction maladies ordinaires vs chroniques est supportée (plafonds pharma différents)
- [ ] L'agent voit un avertissement si un plafond est atteint ou dépassé avant validation

---

## US-5 : Champs bulletin alignés sur le bordereau assureur

**En tant qu'** agent,
**je veux** que le bulletin contienne les champs métier du bordereau système assureur,
**afin que** l'export et le traitement soient compatibles avec le format assureur.

### Critères d'acceptation
- [ ] Champs ajoutés au bulletin : `ref_bs_phys_ass` (réf physique assureur), `ref_bs_phys_clt` (réf physique client), `rang_bs` (rang du bulletin dans le lot)
- [ ] Champs ajoutés par acte : `nbr_cle` (nombre clé/coefficient), `mnt_revise` (montant révisé), `mnt_red_if_avanc` (réduction si avance)
- [ ] Champs observation : `cod_msgr` (code message), `lib_msgr` (libellé message) pour les rejets/remarques ("FOURNIR LETTRE CONFIDENTIELLE", "MEDICAMENTS NON REMBOURSABLE", etc.)
- [ ] Professionnel de santé : `ref_prof_sant` (référence), `nom_prof_sant` (nom) par acte
- [ ] Le bordereau détaillé exporté contient toutes ces colonnes

---

## US-6 : Export CSV enrichi (format CTRL assureur)

**En tant qu'** agent,
**je veux** que l'export CSV récap par lot inclue les colonnes du fichier CTRL système assureur,
**afin que** le fichier soit directement utilisable par l'assureur.

### Critères d'acceptation
- [ ] L'export récap (CTRL) contient : Numero_De_Contrat, Souscripteur, Numero_De_Bordereau, Matricule_Isante, Matricule_Assureur, Nom, Prenom, Rib, Remb
- [ ] Un second export **bordereau détaillé** est disponible avec toutes les colonnes du bordereau standard (lignes d'actes)
- [ ] Le format reste UTF-8 BOM pour Excel
- [ ] Les deux exports sont accessibles depuis la vue lot

---

## Contraintes techniques

- Migrations D1 incrémentales (ne pas casser les données existantes)
- Les codes actes génériques actuels doivent être mappés vers les codes assureur (migration de données)
- Rétrocompatibilité : les bulletins existants restent valides
- Les montants restent en **millimes** (1 DT = 1000 millimes) dans la base
- Tous les nouveaux champs doivent avoir des schemas Zod dans `packages/shared`

## Références

Les formats de données, codes actes et structures de contrats décrits dans ce REQ sont basés sur les standards du secteur de l'assurance santé groupe en Tunisie (bordereau détaillé, fichier CTRL récap, MAJ adhérents, contrat d'assurance groupe multirisques).
