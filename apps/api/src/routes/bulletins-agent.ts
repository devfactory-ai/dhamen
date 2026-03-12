/**
 * Bulletins Agent Routes
 * Routes for insurance agents to create, manage batches, and export bulletins
 */
import { createBatchSchema, actesArraySchema } from '@dhamen/shared';
import type { ActeInput } from '@dhamen/shared';
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { generateId } from '../lib/ulid';
import { calculateRemboursementBulletin } from '../services/remboursement.service';
import { findActeRefByCode, listActesReferentiel } from '@dhamen/db';
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
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Erreur chargement referentiel' },
    }, 500);
  }
});

/**
 * GET /bulletins-soins/agent - List agent's bulletins
 */
bulletinsAgent.get('/', async (c) => {
  const user = c.get('user');

  // Only for agents
  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
    }, 403);
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
    AND bs.status IN (${status.split(',').map(() => '?').join(',')})
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
    const results = await db.prepare(query).bind(...params).all();

    return c.json({
      success: true,
      data: results.results || [],
    });
  } catch (error) {
    console.error('Error fetching agent bulletins:', error);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Erreur de base de donnees' },
    }, 500);
  }
});

/**
 * GET /bulletins-soins/batches - List batches filtered by company and status
 * NOTE: Must be defined BEFORE /:id to avoid route conflict
 */
bulletinsAgent.get('/batches', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
    }, 403);
  }

  const companyId = c.req.query('companyId');
  const status = c.req.query('status') || 'open';

  if (!companyId) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'companyId requis' },
    }, 400);
  }

  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    // Verify company belongs to agent's insurer
    if (user.insurerId) {
      const company = await db.prepare(
        'SELECT id FROM companies WHERE id = ? AND insurer_id = ?'
      ).bind(companyId, user.insurerId).first();

      if (!company) {
        return c.json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Entreprise non autorisee' },
        }, 403);
      }
    }

    const results = await db.prepare(`
      SELECT *
      FROM bulletin_batches
      WHERE company_id = ? AND status = ?
      ORDER BY created_at DESC
    `).bind(companyId, status).all();

    return c.json({
      success: true,
      data: results.results || [],
    });
  } catch (error) {
    console.error('Error fetching batches:', error);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Erreur de base de donnees' },
    }, 500);
  }
});

/**
 * GET /bulletins-soins/batches/:id/export - Export batch as CSV
 * NOTE: Must be defined BEFORE /:id to avoid route conflict
 */
bulletinsAgent.get('/batches/:id/export', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
    }, 403);
  }

  const batchId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    // Verify batch ownership
    const batch = await db.prepare(`
      SELECT * FROM bulletin_batches WHERE id = ? AND created_by = ?
    `).bind(batchId, user.id).first();

    if (!batch) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Lot non trouve' },
      }, 404);
    }

    // Get bulletins in batch
    const bulletins = await db.prepare(`
      SELECT * FROM bulletins_soins WHERE batch_id = ? ORDER BY bulletin_date
    `).bind(batchId).all();

    // Generate CSV
    const headers = [
      'Numero Bulletin',
      'Date Bulletin',
      'Matricule Adherent',
      'Nom Adherent',
      'Prenom Adherent',
      'CIN',
      'Beneficiaire',
      'Lien Parente',
      'Nom Praticien',
      'Specialite',
      'Type Soin',
      'Description',
      'Montant TND',
    ];

    const rows = (bulletins.results || []).map((b: Record<string, unknown>) => [
      b.bulletin_number,
      b.bulletin_date,
      b.adherent_matricule,
      b.adherent_last_name,
      b.adherent_first_name,
      b.adherent_national_id,
      b.beneficiary_name || '',
      b.beneficiary_relationship || '',
      b.provider_name,
      b.provider_specialty || '',
      b.care_type,
      b.care_description || '',
      (b.total_amount as number).toFixed(3),
    ]);

    // Add BOM for Excel UTF-8 support
    const BOM = '\uFEFF';
    const csvContent = BOM + [
      headers.join(';'),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';')),
    ].join('\n');

    // Mark batch as exported
    await db.prepare(`
      UPDATE bulletin_batches SET status = 'exported', exported_at = datetime('now') WHERE id = ?
    `).bind(batchId).run();

    // Mark bulletins as exported
    await db.prepare(`
      UPDATE bulletins_soins SET status = 'exported' WHERE batch_id = ?
    `).bind(batchId).run();

    return new Response(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${batch.name}_export.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting batch:', error);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Erreur lors de l\'export' },
    }, 500);
  }
});

/**
 * GET /bulletins-soins/agent/:id - Get bulletin details with actes
 */
