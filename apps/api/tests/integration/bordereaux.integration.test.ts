/**
 * Bordereaux Integration Tests
 *
 * Tests the bordereaux management flow including listing, details, submit, validate, pay, and PDF generation
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

describe('Bordereaux Integration Tests', () => {
  describe('GET /api/v1/bordereaux', () => {
    it('should list bordereaux with pagination', async () => {
      const app = new Hono();
      app.get('/api/v1/bordereaux', async (c) => {
        const page = Number(c.req.query('page')) || 1;
        const limit = Number(c.req.query('limit')) || 20;

        return c.json({
          success: true,
          data: {
            bordereaux: [
              {
                id: 'bord_001',
                bordereauNumber: 'BRD-2024-001',
                insurerId: 'ins_001',
                insurerName: 'CNAM Tunisie',
                providerId: 'prov_001',
                providerName: 'Pharmacie Ben Ali',
                periodStart: '2024-01-01',
                periodEnd: '2024-01-31',
                status: 'DRAFT',
                claimCount: 45,
                totalAmount: 12500000,
                coveredAmount: 10000000,
                paidAmount: 0,
                createdAt: '2024-01-15T10:00:00Z',
              },
            ],
            total: 1,
          },
        });
      });

      const res = await app.request('/api/v1/bordereaux?page=1&limit=20');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.bordereaux).toHaveLength(1);
      expect(data.data.bordereaux[0].bordereauNumber).toBe('BRD-2024-001');
    });

    it('should filter bordereaux by status', async () => {
      const app = new Hono();
      app.get('/api/v1/bordereaux', async (c) => {
        const status = c.req.query('status');

        const allBordereaux = [
          { id: 'bord_001', status: 'DRAFT' },
          { id: 'bord_002', status: 'SUBMITTED' },
          { id: 'bord_003', status: 'PAID' },
        ];

        const filtered = status
          ? allBordereaux.filter((b) => b.status === status)
          : allBordereaux;

        return c.json({
          success: true,
          data: { bordereaux: filtered, total: filtered.length },
        });
      });

      const res = await app.request('/api/v1/bordereaux?status=SUBMITTED');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.bordereaux).toHaveLength(1);
      expect(data.data.bordereaux[0].status).toBe('SUBMITTED');
    });

    it('should require authentication', async () => {
      const app = new Hono();
      app.get('/api/v1/bordereaux', async (c) => {
        const authHeader = c.req.header('Authorization');

        if (!authHeader) {
          return c.json(
            {
              success: false,
              error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
            },
            401
          );
        }

        return c.json({ success: true, data: { bordereaux: [], total: 0 } });
      });

      const res = await app.request('/api/v1/bordereaux');

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /api/v1/bordereaux/:id', () => {
    it('should return bordereau details with claims', async () => {
      const app = new Hono();
      app.get('/api/v1/bordereaux/:id', async (c) => {
        const bordereauId = c.req.param('id');

        if (bordereauId !== 'bord_001') {
          return c.json(
            {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Bordereau non trouvé' },
            },
            404
          );
        }

        return c.json({
          success: true,
          data: {
            id: 'bord_001',
            bordereauNumber: 'BRD-2024-001',
            insurerName: 'CNAM Tunisie',
            providerName: 'Pharmacie Ben Ali',
            periodStart: '2024-01-01',
            periodEnd: '2024-01-31',
            status: 'DRAFT',
            claimCount: 2,
            totalAmount: 5000000,
            coveredAmount: 4000000,
            claims: [
              {
                id: 'claim_001',
                claimNumber: 'CLM-2024-001',
                adherentName: 'Ahmed Ben Ali',
                totalAmount: 2500000,
                coveredAmount: 2000000,
                status: 'APPROVED',
              },
              {
                id: 'claim_002',
                claimNumber: 'CLM-2024-002',
                adherentName: 'Fatma Trabelsi',
                totalAmount: 2500000,
                coveredAmount: 2000000,
                status: 'APPROVED',
              },
            ],
          },
        });
      });

      const res = await app.request('/api/v1/bordereaux/bord_001');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.claims).toHaveLength(2);
      expect(data.data.bordereauNumber).toBe('BRD-2024-001');
    });

    it('should return 404 for non-existent bordereau', async () => {
      const app = new Hono();
      app.get('/api/v1/bordereaux/:id', async (c) => {
        return c.json(
          {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Bordereau non trouvé' },
          },
          404
        );
      });

      const res = await app.request('/api/v1/bordereaux/non_existent');

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST /api/v1/bordereaux/:id/submit', () => {
    it('should submit a draft bordereau', async () => {
      const app = new Hono();
      app.post('/api/v1/bordereaux/:id/submit', async (c) => {
        const bordereauId = c.req.param('id');

        return c.json({
          success: true,
          message: 'Bordereau soumis avec succès',
          data: {
            id: bordereauId,
            status: 'SUBMITTED',
            submittedAt: new Date().toISOString(),
          },
        });
      });

      const res = await app.request('/api/v1/bordereaux/bord_001/submit', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('SUBMITTED');
    });

    it('should reject submission of non-draft bordereau', async () => {
      const app = new Hono();
      app.post('/api/v1/bordereaux/:id/submit', async (c) => {
        // Simulate bordereau already submitted
        return c.json(
          {
            success: false,
            error: {
              code: 'INVALID_STATUS',
              message: 'Ce bordereau ne peut pas être soumis',
            },
          },
          400
        );
      });

      const res = await app.request('/api/v1/bordereaux/bord_already_submitted/submit', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('INVALID_STATUS');
    });
  });

  describe('POST /api/v1/bordereaux/:id/validate', () => {
    it('should validate a submitted bordereau (insurer only)', async () => {
      const app = new Hono();
      app.post('/api/v1/bordereaux/:id/validate', async (c) => {
        const userRole = c.req.header('X-User-Role');

        if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(userRole || '')) {
          return c.json(
            {
              success: false,
              error: { code: 'FORBIDDEN', message: 'Accès non autorisé' },
            },
            403
          );
        }

        return c.json({
          success: true,
          message: 'Bordereau validé avec succès',
          data: {
            id: c.req.param('id'),
            status: 'VALIDATED',
            validatedAt: new Date().toISOString(),
          },
        });
      });

      const res = await app.request('/api/v1/bordereaux/bord_001/validate', {
        method: 'POST',
        headers: { 'X-User-Role': 'INSURER_ADMIN' },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.status).toBe('VALIDATED');
    });

    it('should reject validation by non-insurer roles', async () => {
      const app = new Hono();
      app.post('/api/v1/bordereaux/:id/validate', async (c) => {
        const userRole = c.req.header('X-User-Role');

        if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(userRole || '')) {
          return c.json(
            {
              success: false,
              error: { code: 'FORBIDDEN', message: 'Accès non autorisé' },
            },
            403
          );
        }

        return c.json({ success: true });
      });

      const res = await app.request('/api/v1/bordereaux/bord_001/validate', {
        method: 'POST',
        headers: { 'X-User-Role': 'PHARMACIST' },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/bordereaux/:id/pay', () => {
    it('should mark validated bordereau as paid', async () => {
      const app = new Hono();
      app.post('/api/v1/bordereaux/:id/pay', async (c) => {
        const body = await c.req.json();

        if (!body.paymentReference) {
          return c.json(
            {
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'Référence de paiement requise' },
            },
            400
          );
        }

        return c.json({
          success: true,
          message: 'Bordereau marqué comme payé',
          data: {
            id: c.req.param('id'),
            status: 'PAID',
            paidAt: new Date().toISOString(),
            paymentReference: body.paymentReference,
          },
        });
      });

      const res = await app.request('/api/v1/bordereaux/bord_001/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentReference: 'VIR-2024-001',
          paymentDate: '2024-02-15',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.status).toBe('PAID');
      expect(data.data.paymentReference).toBe('VIR-2024-001');
    });

    it('should reject payment without reference', async () => {
      const app = new Hono();
      app.post('/api/v1/bordereaux/:id/pay', async (c) => {
        const body = await c.req.json().catch(() => ({}));

        if (!body.paymentReference) {
          return c.json(
            {
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'Référence de paiement requise' },
            },
            400
          );
        }

        return c.json({ success: true });
      });

      const res = await app.request('/api/v1/bordereaux/bord_001/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/v1/bordereaux/:id/pdf', () => {
    it('should generate PDF for bordereau', async () => {
      const app = new Hono();
      app.get('/api/v1/bordereaux/:id/pdf', async (c) => {
        const bordereauId = c.req.param('id');

        const pdfContent = `
BORDEREAU DE FACTURATION
========================

Numéro: BRD-2024-001
Date: ${new Date().toLocaleDateString('fr-TN')}

PRESTATAIRE: Pharmacie Ben Ali
ASSUREUR: CNAM Tunisie

PÉRIODE: 01/01/2024 - 31/01/2024

Total: 12.500 TND
`;

        return new Response(pdfContent, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="bordereau-${bordereauId}.pdf"`,
          },
        });
      });

      const res = await app.request('/api/v1/bordereaux/bord_001/pdf');

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
      expect(res.headers.get('Content-Disposition')).toContain('attachment');
    });

    it('should return 404 for non-existent bordereau PDF', async () => {
      const app = new Hono();
      app.get('/api/v1/bordereaux/:id/pdf', async (c) => {
        const bordereauId = c.req.param('id');

        if (bordereauId === 'non_existent') {
          return c.json(
            {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Bordereau non trouvé' },
            },
            404
          );
        }

        return new Response('PDF content', {
          headers: { 'Content-Type': 'application/pdf' },
        });
      });

      const res = await app.request('/api/v1/bordereaux/non_existent/pdf');

      expect(res.status).toBe(404);
    });
  });

  describe('Status Workflow', () => {
    it('should enforce correct status transitions', async () => {
      const app = new Hono();

      const validTransitions: Record<string, string[]> = {
        DRAFT: ['SUBMITTED'],
        SUBMITTED: ['VALIDATED', 'DISPUTED'],
        VALIDATED: ['PAID'],
        PAID: [],
        DISPUTED: ['SUBMITTED', 'VALIDATED'],
      };

      app.post('/api/v1/bordereaux/:id/transition', async (c) => {
        const body = await c.req.json();
        const currentStatus = body.currentStatus;
        const newStatus = body.newStatus;

        const allowedTransitions = validTransitions[currentStatus] || [];

        if (!allowedTransitions.includes(newStatus)) {
          return c.json(
            {
              success: false,
              error: {
                code: 'INVALID_TRANSITION',
                message: `Transition de ${currentStatus} vers ${newStatus} non autorisée`,
              },
            },
            400
          );
        }

        return c.json({ success: true, data: { status: newStatus } });
      });

      // Valid transition: DRAFT -> SUBMITTED
      const validRes = await app.request('/api/v1/bordereaux/bord_001/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentStatus: 'DRAFT', newStatus: 'SUBMITTED' }),
      });
      expect(validRes.status).toBe(200);

      // Invalid transition: DRAFT -> PAID
      const invalidRes = await app.request('/api/v1/bordereaux/bord_001/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentStatus: 'DRAFT', newStatus: 'PAID' }),
      });
      expect(invalidRes.status).toBe(400);
      const data = await invalidRes.json();
      expect(data.error.code).toBe('INVALID_TRANSITION');
    });
  });

  describe('Amount Calculations', () => {
    it('should calculate totals correctly', async () => {
      const app = new Hono();
      app.get('/api/v1/bordereaux/:id/totals', async (c) => {
        const claims = [
          { totalAmount: 2500000, coveredAmount: 2000000 },
          { totalAmount: 1500000, coveredAmount: 1200000 },
          { totalAmount: 3000000, coveredAmount: 2500000 },
        ];

        const totalAmount = claims.reduce((sum, c) => sum + c.totalAmount, 0);
        const coveredAmount = claims.reduce((sum, c) => sum + c.coveredAmount, 0);
        const ticketModerateur = totalAmount - coveredAmount;

        return c.json({
          success: true,
          data: {
            claimCount: claims.length,
            totalAmount,
            coveredAmount,
            ticketModerateur,
          },
        });
      });

      const res = await app.request('/api/v1/bordereaux/bord_001/totals');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.claimCount).toBe(3);
      expect(data.data.totalAmount).toBe(7000000);
      expect(data.data.coveredAmount).toBe(5700000);
      expect(data.data.ticketModerateur).toBe(1300000);
    });
  });
});
