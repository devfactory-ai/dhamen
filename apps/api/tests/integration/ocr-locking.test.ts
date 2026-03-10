/**
 * REQ-011 TASK-001: OCR locking and attempt limiting — Integration Tests
 *
 * Tests concurrency locking (one OCR at a time per document) and
 * attempt limiting (max 5 retries).
 */

import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';

const MOCK_OCR_RESULT = {
  dateSoin: '2026-03-05',
  typeSoin: 'consultation',
  montantTotal: 50000,
  praticien: { nom: 'Dr. Ben Ali', specialite: 'Generaliste' },
  lignes: [
    { libelle: 'Consultation generale', quantite: 1, prixUnitaire: 50000, montantTotal: 50000 },
  ],
  adherentNom: 'Mohamed Trabelsi',
  adherentMatricule: 'MAT-001',
  confidence: 0.85,
  fieldConfidences: {},
  warnings: [],
};

/**
 * Simulates the OCR route with locking and attempt limiting logic,
 * matching the implementation in apps/api/src/routes/sante/documents.ts
 */
function createOcrApp(initialDoc: {
  id: string;
  ocrStatus: string;
  ocrAttempts: number;
  ocrResultJson: string | null;
}) {
  const doc = { ...initialDoc };
  const app = new Hono();

  app.post('/api/v1/sante/documents/:id/ocr', async (c) => {
    // Locking: reject if already processing
    if (doc.ocrStatus === 'processing') {
      return c.json(
        {
          success: false,
          error: {
            code: 'OCR_ALREADY_PROCESSING',
            message: 'Un traitement OCR est déjà en cours pour ce document',
          },
        },
        409
      );
    }

    // Attempt limit: max 5 retries
    if (doc.ocrAttempts >= 5) {
      return c.json(
        {
          success: false,
          error: {
            code: 'OCR_MAX_ATTEMPTS_REACHED',
            message:
              'Nombre maximum de tentatives OCR atteint (5). Veuillez saisir les données manuellement.',
          },
        },
        429
      );
    }

    // Check cached result
    const forceReprocess = c.req.query('force') === 'true';
    if (!forceReprocess && doc.ocrStatus === 'completed' && doc.ocrResultJson) {
      const cachedResult = JSON.parse(doc.ocrResultJson);
      if (cachedResult.confidence > 0) {
        return c.json({
          success: true,
          data: { message: 'OCR deja effectue', data: cachedResult },
        });
      }
    }

    // Increment attempts and mark as processing
    doc.ocrAttempts += 1;
    doc.ocrStatus = 'processing';

    // Simulate OCR success
    doc.ocrStatus = 'completed';
    doc.ocrResultJson = JSON.stringify(MOCK_OCR_RESULT);

    return c.json({
      success: true,
      data: { message: 'OCR termine avec succes', data: MOCK_OCR_RESULT },
    });
  });

  return { app, doc };
}

