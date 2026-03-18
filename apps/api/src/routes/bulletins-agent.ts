import { findActeRefByCode, listActesGroupesParFamille, listActesReferentiel } from '@dhamen/db';
/**
 * Bulletins Agent Routes
 * Routes for insurance agents to create, manage batches, and export bulletins
 */
import { actesArraySchema, createBatchSchema, validateBulletinSchema } from '@dhamen/shared';
import type { ActeInput, ValidateBulletinResponse } from '@dhamen/shared';
import { Hono } from 'hono';
import { generateId } from '../lib/ulid';
import { authMiddleware } from '../middleware/auth';
import { PushNotificationService } from '../services/push-notification.service';
import { RealtimeNotificationsService } from '../services/realtime-notifications.service';
import {
  calculateRemboursementBulletin,
  calculerRemboursement,
  mettreAJourPlafonds,
} from '../services/remboursement.service';
import type {
  CalculRemboursementInput,
  CalculRemboursementResult,
} from '../services/remboursement.service';
import type { Bindings, Variables } from '../types';

const bulletinsAgent = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
bulletinsAgent.use('*', authMiddleware());

/**
 * GET /bulletins-soins/agent/actes-referentiel - List available medical acts
 */
bulletinsAgent.get('/actes-referentiel', async (c) => {
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    const actes = await listActesReferentiel(db);
    return c.json({ success: true, data: actes });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur chargement referentiel' },
      },
      500
    );
  }
});

/**
 * GET /bulletins-soins/agent/actes-referentiel/groupes - List acts grouped by family
 */
bulletinsAgent.get('/actes-referentiel/groupes', async (c) => {
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    const groupes = await listActesGroupesParFamille(db);
    return c.json({ success: true, data: groupes });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur chargement referentiel groupe' },
      },
      500
    );
  }
});

/**
 * GET /bulletins-soins/agent - List agent's bulletins
 */
bulletinsAgent.get('/', async (c) => {
  const user = c.get('user');

  // Only for agents
  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const db = c.get('tenantDb') ?? c.env.DB;
  const status = c.req.query('status') || 'draft,in_batch';
  const search = c.req.query('search');
  const batchId = c.req.query('batchId');

  let query = `
    SELECT
      bs.*,
      b.name as batch_name
    FROM bulletins_soins bs
    LEFT JOIN bulletin_batches b ON bs.batch_id = b.id
    WHERE bs.created_by = ?
    AND bs.status IN (${status
      .split(',')
      .map(() => '?')
      .join(',')})
  `;
  const params: (string | number)[] = [user.id, ...status.split(',')];

  if (batchId) {
    query += ' AND bs.batch_id = ?';
    params.push(batchId);
  }

  if (search) {
    query += ` AND (
      bs.adherent_first_name LIKE ? OR
      bs.adherent_last_name LIKE ? OR
      bs.adherent_matricule LIKE ? OR
      bs.bulletin_number LIKE ?
    )`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam, searchParam);
  }

  query += ' ORDER BY bs.created_at DESC';

  try {
    const results = await db
      .prepare(query)
      .bind(...params)
      .all();

    return c.json({
      success: true,
      data: results.results || [],
    });
  } catch (error) {
    console.error('Error fetching agent bulletins:', error);
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur de base de donnees' },
      },
      500
    );
  }
});

/**
 * GET /bulletins-soins/batches - List batches filtered by company and status
 * NOTE: Must be defined BEFORE /:id to avoid route conflict
 */
bulletinsAgent.get('/batches', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const companyId = c.req.query('companyId');
  const status = c.req.query('status') || 'open';

  if (!companyId) {
    return c.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'companyId requis' },
      },
      400
    );
  }

  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    // Verify company belongs to agent's insurer
    if (user.insurerId) {
      const company = await db
        .prepare('SELECT id FROM companies WHERE id = ? AND insurer_id = ?')
        .bind(companyId, user.insurerId)
        .first();

      if (!company) {
        return c.json(
          {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Entreprise non autorisee' },
          },
          403
        );
      }
    }

    const results = await db
      .prepare(`
      SELECT bb.*,
             COALESCE(agg.bulletins_count, 0) AS bulletins_count,
             COALESCE(agg.total_amount, 0) AS total_amount
      FROM bulletin_batches bb
      LEFT JOIN (
        SELECT batch_id,
               COUNT(*) AS bulletins_count,
               SUM(COALESCE(total_amount, 0)) AS total_amount
        FROM bulletins_soins
        GROUP BY batch_id
      ) agg ON agg.batch_id = bb.id
      WHERE bb.company_id = ? AND bb.status = ?
      ORDER BY bb.created_at DESC
    `)
      .bind(companyId, status)
      .all();

    return c.json({
      success: true,
      data: results.results || [],
    });
  } catch (error) {
    console.error('Error fetching batches:', error);
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur de base de donnees' },
      },
      500
    );
  }
});

/**
 * GET /bulletins-soins/batches/:id/export - Export batch as CTRL recap CSV (9 columns)
 * Format: UTF-8 BOM, comma separator, one row per adherent (grouped + summed)
 * Columns: Numero_De_Contrat, Souscripteur, Numero_De_Bordereau, Matricule_Isante,
 *          Matricule_Assureur, Nom, Prenom, Rib, Remb
 * NOTE: Must be defined BEFORE /:id to avoid route conflict
 */
