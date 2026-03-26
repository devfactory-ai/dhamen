/**
 * Medications Routes
 *
 * API endpoints for medication management and CSV import
 * Data source: Pharmacie Centrale de Tunisie (PCT)
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware, requireRole } from '../middleware/auth';
import { success, error, paginated, created, notFound, badRequest } from '../lib/response';
import { generateId } from '../lib/ulid';
import { logAudit } from '../middleware/audit-trail';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const medications = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
medications.use('*', authMiddleware());

// Schemas
const importCSVSchema = z.object({
  fileName: z.string(),
  source: z.string().default('PCT'),
  notes: z.string().optional(),
});

const medicationRowSchema = z.object({
  codePct: z.string(),
  codeCnam: z.string().optional(),
  dci: z.string(),
  brandName: z.string(),
  brandNameAr: z.string().optional(),
  dosage: z.string().optional(),
  form: z.string().optional(),
  packaging: z.string().optional(),
  familyCode: z.string().optional(),
  laboratory: z.string().optional(),
  countryOrigin: z.string().optional(),
  pricePublic: z.number().optional(),
  priceHospital: z.number().optional(),
  priceReference: z.number().optional(),
  isGeneric: z.boolean().optional(),
  isReimbursable: z.boolean().optional(),
  reimbursementRate: z.number().optional(),
  requiresPrescription: z.boolean().optional(),
  isControlled: z.boolean().optional(),
});

const familySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  nameAr: z.string().optional(),
  description: z.string().optional(),
  parentId: z.string().optional(),
});

/**
 * POST /import
 * Import medications from CSV data
 */