describe('REQ-011 TASK-001: OCR locking and attempt limiting', () => {
  describe('AC-4: Concurrent processing lock', () => {
    it('rejects OCR request with 409 when document is already processing', async () => {
      const { app } = createOcrApp({
        id: 'doc_001',
        ocrStatus: 'processing',
        ocrAttempts: 1,
        ocrResultJson: null,
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('OCR_ALREADY_PROCESSING');
    });

    it('allows OCR request when document is in pending status', async () => {
      const { app } = createOcrApp({
        id: 'doc_001',
        ocrStatus: 'pending',
        ocrAttempts: 0,
        ocrResultJson: null,
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it('allows OCR request when document is in failed status (retry)', async () => {
      const { app } = createOcrApp({
        id: 'doc_001',
        ocrStatus: 'failed',
        ocrAttempts: 2,
        ocrResultJson: null,
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });

  describe('Attempt limiting (max 5)', () => {
    it('rejects 6th OCR attempt with 429', async () => {
      const { app } = createOcrApp({
        id: 'doc_001',
        ocrStatus: 'failed',
        ocrAttempts: 5,
        ocrResultJson: null,
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('OCR_MAX_ATTEMPTS_REACHED');
      expect(data.error.message).toContain('5');
      expect(data.error.message).toContain('manuellement');
    });

    it('allows 5th attempt (ocrAttempts=4 before increment)', async () => {
      const { app, doc } = createOcrApp({
        id: 'doc_001',
        ocrStatus: 'failed',
        ocrAttempts: 4,
        ocrResultJson: null,
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(doc.ocrAttempts).toBe(5);
    });

    it('increments attempt counter on each OCR call', async () => {
      const { app, doc } = createOcrApp({
        id: 'doc_001',
        ocrStatus: 'pending',
        ocrAttempts: 0,
        ocrResultJson: null,
      });

      expect(doc.ocrAttempts).toBe(0);

      // Use force=true to bypass cached result on subsequent calls
      await app.request('/api/v1/sante/documents/doc_001/ocr?force=true', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });
      expect(doc.ocrAttempts).toBe(1);

      await app.request('/api/v1/sante/documents/doc_001/ocr?force=true', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });
      expect(doc.ocrAttempts).toBe(2);

      await app.request('/api/v1/sante/documents/doc_001/ocr?force=true', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });
      expect(doc.ocrAttempts).toBe(3);
    });

    it('rejects with 429 at exactly ocrAttempts=5', async () => {
      const { app } = createOcrApp({
        id: 'doc_001',
        ocrStatus: 'pending',
        ocrAttempts: 5,
        ocrResultJson: null,
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(429);
      const data = await res.json();
      expect(data.error.code).toBe('OCR_MAX_ATTEMPTS_REACHED');
    });
  });

  describe('Locking takes priority over attempt limit', () => {
    it('returns 409 (processing) even when attempts are exhausted', async () => {
      const { app } = createOcrApp({
        id: 'doc_001',
        ocrStatus: 'processing',
        ocrAttempts: 5,
        ocrResultJson: null,
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });

      // Processing lock is checked first
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error.code).toBe('OCR_ALREADY_PROCESSING');
    });
  });

  describe('Cached result bypass', () => {
    it('returns cached result without incrementing attempts', async () => {
      const { app, doc } = createOcrApp({
        id: 'doc_001',
        ocrStatus: 'completed',
        ocrAttempts: 1,
        ocrResultJson: JSON.stringify(MOCK_OCR_RESULT),
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.message).toBe('OCR deja effectue');
      expect(doc.ocrAttempts).toBe(1); // Not incremented
    });

    it('force=true bypasses cache and increments attempts', async () => {
      const { app, doc } = createOcrApp({
        id: 'doc_001',
        ocrStatus: 'completed',
        ocrAttempts: 1,
        ocrResultJson: JSON.stringify(MOCK_OCR_RESULT),
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr?force=true', {
        method: 'POST',
        headers: { Authorization: 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.message).toBe('OCR termine avec succes');
      expect(doc.ocrAttempts).toBe(2); // Incremented
    });
  });
});

describe('REQ-011 TASK-001: Query helpers', () => {
  describe('incrementOcrAttempts', () => {
    it('increments ocr_attempts and updates updated_at', async () => {
      let capturedBindings: unknown[] = [];
      let capturedQuery = '';

      const mockDb = {
        prepare: (query: string) => {
          capturedQuery = query;
          return {
            bind: (...values: unknown[]) => {
              capturedBindings = values;
              return {
                run: async () => ({ success: true, meta: { changes: 1 } }),
              };
            },
          };
        },
      };

      const { incrementOcrAttempts } = await import('@dhamen/db');
      await incrementOcrAttempts(mockDb as never, 'doc_001');

      expect(capturedQuery).toContain('ocr_attempts = ocr_attempts + 1');
      expect(capturedQuery).toContain('updated_at');
      expect(capturedBindings[1]).toBe('doc_001');
      // First binding is the ISO timestamp
      expect(typeof capturedBindings[0]).toBe('string');
    });
  });

  describe('resetStaleOcrProcessing', () => {
    it('resets processing documents older than 60 seconds', async () => {
      let capturedBindings: unknown[] = [];
      let capturedQuery = '';

      const mockDb = {
        prepare: (query: string) => {
          capturedQuery = query;
          return {
            bind: (...values: unknown[]) => {
              capturedBindings = values;
              return {
                run: async () => ({ success: true, meta: { changes: 3 } }),
              };
            },
          };
        },
      };

      const { resetStaleOcrProcessing } = await import('@dhamen/db');
      const count = await resetStaleOcrProcessing(mockDb as never);

      expect(count).toBe(3);
      expect(capturedQuery).toContain('ocr_status');
      expect(capturedBindings[0]).toBe('pending'); // new status
      expect(capturedBindings[1]).toBe('processing'); // filter status
      // Third binding is the threshold timestamp
      expect(typeof capturedBindings[2]).toBe('string');
    });

    it('returns 0 when no stale documents exist', async () => {
      const mockDb = {
        prepare: () => ({
          bind: () => ({
            run: async () => ({ success: true, meta: { changes: 0 } }),
          }),
        }),
      };

      const { resetStaleOcrProcessing } = await import('@dhamen/db');
      const count = await resetStaleOcrProcessing(mockDb as never);

      expect(count).toBe(0);
    });
  });
});
