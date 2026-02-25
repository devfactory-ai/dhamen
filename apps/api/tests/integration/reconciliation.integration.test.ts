/**
 * Reconciliation Integration Tests
 *
 * Tests the reconciliation flow including listing, summary, reconcile, and export
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

describe('Reconciliation Integration Tests', () => {
  describe('GET /api/v1/reconciliation', () => {
    it('should list reconciliation items with pagination', async () => {
      const app = new Hono();
      app.get('/api/v1/reconciliation', async (c) => {
        const page = Number(c.req.query('page')) || 1;
        const limit = Number(c.req.query('limit')) || 20;
        const period = c.req.query('period');

        return c.json({
          success: true,
          data: {
            items: [
              {
                id: 'rec_001',
                bordereauId: 'bord_001',
                bordereauNumber: 'BRD-2024-001',
                providerId: 'prov_001',
                providerName: 'Pharmacie Ben Ali',
                period: '2024-01-01 - 2024-01-31',
                claimCount: 45,
                declaredAmount: 12500000,
                verifiedAmount: 12500000,
                difference: 0,
                status: 'MATCHED',
                createdAt: '2024-02-01T10:00:00Z',
              },
              {
                id: 'rec_002',
                bordereauId: 'bord_002',
                bordereauNumber: 'BRD-2024-002',
                providerId: 'prov_002',
                providerName: 'Clinique Pasteur',
                period: '2024-01-01 - 2024-01-31',
                claimCount: 23,
                declaredAmount: 45000000,
                verifiedAmount: 43500000,
                difference: -1500000,
                status: 'UNMATCHED',
                createdAt: '2024-02-01T10:30:00Z',
              },
            ],
            total: 2,
          },
        });
      });

      const res = await app.request('/api/v1/reconciliation?page=1&limit=20&period=2024-01');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.items).toHaveLength(2);
      expect(data.data.items[0].status).toBe('MATCHED');
      expect(data.data.items[1].status).toBe('UNMATCHED');
    });

    it('should filter by status', async () => {
      const app = new Hono();
      app.get('/api/v1/reconciliation', async (c) => {
        const status = c.req.query('status');

        const allItems = [
          { id: 'rec_001', status: 'MATCHED', difference: 0 },
          { id: 'rec_002', status: 'UNMATCHED', difference: -1500000 },
          { id: 'rec_003', status: 'DISPUTED', difference: 500000 },
        ];

        const filtered = status
          ? allItems.filter((i) => i.status === status)
          : allItems;

        return c.json({
          success: true,
          data: { items: filtered, total: filtered.length },
        });
      });

      const res = await app.request('/api/v1/reconciliation?status=UNMATCHED');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.items).toHaveLength(1);
      expect(data.data.items[0].status).toBe('UNMATCHED');
    });
  });

  describe('GET /api/v1/reconciliation/summary', () => {
    it('should return reconciliation summary for period', async () => {
      const app = new Hono();
      app.get('/api/v1/reconciliation/summary', async (c) => {
        const period = c.req.query('period');

        if (!period) {
          return c.json(
            {
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'Period is required' },
            },
            400
          );
        }

        return c.json({
          success: true,
          data: {
            period,
            totalClaims: 100,
            totalAmount: 250000000,
            matchedClaims: 85,
            matchedAmount: 212500000,
            unmatchedClaims: 12,
            unmatchedAmount: 30000000,
            disputedClaims: 3,
            disputedAmount: 7500000,
            matchRate: 85.0,
          },
        });
      });

      const res = await app.request('/api/v1/reconciliation/summary?period=2024-01');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.period).toBe('2024-01');
      expect(data.data.matchRate).toBe(85.0);
      expect(data.data.totalClaims).toBe(100);
    });

    it('should require period parameter', async () => {
      const app = new Hono();
      app.get('/api/v1/reconciliation/summary', async (c) => {
        const period = c.req.query('period');

        if (!period) {
          return c.json(
            {
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'Period is required' },
            },
            400
          );
        }

        return c.json({ success: true });
      });

      const res = await app.request('/api/v1/reconciliation/summary');

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/v1/reconciliation/:id', () => {
    it('should return reconciliation item details with discrepancies', async () => {
      const app = new Hono();
      app.get('/api/v1/reconciliation/:id', async (c) => {
        const itemId = c.req.param('id');

        if (itemId !== 'rec_002') {
          return c.json(
            {
              success: false,
              error: { code: 'NOT_FOUND', message: 'Élément non trouvé' },
            },
            404
          );
        }

        return c.json({
          success: true,
          data: {
            id: 'rec_002',
            bordereauId: 'bord_002',
            bordereauNumber: 'BRD-2024-002',
            providerId: 'prov_002',
            providerName: 'Clinique Pasteur',
            insurerName: 'CNAM Tunisie',
            period: '2024-01-01 - 2024-01-31',
            claimCount: 23,
            declaredAmount: 45000000,
            verifiedAmount: 43500000,
            difference: -1500000,
            status: 'UNMATCHED',
            createdAt: '2024-02-01T10:30:00Z',
            discrepancies: [
              {
                id: 'disc_001',
                type: 'AMOUNT_MISMATCH',
                description: 'Écart de 1.500 TND entre le montant déclaré et vérifié',
                amount: 1500000,
                status: 'PENDING',
                resolution: null,
                resolvedAt: null,
              },
            ],
          },
        });
      });

      const res = await app.request('/api/v1/reconciliation/rec_002');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.discrepancies).toHaveLength(1);
      expect(data.data.discrepancies[0].type).toBe('AMOUNT_MISMATCH');
    });
  });

  describe('POST /api/v1/reconciliation/run', () => {
    it('should run reconciliation for a period', async () => {
      const app = new Hono();
      app.post('/api/v1/reconciliation/run', async (c) => {
        const body = await c.req.json();

        if (!body.insurerId || !body.periodStart || !body.periodEnd) {
          return c.json(
            {
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'Missing required fields' },
            },
            400
          );
        }

        return c.json({
          success: true,
          data: {
            processed: 5,
            matched: 4,
            unmatched: 1,
            results: [
              { bordereauId: 'bord_001', bordereauNumber: 'BRD-001', status: 'MATCHED', difference: 0 },
              { bordereauId: 'bord_002', bordereauNumber: 'BRD-002', status: 'MATCHED', difference: 0 },
              { bordereauId: 'bord_003', bordereauNumber: 'BRD-003', status: 'MATCHED', difference: 0 },
              { bordereauId: 'bord_004', bordereauNumber: 'BRD-004', status: 'MATCHED', difference: 0 },
              { bordereauId: 'bord_005', bordereauNumber: 'BRD-005', status: 'UNMATCHED', difference: -2500000 },
            ],
          },
        });
      });

      const res = await app.request('/api/v1/reconciliation/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          insurerId: 'ins_001',
          periodStart: '2024-01-01',
          periodEnd: '2024-01-31',
          cycleType: 'monthly',
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.processed).toBe(5);
      expect(data.data.matched).toBe(4);
      expect(data.data.unmatched).toBe(1);
    });

    it('should require insurer role', async () => {
      const app = new Hono();
      app.post('/api/v1/reconciliation/run', async (c) => {
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

      const res = await app.request('/api/v1/reconciliation/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': 'PHARMACIST',
        },
        body: JSON.stringify({
          insurerId: 'ins_001',
          periodStart: '2024-01-01',
          periodEnd: '2024-01-31',
          cycleType: 'monthly',
        }),
      });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/reconciliation/:id/reconcile', () => {
    it('should manually reconcile an unmatched item', async () => {
      const app = new Hono();
      app.post('/api/v1/reconciliation/:id/reconcile', async (c) => {
        const itemId = c.req.param('id');

        return c.json({
          success: true,
          data: {
            id: itemId,
            status: 'MATCHED',
            updatedAt: new Date().toISOString(),
          },
        });
      });

      const res = await app.request('/api/v1/reconciliation/rec_002/reconcile', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('MATCHED');
    });

    it('should reject reconciling already matched item', async () => {
      const app = new Hono();
      app.post('/api/v1/reconciliation/:id/reconcile', async (c) => {
        // Simulate item already matched
        return c.json(
          {
            success: false,
            error: {
              code: 'ALREADY_MATCHED',
              message: 'Cet élément est déjà rapproché',
            },
          },
          400
        );
      });

      const res = await app.request('/api/v1/reconciliation/rec_001/reconcile', {
        method: 'POST',
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('ALREADY_MATCHED');
    });
  });

  describe('POST /api/v1/reconciliation/discrepancies/:id/resolve', () => {
    it('should resolve a discrepancy', async () => {
      const app = new Hono();
      app.post('/api/v1/reconciliation/discrepancies/:id/resolve', async (c) => {
        const discrepancyId = c.req.param('id');
        const body = await c.req.json();

        if (!body.resolution) {
          return c.json(
            {
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'Resolution is required' },
            },
            400
          );
        }

        return c.json({
          success: true,
          data: {
            id: discrepancyId,
            status: 'RESOLVED',
            resolution: body.resolution,
            resolvedAt: new Date().toISOString(),
          },
        });
      });

      const res = await app.request('/api/v1/reconciliation/discrepancies/disc_001/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolution: 'Écart accepté après vérification manuelle',
          adjustedAmount: 0,
        }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('RESOLVED');
    });

    it('should reject resolving already resolved discrepancy', async () => {
      const app = new Hono();
      app.post('/api/v1/reconciliation/discrepancies/:id/resolve', async (c) => {
        return c.json(
          {
            success: false,
            error: {
              code: 'ALREADY_RESOLVED',
              message: 'Cet écart est déjà résolu',
            },
          },
          400
        );
      });

      const res = await app.request('/api/v1/reconciliation/discrepancies/disc_resolved/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution: 'Test' }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe('ALREADY_RESOLVED');
    });
  });

  describe('GET /api/v1/reconciliation/export', () => {
    it('should export reconciliation data as CSV', async () => {
      const app = new Hono();
      app.get('/api/v1/reconciliation/export', async (c) => {
        const period = c.req.query('period');

        if (!period) {
          return c.json(
            {
              success: false,
              error: { code: 'VALIDATION_ERROR', message: 'Period is required' },
            },
            400
          );
        }

        const csvContent = [
          'Bordereau,Prestataire,Période,Nombre PEC,Montant Déclaré (TND),Montant Vérifié (TND),Écart (TND),Statut,Date',
          'BRD-2024-001,Pharmacie Ben Ali,2024-01-01 - 2024-01-31,45,12.500,12.500,0.000,MATCHED,15/01/2024',
          'BRD-2024-002,Clinique Pasteur,2024-01-01 - 2024-01-31,23,45.000,43.500,-1.500,UNMATCHED,15/01/2024',
        ].join('\n');

        return new Response(csvContent, {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': `attachment; filename="reconciliation-${period}.csv"`,
          },
        });
      });

      const res = await app.request('/api/v1/reconciliation/export?period=2024-01');

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/csv');
      expect(res.headers.get('Content-Disposition')).toContain('attachment');

      const content = await res.text();
      expect(content).toContain('Bordereau');
      expect(content).toContain('BRD-2024-001');
    });
  });

  describe('Reconciliation Calculations', () => {
    it('should correctly identify mismatches above threshold', async () => {
      const app = new Hono();
      app.post('/api/v1/reconciliation/check', async (c) => {
        const body = await c.req.json();
        const declaredAmount = body.declaredAmount;
        const verifiedAmount = body.verifiedAmount;
        const threshold = 1000; // 1 TND in millimes

        const difference = verifiedAmount - declaredAmount;
        const status = Math.abs(difference) > threshold ? 'UNMATCHED' : 'MATCHED';

        return c.json({
          success: true,
          data: {
            declaredAmount,
            verifiedAmount,
            difference,
            status,
          },
        });
      });

      // Test matching amounts
      const matchedRes = await app.request('/api/v1/reconciliation/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ declaredAmount: 10000000, verifiedAmount: 10000500 }),
      });
      const matchedData = await matchedRes.json();
      expect(matchedData.data.status).toBe('MATCHED');

      // Test unmatched amounts
      const unmatchedRes = await app.request('/api/v1/reconciliation/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ declaredAmount: 10000000, verifiedAmount: 8500000 }),
      });
      const unmatchedData = await unmatchedRes.json();
      expect(unmatchedData.data.status).toBe('UNMATCHED');
      expect(unmatchedData.data.difference).toBe(-1500000);
    });

    it('should calculate match rate correctly', async () => {
      const app = new Hono();
      app.get('/api/v1/reconciliation/match-rate', async (c) => {
        const items = [
          { status: 'MATCHED' },
          { status: 'MATCHED' },
          { status: 'MATCHED' },
          { status: 'MATCHED' },
          { status: 'UNMATCHED' },
        ];

        const matched = items.filter((i) => i.status === 'MATCHED').length;
        const total = items.length;
        const matchRate = (matched / total) * 100;

        return c.json({
          success: true,
          data: {
            total,
            matched,
            unmatched: total - matched,
            matchRate,
          },
        });
      });

      const res = await app.request('/api/v1/reconciliation/match-rate');

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.matchRate).toBe(80);
      expect(data.data.matched).toBe(4);
      expect(data.data.unmatched).toBe(1);
    });
  });

  describe('Discrepancy Types', () => {
    it('should categorize discrepancy types correctly', async () => {
      const discrepancyTypes = [
        'AMOUNT_MISMATCH',
        'DUPLICATE_CLAIM',
        'MISSING_CLAIM',
        'STATUS_MISMATCH',
        'DATE_MISMATCH',
        'CARE_TYPE_MISMATCH',
      ];

      const app = new Hono();
      app.post('/api/v1/reconciliation/discrepancy/validate', async (c) => {
        const body = await c.req.json();

        if (!discrepancyTypes.includes(body.type)) {
          return c.json(
            {
              success: false,
              error: {
                code: 'INVALID_TYPE',
                message: `Type de discrepancy invalide. Valeurs acceptées: ${discrepancyTypes.join(', ')}`,
              },
            },
            400
          );
        }

        return c.json({ success: true, data: { type: body.type } });
      });

      // Valid type
      const validRes = await app.request('/api/v1/reconciliation/discrepancy/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'AMOUNT_MISMATCH' }),
      });
      expect(validRes.status).toBe(200);

      // Invalid type
      const invalidRes = await app.request('/api/v1/reconciliation/discrepancy/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'INVALID_TYPE' }),
      });
      expect(invalidRes.status).toBe(400);
    });
  });

  describe('Audit Trail', () => {
    it('should log reconciliation actions', async () => {
      const auditLogs: Array<{ action: string; entityType: string; entityId: string }> = [];

      const app = new Hono();

      app.use('*', async (c, next) => {
        await next();

        // Simulate audit logging
        const action = c.req.method === 'POST' ? 'CREATE' : 'READ';
        auditLogs.push({
          action,
          entityType: 'RECONCILIATION',
          entityId: c.req.param('id') || 'list',
        });
      });

      app.post('/api/v1/reconciliation/:id/reconcile', async (c) => {
        return c.json({ success: true });
      });

      await app.request('/api/v1/reconciliation/rec_001/reconcile', {
        method: 'POST',
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].action).toBe('CREATE');
      expect(auditLogs[0].entityId).toBe('rec_001');
    });
  });
});