bulletinsAgent.get('/:id', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
    }, 403);
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    const bulletin = await db.prepare(
      'SELECT bs.*, b.name as batch_name FROM bulletins_soins bs LEFT JOIN bulletin_batches b ON bs.batch_id = b.id WHERE bs.id = ? AND bs.created_by = ?'
    ).bind(bulletinId, user.id).first();

    if (!bulletin) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
      }, 404);
    }

    const actes = await db.prepare(
      'SELECT * FROM actes_bulletin WHERE bulletin_id = ? ORDER BY created_at'
    ).bind(bulletinId).all();

    // Fetch adherent plafond if linked
    let plafondGlobal: number | null = null;
    let plafondConsomme: number | null = null;
    if (bulletin.adherent_id) {
      const adh = await db.prepare(
        'SELECT plafond_global, plafond_consomme FROM adherents WHERE id = ?'
      ).bind(bulletin.adherent_id).first<{ plafond_global: number | null; plafond_consomme: number | null }>();
      if (adh) {
        plafondGlobal = adh.plafond_global;
        plafondConsomme = adh.plafond_consomme;
      }
    }

    // plafond_consomme_avant = current consumption minus this bulletin's reimbursement
    const reimbursedAmount = (bulletin.reimbursed_amount as number) || 0;
    const plafondConsommeAvant = plafondConsomme != null ? plafondConsomme - reimbursedAmount : null;

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
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Erreur de base de donnees' },
    }, 500);
  }
});

/**
 * DELETE /bulletins-soins/agent/:id - Delete a draft bulletin
 */
bulletinsAgent.delete('/:id', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
    }, 403);
  }

  const bulletinId = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    const bulletin = await db.prepare(
      'SELECT id, status FROM bulletins_soins WHERE id = ? AND created_by = ?'
    ).bind(bulletinId, user.id).first();

    if (!bulletin) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
      }, 404);
    }

    if (bulletin.status === 'exported') {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Impossible de supprimer un bulletin exporte' },
      }, 400);
    }

    // Delete actes first, then bulletin
    await db.batch([
      db.prepare('DELETE FROM actes_bulletin WHERE bulletin_id = ?').bind(bulletinId),
      db.prepare('DELETE FROM bulletins_soins WHERE id = ?').bind(bulletinId),
    ]);

    return c.json({ success: true, data: { id: bulletinId } });
  } catch (error) {
    console.error('Error deleting bulletin:', error);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la suppression' },
    }, 500);
  }
});

/**
 * POST /bulletins-soins/agent/create - Create a new bulletin (agent saisie)
 */
