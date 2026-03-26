/**
 * Medication Family Baremes Routes
 *
 * CRUD endpoints for time-based reimbursement rates per medication family per contract.
 * Includes history/audit trail for all rate changes.
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware, requireRole } from '../middleware/auth';
import { success, error, paginated, created, notFound, badRequest } from '../lib/response';
import { generateId } from '../lib/ulid';
import { logAudit } from '../middleware/audit-trail';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';
import {
  createMedicationFamilyBaremeSchema,
  updateMedicationFamilyBaremeSchema,
} from '@dhamen/shared';

const medicationFamilyBaremes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

medicationFamilyBaremes.use('*', authMiddleware());

/**
 * GET /
 * List medication family baremes with filters
 */
medicationFamilyBaremes.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const contractId = c.req.query('contractId');
  const familyId = c.req.query('familyId');
  const activeOnly = c.req.query('activeOnly') !== 'false';
  const atDate = c.req.query('atDate'); // Filter baremes valid at a specific date
  const offset = (page - 1) * limit;

  let query = `
    SELECT mfb.*, mf.code as family_code, mf.name as family_name,
           u.first_name || ' ' || u.last_name as created_by_name
    FROM medication_family_baremes mfb
    JOIN medication_families mf ON mfb.medication_family_id = mf.id
    LEFT JOIN users u ON mfb.created_by = u.id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (contractId) {
    query += ' AND mfb.contract_id = ?';
    params.push(contractId);
  }

  if (familyId) {
    query += ' AND mfb.medication_family_id = ?';
    params.push(familyId);
  }

  if (activeOnly) {
    query += ' AND mfb.is_active = 1';
  }

  if (atDate) {
    query += ' AND mfb.date_effet <= ? AND (mfb.date_fin_effet IS NULL OR mfb.date_fin_effet >= ?)';
    params.push(atDate, atDate);
  }

  query += ' ORDER BY mf.name ASC, mfb.date_effet DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const results = await getDb(c).prepare(query).bind(...params).all();

  // Count
  let countQuery = `
    SELECT COUNT(*) as count FROM medication_family_baremes mfb WHERE 1=1
  `;
  const countParams: (string | number)[] = [];

  if (contractId) {
    countQuery += ' AND mfb.contract_id = ?';
    countParams.push(contractId);
  }
  if (familyId) {
    countQuery += ' AND mfb.medication_family_id = ?';
    countParams.push(familyId);
  }
  if (activeOnly) {
    countQuery += ' AND mfb.is_active = 1';
  }
  if (atDate) {
    countQuery += ' AND mfb.date_effet <= ? AND (mfb.date_fin_effet IS NULL OR mfb.date_fin_effet >= ?)';
    countParams.push(atDate, atDate);
  }

  const countResult = await getDb(c).prepare(countQuery).bind(...countParams).first();
  const total = Number(countResult?.count) || 0;

  return paginated(c, results.results, { page, limit, total });
});

/**
 * GET /:id
 * Get a single bareme with details
 */
medicationFamilyBaremes.get('/:id', async (c) => {
  const id = c.req.param('id');

  const bareme = await getDb(c)
    .prepare(
      `SELECT mfb.*, mf.code as family_code, mf.name as family_name,
              u.first_name || ' ' || u.last_name as created_by_name
       FROM medication_family_baremes mfb
       JOIN medication_families mf ON mfb.medication_family_id = mf.id
       LEFT JOIN users u ON mfb.created_by = u.id
       WHERE mfb.id = ?`
    )
    .bind(id)
    .first();

  if (!bareme) {
    return notFound(c, 'Barème non trouvé');
  }

  return success(c, { bareme });
});

/**
 * POST /
 * Create a new medication family bareme
 */
medicationFamilyBaremes.post(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', createMedicationFamilyBaremeSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');
    const id = generateId();
    const now = new Date().toISOString();

    // Close any existing active bareme for the same contract+family that overlaps
    if (data.dateEffet) {
      await getDb(c)
        .prepare(
          `UPDATE medication_family_baremes
           SET date_fin_effet = ?, is_active = 0, updated_at = ?
           WHERE contract_id = ? AND medication_family_id = ? AND is_active = 1
             AND date_effet <= ? AND (date_fin_effet IS NULL OR date_fin_effet >= ?)`
        )
        .bind(data.dateEffet, now, data.contractId, data.medicationFamilyId, data.dateEffet, data.dateEffet)
        .run();
    }

    await getDb(c)
      .prepare(
        `INSERT INTO medication_family_baremes
         (id, contract_id, medication_family_id, taux_remboursement,
          plafond_acte, plafond_famille_annuel, date_effet, date_fin_effet,
          is_active, motif, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`
      )
      .bind(
        id,
        data.contractId,
        data.medicationFamilyId,
        data.tauxRemboursement,
        data.plafondActe ?? null,
        data.plafondFamilleAnnuel ?? null,
        data.dateEffet,
        data.dateFinEffet ?? null,
        data.motif ?? null,
        user?.sub ?? null,
        now,
        now
      )
      .run();

    // Record in history
    await getDb(c)
      .prepare(
        `INSERT INTO medication_family_bareme_history
         (id, bareme_id, action, new_taux, new_plafond_acte, new_plafond_famille,
          new_date_effet, motif, changed_by, created_at)
         VALUES (?, ?, 'create', ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        generateId(),
        id,
        data.tauxRemboursement,
        data.plafondActe ?? null,
        data.plafondFamilleAnnuel ?? null,
        data.dateEffet,
        data.motif ?? null,
        user?.sub ?? null,
        now
      )
      .run();

    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'medication_family_bareme.create',
      entityType: 'medication_family_bareme',
      entityId: id,
      changes: data,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return created(c, { id, ...data });
  }
);

