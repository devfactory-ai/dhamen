---
id: TASK-004
title: Emit OCR events via Cloudflare Queues
status: done
priority: should
requires: [TASK-001]
ref: ADR-004
---

# TASK-004 — Emit OCR events via Cloudflare Queues

## Objective

Emit `OCR_COMPLETED` and `OCR_FAILED` events to the Cloudflare Queue after each OCR processing, enabling downstream consumers (notifications, anti-fraud, analytics).

## Why

- F-005 requires webhook/event emission at the end of OCR processing.
- Enables decoupled architecture: the OCR route doesn't need to know about downstream consumers.
- The `QUEUE` binding (`dhamen-events`) is already configured in `wrangler.toml`.

## Files to modify

| File | Change |
|------|--------|
| `apps/api/src/routes/sante/documents.ts` | Add `QUEUE.send()` after OCR completion/failure |
| `packages/shared/src/types/events.ts` (or equivalent) | Define OCR event types |

## Implementation details

### Event types

```typescript
export interface OcrCompletedEvent {
  type: 'OCR_COMPLETED';
  documentId: string;
  demandeId: string;
  confidence: number;
  careType: string;
  montantTotal: number;
  timestamp: string;
}

export interface OcrFailedEvent {
  type: 'OCR_FAILED';
  documentId: string;
  demandeId: string;
  errorCode: string;
  attempt: number;
  timestamp: string;
}
```

### Queue emission in route handler

After OCR success:
```typescript
await c.env.QUEUE.send({
  type: 'OCR_COMPLETED',
  documentId: doc.id,
  demandeId: doc.demandeId,
  confidence: result.confidence,
  careType: result.typeSoin,
  montantTotal: result.montantTotal,
  timestamp: new Date().toISOString(),
});
```

After OCR failure:
```typescript
await c.env.QUEUE.send({
  type: 'OCR_FAILED',
  documentId: doc.id,
  demandeId: doc.demandeId,
  errorCode: 'OCR_EXTRACTION_FAILED',
  attempt: doc.ocrAttempts,
  timestamp: new Date().toISOString(),
});
```

## Tests

- Unit test: verify event is sent on successful OCR
- Unit test: verify event is sent on failed OCR
- Unit test: verify event payload matches expected structure

## Acceptance criteria

- [ ] `OCR_COMPLETED` event emitted with confidence, careType, montantTotal
- [ ] `OCR_FAILED` event emitted with errorCode and attempt count
- [ ] Queue emission does not block the HTTP response (fire-and-forget with error catch)
- [ ] Event types exported from `packages/shared`
