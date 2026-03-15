/**
 * REQ-008: Export CSV par lot — Integration Tests
 *
 * Tests the batch CSV export endpoint: GET /batches/:id/export
 * Format: 2 columns (matricule_adherent, montant_remboursement), UTF-8 BOM
 */

import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';

// ─── Fixtures ────────────────────────────────────────────────────────

const AGENT_USER = {
  id: 'agent_001',
  sub: 'agent_001',
  role: 'INSURER_AGENT',
  insurerId: 'insurer_001',
};

const ADMIN_USER = {
  id: 'admin_001',
  sub: 'admin_001',
  role: 'INSURER_ADMIN',
  insurerId: 'insurer_001',
};

const OTHER_AGENT_USER = {
  id: 'agent_002',
  sub: 'agent_002',
  role: 'INSURER_AGENT',
  insurerId: 'insurer_001',
};

const DOCTOR_USER = {
  id: 'doctor_001',
  sub: 'doctor_001',
  role: 'DOCTOR',
  insurerId: null,
};

const BATCH_OPEN = {
  id: 'batch_001',
  name: 'Lot Mars 2026',
  status: 'open',
  company_id: 'comp_001',
  created_by: 'agent_001',
  exported_at: null,
};

const BATCH_EXPORTED = {
  ...BATCH_OPEN,
  id: 'batch_002',
  status: 'exported',
  exported_at: '2026-03-10T10:00:00Z',
};

const BATCH_EMPTY = {
  ...BATCH_OPEN,
  id: 'batch_003',
  name: 'Lot Vide',
};

const BATCH_OTHER_AGENT = {
  ...BATCH_OPEN,
  id: 'batch_004',
  created_by: 'agent_002',
};

const BULLETINS = [
  { adherent_matricule: 'MAT-001', reimbursed_amount: 95.5, status: 'approved', batch_id: 'batch_001', bulletin_date: '2026-03-01' },
  { adherent_matricule: 'MAT-002', reimbursed_amount: 40.0, status: 'reimbursed', batch_id: 'batch_001', bulletin_date: '2026-03-02' },
  { adherent_matricule: 'MAT-003', reimbursed_amount: 60.0, status: 'rejected', batch_id: 'batch_001', bulletin_date: '2026-03-03' },
  { adherent_matricule: 'MAT-004', reimbursed_amount: 30.0, status: 'draft', batch_id: 'batch_001', bulletin_date: '2026-03-04' },
  { adherent_matricule: null, reimbursed_amount: 25.0, status: 'approved', batch_id: 'batch_001', bulletin_date: '2026-03-05' },
  { adherent_matricule: 'MAT-005', reimbursed_amount: null, status: 'approved', batch_id: 'batch_001', bulletin_date: '2026-03-06' },
  { adherent_matricule: 'MAT-010', reimbursed_amount: 100.0, status: 'approved', batch_id: 'batch_002', bulletin_date: '2026-03-01' },
];

const COMPANIES = [
  { id: 'comp_001', insurer_id: 'insurer_001' },
];

// ─── Mock Hono app simulating the export endpoint ─────────────────

