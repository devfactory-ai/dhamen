---
id: REQ-000
title: Contexte métier du système de gestion santé
status: draft
priority: must
---

# Objectif

Définir le contexte métier et les concepts principaux du système de gestion
des remboursements santé afin de fournir une base commune pour les
spécifications fonctionnelles suivantes.

Ce document décrit les entités métier et le workflow global du système.

---

# Domaine métier

Le système permet de gérer les remboursements de soins médicaux pour des
adhérents couverts par des contrats d'assurance santé.

Les agents traitent des bulletins de soins contenant des actes médicaux
effectués par des prestataires.

Le système doit calculer les remboursements selon les règles du contrat
et les plafonds applicables.

---

# Acteurs

### Agent assurance
Personne chargée de traiter les bulletins de soins et valider les remboursements.

### Adhérent
Personne assurée bénéficiant de la couverture santé.

### Bénéficiaire
Membre de la famille de l'adhérent pouvant bénéficier de la couverture.

### Prestataire
Médecin, clinique, laboratoire ou autre professionnel de santé.

---

# Concepts métier

### Société
Entreprise ayant souscrit un contrat d'assurance santé pour ses employés.

### Adhérent
Employé couvert par le contrat de la société.

### Bénéficiaire
Personne rattachée à un adhérent (conjoint, enfant).

### Acte médical
Prestation médicale pouvant être remboursée selon un taux défini.

### Bulletin de soins
Déclaration d'un ou plusieurs actes médicaux à rembourser.

### Remboursement
Montant calculé selon les règles du contrat et les plafonds applicables.

---

# Workflow global

Société
↓
Adhérents
↓
Bénéficiaires
↓
Bulletin de soins
↓
Actes médicaux
↓
Calcul remboursement
↓
Vérification plafond
↓
Validation
↓
Paiement

---

# Objectif pour les REQ suivants

Les spécifications suivantes implémenteront les modules nécessaires
pour gérer ce workflow :

- authentification des agents
- gestion des adhérents
- gestion des bénéficiaires
- saisie des bulletins de soins
- calcul des remboursements
- gestion des plafonds
- notifications et reporting
