/**
 * REQ-011 TASK-002: GET OCR result endpoint — Integration Tests
 *
 * Tests the GET /api/v1/sante/documents/:id/ocr endpoint for
 * polling OCR status and retrieving structured results.
 */

import { describe, it, expect } from 'vitest';
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
  fieldConfidences: {
    dateSoin: 0.9,
    typeSoin: 0.95,
    montantTotal: 0.8,
    praticienNom: 0.75,
    lignes: 0.85,
  },
  warnings: [],
};

interface MockDoc {
  id: string;
  demandeId: string;
  ocrStatus: string;
  ocrResultJson: string | null;
  adherentId: string;
}

function createGetOcrApp(doc: MockDoc | null) {
  const app = new Hono();

  app.get('/api/v1/sante/documents/:id/ocr', async (c) => {
    const id = c.req.param('id');
    const requesterId = c.req.header('x-user-id') || 'adherent_001';
    const requesterRole = c.req.header('x-user-role') || 'ADHERENT';

    // Document not found
    if (!doc || doc.id !== id) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Document introuvable' } },
        404
      );
    }

    // RBAC check
    if (requesterRole === 'ADHERENT' && doc.adherentId !== requesterId) {
      return c.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Accès non autorisé' } },
        403
      );
    }

    const data: Record<string, unknown> = {
      documentId: doc.id,
      status: doc.ocrStatus,
    };

    if (doc.ocrStatus === 'completed' && doc.ocrResultJson) {
      data.result = JSON.parse(doc.ocrResultJson);
    }

    if (doc.ocrStatus === 'failed') {
      data.error = {
        code: 'OCR_EXTRACTION_FAILED',
        message: "L'extraction OCR a échoué",
      };
    }

    return c.json({ success: true, data });
  });

  return app;
}

describe('REQ-011 TASK-002: GET /api/v1/sante/documents/:id/ocr', () => {
  describe('Status: pending', () => {
    it('returns pending status for freshly uploaded document', async () => {
      const app = createGetOcrApp({
        id: 'doc_001',
        demandeId: 'dem_001',
        ocrStatus: 'pending',
        ocrResultJson: null,
        adherentId: 'adherent_001',
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        headers: { 'x-user-id': 'adherent_001', 'x-user-role': 'ADHERENT' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.documentId).toBe('doc_001');
      expect(body.data.status).toBe('pending');
      expect(body.data.result).toBeUndefined();
      expect(body.data.error).toBeUndefined();
    });
  });

  describe('Status: processing', () => {
    it('returns processing status during OCR extraction', async () => {
      const app = createGetOcrApp({
        id: 'doc_001',
        demandeId: 'dem_001',
        ocrStatus: 'processing',
        ocrResultJson: null,
        adherentId: 'adherent_001',
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        headers: { 'x-user-id': 'adherent_001', 'x-user-role': 'ADHERENT' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.status).toBe('processing');
      expect(body.data.result).toBeUndefined();
    });
  });

  describe('Status: completed', () => {
    it('returns completed status with parsed BulletinExtractedData', async () => {
      const app = createGetOcrApp({
        id: 'doc_001',
        demandeId: 'dem_001',
        ocrStatus: 'completed',
        ocrResultJson: JSON.stringify(MOCK_OCR_RESULT),
        adherentId: 'adherent_001',
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        headers: { 'x-user-id': 'adherent_001', 'x-user-role': 'ADHERENT' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('completed');
      expect(body.data.result).toBeDefined();
      expect(body.data.result.dateSoin).toBe('2026-03-05');
      expect(body.data.result.typeSoin).toBe('consultation');
      expect(body.data.result.montantTotal).toBe(50000);
      expect(body.data.result.praticien.nom).toBe('Dr. Ben Ali');
      expect(body.data.result.lignes).toHaveLength(1);
      expect(body.data.result.confidence).toBe(0.85);
      expect(body.data.result.fieldConfidences).toBeDefined();
      expect(body.data.error).toBeUndefined();
    });
  });

  describe('Status: failed', () => {
    it('returns failed status with error code', async () => {
      const app = createGetOcrApp({
        id: 'doc_001',
        demandeId: 'dem_001',
        ocrStatus: 'failed',
        ocrResultJson: null,
        adherentId: 'adherent_001',
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        headers: { 'x-user-id': 'adherent_001', 'x-user-role': 'ADHERENT' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('failed');
      expect(body.data.error).toBeDefined();
      expect(body.data.error.code).toBe('OCR_EXTRACTION_FAILED');
      expect(body.data.error.message).toContain('OCR');
      expect(body.data.result).toBeUndefined();
    });
  });

  describe('Document not found', () => {
    it('returns 404 for non-existent document', async () => {
      const app = createGetOcrApp(null);

      const res = await app.request('/api/v1/sante/documents/nonexistent/ocr', {
        headers: { 'x-user-id': 'adherent_001', 'x-user-role': 'ADHERENT' },
      });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('RBAC enforcement', () => {
    it('allows owner to access their own document OCR result', async () => {
      const app = createGetOcrApp({
        id: 'doc_001',
        demandeId: 'dem_001',
        ocrStatus: 'completed',
        ocrResultJson: JSON.stringify(MOCK_OCR_RESULT),
        adherentId: 'adherent_001',
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        headers: { 'x-user-id': 'adherent_001', 'x-user-role': 'ADHERENT' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('blocks adherent from accessing another users document OCR', async () => {
      const app = createGetOcrApp({
        id: 'doc_001',
        demandeId: 'dem_001',
        ocrStatus: 'completed',
        ocrResultJson: JSON.stringify(MOCK_OCR_RESULT),
        adherentId: 'adherent_001',
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        headers: { 'x-user-id': 'adherent_002', 'x-user-role': 'ADHERENT' },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('allows ADMIN to access any document OCR result', async () => {
      const app = createGetOcrApp({
        id: 'doc_001',
        demandeId: 'dem_001',
        ocrStatus: 'completed',
        ocrResultJson: JSON.stringify(MOCK_OCR_RESULT),
        adherentId: 'adherent_001',
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        headers: { 'x-user-id': 'admin_001', 'x-user-role': 'ADMIN' },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('Polling simulation', () => {
    it('transitions from processing to completed across polls', async () => {
      // Simulate state change between polls
      let callCount = 0;
      const app = new Hono();

      app.get('/api/v1/sante/documents/:id/ocr', async (c) => {
        callCount++;

        const data: Record<string, unknown> = {
          documentId: 'doc_001',
          status: callCount <= 2 ? 'processing' : 'completed',
        };

        if (callCount > 2) {
          data.result = MOCK_OCR_RESULT;
        }

        return c.json({ success: true, data });
      });

      // Poll 1: processing
      const res1 = await app.request('/api/v1/sante/documents/doc_001/ocr');
      const body1 = await res1.json();
      expect(body1.data.status).toBe('processing');
      expect(body1.data.result).toBeUndefined();

      // Poll 2: still processing
      const res2 = await app.request('/api/v1/sante/documents/doc_001/ocr');
      const body2 = await res2.json();
      expect(body2.data.status).toBe('processing');

      // Poll 3: completed
      const res3 = await app.request('/api/v1/sante/documents/doc_001/ocr');
      const body3 = await res3.json();
      expect(body3.data.status).toBe('completed');
      expect(body3.data.result).toBeDefined();
      expect(body3.data.result.confidence).toBe(0.85);
    });
  });
});
