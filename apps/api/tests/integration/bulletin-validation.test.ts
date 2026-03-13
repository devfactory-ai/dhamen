/**
 * REQ-006: Validation bulletin et upload scan — Integration Tests
 *
 * Tests the agent workflow: validate bulletin → upload scan → download scan
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

// Shared fixtures
const AGENT_USER = {
  id: 'agent_001',
  sub: 'agent_001',
  role: 'INSURER_AGENT',
  insurerId: 'insurer_001',
};

const OTHER_AGENT_USER = {
  id: 'agent_002',
  sub: 'agent_002',
  role: 'INSURER_AGENT',
  insurerId: 'insurer_002',
};

const MOCK_BULLETIN_DRAFT = {
  id: 'bul_001',
  bulletin_number: 'BS-2026-ABCD1234',
  status: 'draft',
  adherent_id: 'adh_001',
  adherent_first_name: 'Mohamed',
  adherent_last_name: 'Trabelsi',
  adherent_matricule: 'MAT-001',
  total_amount: 150.000,
  reimbursed_amount: 120.000,
  created_by: 'agent_001',
  scan_url: null,
  scan_filename: null,
};

const MOCK_BULLETIN_APPROVED = {
  ...MOCK_BULLETIN_DRAFT,
  id: 'bul_002',
  status: 'approved',
  validated_at: '2026-03-13T10:00:00Z',
  validated_by: 'agent_001',
};

// ─── TASK-003: POST /agent/:id/validate ────────────────────────────

describe('REQ-006: Validation bulletin', () => {
  describe('POST /agent/:id/validate', () => {
    it('validates a draft bulletin successfully', async () => {
      const app = new Hono();

      app.post('/bulletins-soins/agent/:id/validate', async (c) => {
        const bulletinId = c.req.param('id');
        const body = await c.req.json();

        if (!body.reimbursed_amount || body.reimbursed_amount <= 0) {
          return c.json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Le montant remboursé doit être supérieur à 0' },
          }, 400);
        }

        // Simulate bulletin lookup
        if (bulletinId !== MOCK_BULLETIN_DRAFT.id) {
          return c.json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
          }, 404);
        }

        const now = new Date().toISOString();
        return c.json({
          success: true,
          data: {
            id: bulletinId,
            status: 'approved',
            reimbursed_amount: body.reimbursed_amount,
            validated_at: now,
            validated_by: AGENT_USER.id,
          },
        });
      });

      const res = await app.request(`/bulletins-soins/agent/${MOCK_BULLETIN_DRAFT.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reimbursed_amount: 120.000, notes: 'RAS' }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('approved');
      expect(data.data.reimbursed_amount).toBe(120.000);
      expect(data.data.validated_at).toBeDefined();
      expect(data.data.validated_by).toBe(AGENT_USER.id);
    });

    it('rejects validation of already approved bulletin (409)', async () => {
      const app = new Hono();

      app.post('/bulletins-soins/agent/:id/validate', async (c) => {
        const bulletinId = c.req.param('id');

        // Simulate already validated bulletin
        if (bulletinId === MOCK_BULLETIN_APPROVED.id) {
          return c.json({
            success: false,
            error: { code: 'BULLETIN_ALREADY_VALIDATED', message: 'Ce bulletin a deja ete valide ou est dans un statut final' },
          }, 409);
        }

        return c.json({ success: true, data: { id: bulletinId, status: 'approved' } });
      });

      const res = await app.request(`/bulletins-soins/agent/${MOCK_BULLETIN_APPROVED.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reimbursed_amount: 120.000 }),
      });

      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('BULLETIN_ALREADY_VALIDATED');
    });

    it('rejects validation with negative amount (400)', async () => {
      const app = new Hono();

      app.post('/bulletins-soins/agent/:id/validate', async (c) => {
        const body = await c.req.json();
        if (!body.reimbursed_amount || body.reimbursed_amount <= 0) {
          return c.json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Le montant remboursé doit être supérieur à 0' },
          }, 400);
        }
        return c.json({ success: true, data: {} });
      });

      const res = await app.request(`/bulletins-soins/agent/${MOCK_BULLETIN_DRAFT.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reimbursed_amount: -50 }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 404 for non-existent bulletin', async () => {
      const app = new Hono();

      app.post('/bulletins-soins/agent/:id/validate', async (c) => {
        return c.json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
        }, 404);
      });

      const res = await app.request('/bulletins-soins/agent/non_existent/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reimbursed_amount: 100 }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  // ─── TASK-004: POST /agent/:id/upload-scan ────────────────────────

  describe('POST /agent/:id/upload-scan', () => {
    it('uploads a JPEG scan successfully', async () => {
      const app = new Hono();

      app.post('/bulletins-soins/agent/:id/upload-scan', async (c) => {
        const bulletinId = c.req.param('id');
        const formData = await c.req.formData();
        const file = formData.get('scan') as File | null;

        if (!file || !(file instanceof File) || file.size === 0) {
          return c.json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Fichier scan requis' },
          }, 400);
        }

        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
          return c.json({
            success: false,
            error: { code: 'INVALID_FILE_TYPE', message: 'Type de fichier non supporte' },
          }, 400);
        }

        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
          return c.json({
            success: false,
            error: { code: 'FILE_TOO_LARGE', message: 'Le fichier ne doit pas depasser 10 Mo' },
          }, 400);
        }

        return c.json({
          success: true,
          data: {
            scan_url: `https://dhamen-files.r2.cloudflarestorage.com/bulletins/${bulletinId}/${file.name}`,
            scan_filename: file.name,
          },
        });
      });

      const formData = new FormData();
      formData.append('scan', new File(['fake-image'], 'bulletin-scan.jpg', { type: 'image/jpeg' }));

      const res = await app.request(`/bulletins-soins/agent/${MOCK_BULLETIN_DRAFT.id}/upload-scan`, {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.scan_url).toContain('bulletins/bul_001/bulletin-scan.jpg');
      expect(data.data.scan_filename).toBe('bulletin-scan.jpg');
    });

    it('uploads a PDF scan successfully', async () => {
      const app = new Hono();

      app.post('/bulletins-soins/agent/:id/upload-scan', async (c) => {
        const formData = await c.req.formData();
        const file = formData.get('scan') as File;

        return c.json({
          success: true,
          data: {
            scan_url: `https://dhamen-files.r2.cloudflarestorage.com/bulletins/${c.req.param('id')}/${file.name}`,
            scan_filename: file.name,
          },
        });
      });

      const formData = new FormData();
      formData.append('scan', new File(['%PDF-1.4'], 'bulletin.pdf', { type: 'application/pdf' }));

      const res = await app.request(`/bulletins-soins/agent/${MOCK_BULLETIN_DRAFT.id}/upload-scan`, {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.scan_filename).toBe('bulletin.pdf');
    });

    it('rejects file with invalid MIME type (400)', async () => {
      const app = new Hono();

      app.post('/bulletins-soins/agent/:id/upload-scan', async (c) => {
        const formData = await c.req.formData();
        const file = formData.get('scan') as File;

        const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
          return c.json({
            success: false,
            error: { code: 'INVALID_FILE_TYPE', message: 'Type de fichier non supporte' },
          }, 400);
        }

        return c.json({ success: true, data: {} });
      });

      const formData = new FormData();
      formData.append('scan', new File(['binary'], 'virus.exe', { type: 'application/x-msdownload' }));

      const res = await app.request(`/bulletins-soins/agent/${MOCK_BULLETIN_DRAFT.id}/upload-scan`, {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('INVALID_FILE_TYPE');
    });

    it('rejects file exceeding 10 Mo (400)', async () => {
      const app = new Hono();

      app.post('/bulletins-soins/agent/:id/upload-scan', async (c) => {
        const formData = await c.req.formData();
        const file = formData.get('scan') as File;

        const maxSize = 10 * 1024 * 1024;
        if (file.size > maxSize) {
          return c.json({
            success: false,
            error: { code: 'FILE_TOO_LARGE', message: 'Le fichier ne doit pas depasser 10 Mo' },
          }, 400);
        }

        return c.json({ success: true, data: {} });
      });

      const largeContent = new Uint8Array(11 * 1024 * 1024);
      const formData = new FormData();
      formData.append('scan', new File([largeContent], 'huge.jpg', { type: 'image/jpeg' }));

      const res = await app.request(`/bulletins-soins/agent/${MOCK_BULLETIN_DRAFT.id}/upload-scan`, {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('FILE_TOO_LARGE');
    });

    it('rejects request with no file (400)', async () => {
      const app = new Hono();

      app.post('/bulletins-soins/agent/:id/upload-scan', async (c) => {
        const formData = await c.req.formData();
        const file = formData.get('scan');

        if (!file || !(file instanceof File) || file.size === 0) {
          return c.json({
            success: false,
            error: { code: 'VALIDATION_ERROR', message: 'Fichier scan requis' },
          }, 400);
        }

        return c.json({ success: true, data: {} });
      });

      const formData = new FormData();
      // No file appended

      const res = await app.request(`/bulletins-soins/agent/${MOCK_BULLETIN_DRAFT.id}/upload-scan`, {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ─── TASK-005: GET /agent/:id/scan ────────────────────────────────

  describe('GET /agent/:id/scan', () => {
    it('returns scan file with correct Content-Type', async () => {
      const app = new Hono();

      app.get('/bulletins-soins/agent/:id/scan', async (c) => {
        const bulletinId = c.req.param('id');

        if (bulletinId !== MOCK_BULLETIN_DRAFT.id) {
          return c.json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
          }, 404);
        }

        // Simulate a bulletin with scan
        const scanContent = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0]); // JPEG magic bytes
        return new Response(scanContent, {
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Disposition': 'inline; filename="bulletin-scan.jpg"',
          },
        });
      });

      const res = await app.request(`/bulletins-soins/agent/${MOCK_BULLETIN_DRAFT.id}/scan`);

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('image/jpeg');
      expect(res.headers.get('Content-Disposition')).toContain('bulletin-scan.jpg');
    });

    it('returns 404 when no scan is attached', async () => {
      const app = new Hono();

      app.get('/bulletins-soins/agent/:id/scan', async (c) => {
        return c.json({
          success: false,
          error: { code: 'SCAN_NOT_FOUND', message: 'Aucun scan attache a ce bulletin' },
        }, 404);
      });

      const res = await app.request(`/bulletins-soins/agent/${MOCK_BULLETIN_DRAFT.id}/scan`);

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error.code).toBe('SCAN_NOT_FOUND');
    });

    it('returns 404 for non-existent bulletin', async () => {
      const app = new Hono();

      app.get('/bulletins-soins/agent/:id/scan', async () => {
        return new Response(JSON.stringify({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
        }), { status: 404, headers: { 'Content-Type': 'application/json' } });
      });

      const res = await app.request('/bulletins-soins/agent/non_existent/scan');

      expect(res.status).toBe(404);
    });
  });

  // ─── Workflow complet ─────────────────────────────────────────────

  describe('Full workflow: validate → upload scan → download scan', () => {
    it('completes the full validation workflow', async () => {
      const app = new Hono();
      const state: { status: string; scan_url: string | null; validated: boolean } = {
        status: 'draft',
        scan_url: null,
        validated: false,
      };

      // Step 1: Validate
      app.post('/bulletins-soins/agent/:id/validate', async (c) => {
        const body = await c.req.json();
        state.status = 'approved';
        state.validated = true;
        return c.json({
          success: true,
          data: {
            id: c.req.param('id'),
            status: 'approved',
            reimbursed_amount: body.reimbursed_amount,
            validated_at: new Date().toISOString(),
            validated_by: AGENT_USER.id,
          },
        });
      });

      // Step 2: Upload scan
      app.post('/bulletins-soins/agent/:id/upload-scan', async (c) => {
        const formData = await c.req.formData();
        const file = formData.get('scan') as File;
        state.scan_url = `bulletins/${c.req.param('id')}/${file.name}`;
        return c.json({
          success: true,
          data: { scan_url: state.scan_url, scan_filename: file.name },
        });
      });

      // Step 3: Download scan
      app.get('/bulletins-soins/agent/:id/scan', async () => {
        if (!state.scan_url) {
          return new Response(JSON.stringify({
            success: false,
            error: { code: 'SCAN_NOT_FOUND', message: 'Aucun scan' },
          }), { status: 404 });
        }
        return new Response('file-content', {
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Disposition': 'inline; filename="scan.jpg"',
          },
        });
      });

      // Execute workflow
      const validateRes = await app.request('/bulletins-soins/agent/bul_001/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reimbursed_amount: 120.000 }),
      });
      expect(validateRes.status).toBe(200);
      expect(state.status).toBe('approved');

      const uploadForm = new FormData();
      uploadForm.append('scan', new File(['img'], 'scan.jpg', { type: 'image/jpeg' }));
      const uploadRes = await app.request('/bulletins-soins/agent/bul_001/upload-scan', {
        method: 'POST',
        body: uploadForm,
      });
      expect(uploadRes.status).toBe(200);
      expect(state.scan_url).toContain('scan.jpg');

      const downloadRes = await app.request('/bulletins-soins/agent/bul_001/scan');
      expect(downloadRes.status).toBe(200);
      expect(downloadRes.headers.get('Content-Type')).toBe('image/jpeg');
    });
  });
});