bulletinsAgent.get('/batches/:id/export', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const batchId = c.req.param('id');
  const force = c.req.query('force') === 'true';
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    // Verify batch ownership — INSURER_ADMIN can export any batch from their insurer
    let batch: Record<string, unknown> | null = null;

    if (user.role === 'INSURER_ADMIN' && user.insurerId) {
      batch = await db
        .prepare(`
        SELECT bb.* FROM bulletin_batches bb
        JOIN companies co ON bb.company_id = co.id
        WHERE bb.id = ? AND co.insurer_id = ?
      `)
        .bind(batchId, user.insurerId)
        .first();
    } else {
      batch = await db
        .prepare('SELECT * FROM bulletin_batches WHERE id = ? AND created_by = ?')
        .bind(batchId, user.id)
        .first();
    }

    if (!batch) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Lot non trouve' },
        },
        404
      );
    }

    // Prevent re-export unless force=true
    if (batch.status === 'exported' && !force) {
      return c.json(
        {
          success: false,
          error: {
            code: 'BATCH_ALREADY_EXPORTED',
            message: 'Ce lot a deja ete exporte. Utilisez ?force=true pour re-exporter.',
          },
        },
        409
      );
    }

    // CTRL 9-column recap: group by adherent, sum reimbursed amounts
    const recapRows = await db
      .prepare(`
      SELECT
        COALESCE(ct.contract_number, '') AS numero_contrat,
        COALESCE(co.name, '') AS souscripteur,
        bb.name AS numero_bordereau,
        COALESCE(a.matricule, bs.adherent_matricule, '') AS matricule_isante,
        COALESCE(a.matricule, bs.adherent_matricule, '') AS matricule_assureur,
        COALESCE(a.last_name, bs.adherent_last_name, '') AS nom,
        COALESCE(a.first_name, bs.adherent_first_name, '') AS prenom,
        COALESCE(a.rib_encrypted, '') AS rib,
        SUM(COALESCE(bs.reimbursed_amount, 0)) AS remb
      FROM bulletins_soins bs
      JOIN bulletin_batches bb ON bs.batch_id = bb.id
      LEFT JOIN adherents a ON bs.adherent_id = a.id
      LEFT JOIN companies co ON a.company_id = co.id
      LEFT JOIN contracts ct ON ct.adherent_id = a.id AND ct.status = 'active'
      WHERE bs.batch_id = ? AND bs.status IN ('approved', 'reimbursed')
      GROUP BY COALESCE(a.id, bs.adherent_matricule)
      ORDER BY nom, prenom
      LIMIT 5000
    `)
      .bind(batchId)
      .all();

    // Build CSV — 9 columns CTRL format
    const BOM = '\uFEFF';
    const header =
      'Numero_De_Contrat,Souscripteur,Numero_De_Bordereau,Matricule_Isante,Matricule_Assureur,Nom,Prenom,Rib,Remb';
    const rows = (recapRows.results || []).map((r: Record<string, unknown>) => {
      const escape = (v: unknown) => {
        const s = v != null ? String(v) : '';
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      return [
        escape(r.numero_contrat),
        escape(r.souscripteur),
        escape(r.numero_bordereau),
        escape(r.matricule_isante),
        escape(r.matricule_assureur),
        escape(r.nom),
        escape(r.prenom),
        escape(r.rib),
        r.remb != null ? Number(r.remb) : 0,
      ].join(',');
    });

    const csvContent = BOM + header + '\n' + rows.join('\n');
    const today = new Date().toISOString().slice(0, 10);
    const filename = `dhamen_ctrl_${batchId}_${today}.csv`;

    // Mark batch as exported
    await db
      .prepare(`
      UPDATE bulletin_batches SET status = 'exported', exported_at = datetime('now') WHERE id = ?
    `)
      .bind(batchId)
      .run();

    // Mark validated bulletins as exported
    await db
      .prepare(`
      UPDATE bulletins_soins SET status = 'exported' WHERE batch_id = ? AND status IN ('approved', 'reimbursed')
    `)
      .bind(batchId)
      .run();

    // Audit trail
    await db
      .prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
      VALUES (?, ?, 'batch_csv_export', 'bulletin_batches', ?, ?, ?, datetime('now'))
    `)
      .bind(
        generateId(),
        user.id,
        batchId,
        JSON.stringify({
          format: 'ctrl_recap',
          rows_count: (recapRows.results || []).length,
          force,
        }),
        c.req.header('CF-Connecting-IP') || 'unknown'
      )
      .run();

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting batch:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: `Erreur lors de l'export: ${error instanceof Error ? error.message : String(error)}`,
        },
      },
      500
    );
  }
});

/**
 * GET /bulletins-soins/batches/:id/export-detail - Export detailed bordereau CSV
 * Format: UTF-8 BOM, comma separator, one row per acte line
 * Columns: Num_Cont, Mat, Rang_Pres, Nom_Pren_Prest, Dat_Bs, Cod_Act,
 *          Frais_Engag, Mnt_Act_Remb, Cod_Msgr, Lib_Msgr, Ref_Prof_Sant, Nom_Prof_Sant
 * NOTE: Must be defined BEFORE /:id to avoid route conflict
 */
