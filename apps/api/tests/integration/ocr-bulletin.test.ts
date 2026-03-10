/**
 * REQ-011 TASK-009: OCR bulletin pipeline — Integration Tests
 *
 * End-to-end tests covering: upload → trigger OCR → retrieve result,
 * including error scenarios and RBAC enforcement.
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import type { BulletinExtractedData } from '../../src/agents/ocr/ocr.types';
import {
  calculateConfidence,
  calculateFieldConfidences,
  validateExtractedData,
  detectLanguage,
} from '../../src/agents/ocr/ocr.rules';
import { deriveImageQuality } from '../../src/agents/ocr/ocr.agent';

// --- Fixtures: realistic Tunisian OCR results ---

const FRENCH_BULLETIN_RESULT: BulletinExtractedData = {
  dateSoin: '2026-02-20',
  typeSoin: 'pharmacie',
  montantTotal: 45500,
  praticien: { nom: 'Pharmacie Ibn Sina', specialite: 'Pharmacie', adresse: 'Rue de la Liberte, Tunis' },
  lignes: [
    { libelle: 'Doliprane 1000mg', quantite: 2, prixUnitaire: 5500, montantTotal: 11000 },
    { libelle: 'Augmentin 1g', quantite: 1, prixUnitaire: 12500, montantTotal: 12500 },
    { libelle: 'Voltarene 75mg', quantite: 1, prixUnitaire: 8000, montantTotal: 8000 },
    { libelle: 'Spasfon Lyoc', quantite: 1, prixUnitaire: 14000, montantTotal: 14000 },
  ],
  adherentNom: 'Fatma Ben Salah',
  adherentMatricule: '12345678A',
  language: 'fr',
  confidence: 0,
  warnings: [],
};

const ARABIC_BULLETIN_RESULT: BulletinExtractedData = {
  dateSoin: '2026-01-10',
  typeSoin: 'consultation',
  montantTotal: 60000,
  praticien: { nom: 'Dr. Mohamed Al-Hadi', specialite: 'Medecine generale' },
  lignes: [
    { libelle: 'Consultation generale', quantite: 1, prixUnitaire: 60000, montantTotal: 60000 },
  ],
  adherentNom: 'Khaled Bouazizi',
  language: 'ar',
  confidence: 0,
  warnings: [],
};

const BLURRY_IMAGE_RESULT: BulletinExtractedData = {
  montantTotal: 0,
  lignes: [],
  confidence: 0,
  warnings: ['Impossible de parser la reponse AI', 'Extraction automatique non disponible'],
};

// --- Mock OCR Pipeline App ---

interface MockDocument {
  id: string;
  demandeId: string;
  ocrStatus: 'pending' | 'processing' | 'completed' | 'failed';
  ocrAttempts: number;
  ocrResultJson: string | null;
  adherentId: string;
  uploadedBy: string;
  mimeType: string;
  tailleOctets: number;
}

interface AuditEntry {
  userId: string;
  action: string;
  resourceId: string;
  timestamp: string;
}

function createFullPipelineApp(options: {
  docs: MockDocument[];
  aiResponse?: BulletinExtractedData;
  aiError?: boolean;
}) {
  const docs = options.docs.map(d => ({ ...d }));
  const auditLog: AuditEntry[] = [];
  const app = new Hono();

  // POST /upload — simulate document upload
  app.post('/api/v1/sante/documents/upload', async (c) => {
    const userId = c.req.header('x-user-id') || 'adherent_001';
    const newDoc: MockDocument = {
      id: `doc_${Date.now()}`,
      demandeId: 'dem_001',
      ocrStatus: 'pending',
      ocrAttempts: 0,
      ocrResultJson: null,
      adherentId: userId,
      uploadedBy: userId,
      mimeType: 'image/jpeg',
      tailleOctets: 500000,
    };
    docs.push(newDoc);

    auditLog.push({
      userId,
      action: 'DOCUMENT_UPLOADED',
      resourceId: newDoc.id,
      timestamp: new Date().toISOString(),
    });

    return c.json({
      success: true,
      data: { id: newDoc.id, ocrStatus: 'pending' },
    }, 201);
  });

  // POST /:id/ocr — trigger OCR
  app.post('/api/v1/sante/documents/:id/ocr', async (c) => {
    const id = c.req.param('id');
    const userId = c.req.header('x-user-id') || 'adherent_001';
    const doc = docs.find(d => d.id === id);

    if (!doc) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Document introuvable' } }, 404);
    }

    if (doc.ocrStatus === 'processing') {
      return c.json({
        success: false,
        error: { code: 'OCR_ALREADY_PROCESSING', message: 'Un traitement OCR est deja en cours' },
      }, 409);
    }

    if (doc.ocrAttempts >= 5) {
      return c.json({
        success: false,
        error: { code: 'OCR_MAX_ATTEMPTS_REACHED', message: 'Nombre maximum de tentatives OCR atteint (5)' },
      }, 429);
    }

    const forceReprocess = c.req.query('force') === 'true';
    if (!forceReprocess && doc.ocrStatus === 'completed' && doc.ocrResultJson) {
      return c.json({ success: true, data: { message: 'OCR deja effectue', data: JSON.parse(doc.ocrResultJson) } });
    }

    doc.ocrAttempts += 1;
    doc.ocrStatus = 'processing';

    // Simulate AI processing
    if (options.aiError) {
      doc.ocrStatus = 'failed';
      auditLog.push({ userId, action: 'OCR_FAILED', resourceId: doc.id, timestamp: new Date().toISOString() });
      return c.json({
        success: true,
        data: { message: 'OCR echoue', data: { montantTotal: 0, lignes: [], confidence: 0, warnings: ['AI unavailable'] } },
      });
    }

    const aiResult = options.aiResponse ?? FRENCH_BULLETIN_RESULT;

    // Run through the real rules pipeline
    const withConfidence: BulletinExtractedData = {
      ...aiResult,
      confidence: calculateConfidence(aiResult),
      fieldConfidences: calculateFieldConfidences({ ...aiResult, confidence: 0, warnings: [] }),
    };
    const validated = validateExtractedData(withConfidence);
    validated.metadata = {
      imageQuality: deriveImageQuality(validated.confidence),
      processingTimeMs: 150,
      modelVersion: '@cf/meta/llama-3.2-11b-vision-instruct',
    };

    doc.ocrStatus = 'completed';
    doc.ocrResultJson = JSON.stringify(validated);

    auditLog.push({ userId, action: 'OCR_COMPLETED', resourceId: doc.id, timestamp: new Date().toISOString() });

    return c.json({ success: true, data: { message: 'OCR termine avec succes', data: validated } });
  });

  // GET /:id/ocr — retrieve OCR result
  app.get('/api/v1/sante/documents/:id/ocr', async (c) => {
    const id = c.req.param('id');
    const requesterId = c.req.header('x-user-id') || 'adherent_001';
    const requesterRole = c.req.header('x-user-role') || 'ADHERENT';
    const doc = docs.find(d => d.id === id);

    if (!doc) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Document introuvable' } }, 404);
    }

    // RBAC
    if (requesterRole === 'ADHERENT' && doc.adherentId !== requesterId) {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: 'Acces non autorise' } }, 403);
    }

    const data: Record<string, unknown> = {
      documentId: doc.id,
      ocrStatus: doc.ocrStatus,
      ocrAttempts: doc.ocrAttempts,
    };

    if (doc.ocrStatus === 'completed' && doc.ocrResultJson) {
      data.ocrResultJson = doc.ocrResultJson;
    }

    if (doc.ocrStatus === 'failed') {
      data.error = { code: 'OCR_EXTRACTION_FAILED', message: "L'extraction OCR a echoue" };
    }

    return c.json({ success: true, data });
  });

  // Helper: get audit log
  app.get('/api/v1/internal/audit', async (c) => {
    return c.json({ success: true, data: auditLog });
  });

  return { app, docs, auditLog };
}

// --- Tests ---

describe('REQ-011 TASK-009: OCR bulletin pipeline integration', () => {
  describe('AC-1: Happy path — French bulletin', () => {
    it('extracts data from a French bulletin with high confidence', async () => {
      const { app } = createFullPipelineApp({ docs: [], aiResponse: FRENCH_BULLETIN_RESULT });

      // 1. Upload document
      const uploadRes = await app.request('/api/v1/sante/documents/upload', {
        method: 'POST',
        headers: { 'x-user-id': 'adherent_001', 'Content-Type': 'multipart/form-data' },
      });
      expect(uploadRes.status).toBe(201);
      const uploadBody = await uploadRes.json() as { data: { id: string } };
      const docId = uploadBody.data.id;

      // 2. Trigger OCR
      const ocrRes = await app.request(`/api/v1/sante/documents/${docId}/ocr`, {
        method: 'POST',
        headers: { 'x-user-id': 'adherent_001' },
      });
      expect(ocrRes.status).toBe(200);
      const ocrBody = await ocrRes.json() as { success: boolean; data: { data: BulletinExtractedData } };
      expect(ocrBody.success).toBe(true);

      const extracted = ocrBody.data.data;
      expect(extracted.dateSoin).toBe('2026-02-20');
      expect(extracted.typeSoin).toBe('pharmacie');
      expect(extracted.praticien?.nom).toBe('Pharmacie Ibn Sina');
      expect(extracted.lignes).toHaveLength(4);
      expect(extracted.montantTotal).toBe(45500);
      expect(extracted.confidence).toBeGreaterThanOrEqual(0.7);
      expect(extracted.fieldConfidences).toBeDefined();

      // 3. GET result (polling endpoint)
      const getRes = await app.request(`/api/v1/sante/documents/${docId}/ocr`, {
        headers: { 'x-user-id': 'adherent_001', 'x-user-role': 'ADHERENT' },
      });
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json() as { data: { ocrStatus: string; ocrResultJson: string } };
      expect(getBody.data.ocrStatus).toBe('completed');
      expect(getBody.data.ocrResultJson).toBeDefined();

      // Verify stored result
      const storedResult = JSON.parse(getBody.data.ocrResultJson) as BulletinExtractedData;
      expect(storedResult.dateSoin).toBe('2026-02-20');
      expect(storedResult.metadata?.imageQuality).toBeDefined();
      expect(storedResult.metadata?.processingTimeMs).toBeGreaterThan(0);
      expect(storedResult.metadata?.modelVersion).toContain('llama');
    });
  });

  describe('AC-2: Arabic bulletin with language detection', () => {
    it('extracts data from an Arabic bulletin and detects language', async () => {
      const { app } = createFullPipelineApp({ docs: [], aiResponse: ARABIC_BULLETIN_RESULT });

      // Upload
      const uploadRes = await app.request('/api/v1/sante/documents/upload', {
        method: 'POST',
        headers: { 'x-user-id': 'adherent_001' },
      });
      const uploadBody = await uploadRes.json() as { data: { id: string } };
      const docId = uploadBody.data.id;

      // Trigger OCR
      const ocrRes = await app.request(`/api/v1/sante/documents/${docId}/ocr`, {
        method: 'POST',
        headers: { 'x-user-id': 'adherent_001' },
      });
      const ocrBody = await ocrRes.json() as { data: { data: BulletinExtractedData } };

      expect(ocrBody.data.data.language).toBe('ar');
      expect(ocrBody.data.data.confidence).toBeGreaterThanOrEqual(0.6);
      expect(ocrBody.data.data.praticien?.nom).toBe('Dr. Mohamed Al-Hadi');
    });

    it('detectLanguage returns ar for Arabic text', () => {
      expect(detectLanguage('صيدلية المركزية تونس')).toBe('ar');
    });

    it('detectLanguage returns fr-ar for mixed text', () => {
      expect(detectLanguage('Pharmacie صيدلية Centrale المركزية')).toBe('fr-ar');
    });
  });

  describe('AC-3: Bad image quality', () => {
    it('returns low confidence for unreadable image (AI failure)', async () => {
      const { app } = createFullPipelineApp({ docs: [], aiError: true });

      const uploadRes = await app.request('/api/v1/sante/documents/upload', {
        method: 'POST',
        headers: { 'x-user-id': 'adherent_001' },
      });
      const uploadBody = await uploadRes.json() as { data: { id: string } };
      const docId = uploadBody.data.id;

      const ocrRes = await app.request(`/api/v1/sante/documents/${docId}/ocr`, {
        method: 'POST',
        headers: { 'x-user-id': 'adherent_001' },
      });
      const ocrBody = await ocrRes.json() as { data: { data: BulletinExtractedData } };

      expect(ocrBody.data.data.confidence).toBe(0);
      expect(ocrBody.data.data.warnings.length).toBeGreaterThan(0);
    });

    it('derives poor image quality from low confidence', () => {
      expect(deriveImageQuality(0.3)).toBe('poor');
      expect(deriveImageQuality(0.0)).toBe('poor');
    });

    it('derives acceptable image quality from medium confidence', () => {
      expect(deriveImageQuality(0.6)).toBe('acceptable');
    });
  });

  describe('AC-4: Concurrent processing lock', () => {
    it('rejects concurrent OCR request with 409', async () => {
      const { app } = createFullPipelineApp({
        docs: [{
          id: 'doc_processing',
          demandeId: 'dem_001',
          ocrStatus: 'processing',
          ocrAttempts: 1,
          ocrResultJson: null,
          adherentId: 'adherent_001',
          uploadedBy: 'adherent_001',
          mimeType: 'image/jpeg',
          tailleOctets: 500000,
        }],
      });

      const res = await app.request('/api/v1/sante/documents/doc_processing/ocr', {
        method: 'POST',
        headers: { 'x-user-id': 'adherent_001' },
      });

      expect(res.status).toBe(409);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('OCR_ALREADY_PROCESSING');
    });
  });

  describe('AC-4 (bis): Attempt limit', () => {
    it('rejects OCR after 5 attempts with 429', async () => {
      const { app } = createFullPipelineApp({
        docs: [{
          id: 'doc_exhausted',
          demandeId: 'dem_001',
          ocrStatus: 'failed',
          ocrAttempts: 5,
          ocrResultJson: null,
          adherentId: 'adherent_001',
          uploadedBy: 'adherent_001',
          mimeType: 'image/jpeg',
          tailleOctets: 500000,
        }],
      });

      const res = await app.request('/api/v1/sante/documents/doc_exhausted/ocr', {
        method: 'POST',
        headers: { 'x-user-id': 'adherent_001' },
      });

      expect(res.status).toBe(429);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('OCR_MAX_ATTEMPTS_REACHED');
    });
  });

  describe('AC-5: GET result polling', () => {
    it('returns structured result via GET /:id/ocr after completion', async () => {
      const { app } = createFullPipelineApp({ docs: [], aiResponse: FRENCH_BULLETIN_RESULT });

      // Upload + OCR
      const uploadRes = await app.request('/api/v1/sante/documents/upload', {
        method: 'POST',
        headers: { 'x-user-id': 'adherent_001' },
      });
      const docId = ((await uploadRes.json()) as { data: { id: string } }).data.id;

      await app.request(`/api/v1/sante/documents/${docId}/ocr`, {
        method: 'POST',
        headers: { 'x-user-id': 'adherent_001' },
      });

      // GET result
      const getRes = await app.request(`/api/v1/sante/documents/${docId}/ocr`, {
        headers: { 'x-user-id': 'adherent_001', 'x-user-role': 'ADHERENT' },
      });
      expect(getRes.status).toBe(200);
      const body = await getRes.json() as { data: { ocrStatus: string; ocrResultJson: string } };
      expect(body.data.ocrStatus).toBe('completed');

      const result = JSON.parse(body.data.ocrResultJson) as BulletinExtractedData;
      expect(result.fieldConfidences).toBeDefined();
      expect(result.dateSoin).toBeDefined();
      expect(result.lignes.length).toBeGreaterThan(0);
    });

    it('returns pending status before OCR is triggered', async () => {
      const { app } = createFullPipelineApp({
        docs: [{
          id: 'doc_pending',
          demandeId: 'dem_001',
          ocrStatus: 'pending',
          ocrAttempts: 0,
          ocrResultJson: null,
          adherentId: 'adherent_001',
          uploadedBy: 'adherent_001',
          mimeType: 'image/jpeg',
          tailleOctets: 500000,
        }],
      });

      const res = await app.request('/api/v1/sante/documents/doc_pending/ocr', {
        headers: { 'x-user-id': 'adherent_001', 'x-user-role': 'ADHERENT' },
      });
      const body = await res.json() as { data: { ocrStatus: string } };
      expect(body.data.ocrStatus).toBe('pending');
    });
  });

  describe('AC-6: RBAC enforcement', () => {
    it('prevents adherent from accessing another users document OCR', async () => {
      const { app } = createFullPipelineApp({
        docs: [{
          id: 'doc_other_user',
          demandeId: 'dem_001',
          ocrStatus: 'completed',
          ocrAttempts: 1,
          ocrResultJson: JSON.stringify(FRENCH_BULLETIN_RESULT),
          adherentId: 'adherent_001',
          uploadedBy: 'adherent_001',
          mimeType: 'image/jpeg',
          tailleOctets: 500000,
        }],
      });

      const res = await app.request('/api/v1/sante/documents/doc_other_user/ocr', {
        headers: { 'x-user-id': 'adherent_999', 'x-user-role': 'ADHERENT' },
      });

      expect(res.status).toBe(403);
      const body = await res.json() as { error: { code: string } };
      expect(body.error.code).toBe('FORBIDDEN');
    });

    it('allows ADMIN to access any document OCR', async () => {
      const { app } = createFullPipelineApp({
        docs: [{
          id: 'doc_admin_access',
          demandeId: 'dem_001',
          ocrStatus: 'completed',
          ocrAttempts: 1,
          ocrResultJson: JSON.stringify(FRENCH_BULLETIN_RESULT),
          adherentId: 'adherent_001',
          uploadedBy: 'adherent_001',
          mimeType: 'image/jpeg',
          tailleOctets: 500000,
        }],
      });

      const res = await app.request('/api/v1/sante/documents/doc_admin_access/ocr', {
        headers: { 'x-user-id': 'admin_001', 'x-user-role': 'ADMIN' },
      });

      expect(res.status).toBe(200);
      const body = await res.json() as { success: boolean };
      expect(body.success).toBe(true);
    });

    it('allows INSURER_AGENT to access any document OCR', async () => {
      const { app } = createFullPipelineApp({
        docs: [{
          id: 'doc_insurer_access',
          demandeId: 'dem_001',
          ocrStatus: 'completed',
          ocrAttempts: 1,
          ocrResultJson: JSON.stringify(FRENCH_BULLETIN_RESULT),
          adherentId: 'adherent_001',
          uploadedBy: 'adherent_001',
          mimeType: 'image/jpeg',
          tailleOctets: 500000,
        }],
      });

      const res = await app.request('/api/v1/sante/documents/doc_insurer_access/ocr', {
        headers: { 'x-user-id': 'agent_001', 'x-user-role': 'INSURER_AGENT' },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('AC-6: Audit trail', () => {
    it('creates audit log entry on OCR completion', async () => {
      const { app, auditLog } = createFullPipelineApp({ docs: [], aiResponse: FRENCH_BULLETIN_RESULT });

      // Upload
      const uploadRes = await app.request('/api/v1/sante/documents/upload', {
        method: 'POST',
        headers: { 'x-user-id': 'adherent_001' },
      });
      const docId = ((await uploadRes.json()) as { data: { id: string } }).data.id;

      // Trigger OCR
      await app.request(`/api/v1/sante/documents/${docId}/ocr`, {
        method: 'POST',
        headers: { 'x-user-id': 'adherent_001' },
      });

      // Verify audit entries
      expect(auditLog.length).toBeGreaterThanOrEqual(2);

      const uploadAudit = auditLog.find(a => a.action === 'DOCUMENT_UPLOADED');
      expect(uploadAudit).toBeDefined();
      expect(uploadAudit!.userId).toBe('adherent_001');
      expect(uploadAudit!.resourceId).toBe(docId);

      const ocrAudit = auditLog.find(a => a.action === 'OCR_COMPLETED');
      expect(ocrAudit).toBeDefined();
      expect(ocrAudit!.userId).toBe('adherent_001');
      expect(ocrAudit!.resourceId).toBe(docId);
      expect(ocrAudit!.timestamp).toBeDefined();
    });

    it('creates audit log entry on OCR failure', async () => {
      const { app, auditLog } = createFullPipelineApp({ docs: [], aiError: true });

      const uploadRes = await app.request('/api/v1/sante/documents/upload', {
        method: 'POST',
        headers: { 'x-user-id': 'adherent_001' },
      });
      const docId = ((await uploadRes.json()) as { data: { id: string } }).data.id;

      await app.request(`/api/v1/sante/documents/${docId}/ocr`, {
        method: 'POST',
        headers: { 'x-user-id': 'adherent_001' },
      });

      const failAudit = auditLog.find(a => a.action === 'OCR_FAILED');
      expect(failAudit).toBeDefined();
      expect(failAudit!.resourceId).toBe(docId);
    });
  });

  describe('Rules pipeline validation', () => {
    it('calculateConfidence returns high score for complete French bulletin', () => {
      const confidence = calculateConfidence(FRENCH_BULLETIN_RESULT);
      expect(confidence).toBeGreaterThanOrEqual(0.9);
    });

    it('calculateFieldConfidences marks all fields present', () => {
      const fc = calculateFieldConfidences({
        ...FRENCH_BULLETIN_RESULT,
        confidence: 0.95,
        warnings: [],
      });
      expect(fc.dateSoin).toBe(1.0);
      expect(fc.typeSoin).toBe(1.0);
      expect(fc.montantTotal).toBe(1.0);
      expect(fc.praticienNom).toBe(1.0);
      expect(fc.adherentMatricule).toBe(1.0);
    });

    it('validateExtractedData warns on line total mismatch', () => {
      const data: BulletinExtractedData = {
        montantTotal: 100000,
        lignes: [{ libelle: 'Item', quantite: 1, prixUnitaire: 20000, montantTotal: 20000 }],
        confidence: 0.9,
        warnings: [],
      };
      const validated = validateExtractedData(data);
      expect(validated.warnings).toContain('Total des lignes ne correspond pas au montant total');
    });

    it('validateExtractedData allows matching line totals', () => {
      const data: BulletinExtractedData = {
        ...FRENCH_BULLETIN_RESULT,
        confidence: 0.9,
        warnings: [],
      };
      const validated = validateExtractedData(data);
      expect(validated.warnings).not.toContain('Total des lignes ne correspond pas au montant total');
    });
  });
});
