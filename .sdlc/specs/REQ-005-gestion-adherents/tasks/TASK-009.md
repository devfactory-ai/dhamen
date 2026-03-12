---
id: TASK-009
parent: REQ-005
status: done
dependencies: [TASK-005]
files:
  - apps/web/src/App.tsx
  - apps/web/src/components/layout/Sidebar.tsx
---

## Objective

Ajouter la navigation vers la page adhérents agent dans le menu sidebar et le routeur.

## Context

La page liste adhérents agent (TASK-005) doit être accessible depuis le menu de navigation. Il faut ajouter une entrée dans le sidebar pour les rôles agent et admin assureur, et déclarer la route dans App.tsx.

## Acceptance Criteria

- AC1 : entrée "Adhérents" visible dans le sidebar pour les rôles INSURER_AGENT et INSURER_ADMIN
- AC2 : route `/adherents/agent` déclarée dans App.tsx avec le guard agent
- AC3 : l'entrée est active (highlight) quand on est sur la page
- AC4 : icône cohérente avec les autres entrées du menu (Users ou similaire)

## Implementation Steps

1. Ajouter la route `/adherents/agent` dans App.tsx avec `AgentContextGuard`
2. Ajouter l'entrée "Adhérents" dans le sidebar pour les rôles agent
3. Utiliser l'icône `Users` de lucide-react
4. Vérifier le highlight actif

## Tests

- Agent voit l'entrée "Adhérents" dans le sidebar
- Clic navigue vers la page adhérents agent
- Admin plateforme ne voit pas cette entrée (il a sa propre page adhérents)
- L'entrée est surlignée quand on est sur /adherents/agent