bulletinsAgent.get('/batches/:id/export-detail', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const batchId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    // Verify batch ownership
    let batch: Record<string, unknown> | null = null;

    if (user.role === 'INSURER_ADMIN' && user.insurerId) {
      batch = await db
        .prepare(`
        SELECT bb.* FROM bulletin_batches bb
        JOIN companies co ON bb.company_id = co.id
        WHERE bb.id = ? AND co.insurer_id = ?
      `)
        .bind(batchId, user.insurerId)
        .first();
    } else {
      batch = await db
        .prepare('SELECT * FROM bulletin_batches WHERE id = ? AND created_by = ?')
        .bind(batchId, user.id)
        .first();
    }

    if (!batch) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Lot non trouve' },
        },
        404
      );
    }

    // Detailed bordereau: one row per acte line
    const detailRows = await db
      .prepare(`
      SELECT
        COALESCE(ct.contract_number, '') AS num_cont,
        COALESCE(a.matricule, bs.adherent_matricule, '') AS mat,
        COALESCE(a.rang_pres, bs.rang_pres, 0) AS rang_pres,
        COALESCE(a.last_name || ' ' || a.first_name, bs.adherent_last_name || ' ' || bs.adherent_first_name, '') AS nom_pren_prest,
        bs.bulletin_date AS dat_bs,
        COALESCE(ab.code, '') AS cod_act,
        COALESCE(ab.amount, 0) AS frais_engag,
        COALESCE(ab.montant_rembourse, 0) AS mnt_act_remb,
        COALESCE(ab.cod_msgr, '') AS cod_msgr,
        COALESCE(ab.lib_msgr, '') AS lib_msgr,
        COALESCE(ab.ref_prof_sant, '') AS ref_prof_sant,
        COALESCE(ab.nom_prof_sant, bs.provider_name, '') AS nom_prof_sant
      FROM bulletins_soins bs
      JOIN actes_bulletin ab ON ab.bulletin_id = bs.id
      LEFT JOIN adherents a ON bs.adherent_id = a.id
      LEFT JOIN contracts ct ON ct.adherent_id = a.id AND ct.status = 'active'
      WHERE bs.batch_id = ? AND bs.status IN ('approved', 'reimbursed', 'exported')
      ORDER BY mat, dat_bs, ab.created_at
      LIMIT 10000
    `)
      .bind(batchId)
      .all();

    // Build CSV — 12 columns detailed format
    const BOM = '\uFEFF';
    const header =
      'Num_Cont,Mat,Rang_Pres,Nom_Pren_Prest,Dat_Bs,Cod_Act,Frais_Engag,Mnt_Act_Remb,Cod_Msgr,Lib_Msgr,Ref_Prof_Sant,Nom_Prof_Sant';
    const rows = (detailRows.results || []).map((r: Record<string, unknown>) => {
      const escape = (v: unknown) => {
        const s = v != null ? String(v) : '';
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      return [
        escape(r.num_cont),
        escape(r.mat),
        r.rang_pres != null ? Number(r.rang_pres) : 0,
        escape(r.nom_pren_prest),
        escape(r.dat_bs),
        escape(r.cod_act),
        r.frais_engag != null ? Number(r.frais_engag) : 0,
        r.mnt_act_remb != null ? Number(r.mnt_act_remb) : 0,
        escape(r.cod_msgr),
        escape(r.lib_msgr),
        escape(r.ref_prof_sant),
        escape(r.nom_prof_sant),
      ].join(',');
    });

    const csvContent = BOM + header + '\n' + rows.join('\n');
    const today = new Date().toISOString().slice(0, 10);
    const filename = `dhamen_detail_${batchId}_${today}.csv`;

    // Audit trail
    await db
      .prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
      VALUES (?, ?, 'batch_detail_csv_export', 'bulletin_batches', ?, ?, ?, datetime('now'))
    `)
      .bind(
        generateId(),
        user.id,
        batchId,
        JSON.stringify({
          format: 'bordereau_detail',
          rows_count: (detailRows.results || []).length,
        }),
        c.req.header('CF-Connecting-IP') || 'unknown'
      )
      .run();

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Error exporting batch detail:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: `Erreur lors de l'export detaille: ${error instanceof Error ? error.message : String(error)}`,
        },
      },
      500
    );
  }
});

/**
 * GET /bulletins-soins/agent/:id - Get bulletin details with actes
 */
bulletinsAgent.get('/:id', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    const bulletin = await db
      .prepare(
        'SELECT bs.*, b.name as batch_name FROM bulletins_soins bs LEFT JOIN bulletin_batches b ON bs.batch_id = b.id WHERE bs.id = ? AND bs.created_by = ?'
      )
      .bind(bulletinId, user.id)
      .first();

    if (!bulletin) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
        },
        404
      );
    }

    const actes = await db
      .prepare('SELECT * FROM actes_bulletin WHERE bulletin_id = ? ORDER BY created_at')
      .bind(bulletinId)
      .all();

    // Fetch adherent plafond if linked
    let plafondGlobal: number | null = null;
    let plafondConsomme: number | null = null;
    if (bulletin.adherent_id) {
      const adh = await db
        .prepare('SELECT plafond_global, plafond_consomme FROM adherents WHERE id = ?')
        .bind(bulletin.adherent_id)
        .first<{ plafond_global: number | null; plafond_consomme: number | null }>();
      if (adh) {
        plafondGlobal = adh.plafond_global;
        plafondConsomme = adh.plafond_consomme;
      }
    }

    // plafond_consomme_avant = current consumption minus this bulletin's reimbursement
    const reimbursedAmount = (bulletin.reimbursed_amount as number) || 0;
    const plafondConsommeAvant =
      plafondConsomme != null ? plafondConsomme - reimbursedAmount : null;

    return c.json({
      success: true,
      data: {
        ...bulletin,
        actes: actes.results || [],
        plafond_global: plafondGlobal,
        plafond_consomme: plafondConsomme,
        plafond_consomme_avant: plafondConsommeAvant,
      },
    });
  } catch (error) {
    console.error('Error fetching bulletin:', error);
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur de base de donnees' },
      },
      500
    );
  }
});

/**
 * DELETE /bulletins-soins/agent/:id - Delete a draft bulletin
 */
bulletinsAgent.delete('/:id', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    const bulletin = await db
      .prepare('SELECT id, status FROM bulletins_soins WHERE id = ? AND created_by = ?')
      .bind(bulletinId, user.id)
      .first();

    if (!bulletin) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
        },
        404
      );
    }

    if (bulletin.status === 'exported') {
      return c.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Impossible de supprimer un bulletin exporte',
          },
        },
        400
      );
    }

    // Delete actes first, then bulletin
    await db.batch([
      db.prepare('DELETE FROM actes_bulletin WHERE bulletin_id = ?').bind(bulletinId),
      db.prepare('DELETE FROM bulletins_soins WHERE id = ?').bind(bulletinId),
    ]);

    return c.json({ success: true, data: { id: bulletinId } });
  } catch (error) {
    console.error('Error deleting bulletin:', error);
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la suppression' },
      },
      500
    );
  }
});

/**
 * POST /bulletins-soins/agent/create - Create a new bulletin (agent saisie)
 */
