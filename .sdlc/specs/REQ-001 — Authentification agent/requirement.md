# REQ-001 — Authentification agent

## Description
Un agent d’assurance doit pouvoir se connecter à la plateforme Dhamen afin de saisir des bulletins de remboursement.

## Acteurs
- Agent assurance

## User Story
En tant qu’agent, je veux me connecter afin d’accéder au système et commencer la saisie des bulletins.

## Flux

1. L’agent ouvre la page login
2. Il saisit email + mot de passe
3. Le système vérifie les identifiants
4. Si valide → retour token JWT
5. L’agent est redirigé vers le dashboard

## Acceptance Criteria

AC1 : un agent peut se connecter avec email + mot de passe  
AC2 : un token JWT est généré  
AC3 : l’accès aux routes API nécessite un token valide  
AC4 : si les identifiants sont incorrects → erreur 401