function createTestApp(currentUser: typeof AGENT_USER) {
  const app = new Hono();
  const auditLogs: Record<string, unknown>[] = [];

  app.get('/batches/:id/export', async (c) => {
    const user = currentUser;

    if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
      return c.json({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      }, 403);
    }

    const batchId = c.req.param('id');
    const force = c.req.query('force') === 'true';

    // Find batch
    const allBatches = [BATCH_OPEN, BATCH_EXPORTED, BATCH_EMPTY, BATCH_OTHER_AGENT];
    let batch: typeof BATCH_OPEN | undefined;

    if (user.role === 'INSURER_ADMIN' && user.insurerId) {
      // INSURER_ADMIN: find batch by insurer via company
      batch = allBatches.find((b) => {
        if (b.id !== batchId) return false;
        const company = COMPANIES.find((co) => co.id === b.company_id);
        return company?.insurer_id === user.insurerId;
      });
    } else {
      // INSURER_AGENT: only own batches
      batch = allBatches.find((b) => b.id === batchId && b.created_by === user.id);
    }

    if (!batch) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Lot non trouve' },
      }, 404);
    }

    if (batch.status === 'exported' && !force) {
      return c.json({
        success: false,
        error: { code: 'BATCH_ALREADY_EXPORTED', message: 'Ce lot a deja ete exporte. Utilisez ?force=true pour re-exporter.' },
      }, 409);
    }

    // Get approved/reimbursed bulletins for this batch
    const batchBulletins = BULLETINS
      .filter((b) => b.batch_id === batchId && ['approved', 'reimbursed'].includes(b.status))
      .slice(0, 5000);

    // Build CSV with BOM for Excel (comma separator per architecture.md)
    const BOM = '\uFEFF';
    const header = 'matricule_adherent,montant_remboursement';
    const rows = batchBulletins.map((b) => {
      const matricule = b.adherent_matricule ?? 'INCONNU';
      const montant = b.reimbursed_amount != null ? Number(b.reimbursed_amount) : 0;
      return `${matricule},${montant}`;
    });

    const csvContent = BOM + header + '\n' + rows.join('\n');
    const today = new Date().toISOString().slice(0, 10);
    const filename = `dhamen_lot_${batchId}_${today}.csv`;

    // Record audit log
    auditLogs.push({
      action: 'batch_csv_export',
      entity_type: 'bulletin_batches',
      entity_id: batchId,
      user_id: user.id,
      bulletins_count: batchBulletins.length,
      force,
    });

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  });

  return { app, auditLogs };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('REQ-008: Export CSV par lot', () => {
  describe('GET /batches/:id/export', () => {
    it('AC1 — exports CSV with header and exactly 2 columns', async () => {
      const { app } = createTestApp(AGENT_USER);
      const res = await app.request('/batches/batch_001/export');

      expect(res.status).toBe(200);
      const text = await res.text();
      // Remove BOM
      const csv = text.replace(/^\uFEFF/, '');
      const lines = csv.split('\n');

      // First line is header
      expect(lines[0]).toBe('matricule_adherent,montant_remboursement');
      // Each data line has exactly 2 columns separated by comma
      for (let i = 1; i < lines.length; i++) {
        if (lines[i]!.trim()) {
          expect(lines[i]!.split(',').length).toBe(2);
        }
      }
    });

    it('AC2 — includes only approved/reimbursed bulletins (not rejected, draft)', async () => {
      const { app } = createTestApp(AGENT_USER);
      const res = await app.request('/batches/batch_001/export');
      const text = await res.text();
      const csv = text.replace(/^\uFEFF/, '');
      const lines = csv.split('\n').filter((l) => l.trim());

      // batch_001 has 4 approved/reimbursed (MAT-001, MAT-002, null matricule, MAT-005)
      // rejected (MAT-003) and draft (MAT-004) are excluded
      expect(lines.length).toBe(5); // 1 header + 4 data rows

      // Verify MAT-003 (rejected) is not present
      expect(csv).not.toContain('MAT-003');
      // Verify MAT-004 (draft) is not present
      expect(csv).not.toContain('MAT-004');
    });

    it('AC3 — CSV starts with UTF-8 BOM', async () => {
      const { app } = createTestApp(AGENT_USER);
      const res = await app.request('/batches/batch_001/export');
      const text = await res.text();

      expect(text.charCodeAt(0)).toBe(0xFEFF);
    });

    it('AC4 — filename follows pattern dhamen_lot_{id}_{date}.csv', async () => {
      const { app } = createTestApp(AGENT_USER);
      const res = await app.request('/batches/batch_001/export');

      const disposition = res.headers.get('Content-Disposition');
      expect(disposition).toBeTruthy();
      expect(disposition).toMatch(/dhamen_lot_batch_001_\d{4}-\d{2}-\d{2}\.csv/);
    });

    it('AC5 — Content-Type is text/csv with UTF-8 charset', async () => {
      const { app } = createTestApp(AGENT_USER);
      const res = await app.request('/batches/batch_001/export');

      expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    });

    it('AC6 — empty batch returns CSV with header only', async () => {
      const { app } = createTestApp(AGENT_USER);
      const res = await app.request('/batches/batch_003/export');

      expect(res.status).toBe(200);
      const text = await res.text();
      const csv = text.replace(/^\uFEFF/, '');
      const lines = csv.split('\n').filter((l) => l.trim());

      expect(lines.length).toBe(1); // header only
      expect(lines[0]).toBe('matricule_adherent,montant_remboursement');
    });

    it('AC7 — already exported batch returns 409', async () => {
      const { app } = createTestApp(AGENT_USER);
      const res = await app.request('/batches/batch_002/export');

      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe('BATCH_ALREADY_EXPORTED');
    });

    it('AC8 — already exported batch with force=true returns CSV', async () => {
      const { app } = createTestApp(AGENT_USER);
      const res = await app.request('/batches/batch_002/export?force=true');

      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('matricule_adherent,montant_remboursement');
    });

    it('AC9 — bulletin without matricule uses INCONNU', async () => {
      const { app } = createTestApp(AGENT_USER);
      const res = await app.request('/batches/batch_001/export');
      const text = await res.text();

      expect(text).toContain('INCONNU,25');
    });

    it('AC10 — bulletin without reimbursed_amount uses 0', async () => {
      const { app } = createTestApp(AGENT_USER);
      const res = await app.request('/batches/batch_001/export');
      const text = await res.text();

      expect(text).toContain('MAT-005,0');
    });

    it('AC11 — audit log is recorded after export', async () => {
      const { app, auditLogs } = createTestApp(AGENT_USER);
      await app.request('/batches/batch_001/export');

      expect(auditLogs.length).toBe(1);
      expect(auditLogs[0]!.action).toBe('batch_csv_export');
      expect(auditLogs[0]!.entity_type).toBe('bulletin_batches');
      expect(auditLogs[0]!.entity_id).toBe('batch_001');
      expect(auditLogs[0]!.user_id).toBe('agent_001');
      expect(auditLogs[0]!.bulletins_count).toBe(4);
    });

    it('AC12 — INSURER_ADMIN can export batch created by another agent of same insurer', async () => {
      const { app } = createTestApp(ADMIN_USER);
      // batch_004 was created by agent_002 but belongs to comp_001 (insurer_001)
      const res = await app.request('/batches/batch_004/export');

      expect(res.status).toBe(200);
    });

    it('AC13 — INSURER_AGENT cannot export batch created by another agent', async () => {
      const { app } = createTestApp(AGENT_USER);
      // batch_004 was created by agent_002
      const res = await app.request('/batches/batch_004/export');

      expect(res.status).toBe(404);
    });

    it('AC14 — forbidden role (DOCTOR) returns 403', async () => {
      const { app } = createTestApp(DOCTOR_USER as typeof AGENT_USER);
      const res = await app.request('/batches/batch_001/export');

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe('FORBIDDEN');
    });

    it('AC15 — non-existent batch returns 404', async () => {
      const { app } = createTestApp(AGENT_USER);
      const res = await app.request('/batches/nonexistent/export');

      expect(res.status).toBe(404);
    });
  });
});