bulletinsAgent.post('/create', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const db = c.get('tenantDb') ?? c.env.DB;
  const formData = await c.req.parseBody();

  // Extract form fields
  const bulletinDate = formData['bulletin_date'] as string;
  const adherentMatricule = formData['adherent_matricule'] as string;
  const adherentFirstName = formData['adherent_first_name'] as string;
  const adherentLastName = formData['adherent_last_name'] as string;
  const adherentNationalId = (formData['adherent_national_id'] as string) || null;
  const adherentEmail = (formData['adherent_email'] as string) || null;
  const beneficiaryName = (formData['beneficiary_name'] as string) || null;
  const beneficiaryRelationship = (formData['beneficiary_relationship'] as string) || null;
  const providerName = (formData['provider_name'] as string) || null;
  const providerSpecialty = (formData['provider_specialty'] as string) || null;
  const careType = formData['care_type'] as string;
  const careDescription = (formData['care_description'] as string) || null;
  const batchId = (formData['batch_id'] as string) || null;

  // Parse actes array (JSON string from form)
  const actesRaw = formData['actes'] as string;
  let actes: { code?: string; label: string; amount: number; ref_prof_sant?: string; nom_prof_sant?: string; cod_msgr?: string; lib_msgr?: string }[] = [];

  if (actesRaw) {
    try {
      const parsed = JSON.parse(actesRaw);
      const result = actesArraySchema.safeParse(parsed);
      if (!result.success) {
        return c.json(
          {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: result.error.errors.map((e) => e.message).join(', '),
            },
          },
          400
        );
      }
      actes = result.data;
    } catch {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Format des actes invalide' },
        },
        400
      );
    }
  }

  // Calculate total from actes if provided, otherwise use legacy total_amount field
  const totalAmount =
    actes.length > 0
      ? actes.reduce((sum, a) => sum + a.amount, 0)
      : Number.parseFloat(formData['total_amount'] as string);

  // Validate required fields
  // Note: providerName is optional since REQ-009 moved praticien to per-acte level
  if (
    !bulletinDate ||
    !adherentMatricule ||
    !adherentFirstName ||
    !adherentLastName ||
    !careType ||
    isNaN(totalAmount)
  ) {
    return c.json(
      {
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Champs requis manquants' },
      },
      400
    );
  }

  // Generate bulletin number
  const bulletinId = generateId();
  const bulletinNumber = `BS-${new Date().getFullYear()}-${bulletinId.slice(-8).toUpperCase()}`;

  // Handle file upload (scan)
  let scanUrl: string | null = null;
  const storage = c.env.STORAGE;

  // Find scan files in formData
  for (const key of Object.keys(formData)) {
    if (key.startsWith('scan_') && formData[key] instanceof File) {
      const file = formData[key] as File;
      if (file.size > 0) {
        const fileName = `bulletins/${bulletinId}/${key}_${file.name}`;
        const arrayBuffer = await file.arrayBuffer();
        await storage.put(fileName, arrayBuffer, {
          httpMetadata: { contentType: file.type },
        });
        scanUrl = `https://dhamen-files.${c.env.ENVIRONMENT === 'production' ? '' : 'dev.'}r2.cloudflarestorage.com/${fileName}`;
        break; // Just use the first scan for now
      }
    }
  }

  try {
    // Validate batch if provided
    if (batchId) {
      // INSURER_ADMIN can use any batch from their insurer's companies
      // INSURER_AGENT can only use their own batches
      let batchQuery: string;
      const batchParams: string[] = [batchId];

      if (user.role === 'INSURER_ADMIN' && user.insurerId) {
        batchQuery =
          'SELECT bb.id, bb.status, bb.created_by FROM bulletin_batches bb JOIN companies co ON bb.company_id = co.id WHERE bb.id = ? AND co.insurer_id = ?';
        batchParams.push(user.insurerId);
      } else {
        batchQuery =
          'SELECT id, status, created_by FROM bulletin_batches WHERE id = ? AND created_by = ?';
        batchParams.push(user.id);
      }

      const batch = await db
        .prepare(batchQuery)
        .bind(...batchParams)
        .first();

      if (!batch) {
        return c.json(
          {
            success: false,
            error: { code: 'NOT_FOUND', message: 'Lot non trouve ou non autorise' },
          },
          404
        );
      }

      if (batch.status !== 'open') {
        return c.json(
          {
            success: false,
            error: { code: 'VALIDATION_ERROR', message: "Le lot n'est plus ouvert" },
          },
          400
        );
      }
    }

    // Find adherent by matricule and verify identity coherence
    // Always filter by insurer to prevent cross-insurer data leaks
    let adherentId: string | null = null;
    let adherentResult: Record<string, unknown> | null = null;

    const adherentSelectCols = 'a.id, a.first_name, a.last_name, a.national_id_hash';

    if (user.insurerId) {
      adherentResult = await db
        .prepare(
          `SELECT ${adherentSelectCols} FROM adherents a JOIN companies co ON a.company_id = co.id WHERE a.matricule = ? AND co.insurer_id = ?`
        )
        .bind(adherentMatricule, user.insurerId)
        .first();

      if (!adherentResult && adherentNationalId) {
        adherentResult = await db
          .prepare(
            `SELECT ${adherentSelectCols} FROM adherents a JOIN companies co ON a.company_id = co.id WHERE (a.national_id_encrypted LIKE ? OR a.national_id_hash = ?) AND co.insurer_id = ?`
          )
          .bind(`%${adherentNationalId}%`, adherentNationalId, user.insurerId)
          .first();
      }

      if (!adherentResult && adherentFirstName && adherentLastName) {
        adherentResult = await db
          .prepare(
            `SELECT ${adherentSelectCols} FROM adherents a JOIN companies co ON a.company_id = co.id WHERE a.first_name = ? AND a.last_name = ? AND co.insurer_id = ?`
          )
          .bind(adherentFirstName, adherentLastName, user.insurerId)
          .first();
      }
    } else {
      // ADMIN without insurer — no filter
      adherentResult = await db
        .prepare(`SELECT ${adherentSelectCols} FROM adherents a WHERE a.matricule = ?`)
        .bind(adherentMatricule)
        .first();

      if (!adherentResult && adherentNationalId) {
        adherentResult = await db
          .prepare(
            `SELECT ${adherentSelectCols} FROM adherents a WHERE a.national_id_encrypted LIKE ? OR a.national_id_hash = ?`
          )
          .bind(`%${adherentNationalId}%`, adherentNationalId)
          .first();
      }

      if (!adherentResult && adherentFirstName && adherentLastName) {
        adherentResult = await db
          .prepare(
            `SELECT ${adherentSelectCols} FROM adherents a WHERE a.first_name = ? AND a.last_name = ?`
          )
          .bind(adherentFirstName, adherentLastName)
          .first();
      }
    }

    if (!adherentResult) {
      return c.json(
        {
          success: false,
          error: {
            code: 'ADHERENT_NOT_FOUND',
            message: 'Adhérent non trouvé. Vérifiez le matricule ou le CIN.',
          },
        },
        404
      );
    }

    // Verify identity coherence: matricule must match the name or CIN provided
    const dbFirstName = adherentResult.first_name as string | null;
    const dbLastName = adherentResult.last_name as string | null;
    const nameMatches =
      dbFirstName?.toLowerCase() === adherentFirstName.toLowerCase() &&
      dbLastName?.toLowerCase() === adherentLastName.toLowerCase();
    const cinMatches =
      !adherentNationalId ||
      !adherentResult.national_id_hash ||
      adherentResult.national_id_hash === adherentNationalId;

    if (!nameMatches && !cinMatches) {
      return c.json(
        {
          success: false,
          error: {
            code: 'ADHERENT_IDENTITY_MISMATCH',
            message:
              "Le matricule ne correspond pas au nom/prénom ou CIN saisi. Vérifiez les informations de l'adhérent.",
          },
        },
        400
      );
    }

    if (adherentResult) {
      adherentId = adherentResult.id as string;
      // Update adherent email if provided and not already set
      if (adherentEmail) {
        await db
          .prepare('UPDATE adherents SET email = ? WHERE id = ? AND (email IS NULL OR email = ?)')
          .bind(adherentEmail, adherentId, adherentEmail)
          .run();
      }
      // Update matricule if empty
      if (adherentMatricule) {
        await db
          .prepare(
            'UPDATE adherents SET matricule = ? WHERE id = ? AND (matricule IS NULL OR matricule = "")'
          )
          .bind(adherentMatricule, adherentId)
          .run();
      }
    }

    const status = batchId ? 'in_batch' : 'draft';

    // Fallback: derive provider_name from first acte's nom_prof_sant if not provided at bulletin level
    const effectiveProviderName = providerName || (actes.length > 0 && (actes[0] as Record<string, unknown>).nom_prof_sant) || null;

    // Insert bulletin
    await db
      .prepare(`
      INSERT INTO bulletins_soins (
        id, bulletin_number, bulletin_date, adherent_id, adherent_matricule,
        adherent_first_name, adherent_last_name, adherent_national_id,
        beneficiary_name, beneficiary_relationship,
        provider_name, provider_specialty, care_type, care_description,
        total_amount, scan_url, batch_id, status, created_by,
        submission_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    `)
      .bind(
        bulletinId,
        bulletinNumber,
        bulletinDate,
        adherentId,
        adherentMatricule,
        adherentFirstName,
        adherentLastName,
        adherentNationalId,
        beneficiaryName,
        beneficiaryRelationship,
        effectiveProviderName,
        providerSpecialty,
        careType,
        careDescription,
        totalAmount,
        scanUrl,
        batchId,
        status,
        user.id
      )
      .run();

    // Insert actes and calculate reimbursement
    let reimbursedAmount: number | null = null;

    if (actes.length > 0) {
      // Try contract-bareme-aware calculation first, fallback to legacy
      // Lookup adherent contract for bareme-aware calculation
      let contractId: string | null = null;
      if (adherentId) {
        const contract = await db
          .prepare(
            `SELECT c.id FROM contracts c
           WHERE c.adherent_id = ? AND c.status = 'active'
             AND c.start_date <= ? AND c.end_date >= ?
           LIMIT 1`
          )
          .bind(adherentId, bulletinDate, bulletinDate)
          .first<{ id: string }>();
        contractId = contract?.id ?? null;
      }

      // Resolve acte_ref_id for each acte
      const acteRefs: Array<{
        ref: { id: string; taux_remboursement: number } | null;
        code: string;
      }> = [];
      for (const acte of actes) {
        const code = acte.code?.trim();
        if (code) {
          const ref = await findActeRefByCode(db, code);
          acteRefs.push({ ref: ref as { id: string; taux_remboursement: number } | null, code });
        } else {
          acteRefs.push({ ref: null, code: '' });
        }
      }

      // Contract-bareme-aware calculation (TASK-006)
      if (contractId && adherentId) {
        const baremeResults: CalculRemboursementResult[] = [];
        let totalRembourse = 0;

        for (let i = 0; i < actes.length; i++) {
          const acte = actes[i]!;
          const acteRefInfo = acteRefs[i]!;

          if (acteRefInfo.ref) {
            try {
              const calcInput: CalculRemboursementInput = {
                adherentId,
                contractId,
                acteRefId: acteRefInfo.ref.id,
                fraisEngages: acte.amount,
                dateSoin: bulletinDate,
                typeMaladie: (careType === 'pharmacie_chronique' ? 'chronique' : 'ordinaire') as
                  | 'ordinaire'
                  | 'chronique',
              };
              const result = await calculerRemboursement(db, calcInput);
              baremeResults.push(result);
              totalRembourse += result.montantRembourse;
            } catch {
              // If bareme not found, use legacy calculation for this acte
              baremeResults.push({
                montantRembourse: Math.round(
                  acte.amount * (acteRefInfo.ref.taux_remboursement || 0)
                ),
                typeCalcul: 'taux',
                valeurBareme: acteRefInfo.ref.taux_remboursement || 0,
                plafondActeApplique: false,
                plafondFamilleApplique: false,
                plafondGlobalApplique: false,
                details: {
                  montantBrut: Math.round(acte.amount * (acteRefInfo.ref.taux_remboursement || 0)),
                  apresPlafondActe: Math.round(
                    acte.amount * (acteRefInfo.ref.taux_remboursement || 0)
                  ),
                  apresPlafondFamille: Math.round(
                    acte.amount * (acteRefInfo.ref.taux_remboursement || 0)
                  ),
                  apresPlafondGlobal: Math.round(
                    acte.amount * (acteRefInfo.ref.taux_remboursement || 0)
                  ),
                },
              });
              totalRembourse += baremeResults[baremeResults.length - 1]!.montantRembourse;
            }
          } else {
            baremeResults.push({
              montantRembourse: 0,
              typeCalcul: 'taux',
              valeurBareme: 0,
              plafondActeApplique: false,
              plafondFamilleApplique: false,
              plafondGlobalApplique: false,
              details: {
                montantBrut: 0,
                apresPlafondActe: 0,
                apresPlafondFamille: 0,
                apresPlafondGlobal: 0,
              },
            });
          }
        }

        reimbursedAmount = totalRembourse;

        // Insert actes with bareme-aware reimbursement data
        const stmts = actes.map((acte, i) => {
          const acteId = generateId();
          const baremeResult = baremeResults[i]!;
          return db
            .prepare(
              `INSERT INTO actes_bulletin (id, bulletin_id, code, label, amount, taux_remboursement, montant_rembourse, remboursement_brut, plafond_depasse, acte_ref_id, ref_prof_sant, nom_prof_sant, cod_msgr, lib_msgr, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM actes_referentiel WHERE code = ? AND is_active = 1), ?, ?, ?, ?, datetime('now'))`
            )
            .bind(
              acteId,
              bulletinId,
              acte.code?.trim() || null,
              acte.label,
              acte.amount,
              baremeResult.valeurBareme,
              baremeResult.montantRembourse,
              baremeResult.details.montantBrut,
              baremeResult.plafondActeApplique ||
                baremeResult.plafondFamilleApplique ||
                baremeResult.plafondGlobalApplique
                ? 1
                : 0,
              acte.code?.trim() || null,
              acte.ref_prof_sant?.trim() || null,
              acte.nom_prof_sant?.trim() || null,
              acte.cod_msgr?.trim() || null,
              acte.lib_msgr?.trim() || null
            );
        });
        await db.batch(stmts);

        // Update bulletin reimbursed_amount
        await db
          .prepare('UPDATE bulletins_soins SET reimbursed_amount = ? WHERE id = ?')
          .bind(reimbursedAmount, bulletinId)
          .run();

        // Update plafonds via mettreAJourPlafonds for each acte (TASK-006)
        const annee = Number(bulletinDate.split('-')[0]);
        for (let i = 0; i < actes.length; i++) {
          const acteRefInfo = acteRefs[i]!;
          const baremeResult = baremeResults[i]!;
          if (acteRefInfo.ref && baremeResult.montantRembourse > 0) {
            // Lookup famille_id from actes_referentiel
            const acteRefRow = await db
              .prepare('SELECT famille_id FROM actes_referentiel WHERE id = ?')
              .bind(acteRefInfo.ref.id)
              .first<{ famille_id: string | null }>();

            await mettreAJourPlafonds(
              db,
              adherentId,
              contractId,
              annee,
              acteRefRow?.famille_id ?? null,
              baremeResult.montantRembourse,
              (careType === 'pharmacie_chronique' ? 'chronique' : 'ordinaire') as
                | 'ordinaire'
                | 'chronique'
            );
          }
        }

        // Also update legacy adherent plafond_consomme for backward compat
        if (reimbursedAmount > 0) {
          await db
            .prepare(
              'UPDATE adherents SET plafond_consomme = COALESCE(plafond_consomme, 0) + ? WHERE id = ?'
            )
            .bind(reimbursedAmount, adherentId)
            .run();
        }
      } else {
        // Legacy calculation fallback (no contract found)
        const actesInput: ActeInput[] = [];
        for (let i = 0; i < actes.length; i++) {
          const acte = actes[i]!;
          const acteRefInfo = acteRefs[i]!;
          actesInput.push({
            code: acteRefInfo.code || '',
            label: acte.label,
            montantActe: acte.amount,
            tauxRemboursement: acteRefInfo.ref?.taux_remboursement || 0,
          });
        }

        // Get adherent plafond
        let plafondRestant = 0;
        if (adherentId) {
          const adh = await db
            .prepare('SELECT plafond_global, plafond_consomme FROM adherents WHERE id = ?')
            .bind(adherentId)
            .first<{ plafond_global: number | null; plafond_consomme: number | null }>();
          if (adh && adh.plafond_global) {
            plafondRestant = adh.plafond_global - (adh.plafond_consomme || 0);
          }
        }

        // Calculate reimbursement (legacy)
        const calcul = calculateRemboursementBulletin(actesInput, plafondRestant);
        reimbursedAmount = calcul.totalRembourse;

        // Insert actes with reimbursement data
        const stmts = actes.map((acte, i) => {
          const acteId = generateId();
          const acteResult = calcul.actes[i]!;
          return db
            .prepare(
              `INSERT INTO actes_bulletin (id, bulletin_id, code, label, amount, taux_remboursement, montant_rembourse, remboursement_brut, plafond_depasse, acte_ref_id, ref_prof_sant, nom_prof_sant, cod_msgr, lib_msgr, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM actes_referentiel WHERE code = ? AND is_active = 1), ?, ?, ?, ?, datetime('now'))`
            )
            .bind(
              acteId,
              bulletinId,
              acte.code?.trim() || null,
              acte.label,
              acte.amount,
              acteResult.tauxRemboursement,
              acteResult.remboursementFinal,
              acteResult.remboursementBrut,
              acteResult.plafondDepasse ? 1 : 0,
              acte.code?.trim() || null,
              acte.ref_prof_sant?.trim() || null,
              acte.nom_prof_sant?.trim() || null,
              acte.cod_msgr?.trim() || null,
              acte.lib_msgr?.trim() || null
            );
        });
        await db.batch(stmts);

        // Update bulletin reimbursed_amount
        await db
          .prepare('UPDATE bulletins_soins SET reimbursed_amount = ? WHERE id = ?')
          .bind(reimbursedAmount, bulletinId)
          .run();

        // Update adherent plafond_consomme
        if (adherentId && reimbursedAmount > 0) {
          await db
            .prepare(
              'UPDATE adherents SET plafond_consomme = COALESCE(plafond_consomme, 0) + ? WHERE id = ?'
            )
            .bind(reimbursedAmount, adherentId)
            .run();
        }
      }
    }

    return c.json(
      {
        success: true,
        data: {
          id: bulletinId,
          bulletin_number: bulletinNumber,
          status,
          actes_count: actes.length,
          reimbursed_amount: reimbursedAmount,
        },
      },
      201
    );
  } catch (error) {
    console.error('Error creating bulletin:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'DATABASE_ERROR',
          message: error instanceof Error ? error.message : 'Erreur lors de la creation',
        },
      },
      500
    );
  }
});

