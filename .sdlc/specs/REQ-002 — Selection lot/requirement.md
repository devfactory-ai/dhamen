# REQ-002 — Sélection lot

## Description

Après connexion, l'agent d'assurance doit sélectionner l'entreprise et le lot sur lequel il va travailler avant d'accéder à la saisie des bulletins.

## Acteurs

- Agent assurance (INSURER_AGENT)

## User Story

En tant qu'agent, après m'être connecté, je veux choisir une entreprise et un lot de travail afin de commencer la saisie des bulletins de remboursement dans le bon contexte.

## Flux

1. L'agent se connecte (REQ-001)
2. Le système affiche la liste des entreprises rattachées à l'assureur de l'agent
3. L'agent sélectionne une entreprise
4. Le système affiche les lots existants (ouverts) pour cette entreprise, avec la possibilité d'en créer un nouveau
5. L'agent sélectionne un lot existant ou crée un nouveau lot
6. Le contexte (entreprise + lot) est mémorisé pour la session
7. L'agent est redirigé vers le dashboard de saisie

## Acceptance Criteria

AC1 : après connexion, l'agent voit la liste des entreprises de son assureur
AC2 : l'agent peut sélectionner une entreprise
AC3 : après sélection de l'entreprise, l'agent voit les lots ouverts de cette entreprise
AC4 : l'agent peut créer un nouveau lot
AC5 : l'agent peut sélectionner un lot existant (statut open uniquement)
AC6 : le contexte entreprise + lot est conservé dans la session
AC7 : l'agent est redirigé vers le dashboard de saisie après sélection

## Dépendances

- REQ-001 : Authentification agent