medications.post(
  '/import',
  requireRole('ADMIN'),
  async (c) => {
    const user = c.get('user');
    const formData = await c.req.formData();
    const fileEntry = formData.get('file');
    const source = formData.get('source') as string || 'PCT';
    const notes = formData.get('notes') as string || '';

    if (!fileEntry || typeof fileEntry === 'string') {
      return badRequest(c, 'Fichier CSV requis');
    }
    const file = fileEntry as File;

    // Create import batch
    const batchId = generateId();
    const now = new Date().toISOString();

    await getDb(c).prepare(
      `INSERT INTO medication_import_batches
       (id, file_name, file_size, source, status, imported_by, started_at, notes, created_at)
       VALUES (?, ?, ?, ?, 'processing', ?, ?, ?, ?)`
    )
      .bind(batchId, file.name, file.size, source, user?.sub, now, notes, now)
      .run();

    // Parse CSV
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    const headerLine = lines[0];
    if (!headerLine) {
      return badRequest(c, 'Fichier CSV vide');
    }
    const headers = headerLine.split(';').map(h => h.trim().toLowerCase());

    const results = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [] as { row: number; error: string }[],
    };

    // Column mapping
    const colMap: Record<string, string> = {
      'code_pct': 'codePct',
      'code': 'codePct',
      'code_cnam': 'codeCnam',
      'dci': 'dci',
      'nom_generique': 'dci',
      'marque': 'brandName',
      'nom_commercial': 'brandName',
      'nom_ar': 'brandNameAr',
      'dosage': 'dosage',
      'forme': 'form',
      'conditionnement': 'packaging',
      'famille': 'familyCode',
      'laboratoire': 'laboratory',
      'pays': 'countryOrigin',
      'prix_public': 'pricePublic',
      'prix_hospitalier': 'priceHospital',
      'prix_reference': 'priceReference',
      'generique': 'isGeneric',
      'remboursable': 'isReimbursable',
      'taux_remboursement': 'reimbursementRate',
      'ordonnance': 'requiresPrescription',
      'tableau': 'isControlled',
    };

    // Process rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      try {
        const values = line.split(';').map(v => v.trim());
        const row: Record<string, string | number | boolean | undefined> = {};

        headers.forEach((header, idx) => {
          const key = colMap[header] || header;
          let value: string | number | boolean | undefined = values[idx];

          // Convert types
          if (['pricePublic', 'priceHospital', 'priceReference', 'reimbursementRate'].includes(key)) {
            value = value ? parseFloat(String(value).replace(',', '.')) : undefined;
          }
          if (['isGeneric', 'isReimbursable', 'requiresPrescription', 'isControlled'].includes(key)) {
            value = ['1', 'oui', 'true', 'yes', 'o'].includes(String(value).toLowerCase());
          }

          row[key] = value;
        });

        // Validate required fields
        if (!row.codePct || !row.dci || !row.brandName) {
          results.errors.push({ row: i + 1, error: 'Champs obligatoires manquants (code, DCI, marque)' });
          results.skipped++;
          continue;
        }

        // Check if medication exists
        const existing = await getDb(c).prepare(
          'SELECT id, price_public, price_hospital FROM medications WHERE code_pct = ?'
        )
          .bind(row.codePct)
          .first();

        const medId = existing ? String(existing.id) : generateId();

        // Get family ID if provided
        let familyId: string | null = null;
        if (row.familyCode) {
          const family = await getDb(c).prepare(
            'SELECT id FROM medication_families WHERE code = ?'
          )
            .bind(row.familyCode)
            .first();
          familyId = family ? String(family.id) : null;
        }

        if (existing) {
          // Update existing
          await getDb(c).prepare(
            `UPDATE medications SET
             dci = ?, brand_name = ?, brand_name_ar = ?, dosage = ?, form = ?,
             packaging = ?, family_id = ?, laboratory = ?, country_origin = ?,
             price_public = ?, price_hospital = ?, price_reference = ?,
             is_generic = ?, is_reimbursable = ?, reimbursement_rate = ?,
             requires_prescription = ?, is_controlled = ?,
             import_batch_id = ?, updated_at = ?
             WHERE id = ?`
          )
            .bind(
              row.dci,
              row.brandName,
              row.brandNameAr || null,
              row.dosage || null,
              row.form || null,
              row.packaging || null,
              familyId,
              row.laboratory || null,
              row.countryOrigin || null,
              row.pricePublic || null,
              row.priceHospital || null,
              row.priceReference || null,
              row.isGeneric ? 1 : 0,
              row.isReimbursable !== false ? 1 : 0,
              row.reimbursementRate || 0.7,
              row.requiresPrescription !== false ? 1 : 0,
              row.isControlled ? 1 : 0,
              batchId,
              now,
              medId
            )
            .run();

          // Log price changes
          if (existing.price_public !== row.pricePublic) {
            await getDb(c).prepare(
              `INSERT INTO medication_history (id, medication_id, field_changed, old_value, new_value, change_type, import_batch_id, changed_by, created_at)
               VALUES (?, ?, 'price_public', ?, ?, 'price_change', ?, ?, ?)`
            )
              .bind(generateId(), medId, String(existing.price_public), String(row.pricePublic), batchId, user?.sub, now)
              .run();
          }

          results.updated++;
        } else {
          // Insert new
          await getDb(c).prepare(
            `INSERT INTO medications
             (id, code_pct, code_cnam, dci, brand_name, brand_name_ar, dosage, form,
              packaging, family_id, laboratory, country_origin,
              price_public, price_hospital, price_reference,
              is_generic, is_reimbursable, reimbursement_rate,
              requires_prescription, is_controlled, import_batch_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
            .bind(
              medId,
              row.codePct,
              row.codeCnam || null,
              row.dci,
              row.brandName,
              row.brandNameAr || null,
              row.dosage || null,
              row.form || null,
              row.packaging || null,
              familyId,
              row.laboratory || null,
              row.countryOrigin || null,
              row.pricePublic || null,
              row.priceHospital || null,
              row.priceReference || null,
              row.isGeneric ? 1 : 0,
              row.isReimbursable !== false ? 1 : 0,
              row.reimbursementRate || 0.7,
              row.requiresPrescription !== false ? 1 : 0,
              row.isControlled ? 1 : 0,
              batchId,
              now,
              now
            )
            .run();

          // Log creation
          await getDb(c).prepare(
            `INSERT INTO medication_history (id, medication_id, field_changed, new_value, change_type, import_batch_id, changed_by, created_at)
             VALUES (?, ?, 'medication', ?, 'create', ?, ?, ?)`
          )
            .bind(generateId(), medId, row.brandName, batchId, user?.sub, now)
            .run();

          results.imported++;
        }
      } catch (err) {
        results.errors.push({
          row: i + 1,
          error: err instanceof Error ? err.message : 'Erreur inconnue',
        });
        results.skipped++;
      }
    }

    // Update batch status
    const completedAt = new Date().toISOString();
    await getDb(c).prepare(
      `UPDATE medication_import_batches SET
       status = 'completed',
       total_rows = ?,
       imported_count = ?,
       updated_count = ?,
       skipped_count = ?,
       error_count = ?,
       errors_json = ?,
       completed_at = ?
       WHERE id = ?`
    )
      .bind(
        lines.length - 1,
        results.imported,
        results.updated,
        results.skipped,
        results.errors.length,
        JSON.stringify(results.errors.slice(0, 100)), // Keep first 100 errors
        completedAt,
        batchId
      )
      .run();

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'medications.import',
      entityType: 'medication_batch',
      entityId: batchId,
      changes: {
        fileName: file.name,
        imported: results.imported,
        updated: results.updated,
        errors: results.errors.length,
      },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, {
      batchId,
      totalRows: lines.length - 1,
      imported: results.imported,
      updated: results.updated,
      skipped: results.skipped,
      errors: results.errors.slice(0, 10), // Return first 10 errors
    });
  }
);

/**
 * POST /import-amm
 * Import medications from AMM Excel data (parsed client-side)
 * Accessible to ADMIN, INSURER_ADMIN, INSURER_AGENT
 */
const ammRowSchema = z.object({
  nom: z.string().min(1),
  dosage: z.string().optional().default(''),
  forme: z.string().optional().default(''),
  presentation: z.string().optional().default(''),
  dci: z.string().default(''),
  classe: z.string().optional().default(''),
  sousClasse: z.string().optional().default(''),
  laboratoire: z.string().optional().default(''),
  amm: z.string().min(1),
  dateAmm: z.string().optional().default(''),
  conditionnementPrimaire: z.string().optional().default(''),
  specConditionnementPrimaire: z.string().optional().default(''),
  tableau: z.string().optional().default(''),
  dureeConservation: z.string().optional().default(''),
  indications: z.string().optional().default(''),
  gpb: z.string().optional().default(''),
  veic: z.string().optional().default(''),
});

const importAmmSchema = z.object({
  fileName: z.string().min(1),
  rows: z.array(ammRowSchema).min(1),
  notes: z.string().optional(),
});

medications.post(
  '/import-amm',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', importAmmSchema),
  async (c) => {
    const user = c.get('user');
    const data = c.req.valid('json');
    const db = getDb(c);
    const now = new Date().toISOString();

    // Create import batch
    const batchId = generateId();
    await db.prepare(
      `INSERT INTO medication_import_batches
       (id, file_name, file_size, source, status, imported_by, started_at, notes, created_at)
       VALUES (?, ?, ?, 'AMM', 'processing', ?, ?, ?, ?)`
    )
      .bind(batchId, data.fileName, 0, user?.sub, now, data.notes || '', now)
      .run();

    const results = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: [] as { row: number; error: string }[],
    };

    // Normalize GPB value
    const normalizeGpb = (val: string): string | null => {
      const v = val.trim().toLowerCase();
      if (v.startsWith('g')) return 'G';
      if (v.startsWith('p')) return 'P';
      if (v.startsWith('b')) return 'B';
      return null;
    };

    // Normalize VEIC value
    const normalizeVeic = (val: string): string | null => {
      const v = val.trim().toLowerCase();
      if (v.startsWith('v')) return 'V';
      if (v.startsWith('e')) return 'E';
      if (v.startsWith('i')) return 'I';
      if (v.startsWith('c')) return 'C';
      return null;
    };

    // Load all existing code_amm values in ONE query to avoid per-row SELECTs
    const existingCodesResult = await db.prepare(
      'SELECT code_amm FROM medications WHERE code_amm IS NOT NULL'
    ).all();
    const existingCodes = new Set(
      existingCodesResult.results.map((r) => String(r.code_amm))
    );

    // Process in batches of 200 for D1 performance
    const BATCH_SIZE = 200;
    for (let i = 0; i < data.rows.length; i += BATCH_SIZE) {
      const chunk = data.rows.slice(i, i + BATCH_SIZE);
      const statements: D1PreparedStatement[] = [];

      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j]!;
        const rowIndex = i + j + 1;
        try {
          const codeAmm = row.amm.trim();
          if (!codeAmm) {
            results.errors.push({ row: rowIndex, error: 'Code AMM manquant' });
            results.skipped++;
            continue;
          }

          const gpb = normalizeGpb(row.gpb);
          const veic = normalizeVeic(row.veic);
          const dureeConservationRaw = row.dureeConservation ? parseInt(String(row.dureeConservation), 10) : null;
          const dureeConservation = dureeConservationRaw !== null && isNaN(dureeConservationRaw) ? null : dureeConservationRaw;
          const isUpdate = existingCodes.has(codeAmm);

          // Upsert: INSERT with ON CONFLICT to avoid separate SELECT per row
          statements.push(
            db.prepare(
              `INSERT INTO medications
               (id, code_pct, code_amm, brand_name, dci, dosage, form, packaging,
                laboratory, gpb, veic, is_generic, is_reimbursable, reimbursement_rate,
                amm_classe, amm_sous_classe, amm_date,
                indications, duree_conservation,
                conditionnement_primaire, spec_conditionnement, tableau_amm,
                import_batch_id, is_active, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0.7, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
               ON CONFLICT(code_amm) DO UPDATE SET
                 brand_name = excluded.brand_name,
                 dci = excluded.dci,
                 dosage = excluded.dosage,
                 form = excluded.form,
                 packaging = excluded.packaging,
                 laboratory = excluded.laboratory,
                 gpb = excluded.gpb,
                 veic = excluded.veic,
                 is_generic = excluded.is_generic,
                 amm_classe = excluded.amm_classe,
                 amm_sous_classe = excluded.amm_sous_classe,
                 amm_date = excluded.amm_date,
                 indications = excluded.indications,
                 duree_conservation = excluded.duree_conservation,
                 conditionnement_primaire = excluded.conditionnement_primaire,
                 spec_conditionnement = excluded.spec_conditionnement,
                 tableau_amm = excluded.tableau_amm,
                 import_batch_id = excluded.import_batch_id,
                 updated_at = excluded.updated_at`
            )
              .bind(
                generateId(), codeAmm, codeAmm, row.nom, row.dci,
                row.dosage || null, row.forme || null, row.presentation || null,
                row.laboratoire || null, gpb, veic, gpb === 'G' ? 1 : 0,
                row.classe || null, row.sousClasse || null, row.dateAmm || null,
                row.indications || null, dureeConservation,
                row.conditionnementPrimaire || null, row.specConditionnementPrimaire || null, row.tableau || null,
                batchId, now, now
              )
          );

          if (isUpdate) {
            results.updated++;
          } else {
            // Track new code so duplicates within the same file count as updates
            existingCodes.add(codeAmm);
            results.imported++;
          }
        } catch (err) {
          results.errors.push({
            row: rowIndex,
            error: err instanceof Error ? err.message : 'Erreur inconnue',
          });
          results.skipped++;
        }
      }

      // Execute batch
      if (statements.length > 0) {
        await db.batch(statements);
      }
    }

    // Update batch status
    await db.prepare(
      `UPDATE medication_import_batches SET
       status = 'completed',
       total_rows = ?,
       imported_count = ?,
       updated_count = ?,
       skipped_count = ?,
       error_count = ?,
       errors_json = ?,
       completed_at = ?
       WHERE id = ?`
    )
      .bind(
        data.rows.length,
        results.imported,
        results.updated,
        results.skipped,
        results.errors.length,
        JSON.stringify(results.errors.slice(0, 100)),
        new Date().toISOString(),
        batchId
      )
      .run();

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'medications.import_amm',
      entityType: 'medication_batch',
      entityId: batchId,
      changes: {
        fileName: data.fileName,
        imported: results.imported,
        updated: results.updated,
        errors: results.errors.length,
      },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, {
      batchId,
      totalRows: data.rows.length,
      imported: results.imported,
      updated: results.updated,
      skipped: results.skipped,
      errors: results.errors.slice(0, 10),
    });
  }
);

/**
 * GET /
 * List medications with search and filters
 */
medications.get(
  '/',
  async (c) => {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const search = c.req.query('search');
    const familyId = c.req.query('familyId');
    const isGeneric = c.req.query('isGeneric');
    const gpb = c.req.query('gpb');
    const veic = c.req.query('veic');
    const ammClasse = c.req.query('ammClasse');
    const offset = (page - 1) * limit;

    let query = `
      SELECT m.*, mf.name as family_name, mf.code as family_code
      FROM medications m
      LEFT JOIN medication_families mf ON m.family_id = mf.id
      WHERE m.deleted_at IS NULL AND m.is_active = 1
    `;
    const params: (string | number)[] = [];

    if (search) {
      query += ` AND (m.brand_name LIKE ? OR m.dci LIKE ? OR m.code_pct LIKE ? OR m.code_amm LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (familyId) {
      query += ' AND m.family_id = ?';
      params.push(familyId);
    }

    if (isGeneric !== undefined) {
      query += ' AND m.is_generic = ?';
      params.push(isGeneric === 'true' ? 1 : 0);
    }

    if (gpb) {
      query += ' AND m.gpb = ?';
      params.push(gpb);
    }

    if (veic) {
      query += ' AND m.veic = ?';
      params.push(veic);
    }

    if (ammClasse) {
      query += ' AND m.amm_classe = ?';
      params.push(ammClasse);
    }

    query += ' ORDER BY m.brand_name ASC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const meds = await getDb(c).prepare(query).bind(...params).all();

    // Count
    let countQuery = 'SELECT COUNT(*) as count FROM medications WHERE deleted_at IS NULL AND is_active = 1';
    const countParams: (string | number)[] = [];

    if (search) {
      countQuery += ` AND (brand_name LIKE ? OR dci LIKE ? OR code_pct LIKE ? OR code_amm LIKE ?)`;
      countParams.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (familyId) {
      countQuery += ' AND family_id = ?';
      countParams.push(familyId);
    }
    if (isGeneric !== undefined) {
      countQuery += ' AND is_generic = ?';
      countParams.push(isGeneric === 'true' ? 1 : 0);
    }
    if (gpb) {
      countQuery += ' AND gpb = ?';
      countParams.push(gpb);
    }
    if (veic) {
      countQuery += ' AND veic = ?';
      countParams.push(veic);
    }
    if (ammClasse) {
      countQuery += ' AND amm_classe = ?';
      countParams.push(ammClasse);
    }

    const countResult = await getDb(c).prepare(countQuery).bind(...countParams).first();
    const total = Number(countResult?.count) || 0;

    return paginated(c, meds.results, { page, limit, total });
  }
);

/**
 * GET /families
 * List medication families
 */
medications.get(
  '/families',
  async (c) => {
    const families = await getDb(c).prepare(
      `SELECT * FROM medication_families WHERE is_active = 1 ORDER BY name ASC`
    ).all();

    return success(c, { families: families.results });
  }
);

/**
 * POST /families
 * Create medication family
 */
medications.post(
  '/families',
  requireRole('ADMIN'),
  zValidator('json', familySchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');
    const id = generateId();
    const now = new Date().toISOString();

    await getDb(c).prepare(
      `INSERT INTO medication_families (id, code, name, name_ar, description, parent_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, data.code, data.name, data.nameAr || null, data.description || null, data.parentId || null, now, now)
      .run();

    return created(c, { id, ...data });
  }
);

/**
 * GET /imports
 * List import batches history
 */
medications.get(
  '/imports',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = (page - 1) * limit;

    const batches = await getDb(c).prepare(
      `SELECT mib.*, u.first_name || ' ' || u.last_name as imported_by_name
       FROM medication_import_batches mib
       LEFT JOIN users u ON mib.imported_by = u.id
       ORDER BY mib.created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(limit, offset)
      .all();

    const countResult = await getDb(c).prepare(
      'SELECT COUNT(*) as count FROM medication_import_batches'
    ).first();

    const total = Number(countResult?.count) || 0;

    return paginated(c, batches.results, { page, limit, total });
  }
);

/**
 * GET /imports/:id
 * Get import batch details
 */
medications.get(
  '/imports/:id',
  requireRole('ADMIN'),
  async (c) => {
    const id = c.req.param('id');

    const batch = await getDb(c).prepare(
      `SELECT mib.*, u.first_name || ' ' || u.last_name as imported_by_name
       FROM medication_import_batches mib
       LEFT JOIN users u ON mib.imported_by = u.id
       WHERE mib.id = ?`
    )
      .bind(id)
      .first();

    if (!batch) {
      return notFound(c, 'Import non trouvé');
    }

    return success(c, { batch });
  }
);

/**
 * GET /:id
 * Get medication details
 */
medications.get(
  '/:id',
  async (c) => {
    const id = c.req.param('id');

    const med = await getDb(c).prepare(
      `SELECT m.*, mf.name as family_name, mf.code as family_code
       FROM medications m
       LEFT JOIN medication_families mf ON m.family_id = mf.id
       WHERE m.id = ? AND m.deleted_at IS NULL`
    )
      .bind(id)
      .first();

    if (!med) {
      return notFound(c, 'Médicament non trouvé');
    }

    return success(c, { medication: med });
  }
);

/**
 * GET /:id/history
 * Get medication change history
 */
medications.get(
  '/:id/history',
  requireRole('ADMIN'),
  async (c) => {
    const id = c.req.param('id');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = (page - 1) * limit;

    const history = await getDb(c).prepare(
      `SELECT mh.*, u.first_name || ' ' || u.last_name as changed_by_name
       FROM medication_history mh
       LEFT JOIN users u ON mh.changed_by = u.id
       WHERE mh.medication_id = ?
       ORDER BY mh.created_at DESC
       LIMIT ? OFFSET ?`
    )
      .bind(id, limit, offset)
      .all();

    const countResult = await getDb(c).prepare(
      'SELECT COUNT(*) as count FROM medication_history WHERE medication_id = ?'
    )
      .bind(id)
      .first();

    const total = Number(countResult?.count) || 0;

    return paginated(c, history.results, { page, limit, total });
  }
);

export { medications };