/**
 * POST /bulletins-soins/batches - Create a new batch for a company
 */
bulletinsAgent.post('/batches', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const db = c.get('tenantDb') ?? c.env.DB;
  const body = await c.req.json();

  const parsed = createBatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors.map((e) => e.message).join(', '),
        },
      },
      400
    );
  }

  const { name, companyId } = parsed.data;

  try {
    // Verify company belongs to agent's insurer
    if (user.insurerId) {
      const company = await db
        .prepare('SELECT id FROM companies WHERE id = ? AND insurer_id = ?')
        .bind(companyId, user.insurerId)
        .first();

      if (!company) {
        return c.json(
          {
            success: false,
            error: { code: 'FORBIDDEN', message: 'Entreprise non autorisee' },
          },
          403
        );
      }
    }

    const batchId = generateId();

    await db
      .prepare(`
      INSERT INTO bulletin_batches (id, name, status, company_id, created_by, created_at)
      VALUES (?, ?, 'open', ?, ?, datetime('now'))
    `)
      .bind(batchId, name, companyId, user.id)
      .run();

    return c.json(
      {
        success: true,
        data: { id: batchId, name, companyId, status: 'open' },
      },
      201
    );
  } catch (error) {
    console.error('Error creating batch:', error);
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la creation du lot' },
      },
      500
    );
  }
});