/**
 * PUT /:id
 * Update an existing bareme
 */
medicationFamilyBaremes.put(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', updateMedicationFamilyBaremeSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');
    const now = new Date().toISOString();

    // Get current values for history
    const current = await getDb(c)
      .prepare('SELECT * FROM medication_family_baremes WHERE id = ?')
      .bind(id)
      .first<{
        taux_remboursement: number;
        plafond_acte: number | null;
        plafond_famille_annuel: number | null;
        date_effet: string;
      }>();

    if (!current) {
      return notFound(c, 'Barème non trouvé');
    }

    const updates: string[] = [];
    const values: unknown[] = [];

    if (data.tauxRemboursement !== undefined) {
      updates.push('taux_remboursement = ?');
      values.push(data.tauxRemboursement);
    }
    if (data.plafondActe !== undefined) {
      updates.push('plafond_acte = ?');
      values.push(data.plafondActe);
    }
    if (data.plafondFamilleAnnuel !== undefined) {
      updates.push('plafond_famille_annuel = ?');
      values.push(data.plafondFamilleAnnuel);
    }
    if (data.dateEffet !== undefined) {
      updates.push('date_effet = ?');
      values.push(data.dateEffet);
    }
    if (data.dateFinEffet !== undefined) {
      updates.push('date_fin_effet = ?');
      values.push(data.dateFinEffet);
    }
    if (data.motif !== undefined) {
      updates.push('motif = ?');
      values.push(data.motif);
    }

    updates.push("updated_at = ?");
    values.push(now);
    values.push(id);

    await getDb(c)
      .prepare(`UPDATE medication_family_baremes SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    // Record history
    await getDb(c)
      .prepare(
        `INSERT INTO medication_family_bareme_history
         (id, bareme_id, action, old_taux, new_taux, old_plafond_acte, new_plafond_acte,
          old_plafond_famille, new_plafond_famille, old_date_effet, new_date_effet,
          motif, changed_by, created_at)
         VALUES (?, ?, 'update', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        generateId(),
        id,
        current.taux_remboursement,
        data.tauxRemboursement ?? current.taux_remboursement,
        current.plafond_acte,
        data.plafondActe !== undefined ? data.plafondActe : current.plafond_acte,
        current.plafond_famille_annuel,
        data.plafondFamilleAnnuel !== undefined ? data.plafondFamilleAnnuel : current.plafond_famille_annuel,
        current.date_effet,
        data.dateEffet ?? current.date_effet,
        data.motif ?? null,
        user?.sub ?? null,
        now
      )
      .run();

    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'medication_family_bareme.update',
      entityType: 'medication_family_bareme',
      entityId: id,
      changes: { before: current, after: data },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, { id, updated: true });
  }
);

