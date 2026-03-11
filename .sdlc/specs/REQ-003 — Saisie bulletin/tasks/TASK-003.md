---
id: TASK-003
parent: REQ-003
status: done
dependencies: []
files:
  - apps/web/src/components/guards/AgentContextGuard.tsx
  - apps/web/src/App.tsx
---

## Objective

Créer un garde de route qui redirige les agents vers `/select-context` s'ils n'ont pas sélectionné d'entreprise et de lot.

## Acceptance Criteria

- AC1 : un composant `AgentContextGuard` vérifie que `isContextReady()` est true
- AC2 : si le contexte est incomplet, redirection vers `/select-context`
- AC3 : les rôles non-agent (pharmacien, médecin, etc.) ne sont pas affectés par le guard
- AC4 : la route `/bulletins/saisie` est protégée par ce guard dans `App.tsx`

## Implementation Steps

1. Créer `AgentContextGuard.tsx` qui lit le store `useAgentContext` et `getUser()`
2. Si l'utilisateur est un agent et `isContextReady()` est false → redirect `/select-context`
3. Sinon → rendre les children
4. Envelopper la route `/bulletins/saisie` avec ce guard dans `App.tsx`