/**
 * POST /bulletins-soins/agent/:id/validate - Validate a bulletin and record reimbursement
 */
bulletinsAgent.post('/:id/validate', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;

  const body = await c.req.json();
  const parsed = validateBulletinSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parsed.error.errors.map((e) => e.message).join(', '),
        },
      },
      400
    );
  }

  const { reimbursed_amount, notes } = parsed.data;

  try {
    // Fetch bulletin and verify ownership
    const bulletin = await db
      .prepare(
        'SELECT id, status, adherent_id, reimbursed_amount, bulletin_number, care_type, bulletin_date FROM bulletins_soins WHERE id = ? AND created_by = ?'
      )
      .bind(bulletinId, user.id)
      .first<{
        id: string;
        status: string;
        adherent_id: string | null;
        reimbursed_amount: number | null;
        bulletin_number: string;
        care_type: string | null;
        bulletin_date: string | null;
      }>();

    if (!bulletin) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
        },
        404
      );
    }

    // Only draft, in_batch, or processing bulletins can be validated
    const validStatuses = ['draft', 'in_batch', 'processing'];
    if (!validStatuses.includes(bulletin.status)) {
      return c.json(
        {
          success: false,
          error: {
            code: 'BULLETIN_ALREADY_VALIDATED',
            message: 'Ce bulletin a deja ete valide ou est dans un statut final',
          },
        },
        409
      );
    }

    const now = new Date().toISOString();

    // Update bulletin status and reimbursement
    await db
      .prepare(`
      UPDATE bulletins_soins
      SET status = 'approved',
          reimbursed_amount = ?,
          validated_at = ?,
          validated_by = ?,
          approved_date = ?,
          approved_amount = ?,
          updated_at = ?
      WHERE id = ?
    `)
      .bind(reimbursed_amount, now, user.id, now, reimbursed_amount, now, bulletinId)
      .run();

    // Update adherent plafond_consomme (adjust delta if reimbursement changed)
    if (bulletin.adherent_id) {
      const previousAmount = bulletin.reimbursed_amount || 0;
      const delta = reimbursed_amount - previousAmount;
      if (delta !== 0) {
        await db
          .prepare(
            'UPDATE adherents SET plafond_consomme = COALESCE(plafond_consomme, 0) + ? WHERE id = ?'
          )
          .bind(delta, bulletin.adherent_id)
          .run();
      }
    }

    // Audit log
    await db
      .prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
      VALUES (?, ?, 'bulletin_validated', 'bulletins_soins', ?, ?, ?, datetime('now'))
    `)
      .bind(
        generateId(),
        user.id,
        bulletinId,
        JSON.stringify({
          reimbursed_amount,
          notes: notes || null,
          previous_status: bulletin.status,
        }),
        c.req.header('CF-Connecting-IP') || 'unknown'
      )
      .run();

    const response: ValidateBulletinResponse = {
      id: bulletinId,
      status: 'approved',
      reimbursed_amount,
      validated_at: now,
      validated_by: user.id,
    };

    // Fire-and-forget: notify adherent (in-app + push + realtime)
    if (bulletin.adherent_id) {
      const bulletinNumber = bulletin.bulletin_number;
      const careType = bulletin.care_type || 'soin';
      const formatAmt = (v: number) => v.toFixed(3);
      const notifBody = `Votre bulletin ${bulletinNumber} (${careType}) a ete approuve. Montant rembourse : ${formatAmt(reimbursed_amount)} TND.`;
      const notifTitle = `Bulletin ${bulletinNumber} approuve`;

      c.executionCtx.waitUntil(
        (async () => {
          try {
            const adherent = await db
              .prepare('SELECT email FROM adherents WHERE id = ?')
              .bind(bulletin.adherent_id)
              .first<{ email: string }>();
            if (!adherent?.email) return;

            // Find user account by email
            let userId: string | null = null;
            const tenantUser = await db
              .prepare('SELECT id FROM users WHERE email = ? AND is_active = 1')
              .bind(adherent.email)
              .first<{ id: string }>();
            if (tenantUser) userId = tenantUser.id;
            if (!userId) {
              const platformUser = await c.env.DB.prepare(
                'SELECT id FROM users WHERE email = ? AND is_active = 1'
              )
                .bind(adherent.email)
                .first<{ id: string }>();
              if (platformUser) userId = platformUser.id;
            }
            if (!userId) return;

            const notifId = generateId();

            // 1. In-app notification — tenant DB
            await db
              .prepare(`
              INSERT INTO notifications (id, user_id, type, event_type, title, body, entity_id, entity_type, status, created_at)
              VALUES (?, ?, 'IN_APP', 'SANTE_DEMANDE_APPROUVEE', ?, ?, ?, 'bulletin', 'PENDING', ?)
            `)
              .bind(notifId, userId, notifTitle, notifBody, bulletinId, now)
              .run();

            // Also write to platform DB for mobile
            if (db !== c.env.DB) {
              await c.env.DB.prepare(`
                INSERT INTO notifications (id, user_id, type, event_type, title, body, entity_id, entity_type, status, created_at)
                VALUES (?, ?, 'IN_APP', 'SANTE_DEMANDE_APPROUVEE', ?, ?, ?, 'bulletin', 'PENDING', ?)
              `)
                .bind(notifId, userId, notifTitle, notifBody, bulletinId, now)
                .run()
                .catch(() => {});
            }

            // 2. Push notification
            const pushService = new PushNotificationService(c.env);
            await pushService
              .sendSanteNotification(userId, 'SANTE_DEMANDE_APPROUVEE', {
                demandeId: bulletinId,
                numeroDemande: bulletinNumber,
                typeSoin: careType,
                dateSoin: bulletin.bulletin_date || '',
                montantRembourse: String(reimbursed_amount),
              })
              .catch(() => {});

            // 3. Realtime WebSocket
            if (c.env.NOTIFICATION_HUB) {
              const realtimeService = new RealtimeNotificationsService(c);
              await realtimeService
                .sendToUser(userId, {
                  id: notifId,
                  type: 'SANTE_DEMANDE_APPROUVEE',
                  title: notifTitle,
                  message: notifBody,
                  createdAt: now,
                  read: false,
                  data: {
                    demandeId: bulletinId,
                    numeroDemande: bulletinNumber,
                    statut: 'approved',
                    typeSoin: careType,
                    montantRembourse: reimbursed_amount,
                  },
                })
                .catch(() => {});
            }
          } catch (err) {
            console.error('Notification failed:', err);
          }
        })()
      );
    }

    return c.json({ success: true, data: response });
  } catch (error) {
    console.error('Error validating bulletin:', error);
    return c.json(
      {
        success: false,
        error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la validation' },
      },
      500
    );
  }
});

/**
 * POST /bulletins-soins/agent/:id/upload-scan - Upload a scan for a bulletin
 */
bulletinsAgent.post('/:id/upload-scan', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;
  const storage = c.env.STORAGE;

  try {
    // Verify bulletin ownership
    const bulletin = await db
      .prepare('SELECT id FROM bulletins_soins WHERE id = ? AND created_by = ?')
      .bind(bulletinId, user.id)
      .first();

    if (!bulletin) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
        },
        404
      );
    }

    // Parse multipart form data
    const formData = await c.req.parseBody();
    const file = formData['scan'] as File | undefined;

    if (!file || !(file instanceof File) || file.size === 0) {
      return c.json(
        {
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Fichier scan requis' },
        },
        400
      );
    }

    // Validate MIME type
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      return c.json(
        {
          success: false,
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'Type de fichier non supporte. Formats acceptes : JPEG, PNG, PDF',
          },
        },
        400
      );
    }

    // Validate file size (10 MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return c.json(
        {
          success: false,
          error: { code: 'FILE_TOO_LARGE', message: 'Le fichier ne doit pas depasser 10 Mo' },
        },
        400
      );
    }

    // Upload to R2
    const r2Key = `bulletins/${bulletinId}/${file.name}`;
    const arrayBuffer = await file.arrayBuffer();
    await storage.put(r2Key, arrayBuffer, {
      httpMetadata: { contentType: file.type },
      customMetadata: { uploadedBy: user.id, bulletinId },
    });

    const scanUrl = `https://dhamen-files.r2.cloudflarestorage.com/${r2Key}`;

    // Update bulletin with scan info
    await db
      .prepare(`
      UPDATE bulletins_soins
      SET scan_url = ?, scan_filename = ?, updated_at = datetime('now')
      WHERE id = ?
    `)
      .bind(scanUrl, file.name, bulletinId)
      .run();

    // Audit log
    await db
      .prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
      VALUES (?, ?, 'scan_uploaded', 'bulletins_soins', ?, ?, ?, datetime('now'))
    `)
      .bind(
        generateId(),
        user.id,
        bulletinId,
        JSON.stringify({ filename: file.name, size: file.size, mime_type: file.type }),
        c.req.header('CF-Connecting-IP') || 'unknown'
      )
      .run();

    return c.json({
      success: true,
      data: { scan_url: scanUrl, scan_filename: file.name },
    });
  } catch (error) {
    console.error('Error uploading scan:', error);
    return c.json(
      {
        success: false,
        error: { code: 'STORAGE_ERROR', message: "Erreur lors de l'upload du scan" },
      },
      500
    );
  }
});

/**
 * GET /bulletins-soins/agent/:id/scan - Download the scan attached to a bulletin
 */
bulletinsAgent.get('/:id/scan', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json(
      {
        success: false,
        error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
      },
      403
    );
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;
  const storage = c.env.STORAGE;

  try {
    const query = user.role === 'INSURER_ADMIN' || user.role === 'ADMIN'
      ? db.prepare('SELECT scan_url, scan_filename FROM bulletins_soins WHERE id = ?').bind(bulletinId)
      : db.prepare('SELECT scan_url, scan_filename FROM bulletins_soins WHERE id = ? AND created_by = ?').bind(bulletinId, user.id);
    const bulletin = await query.first<{ scan_url: string | null; scan_filename: string | null }>();

    if (!bulletin) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
        },
        404
      );
    }

    if (!bulletin.scan_url) {
      return c.json(
        {
          success: false,
          error: { code: 'SCAN_NOT_FOUND', message: 'Aucun scan attache a ce bulletin' },
        },
        404
      );
    }

    // Extract R2 key from URL
    const R2_URL_PREFIX = 'https://dhamen-files.r2.cloudflarestorage.com/';
    const r2Key = bulletin.scan_url.startsWith(R2_URL_PREFIX)
      ? bulletin.scan_url.slice(R2_URL_PREFIX.length)
      : bulletin.scan_url;

    const object = await storage.get(r2Key);

    if (!object) {
      return c.json(
        {
          success: false,
          error: { code: 'STORAGE_ERROR', message: 'Fichier introuvable dans le stockage' },
        },
        500
      );
    }

    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Content-Disposition', `inline; filename="${bulletin.scan_filename || 'scan'}"`);

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('Error downloading scan:', error);
    return c.json(
      {
        success: false,
        error: { code: 'STORAGE_ERROR', message: 'Erreur lors du chargement du scan' },
      },
      500
    );
  }
});

export { bulletinsAgent };
