/**
 * Bulletins Agent Routes
 * Routes for insurance agents to create, manage batches, and export bulletins
 */
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { generateULID } from '../lib/ulid';
import type { Bindings, Variables } from '../types';

const bulletinsAgent = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
bulletinsAgent.use('*', authMiddleware);

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

  const db = c.get('db');
  const status = c.req.query('status') || 'draft,in_batch';
  const search = c.req.query('search');

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

  const db = c.get('db');
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
  const totalAmount = parseFloat(formData['total_amount'] as string);

  // Validate required fields
  if (!bulletinDate || !adherentMatricule || !adherentFirstName || !adherentLastName ||
      !adherentNationalId || !providerName || !careType || isNaN(totalAmount)) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Champs requis manquants' },
    }, 400);
  }

  // Generate bulletin number
  const bulletinId = generateULID();
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
    // Find adherent by matricule (optional - we still create the bulletin even if not found)
    let adherentId: string | null = null;
    const adherentResult = await db.prepare(
      'SELECT id FROM adherents WHERE matricule = ?'
    ).bind(adherentMatricule).first();

    if (adherentResult) {
      adherentId = adherentResult.id as string;
    }

    // Insert bulletin
    await db.prepare(`
      INSERT INTO bulletins_soins (
        id, bulletin_number, bulletin_date, adherent_id, adherent_matricule,
        adherent_first_name, adherent_last_name, adherent_national_id,
        beneficiary_name, beneficiary_relationship,
        provider_name, provider_specialty, care_type, care_description,
        total_amount, scan_url, status, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, datetime('now'))
    `).bind(
      bulletinId, bulletinNumber, bulletinDate, adherentId, adherentMatricule,
      adherentFirstName, adherentLastName, adherentNationalId,
      beneficiaryName, beneficiaryRelationship,
      providerName, providerSpecialty, careType, careDescription,
      totalAmount, scanUrl, user.id
    ).run();

    return c.json({
      success: true,
      data: {
        id: bulletinId,
        bulletin_number: bulletinNumber,
      },
    }, 201);
  } catch (error) {
    console.error('Error creating bulletin:', error);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la creation' },
    }, 500);
  }
});

/**
 * GET /bulletins-soins/batches - List batches
 */
bulletinsAgent.get('/batches', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
    }, 403);
  }

  const db = c.get('db');

  try {
    const results = await db.prepare(`
      SELECT
        b.*,
        COUNT(bs.id) as bulletins_count,
        COALESCE(SUM(bs.total_amount), 0) as total_amount
      FROM bulletin_batches b
      LEFT JOIN bulletins_soins bs ON bs.batch_id = b.id
      WHERE b.created_by = ?
      GROUP BY b.id
      ORDER BY b.created_at DESC
    `).bind(user.id).all();

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
 * POST /bulletins-soins/batches - Create a new batch
 */
bulletinsAgent.post('/batches', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
    }, 403);
  }

  const db = c.get('db');
  const body = await c.req.json<{ name: string; bulletinIds: string[] }>();

  if (!body.name || !body.bulletinIds || body.bulletinIds.length === 0) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Nom et bulletins requis' },
    }, 400);
  }

  const batchId = generateULID();

  try {
    // Create batch
    await db.prepare(`
      INSERT INTO bulletin_batches (id, name, status, created_by, created_at)
      VALUES (?, ?, 'open', ?, datetime('now'))
    `).bind(batchId, body.name, user.id).run();

    // Update bulletins to link to batch
    const placeholders = body.bulletinIds.map(() => '?').join(',');
    await db.prepare(`
      UPDATE bulletins_soins
      SET batch_id = ?, status = 'in_batch'
      WHERE id IN (${placeholders}) AND created_by = ? AND status = 'draft'
    `).bind(batchId, ...body.bulletinIds, user.id).run();

    return c.json({
      success: true,
      data: { id: batchId, name: body.name },
    }, 201);
  } catch (error) {
    console.error('Error creating batch:', error);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la creation du lot' },
    }, 500);
  }
});

/**
 * GET /bulletins-soins/batches/:id/export - Export batch as CSV
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
  const db = c.get('db');

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

export { bulletinsAgent };
