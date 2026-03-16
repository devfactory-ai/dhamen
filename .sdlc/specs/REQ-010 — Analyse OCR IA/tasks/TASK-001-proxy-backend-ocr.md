---
id: TASK-001
title: Proxy backend OCR (endpoint analyse-bulletin)
status: done
priority: must
requires: []
ref: ADR-001, ADR-002
---

# TASK-001 — Proxy backend OCR (endpoint analyse-bulletin)

## Objective

Ajouter un endpoint `POST /bulletins-soins/agent/analyse-bulletin` qui sert de proxy entre le frontend et le service OCR externe, evitant les problemes CORS et nettoyant la reponse.

## Why

Le navigateur bloque les appels cross-origin vers le domaine ngrok du service OCR. Le proxy backend (Cloudflare Worker) n'est pas soumis a ces restrictions. De plus, le nettoyage de la reponse OCR (markdown -> JSON) est centralise cote serveur.

## Files to modify

| File | Change |
|------|--------|
| `apps/api/src/routes/bulletins-agent.ts` | Ajout endpoint `POST /analyse-bulletin` |
| `apps/api/src/types.ts` | Ajout `OCR_URL?: string` aux Bindings |

## Implementation details

### 1. Bindings (`apps/api/src/types.ts`)

```typescript
// Optional configuration
API_BASE_URL?: string;
OCR_URL?: string;  // <-- ADD
```

### 2. Endpoint proxy (`bulletins-agent.ts`)

```typescript
bulletinsAgent.post('/analyse-bulletin', async (c) => {
  const user = c.get('user');
  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' } }, 403);
  }

  try {
    const body = await c.req.parseBody({ all: true });
    const files = body['files'];
    const proxyForm = new FormData();

    if (Array.isArray(files)) {
      for (const file of files) {
        if (file instanceof File) proxyForm.append('files', file);
      }
    } else if (files instanceof File) {
      proxyForm.append('files', files);
    }

    const ocrUrl = c.env.OCR_URL || 'https://grady-semistiff-willia.ngrok-free.dev/analyse-bulletin';
    const ocrRes = await fetch(ocrUrl, {
      method: 'POST',
      headers: { accept: 'application/json' },
      body: proxyForm,
    });

    if (!ocrRes.ok) {
      return c.json({ success: false, error: { code: 'OCR_ERROR', message: `OCR service returned ${ocrRes.status}` } }, 502);
    }

    const ocrData = await ocrRes.json();

    // Nettoyage : extraire JSON du bloc markdown
    const raw = typeof ocrData.raw_response === 'string' ? ocrData.raw_response : JSON.stringify(ocrData);
    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return c.json({ success: true, data: parsed });
  } catch (error) {
    console.error('OCR proxy error:', error);
    return c.json({ success: false, error: { code: 'OCR_ERROR', message: "Erreur lors de l'analyse OCR" } }, 500);
  }
});
```

## Tests

- Integration test: POST avec fichier image -> reponse JSON nettoyee
- Integration test: role non autorise -> 403
- Integration test: service OCR indisponible -> 502

## Acceptance criteria

- [ ] Endpoint accessible a `/bulletins-soins/agent/analyse-bulletin`
- [ ] Fichiers forwardes au service OCR externe
- [ ] Reponse nettoyee : JSON pur sans bloc markdown
- [ ] Roles verifies (INSURER_ADMIN, INSURER_AGENT, ADMIN)
- [ ] Erreurs gerees proprement (502, 500)