bulletinsAgent.post('/create', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
    }, 403);
  }

  const db = c.get('tenantDb') ?? c.env.DB;
  const formData = await c.req.parseBody();

  // Extract form fields
  const bulletinDate = formData['bulletin_date'] as string;
  const adherentMatricule = formData['adherent_matricule'] as string;
  const adherentFirstName = formData['adherent_first_name'] as string;
  const adherentLastName = formData['adherent_last_name'] as string;
  const adherentNationalId = formData['adherent_national_id'] as string;
  const beneficiaryName = formData['beneficiary_name'] as string || null;
  const beneficiaryRelationship = formData['beneficiary_relationship'] as string || null;
  const providerName = formData['provider_name'] as string;
  const providerSpecialty = formData['provider_specialty'] as string || null;
  const careType = formData['care_type'] as string;
  const careDescription = formData['care_description'] as string || null;
  const batchId = formData['batch_id'] as string || null;

  // Parse actes array (JSON string from form)
  const actesRaw = formData['actes'] as string;
  let actes: { code?: string; label: string; amount: number }[] = [];

  if (actesRaw) {
    try {
      const parsed = JSON.parse(actesRaw);
      const result = actesArraySchema.safeParse(parsed);
      if (!result.success) {
        return c.json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: result.error.errors.map((e) => e.message).join(', '),
          },
        }, 400);
      }
      actes = result.data;
    } catch {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Format des actes invalide' },
      }, 400);
    }
  }

  // Calculate total from actes if provided, otherwise use legacy total_amount field
  const totalAmount = actes.length > 0
    ? actes.reduce((sum, a) => sum + a.amount, 0)
    : parseFloat(formData['total_amount'] as string);

  // Validate required fields
  if (!bulletinDate || !adherentMatricule || !adherentFirstName || !adherentLastName ||
      !adherentNationalId || !providerName || !careType || isNaN(totalAmount)) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Champs requis manquants' },
    }, 400);
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
      const batch = await db.prepare(
        'SELECT id, status, created_by FROM bulletin_batches WHERE id = ? AND created_by = ?'
      ).bind(batchId, user.id).first();

      if (!batch) {
        return c.json({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Lot non trouve ou non autorise' },
        }, 404);
      }

      if (batch.status !== 'open') {
        return c.json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Le lot n\'est plus ouvert' },
        }, 400);
      }
    }

    // Find adherent by matricule (optional - we still create the bulletin even if not found)
    let adherentId: string | null = null;
    const adherentResult = await db.prepare(
      'SELECT id FROM adherents WHERE matricule = ?'
    ).bind(adherentMatricule).first();

    if (adherentResult) {
      adherentId = adherentResult.id as string;
    }

    const status = batchId ? 'in_batch' : 'draft';

    // Insert bulletin
    await db.prepare(`
      INSERT INTO bulletins_soins (
        id, bulletin_number, bulletin_date, adherent_id, adherent_matricule,
        adherent_first_name, adherent_last_name, adherent_national_id,
        beneficiary_name, beneficiary_relationship,
        provider_name, provider_specialty, care_type, care_description,
        total_amount, scan_url, batch_id, status, created_by,
        submission_date, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
    `).bind(
      bulletinId, bulletinNumber, bulletinDate, adherentId, adherentMatricule,
      adherentFirstName, adherentLastName, adherentNationalId,
      beneficiaryName, beneficiaryRelationship,
      providerName, providerSpecialty, careType, careDescription,
      totalAmount, scanUrl, batchId, status, user.id
    ).run();

    // Insert actes and calculate reimbursement
    let reimbursedAmount: number | null = null;

    if (actes.length > 0) {
      // Resolve taux from actes_referentiel and build ActeInput[]
      const actesInput: ActeInput[] = [];
      for (const acte of actes) {
        let taux = 0;
        const code = acte.code?.trim();
        if (code) {
          const ref = await findActeRefByCode(db, code);
          if (ref) {
            taux = ref.taux_remboursement;
          }
        }
        actesInput.push({
          code: code || '',
          label: acte.label,
          montantActe: acte.amount,
          tauxRemboursement: taux,
        });
      }

      // Get adherent plafond
      let plafondRestant = 0;
      if (adherentId) {
        const adh = await db.prepare(
          'SELECT plafond_global, plafond_consomme FROM adherents WHERE id = ?'
        ).bind(adherentId).first<{ plafond_global: number | null; plafond_consomme: number | null }>();
        if (adh && adh.plafond_global) {
          plafondRestant = adh.plafond_global - (adh.plafond_consomme || 0);
        }
      }

      // Calculate reimbursement
      const calcul = calculateRemboursementBulletin(actesInput, plafondRestant);
      reimbursedAmount = calcul.totalRembourse;

      // Insert actes with reimbursement data
      const stmts = actes.map((acte, i) => {
        const acteId = generateId();
        const acteResult = calcul.actes[i]!;
        return db.prepare(
          `INSERT INTO actes_bulletin (id, bulletin_id, code, label, amount, taux_remboursement, montant_rembourse, remboursement_brut, plafond_depasse, acte_ref_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT id FROM actes_referentiel WHERE code = ? AND is_active = 1), datetime('now'))`
        ).bind(
          acteId, bulletinId, acte.code?.trim() || null, acte.label, acte.amount,
          acteResult.tauxRemboursement, acteResult.remboursementFinal,
          acteResult.remboursementBrut, acteResult.plafondDepasse ? 1 : 0,
          acte.code?.trim() || null
        );
      });
      await db.batch(stmts);

      // Update bulletin reimbursed_amount
      await db.prepare(
        'UPDATE bulletins_soins SET reimbursed_amount = ? WHERE id = ?'
      ).bind(reimbursedAmount, bulletinId).run();

      // Update adherent plafond_consomme
      if (adherentId && reimbursedAmount > 0) {
        await db.prepare(
          'UPDATE adherents SET plafond_consomme = COALESCE(plafond_consomme, 0) + ? WHERE id = ?'
        ).bind(reimbursedAmount, adherentId).run();
      }
    }

    return c.json({
      success: true,
      data: {
        id: bulletinId,
        bulletin_number: bulletinNumber,
        status,
        actes_count: actes.length,
        reimbursed_amount: reimbursedAmount,
      },
    }, 201);
  } catch (error) {
    console.error('Error creating bulletin:', error);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error instanceof Error ? error.message : 'Erreur lors de la creation' },
    }, 500);
  }
});

/**
 * POST /bulletins-soins/batches - Create a new batch for a company
 */
bulletinsAgent.post('/batches', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
    }, 403);
  }

  const db = c.get('tenantDb') ?? c.env.DB;
  const body = await c.req.json();

  const parsed = createBatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: parsed.error.errors.map((e) => e.message).join(', '),
      },
    }, 400);
  }

  const { name, companyId } = parsed.data;

  try {
    // Verify company belongs to agent's insurer
    if (user.insurerId) {
      const company = await db.prepare(
        'SELECT id FROM companies WHERE id = ? AND insurer_id = ?'
      ).bind(companyId, user.insurerId).first();

      if (!company) {
        return c.json({
          success: false,
          error: { code: 'FORBIDDEN', message: 'Entreprise non autorisee' },
        }, 403);
      }
    }

    const batchId = generateId();

    await db.prepare(`
      INSERT INTO bulletin_batches (id, name, status, company_id, created_by, created_at)
      VALUES (?, ?, 'open', ?, ?, datetime('now'))
    `).bind(batchId, name, companyId, user.id).run();

    return c.json({
      success: true,
      data: { id: batchId, name, companyId, status: 'open' },
    }, 201);
  } catch (error) {
    console.error('Error creating batch:', error);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la creation du lot' },
    }, 500);
  }
});

export { bulletinsAgent };
