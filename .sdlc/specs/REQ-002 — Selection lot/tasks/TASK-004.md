---
id: TASK-004
parent: REQ-002
status: done
dependencies: [TASK-003]
files:
  - apps/web/src/features/agent/stores/agent-context.ts
  - apps/web/src/features/agent/pages/SelectContextPage.tsx
  - apps/web/src/features/agent/hooks/useCompanies.ts
  - apps/web/src/features/agent/hooks/useBatches.ts
---

## Objective

Créer la page frontend de sélection du contexte de travail (entreprise + lot) et le store Zustand pour mémoriser la sélection.

## Acceptance Criteria

- AC1 : la page affiche les entreprises de l'assureur de l'agent
- AC2 : l'agent peut sélectionner une entreprise (clic sur card/ligne)
- AC3 : après sélection, les lots ouverts de l'entreprise s'affichent
- AC4 : un bouton "Créer un nouveau lot" ouvre un modal/formulaire
- AC5 : l'agent peut sélectionner un lot ouvert
- AC6 : le contexte `{ selectedCompany, selectedBatch }` est stocké dans un store Zustand persisté en sessionStorage
- AC7 : après sélection complète, redirection vers le dashboard de saisie

## Implementation Steps

1. Créer `agent-context.ts` — store Zustand avec :
   - `selectedCompany`, `selectedBatch`
   - `setCompany()`, `setBatch()`, `clearContext()`
   - Persist middleware avec sessionStorage
2. Créer `useCompanies.ts` — hook TanStack Query pour `GET /api/v1/companies?isActive=true`
3. Créer `useBatches.ts` — hook TanStack Query pour `GET /api/v1/bulletins-soins/agent/batches?companyId={id}&status=open` + mutation pour POST
4. Créer `SelectContextPage.tsx` :
   - Étape 1 : liste des entreprises avec recherche
   - Étape 2 : liste des lots + bouton créer
   - Redirection vers `/dashboard` après sélection
5. Ajouter la route `/select-context` dans le router

## Tests

- Test : le store persiste le contexte en sessionStorage
- Test : la page affiche les entreprises
- Test : sélection entreprise affiche les lots
- Test : création d'un lot appelle POST et rafraîchit la liste
