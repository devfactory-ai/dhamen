---
id: TASK-002
title: Integration frontend via proxy API
status: todo
priority: must
requires: [TASK-001]
ref: ADR-001
---

# TASK-002 — Integration frontend via proxy API

## Objective

Modifier la fonction `analyzeWithOCR` dans `BulletinsSaisiePage.tsx` pour utiliser le proxy backend au lieu de l'appel direct vers ngrok, et adapter le parsing de la reponse nettoyee.

## Why

L'appel direct vers `https://grady-semistiff-willia.ngrok-free.dev/analyse-bulletin` est bloque par le navigateur (CORS). Le proxy backend (TASK-001) resout ce probleme et retourne une reponse deja nettoyee.

## Files to modify

| File | Change |
|------|--------|
| `apps/web/src/features/bulletins/pages/BulletinsSaisiePage.tsx` | Modification `analyzeWithOCR()` |

## Implementation details

### Avant

```typescript
const res = await fetch('https://grady-semistiff-willia.ngrok-free.dev/analyse-bulletin', {
  method: 'POST',
  headers: { 'accept': 'application/json' },
  body: formData,
});
if (!res.ok) throw new Error(`Erreur OCR: ${res.status}`);
const result = await res.json();
let parsed = result;
if (typeof result.raw_response === 'string') {
  const jsonMatch = result.raw_response.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch?.[1]) parsed = JSON.parse(jsonMatch[1]);
}
```

### Apres

```typescript
const res = await apiClient.upload<Record<string, unknown>>(
  '/bulletins-soins/agent/analyse-bulletin',
  formData,
  { timeout: 120000 }
);
if (!res.success) throw new Error(res.error?.message || 'Erreur OCR');
const parsed = res.data;
```

La reponse est deja nettoyee par le backend (TASK-001). Plus besoin de parser le bloc markdown cote frontend.

## Tests

- Test manuel : upload scan -> clic "Analyser avec IA" -> pas d'erreur CORS
- Test manuel : champs pre-remplis correctement

## Acceptance criteria

- [ ] `analyzeWithOCR` utilise `apiClient.upload()` au lieu de `fetch()` direct
- [ ] Timeout de 120 secondes configure
- [ ] Plus de logique de nettoyage markdown cote frontend
- [ ] Pas d'erreur CORS
