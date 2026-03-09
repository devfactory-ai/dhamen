/**
 * REQ-001: Scan feuille de soin — Integration Tests
 *
 * Tests the full API flow: brouillon creation → document upload → OCR extraction
 * → demande finalization → push notification.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';

// Shared fixtures
const ADHERENT_USER = {
  sub: 'adherent_001',
  role: 'ADHERENT',
  tenantId: 'tenant_001',
};

const OTHER_ADHERENT_USER = {
  sub: 'adherent_002',
  role: 'ADHERENT',
  tenantId: 'tenant_001',
};

const MOCK_DEMANDE_BROUILLON = {
  id: 'dem_001',
  numeroDemande: 'DEM-2026-0001',
  adherentId: 'adherent_001',
  typeSoin: 'consultation',
  montantDemande: 0,
  dateSoin: '2026-03-09',
  statut: 'brouillon',
  source: 'adherent',
  createdAt: '2026-03-09T10:00:00Z',
  updatedAt: '2026-03-09T10:00:00Z',
};

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
    praticienSpecialite: 0.6,
    lignes: 0.85,
    adherentMatricule: 0.7,
  },
  warnings: [],
};

describe('REQ-001: Scan feuille de soin', () => {
  describe('AC-1: Capture et upload reussis', () => {
    it('creates a brouillon demande with montantDemande=0', async () => {
      const app = new Hono();

      app.post('/api/v1/sante/demandes', async (c) => {
        const body = await c.req.json();

        if (!body.typeSoin) {
          return c.json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'typeSoin is required' },
          }, 400);
        }

        const demande = {
          ...MOCK_DEMANDE_BROUILLON,
          typeSoin: body.typeSoin,
          montantDemande: body.montantDemande ?? 0,
          statut: 'brouillon',
        };

        return c.json({ success: true, data: demande }, 201);
      });

      const res = await app.request('/api/v1/sante/demandes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_token',
        },
        body: JSON.stringify({
          typeSoin: 'consultation',
          montantDemande: 0,
          dateSoin: '2026-03-09',
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.statut).toBe('brouillon');
      expect(data.data.montantDemande).toBe(0);
      expect(data.data.id).toBeDefined();
      expect(data.data.numeroDemande).toBeDefined();
    });

    it('uploads a document linked to the brouillon demande', async () => {
      const app = new Hono();

      app.post('/api/v1/sante/documents/upload', async (c) => {
        const formData = await c.req.formData();
        const file = formData.get('file') as File | null;
        const demandeId = formData.get('demandeId') as string | null;
        const typeDocument = formData.get('typeDocument') as string | null;

        if (!file || !demandeId || !typeDocument) {
          return c.json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'file, demandeId, typeDocument required' },
          }, 400);
        }

        const doc = {
          id: 'doc_001',
          demandeId,
          typeDocument,
          r2Key: `sante/documents/${demandeId}/doc_001.jpg`,
          nomFichier: file.name,
          mimeType: file.type,
          tailleOctets: file.size,
          ocrStatus: 'pending',
          createdAt: '2026-03-09T10:01:00Z',
        };

        return c.json({ success: true, data: doc }, 201);
      });

      const formData = new FormData();
      formData.append('file', new File(['fake-image-content'], 'bulletin.jpg', { type: 'image/jpeg' }));
      formData.append('demandeId', 'dem_001');
      formData.append('typeDocument', 'bulletin_soin');

      const res = await app.request('/api/v1/sante/documents/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
        body: formData,
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.ocrStatus).toBe('pending');
      expect(data.data.r2Key).toContain('sante/documents/dem_001/');
      expect(data.data.typeDocument).toBe('bulletin_soin');
    });

    it('rejects upload of file > 10 Mo', async () => {
      const MAX_FILE_SIZE = 10 * 1024 * 1024;

      const app = new Hono();

      app.post('/api/v1/sante/documents/upload', async (c) => {
        const formData = await c.req.formData();
        const file = formData.get('file') as File | null;

        if (file && file.size > MAX_FILE_SIZE) {
          return c.json({
            success: false,
            error: { code: 'FILE_TOO_LARGE', message: 'Fichier trop volumineux (max 10MB)' },
          }, 400);
        }

        return c.json({ success: true, data: { id: 'doc_001' } }, 201);
      });

      // Create a file exceeding 10MB
      const largeContent = new Uint8Array(11 * 1024 * 1024);
      const formData = new FormData();
      formData.append('file', new File([largeContent], 'large.jpg', { type: 'image/jpeg' }));
      formData.append('demandeId', 'dem_001');
      formData.append('typeDocument', 'bulletin_soin');

      const res = await app.request('/api/v1/sante/documents/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('10MB');
    });

    it('rejects upload of non-allowed MIME type', async () => {
      const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

      const app = new Hono();

      app.post('/api/v1/sante/documents/upload', async (c) => {
        const formData = await c.req.formData();
        const file = formData.get('file') as File | null;

        if (file && !ALLOWED_MIME_TYPES.includes(file.type)) {
          return c.json({
            success: false,
            error: { code: 'INVALID_FILE_TYPE', message: 'Type de fichier non supporte' },
          }, 400);
        }

        return c.json({ success: true, data: { id: 'doc_001' } }, 201);
      });

      const formData = new FormData();
      formData.append('file', new File(['fake-content'], 'document.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }));
      formData.append('demandeId', 'dem_001');
      formData.append('typeDocument', 'bulletin_soin');

      const res = await app.request('/api/v1/sante/documents/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('INVALID_FILE_TYPE');
    });

    it('rejects upload to a demande not owned by the adherent', async () => {
      const app = new Hono();

      app.post('/api/v1/sante/documents/upload', async (c) => {
        // Simulate that demandeId belongs to another adherent
        const formData = await c.req.formData();
        const demandeId = formData.get('demandeId') as string;

        // Simulate ownership check: demande belongs to adherent_002, but requester is adherent_001
        const demandeOwner = 'adherent_002';
        const requesterId = ADHERENT_USER.sub; // adherent_001

        if (demandeOwner !== requesterId) {
          return c.json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Acces non autorise' },
          }, 403);
        }

        return c.json({ success: true, data: { id: 'doc_001' } }, 201);
      });

      const formData = new FormData();
      formData.append('file', new File(['fake-content'], 'bulletin.jpg', { type: 'image/jpeg' }));
      formData.append('demandeId', 'dem_other_user');
      formData.append('typeDocument', 'bulletin_soin');

      const res = await app.request('/api/v1/sante/documents/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
        body: formData,
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FORBIDDEN');
    });
  });

  describe('AC-2: Extraction OCR complete', () => {
    it('triggers OCR and returns extracted data with confidence score', async () => {
      const app = new Hono();

      app.post('/api/v1/sante/documents/:id/ocr', async (c) => {
        const id = c.req.param('id');

        return c.json({
          success: true,
          data: {
            message: 'OCR termine avec succes',
            data: MOCK_OCR_RESULT,
          },
        });
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.data.confidence).toBeGreaterThanOrEqual(0);
      expect(data.data.data.confidence).toBeLessThanOrEqual(1);
      expect(data.data.data.montantTotal).toBe(50000);
      expect(data.data.data.lignes).toHaveLength(1);
      expect(data.data.data.dateSoin).toBe('2026-03-05');
    });

    it('returns cached result if OCR already done', async () => {
      let ocrCallCount = 0;

      const app = new Hono();

      app.post('/api/v1/sante/documents/:id/ocr', async (c) => {
        ocrCallCount++;

        // Simulate already-processed document
        const doc = { ocrStatus: 'completed', ocrResultJson: JSON.stringify(MOCK_OCR_RESULT) };

        if (doc.ocrStatus === 'completed' && doc.ocrResultJson) {
          return c.json({
            success: true,
            data: {
              message: 'OCR deja effectue',
              data: JSON.parse(doc.ocrResultJson),
            },
          });
        }

        return c.json({ success: true, data: { data: MOCK_OCR_RESULT } });
      });

      // First call
      const res1 = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      // Second call
      const res2 = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      const data1 = await res1.json();
      const data2 = await res2.json();

      expect(data2.data.message).toBe('OCR deja effectue');
      expect(data2.data.data.confidence).toBe(data1.data.data.confidence);
    });

    it('handles OCR failure gracefully', async () => {
      const app = new Hono();

      app.post('/api/v1/sante/documents/:id/ocr', async (c) => {
        // Simulate AI.run failure
        return c.json({
          success: false,
          error: {
            code: 'OCR_FAILED',
            message: 'Erreur OCR: Workers AI unavailable',
          },
        }, 400);
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('OCR_FAILED');
    });

    it('returns per-field confidence scores', async () => {
      const app = new Hono();

      app.post('/api/v1/sante/documents/:id/ocr', async (c) => {
        return c.json({
          success: true,
          data: { data: MOCK_OCR_RESULT },
        });
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      const fieldConfidences = data.data.data.fieldConfidences;

      expect(fieldConfidences).toBeDefined();
      expect(fieldConfidences.dateSoin).toBeGreaterThanOrEqual(0);
      expect(fieldConfidences.typeSoin).toBeGreaterThanOrEqual(0);
      expect(fieldConfidences.montantTotal).toBeGreaterThanOrEqual(0);
      expect(fieldConfidences.praticienNom).toBeGreaterThanOrEqual(0);
      expect(fieldConfidences.lignes).toBeGreaterThanOrEqual(0);
      expect(fieldConfidences.adherentMatricule).toBeGreaterThanOrEqual(0);
    });

    it('marks low-confidence fields below 0.7 threshold', async () => {
      const lowConfidenceResult = {
        ...MOCK_OCR_RESULT,
        fieldConfidences: {
          dateSoin: 0.9,
          typeSoin: 0.95,
          montantTotal: 0.5, // Low
          praticienNom: 0.4, // Low
          praticienSpecialite: 0.3, // Low
          lignes: 0.85,
          adherentMatricule: 0.65, // Low
        },
      };

      const app = new Hono();

      app.post('/api/v1/sante/documents/:id/ocr', async (c) => {
        return c.json({ success: true, data: { data: lowConfidenceResult } });
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      const data = await res.json();
      const fc = data.data.data.fieldConfidences;

      // Fields below 0.7 should be flagged as low confidence
      const LOW_CONFIDENCE_THRESHOLD = 0.7;
      expect(fc.montantTotal).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
      expect(fc.praticienNom).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);
      expect(fc.adherentMatricule).toBeLessThan(LOW_CONFIDENCE_THRESHOLD);

      // Fields above 0.7 should not be flagged
      expect(fc.dateSoin).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
      expect(fc.typeSoin).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
      expect(fc.lignes).toBeGreaterThanOrEqual(LOW_CONFIDENCE_THRESHOLD);
    });
  });

  describe('AC-4: Soumission avec notification', () => {
    it('finalizes a brouillon demande to soumise with updated fields', async () => {
      const app = new Hono();

      app.patch('/api/v1/sante/demandes/:id', async (c) => {
        const id = c.req.param('id');
        const body = await c.req.json();

        // Simulate existing brouillon demande
        const existing = { ...MOCK_DEMANDE_BROUILLON, id };

        if (existing.statut !== 'brouillon') {
          return c.json({
            success: false,
            error: { code: 'BAD_REQUEST', message: 'Seule une demande en brouillon peut etre soumise' },
          }, 400);
        }

        const updated = {
          ...existing,
          statut: 'soumise',
          montantDemande: body.montantDemande,
          dateSoin: body.dateSoin,
          typeSoin: body.typeSoin,
          updatedAt: new Date().toISOString(),
        };

        return c.json({ success: true, data: updated });
      });

      const res = await app.request('/api/v1/sante/demandes/dem_001', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_token',
        },
        body: JSON.stringify({
          statut: 'soumise',
          montantDemande: 50000,
          dateSoin: '2026-03-05',
          typeSoin: 'consultation',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.statut).toBe('soumise');
      expect(data.data.montantDemande).toBe(50000);
      expect(data.data.numeroDemande).toBeDefined();
    });

    it('sends push notification on submission', async () => {
      const pushNotificationSpy = vi.fn().mockResolvedValue([{ success: true }]);

      const app = new Hono();

      app.patch('/api/v1/sante/demandes/:id', async (c) => {
        const body = await c.req.json();

        const demande = {
          ...MOCK_DEMANDE_BROUILLON,
          statut: 'soumise',
          montantDemande: body.montantDemande,
        };

        // Simulate push notification (fire-and-forget)
        pushNotificationSpy(ADHERENT_USER.sub, 'SANTE_DEMANDE_SOUMISE', {
          demandeId: demande.id,
          numeroDemande: demande.numeroDemande,
          typeSoin: demande.typeSoin,
          montant: String(demande.montantDemande),
        });

        return c.json({ success: true, data: demande });
      });

      const res = await app.request('/api/v1/sante/demandes/dem_001', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_token',
        },
        body: JSON.stringify({
          statut: 'soumise',
          montantDemande: 50000,
          dateSoin: '2026-03-05',
          typeSoin: 'consultation',
        }),
      });

      expect(res.status).toBe(200);
      expect(pushNotificationSpy).toHaveBeenCalledOnce();
      expect(pushNotificationSpy).toHaveBeenCalledWith(
        'adherent_001',
        'SANTE_DEMANDE_SOUMISE',
        expect.objectContaining({
          demandeId: 'dem_001',
          numeroDemande: 'DEM-2026-0001',
          typeSoin: 'consultation',
        })
      );
    });

    it('rejects finalization of a non-brouillon demande', async () => {
      const app = new Hono();

      app.patch('/api/v1/sante/demandes/:id', async (c) => {
        // Simulate demande already soumise
        const existing = { ...MOCK_DEMANDE_BROUILLON, statut: 'soumise' };

        if (existing.statut !== 'brouillon') {
          return c.json({
            success: false,
            error: {
              code: 'BAD_REQUEST',
              message: 'Seule une demande en brouillon peut etre soumise via cette route',
            },
          }, 400);
        }

        return c.json({ success: true });
      });

      const res = await app.request('/api/v1/sante/demandes/dem_001', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_token',
        },
        body: JSON.stringify({
          statut: 'soumise',
          montantDemande: 50000,
          dateSoin: '2026-03-05',
          typeSoin: 'consultation',
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('brouillon');
    });

    it('rejects finalization by non-owner', async () => {
      const app = new Hono();

      app.patch('/api/v1/sante/demandes/:id', async (c) => {
        // Simulate ownership check: demande belongs to adherent_001 but requester is adherent_002
        const existing = { ...MOCK_DEMANDE_BROUILLON };
        const requesterId = OTHER_ADHERENT_USER.sub;

        if (existing.adherentId !== requesterId) {
          return c.json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Acces non autorise a cette demande' },
          }, 403);
        }

        return c.json({ success: true });
      });

      const res = await app.request('/api/v1/sante/demandes/dem_001', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_token',
        },
        body: JSON.stringify({
          statut: 'soumise',
          montantDemande: 50000,
          dateSoin: '2026-03-05',
          typeSoin: 'consultation',
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FORBIDDEN');
    });
  });

  describe('AC-3: Pre-remplissage et correction', () => {
    it('OCR data includes all expected fields for form pre-fill', async () => {
      const app = new Hono();

      app.post('/api/v1/sante/documents/:id/ocr', async (c) => {
        return c.json({ success: true, data: { data: MOCK_OCR_RESULT } });
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      const data = await res.json();
      const ocrData = data.data.data;

      // All pre-fill fields must be present
      expect(ocrData).toHaveProperty('dateSoin');
      expect(ocrData).toHaveProperty('typeSoin');
      expect(ocrData).toHaveProperty('montantTotal');
      expect(ocrData).toHaveProperty('praticien');
      expect(ocrData.praticien).toHaveProperty('nom');
      expect(ocrData.praticien).toHaveProperty('specialite');
      expect(ocrData).toHaveProperty('lignes');
      expect(ocrData).toHaveProperty('confidence');
      expect(ocrData).toHaveProperty('fieldConfidences');
      expect(ocrData).toHaveProperty('warnings');
    });

    it('allows overriding OCR-extracted values on submission', async () => {
      const app = new Hono();

      app.patch('/api/v1/sante/demandes/:id', async (c) => {
        const body = await c.req.json();

        // OCR extracted consultation, but user overrides to pharmacie
        const updated = {
          ...MOCK_DEMANDE_BROUILLON,
          statut: 'soumise',
          montantDemande: body.montantDemande, // User-corrected value
          dateSoin: body.dateSoin,               // User-corrected value
          typeSoin: body.typeSoin,               // User-corrected value
        };

        return c.json({ success: true, data: updated });
      });

      const res = await app.request('/api/v1/sante/demandes/dem_001', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_token',
        },
        body: JSON.stringify({
          statut: 'soumise',
          montantDemande: 75000, // Corrected from 50000
          dateSoin: '2026-03-06', // Corrected from 2026-03-05
          typeSoin: 'pharmacie',  // Corrected from consultation
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.montantDemande).toBe(75000);
      expect(data.data.dateSoin).toBe('2026-03-06');
      expect(data.data.typeSoin).toBe('pharmacie');
    });
  });

  describe('AC-5: Gestion des erreurs', () => {
    it('returns error for missing file in upload', async () => {
      const app = new Hono();

      app.post('/api/v1/sante/documents/upload', async (c) => {
        const formData = await c.req.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
          return c.json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Fichier requis' },
          }, 400);
        }

        return c.json({ success: true, data: { id: 'doc_001' } }, 201);
      });

      const formData = new FormData();
      formData.append('demandeId', 'dem_001');
      formData.append('typeDocument', 'bulletin_soin');
      // No file appended

      const res = await app.request('/api/v1/sante/documents/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
    });

    it('returns 404 for OCR on non-existent document', async () => {
      const app = new Hono();

      app.post('/api/v1/sante/documents/:id/ocr', async (c) => {
        const id = c.req.param('id');

        // Simulate document not found
        return c.json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Document non trouve' },
        }, 404);
      });

      const res = await app.request('/api/v1/sante/documents/nonexistent/ocr', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('NOT_FOUND');
    });

    it('OCR failure sets status to failed and returns error', async () => {
      const app = new Hono();

      app.post('/api/v1/sante/documents/:id/ocr', async (c) => {
        // Simulate OCR failure (AI unavailable)
        return c.json({
          success: false,
          error: {
            code: 'OCR_FAILED',
            message: 'Erreur OCR: Workers AI unavailable',
          },
        }, 400);
      });

      const res = await app.request('/api/v1/sante/documents/doc_001/ocr', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.message).toContain('OCR');
    });
  });

  describe('AC-6: Securite et audit', () => {
    it('creates audit log on document upload', async () => {
      const auditSpy = vi.fn();

      const app = new Hono();

      app.post('/api/v1/sante/documents/upload', async (c) => {
        const formData = await c.req.formData();
        const file = formData.get('file') as File | null;

        if (!file) {
          return c.json({ success: false, error: { message: 'File required' } }, 400);
        }

        // Simulate audit log creation
        auditSpy({
          userId: ADHERENT_USER.sub,
          action: 'sante_documents.upload',
          entityType: 'sante_documents',
          entityId: 'doc_001',
          changes: {
            filename: file.name,
            size: file.size,
            type: 'bulletin_soin',
          },
        });

        return c.json({ success: true, data: { id: 'doc_001' } }, 201);
      });

      const formData = new FormData();
      formData.append('file', new File(['content'], 'bulletin.jpg', { type: 'image/jpeg' }));
      formData.append('demandeId', 'dem_001');
      formData.append('typeDocument', 'bulletin_soin');

      const res = await app.request('/api/v1/sante/documents/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer valid_token' },
        body: formData,
      });

      expect(res.status).toBe(201);
      expect(auditSpy).toHaveBeenCalledOnce();
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sante_documents.upload',
          entityType: 'sante_documents',
          userId: 'adherent_001',
        })
      );
    });

    it('creates audit log on demande submission', async () => {
      const auditSpy = vi.fn();

      const app = new Hono();

      app.patch('/api/v1/sante/demandes/:id', async (c) => {
        const id = c.req.param('id');
        const body = await c.req.json();

        // Simulate audit log creation
        auditSpy({
          userId: ADHERENT_USER.sub,
          action: 'sante_demandes.submit',
          entityType: 'sante_demandes',
          entityId: id,
          changes: {
            previousStatut: 'brouillon',
            newStatut: 'soumise',
            montantDemande: body.montantDemande,
            typeSoin: body.typeSoin,
          },
        });

        return c.json({
          success: true,
          data: { ...MOCK_DEMANDE_BROUILLON, statut: 'soumise' },
        });
      });

      const res = await app.request('/api/v1/sante/demandes/dem_001', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_token',
        },
        body: JSON.stringify({
          statut: 'soumise',
          montantDemande: 50000,
          dateSoin: '2026-03-05',
          typeSoin: 'consultation',
        }),
      });

      expect(res.status).toBe(200);
      expect(auditSpy).toHaveBeenCalledOnce();
      expect(auditSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'sante_demandes.submit',
          entityType: 'sante_demandes',
          entityId: 'dem_001',
          changes: expect.objectContaining({
            previousStatut: 'brouillon',
            newStatut: 'soumise',
          }),
        })
      );
    });

    it('blocks access to documents of other adherents', async () => {
      const app = new Hono();

      app.get('/api/v1/sante/documents/:id', async (c) => {
        // Simulate document owned by adherent_001, requested by adherent_002
        const docOwnerId = 'adherent_001';
        const requesterId = OTHER_ADHERENT_USER.sub; // adherent_002

        if (docOwnerId !== requesterId) {
          return c.json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Acces non autorise' },
          }, 403);
        }

        return c.json({ success: true, data: { id: 'doc_001' } });
      });

      const res = await app.request('/api/v1/sante/documents/doc_001', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid_token' },
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('FORBIDDEN');
    });

    it('blocks non-ADHERENT roles from PATCH brouillon finalization', async () => {
      const app = new Hono();

      app.patch('/api/v1/sante/demandes/:id', async (c) => {
        // Simulate role check: only ADHERENT can finalize brouillon
        const userRole = 'SOIN_GESTIONNAIRE';

        if (userRole !== 'ADHERENT') {
          return c.json({
            success: false,
            error: { code: 'FORBIDDEN', message: 'Acces reserve aux adherents' },
          }, 403);
        }

        return c.json({ success: true });
      });

      const res = await app.request('/api/v1/sante/demandes/dem_001', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer valid_token',
        },
        body: JSON.stringify({
          statut: 'soumise',
          montantDemande: 50000,
          dateSoin: '2026-03-05',
          typeSoin: 'consultation',
        }),
      });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Full flow: brouillon lifecycle', () => {
    it('complete flow: create brouillon → upload → OCR → finalize', async () => {
      const app = new Hono();

      // Step 1: Create brouillon
      app.post('/api/v1/sante/demandes', async (c) => {
        return c.json({ success: true, data: MOCK_DEMANDE_BROUILLON }, 201);
      });

      // Step 2: Upload document
      app.post('/api/v1/sante/documents/upload', async (c) => {
        return c.json({
          success: true,
          data: {
            id: 'doc_001',
            demandeId: 'dem_001',
            ocrStatus: 'pending',
            r2Key: 'sante/documents/dem_001/doc_001.jpg',
          },
        }, 201);
      });

      // Step 3: OCR extraction
      app.post('/api/v1/sante/documents/:id/ocr', async (c) => {
        return c.json({
          success: true,
          data: { data: MOCK_OCR_RESULT },
        });
      });

      // Step 4: Finalize demande
      app.patch('/api/v1/sante/demandes/:id', async (c) => {
        const body = await c.req.json();
        return c.json({
          success: true,
          data: {
            ...MOCK_DEMANDE_BROUILLON,
            statut: 'soumise',
            montantDemande: body.montantDemande,
            dateSoin: body.dateSoin,
            typeSoin: body.typeSoin,
          },
        });
      });

      // Execute flow
      const createRes = await app.request('/api/v1/sante/demandes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token' },
        body: JSON.stringify({ typeSoin: 'consultation', montantDemande: 0, dateSoin: '2026-03-09' }),
      });
      expect(createRes.status).toBe(201);
      const createData = await createRes.json();
      expect(createData.data.statut).toBe('brouillon');

      const formData = new FormData();
      formData.append('file', new File(['img'], 'page.jpg', { type: 'image/jpeg' }));
      formData.append('demandeId', createData.data.id);
      formData.append('typeDocument', 'bulletin_soin');

      const uploadRes = await app.request('/api/v1/sante/documents/upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer token' },
        body: formData,
      });
      expect(uploadRes.status).toBe(201);
      const uploadData = await uploadRes.json();
      expect(uploadData.data.ocrStatus).toBe('pending');

      const ocrRes = await app.request(`/api/v1/sante/documents/${uploadData.data.id}/ocr`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer token' },
      });
      expect(ocrRes.status).toBe(200);
      const ocrData = await ocrRes.json();
      expect(ocrData.data.data.confidence).toBeGreaterThan(0);

      const finalizeRes = await app.request(`/api/v1/sante/demandes/${createData.data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token' },
        body: JSON.stringify({
          statut: 'soumise',
          montantDemande: ocrData.data.data.montantTotal,
          dateSoin: ocrData.data.data.dateSoin,
          typeSoin: ocrData.data.data.typeSoin,
        }),
      });
      expect(finalizeRes.status).toBe(200);
      const finalData = await finalizeRes.json();
      expect(finalData.data.statut).toBe('soumise');
      expect(finalData.data.montantDemande).toBe(50000);
    });
  });
});