/**
 * DELETE /:id
 * Deactivate a bareme (soft delete)
 */
medicationFamilyBaremes.delete(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    const now = new Date().toISOString();

    const current = await getDb(c)
      .prepare('SELECT taux_remboursement FROM medication_family_baremes WHERE id = ?')
      .bind(id)
      .first<{ taux_remboursement: number }>();

    if (!current) {
      return notFound(c, 'Barème non trouvé');
    }

    await getDb(c)
      .prepare(
        `UPDATE medication_family_baremes SET is_active = 0, date_fin_effet = ?, updated_at = ? WHERE id = ?`
      )
      .bind(now.split('T')[0], now, id)
      .run();

    // Record history
    await getDb(c)
      .prepare(
        `INSERT INTO medication_family_bareme_history
         (id, bareme_id, action, old_taux, motif, changed_by, created_at)
         VALUES (?, ?, 'deactivate', ?, 'Désactivation manuelle', ?, ?)`
      )
      .bind(generateId(), id, current.taux_remboursement, user?.sub ?? null, now)
      .run();

    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'medication_family_bareme.deactivate',
      entityType: 'medication_family_bareme',
      entityId: id,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, { id, deactivated: true });
  }
);

/**
 * GET /:id/history
 * Get change history for a specific bareme
 */
medicationFamilyBaremes.get('/:id/history', async (c) => {
  const id = c.req.param('id');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = (page - 1) * limit;

  const history = await getDb(c)
    .prepare(
      `SELECT h.*, u.first_name || ' ' || u.last_name as changed_by_name
       FROM medication_family_bareme_history h
       LEFT JOIN users u ON h.changed_by = u.id
       WHERE h.bareme_id = ?
       ORDER BY h.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(id, limit, offset)
    .all();

  const countResult = await getDb(c)
    .prepare('SELECT COUNT(*) as count FROM medication_family_bareme_history WHERE bareme_id = ?')
    .bind(id)
    .first();

  const total = Number(countResult?.count) || 0;

  return paginated(c, history.results, { page, limit, total });
});

/**
 * GET /by-contract/:contractId/history
 * Get full history of all bareme changes for a contract
 */
medicationFamilyBaremes.get('/by-contract/:contractId/history', async (c) => {
  const contractId = c.req.param('contractId');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = (page - 1) * limit;

  const history = await getDb(c)
    .prepare(
      `SELECT h.*, mf.code as family_code, mf.name as family_name,
              u.first_name || ' ' || u.last_name as changed_by_name
       FROM medication_family_bareme_history h
       JOIN medication_family_baremes mfb ON h.bareme_id = mfb.id
       JOIN medication_families mf ON mfb.medication_family_id = mf.id
       LEFT JOIN users u ON h.changed_by = u.id
       WHERE mfb.contract_id = ?
       ORDER BY h.created_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(contractId, limit, offset)
    .all();

  const countResult = await getDb(c)
    .prepare(
      `SELECT COUNT(*) as count
       FROM medication_family_bareme_history h
       JOIN medication_family_baremes mfb ON h.bareme_id = mfb.id
       WHERE mfb.contract_id = ?`
    )
    .bind(contractId)
    .first();

  const total = Number(countResult?.count) || 0;

  return paginated(c, history.results, { page, limit, total });
});

export { medicationFamilyBaremes };
