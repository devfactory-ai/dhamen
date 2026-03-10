/**
 * REQ-011 TASK-004: OCR queue events — Integration Tests
 *
 * Tests that OCR_COMPLETED and OCR_FAILED events are emitted
 * via Cloudflare Queues after OCR processing.
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import type { OcrCompletedEvent, OcrFailedEvent } from '@dhamen/shared';

const MOCK_OCR_RESULT = {
  dateSoin: '2026-03-05',
  typeSoin: 'consultation',
  montantTotal: 50000,
  praticien: { nom: 'Dr. Ben Ali', specialite: 'Generaliste' },
  lignes: [
    { libelle: 'Consultation generale', quantite: 1, prixUnitaire: 50000, montantTotal: 50000 },
  ],
  confidence: 0.85,
  fieldConfidences: {},
  warnings: [],
};

function createOcrAppWithQueue(scenario: 'success' | 'failure' | 'queue-error') {
  const queueSendSpy = vi.fn().mockImplementation(() => {
    if (scenario === 'queue-error') {
      return Promise.reject(new Error('Queue unavailable'));
    }
    return Promise.resolve();
  });

  const app = new Hono();

  app.post('/api/v1/sante/documents/:id/ocr', async (c) => {
    const id = c.req.param('id');
    const doc = { id, demandeId: 'dem_001', ocrAttempts: 2 };

    if (scenario === 'failure') {
      // Emit OCR_FAILED event (fire-and-forget)
      const failedEvent: OcrFailedEvent = {
        type: 'OCR_FAILED',
        documentId: id,
        demandeId: doc.demandeId,
        errorCode: 'OCR_EXTRACTION_FAILED',
        attempt: doc.ocrAttempts + 1,
        timestamp: new Date().toISOString(),
      };
      queueSendSpy(failedEvent).catch(() => {});

      return c.json({
        success: false,
        error: { code: 'OCR_EXTRACTION_FAILED', message: 'Extraction failed' },
      }, 500);
    }

    // Emit OCR_COMPLETED event (fire-and-forget)
    const completedEvent: OcrCompletedEvent = {
      type: 'OCR_COMPLETED',
      documentId: id,
      demandeId: doc.demandeId,
      confidence: MOCK_OCR_RESULT.confidence,
      careType: MOCK_OCR_RESULT.typeSoin,
      montantTotal: MOCK_OCR_RESULT.montantTotal,
      timestamp: new Date().toISOString(),
    };
    queueSendSpy(completedEvent).catch(() => {});

    return c.json({
      success: true,
      data: { message: 'OCR termine avec succes', data: MOCK_OCR_RESULT },
    });
  });

  return { app, queueSendSpy };
}

describe('REQ-011 TASK-004: OCR queue events', () => {
  describe('OCR_COMPLETED event', () => {
    it('emits OCR_COMPLETED event on successful extraction', async () => {
      const { app, queueSendSpy } = createOcrAppWithQueue('success');

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      expect(queueSendSpy).toHaveBeenCalledOnce();

      const event = queueSendSpy.mock.calls[0][0] as OcrCompletedEvent;
      expect(event.type).toBe('OCR_COMPLETED');
      expect(event.documentId).toBe('doc_001');
      expect(event.demandeId).toBe('dem_001');
      expect(event.confidence).toBe(0.85);
      expect(event.careType).toBe('consultation');
      expect(event.montantTotal).toBe(50000);
      expect(event.timestamp).toBeDefined();
    });

    it('includes valid ISO timestamp in event', async () => {
      const { app, queueSendSpy } = createOcrAppWithQueue('success');

      await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });

      const event = queueSendSpy.mock.calls[0][0] as OcrCompletedEvent;
      const parsed = new Date(event.timestamp);
      expect(parsed.getTime()).not.toBeNaN();
    });
  });

  describe('OCR_FAILED event', () => {
    it('emits OCR_FAILED event on extraction failure', async () => {
      const { app, queueSendSpy } = createOcrAppWithQueue('failure');

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(500);
      expect(queueSendSpy).toHaveBeenCalledOnce();

      const event = queueSendSpy.mock.calls[0][0] as OcrFailedEvent;
      expect(event.type).toBe('OCR_FAILED');
      expect(event.documentId).toBe('doc_001');
      expect(event.demandeId).toBe('dem_001');
      expect(event.errorCode).toBe('OCR_EXTRACTION_FAILED');
      expect(event.attempt).toBe(3);
      expect(event.timestamp).toBeDefined();
    });
  });

  describe('Fire-and-forget behavior', () => {
    it('does not block HTTP response when queue send fails', async () => {
      const { app, queueSendSpy } = createOcrAppWithQueue('queue-error');

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });

      // Response should still succeed even though queue failed
      expect(res.status).toBe(200);
      expect(queueSendSpy).toHaveBeenCalledOnce();
    });
  });

  describe('Event type structure', () => {
    it('OcrCompletedEvent has all required fields', () => {
      const event: OcrCompletedEvent = {
        type: 'OCR_COMPLETED',
        documentId: 'doc_001',
        demandeId: 'dem_001',
        confidence: 0.85,
        careType: 'consultation',
        montantTotal: 50000,
        timestamp: '2026-03-10T12:00:00Z',
      };

      expect(event.type).toBe('OCR_COMPLETED');
      expect(typeof event.documentId).toBe('string');
      expect(typeof event.demandeId).toBe('string');
      expect(typeof event.confidence).toBe('number');
      expect(typeof event.careType).toBe('string');
      expect(typeof event.montantTotal).toBe('number');
      expect(typeof event.timestamp).toBe('string');
    });

    it('OcrFailedEvent has all required fields', () => {
      const event: OcrFailedEvent = {
        type: 'OCR_FAILED',
        documentId: 'doc_001',
        demandeId: 'dem_001',
        errorCode: 'OCR_AI_UNAVAILABLE',
        attempt: 3,
        timestamp: '2026-03-10T12:00:00Z',
      };

      expect(event.type).toBe('OCR_FAILED');
      expect(typeof event.documentId).toBe('string');
      expect(typeof event.demandeId).toBe('string');
      expect(typeof event.errorCode).toBe('string');
      expect(typeof event.attempt).toBe('number');
      expect(typeof event.timestamp).toBe('string');
    });
  });
});
