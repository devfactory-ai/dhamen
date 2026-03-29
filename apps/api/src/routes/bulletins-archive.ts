/**
 * Routes for bulletin archiving - Import CSV and scans for 2024-2025 digitization
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import type { Bindings, Variables } from '../types';
import { generateId } from '../lib/ulid';

const bulletinsArchive = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
bulletinsArchive.use('*', authMiddleware());

/**
 * POST /bulletins-soins/archive/import-csv - Import CSV file with historical data
 */
bulletinsArchive.post('/import-csv', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux agents' },
    }, 403);
  }

  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    const formData = await c.req.formData();
    const csvFile = formData.get('file') as File | null;
    const batchName = formData.get('batchName') as string || 'Import Archive';
    const year = formData.get('year') as string || '2024';
    const companyId = formData.get('companyId') as string || null;

    if (!csvFile) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Fichier CSV requis' },
      }, 400);
    }

    const csvContent = await csvFile.text();
    const lines = csvContent.split('\n').filter(line => line.trim());

    // Skip BOM if present and get header
    let headerLine = lines[0];
    if (!headerLine) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Fichier CSV vide' },
      }, 400);
    }
    if (headerLine.charCodeAt(0) === 0xFEFF) {
      headerLine = headerLine.slice(1);
    }

    // Parse headers (semicolon separated)
    const headers = headerLine.split(';').map(h => h.replace(/"/g, '').trim());

    // Expected headers mapping
    const headerMap: Record<string, string> = {
      'Numero Bulletin': 'bulletin_number',
      'Date Bulletin': 'bulletin_date',
      'Matricule Adherent': 'adherent_matricule',
      'Nom Adherent': 'adherent_last_name',
      'Prenom Adherent': 'adherent_first_name',
      'CIN': 'adherent_national_id',
      'Beneficiaire': 'beneficiary_name',
      'Lien Parente': 'beneficiary_relationship',
      'Nom Praticien': 'provider_name',
      'Specialite': 'provider_specialty',
      'Type Soin': 'care_type',
      'Description': 'care_description',
      'Montant TND': 'total_amount',
    };

    // Create archive batch ('closed' is a valid status for archived batches)
    const batchId = generateId();
    await db.prepare(`
      INSERT INTO bulletin_batches (id, name, status, company_id, created_by, created_at)
      VALUES (?, ?, 'closed', ?, ?, datetime('now'))
    `).bind(batchId, `Archive ${year} - ${batchName}`, companyId, user.id).run();

    // Parse and insert bulletins
    let imported = 0;
    let errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const line = lines[i];
        if (!line) continue;
        const values = parseCSVLine(line, ';');
        if (values.length < headers.length) continue;

        const bulletinData: Record<string, string | number | null> = {};
        headers.forEach((header, idx) => {
          const field = headerMap[header];
          if (field) {
            let value = values[idx]?.replace(/"/g, '').trim() || null;
            if (field === 'total_amount' && value) {
              bulletinData[field] = parseFloat(value.replace(',', '.'));
            } else {
              bulletinData[field] = value;
            }
          }
        });

        // Try to find adherent by matricule to link
        let adherentId: string | null = null;
        if (bulletinData.adherent_matricule) {
          const adherent = await db.prepare(
            'SELECT id FROM adherents WHERE matricule = ? AND deleted_at IS NULL LIMIT 1'
          ).bind(bulletinData.adherent_matricule).first<{ id: string }>();
          if (adherent) adherentId = adherent.id;
        }

        // Generate ID and insert
        const id = generateId();
        await db.prepare(`
          INSERT INTO bulletins_soins (
            id, adherent_id, batch_id, bulletin_number, bulletin_date,
            adherent_matricule, adherent_last_name, adherent_first_name, adherent_national_id,
            beneficiary_name, beneficiary_relationship,
            provider_name, provider_specialty, care_type, care_description,
            total_amount, company_id, status, submission_date, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'archived', datetime('now'), ?, datetime('now'))
        `).bind(
          id, adherentId || 'ARCHIVE_UNKNOWN',
          batchId,
          bulletinData.bulletin_number,
          bulletinData.bulletin_date,
          bulletinData.adherent_matricule,
          bulletinData.adherent_last_name,
          bulletinData.adherent_first_name,
          bulletinData.adherent_national_id,
          bulletinData.beneficiary_name,
          bulletinData.beneficiary_relationship,
          bulletinData.provider_name,
          bulletinData.provider_specialty,
          bulletinData.care_type || 'consultation',
          bulletinData.care_description,
          bulletinData.total_amount || 0,
          companyId,
          user.id
        ).run();

        imported++;
      } catch (err) {
        errors.push(`Ligne ${i + 1}: ${(err as Error).message}`);
      }
    }

    return c.json({
      success: true,
      data: {
        batchId,
        imported,
        total: lines.length - 1,
        errors: errors.slice(0, 10), // Return first 10 errors
      },
    });
  } catch (error) {
    console.error('Error importing CSV:', error);
    return c.json({
      success: false,
      error: { code: 'IMPORT_ERROR', message: 'Erreur lors de l\'import' },
    }, 500);
  }
});

/**
 * POST /bulletins-soins/archive/upload-scans - Upload scans and match with bulletins
 */
bulletinsArchive.post('/upload-scans', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux agents' },
    }, 403);
  }

  const db = c.get('tenantDb') ?? c.env.DB;
  const storage = c.env.STORAGE;

  try {
    const formData = await c.req.formData();
    const fileEntries = formData.getAll('files');
    const files: File[] = [];
    for (const entry of fileEntries) {
      if (typeof entry !== 'string') {
        files.push(entry);
      }
    }
    const batchId = formData.get('batchId') as string;

    if (!files.length) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Fichiers requis' },
      }, 400);
    }

    let uploaded = 0;
    let matched = 0;
    const results: Array<{ filename: string; status: string; bulletinNumber?: string }> = [];

    for (const file of files) {
      try {
        // Extract bulletin number from filename (e.g., "BS-2024-0001.pdf" or "BS-2024-0001_scan.jpg")
        const filename = file.name;
        const bulletinMatch = filename.match(/BS-\d{4}-\d+/i);
        const bulletinNumber = bulletinMatch ? bulletinMatch[0].toUpperCase() : null;

        // Upload to R2
        const key = `archive/scans/${new Date().getFullYear()}/${filename}`;
        const arrayBuffer = await file.arrayBuffer();
        await storage.put(key, arrayBuffer, {
          httpMetadata: {
            contentType: file.type,
          },
          customMetadata: {
            uploadedBy: user.id,
            uploadedAt: new Date().toISOString(),
            bulletinNumber: bulletinNumber || 'unknown',
          },
        });

        uploaded++;

        // Try to match with existing bulletin
        if (bulletinNumber) {
          let query = `
            UPDATE bulletins_soins
            SET scan_url = ?, scan_filename = ?, updated_at = datetime('now')
            WHERE bulletin_number = ?
          `;
          const params = [key, filename, bulletinNumber];

          if (batchId) {
            query += ' AND batch_id = ?';
            params.push(batchId);
          }

          const result = await db.prepare(query).bind(...params).run();

          if (result.meta.changes > 0) {
            matched++;
            results.push({ filename, status: 'matched', bulletinNumber });
          } else {
            results.push({ filename, status: 'uploaded_no_match', bulletinNumber });
          }
        } else {
          results.push({ filename, status: 'uploaded_no_number' });
        }
      } catch (err) {
        results.push({ filename: file.name, status: 'error' });
      }
    }

    return c.json({
      success: true,
      data: {
        uploaded,
        matched,
        total: files.length,
        results,
      },
    });
  } catch (error) {
    console.error('Error uploading scans:', error);
    return c.json({
      success: false,
      error: { code: 'UPLOAD_ERROR', message: 'Erreur lors de l\'upload' },
    }, 500);
  }
});

/**
 * GET /bulletins-soins/archive/search - Search archived bulletins
 */
bulletinsArchive.get('/search', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux agents' },
    }, 403);
  }

  const db = c.get('tenantDb') ?? c.env.DB;

  try {
    const query = c.req.query('q') || '';
    const year = c.req.query('year');
    const hasScans = c.req.query('hasScans');
    const companyId = c.req.query('companyId');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = (page - 1) * limit;

    const fromClause = `FROM bulletins_soins bs LEFT JOIN bulletin_batches bb ON bs.batch_id = bb.id`;
    let whereClause = `WHERE bs.status = 'archived'`;
    const params: (string | number)[] = [];

    if (companyId) {
      whereClause += ` AND bs.company_id = ?`;
      params.push(companyId);
    }

    if (query) {
      whereClause += ` AND (
        bs.bulletin_number LIKE ? OR
        bs.adherent_matricule LIKE ? OR
        bs.adherent_last_name LIKE ? OR
        bs.adherent_first_name LIKE ? OR
        bs.adherent_national_id LIKE ?
      )`;
      const searchTerm = `%${query}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (year) {
      whereClause += ` AND bs.bulletin_date LIKE ?`;
      params.push(`${year}%`);
    }

    if (hasScans === 'true') {
      whereClause += ` AND bs.scan_url IS NOT NULL`;
    } else if (hasScans === 'false') {
      whereClause += ` AND bs.scan_url IS NULL`;
    }

    // Count total
    const countSql = `SELECT COUNT(*) as total ${fromClause} ${whereClause}`;
    const countResult = await db.prepare(countSql).bind(...params).first<{ total: number }>();

    // Get results
    const dataSql = `SELECT bs.*, bb.name as batch_name ${fromClause} ${whereClause} ORDER BY bs.bulletin_date DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const results = await db.prepare(dataSql).bind(...params).all();

    return c.json({
      success: true,
      data: results.results,
      meta: {
        total: countResult?.total || 0,
        page,
        limit,
        totalPages: Math.ceil((countResult?.total || 0) / limit),
      },
    });
  } catch (error) {
    console.error('Error searching archive:', error);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Erreur lors de la recherche' },
    }, 500);
  }
});

/**
 * GET /bulletins-soins/archive/stats - Get archive statistics
 */
bulletinsArchive.get('/stats', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux agents' },
    }, 403);
  }

  const db = c.get('tenantDb') ?? c.env.DB;
  const companyId = c.req.query('companyId');

  try {
    const companyFilter = companyId ? ' AND company_id = ?' : '';
    const companyParams = companyId ? [companyId] : [];

    // Total archived bulletins
    const total = await db.prepare(`
      SELECT COUNT(*) as count FROM bulletins_soins WHERE status = 'archived'${companyFilter}
    `).bind(...companyParams).first<{ count: number }>();

    // With scans
    const withScans = await db.prepare(`
      SELECT COUNT(*) as count FROM bulletins_soins WHERE status = 'archived' AND scan_url IS NOT NULL${companyFilter}
    `).bind(...companyParams).first<{ count: number }>();

    // By year
    const byYear = await db.prepare(`
      SELECT
        substr(bulletin_date, 1, 4) as year,
        COUNT(*) as count,
        SUM(CASE WHEN scan_url IS NOT NULL THEN 1 ELSE 0 END) as with_scans
      FROM bulletins_soins
      WHERE status = 'archived'${companyFilter}
      GROUP BY substr(bulletin_date, 1, 4)
      ORDER BY year DESC
    `).bind(...companyParams).all();

    return c.json({
      success: true,
      data: {
        total: total?.count || 0,
        withScans: withScans?.count || 0,
        withoutScans: (total?.count || 0) - (withScans?.count || 0),
        byYear: byYear.results,
        recentBatches: [],
      },
    });
  } catch (error) {
    console.error('Error getting archive stats:', error);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: 'Erreur lors du chargement' },
    }, 500);
  }
});

/**
 * GET /bulletins-soins/archive/:id/scan - Get scan URL for a bulletin
 */
bulletinsArchive.get('/:id/scan', async (c) => {
  const user = c.get('user');

  if (!['INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux agents' },
    }, 403);
  }

  const id = c.req.param('id');
  const db = c.get('tenantDb') ?? c.env.DB;
  const storage = c.env.STORAGE;

  try {
    const bulletin = await db.prepare(`
      SELECT scan_url FROM bulletins_soins WHERE id = ?
    `).bind(id).first<{ scan_url: string | null }>();

    if (!bulletin?.scan_url) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Scan non trouvé' },
      }, 404);
    }

    // Extract R2 key from full URL
    const R2_URL_PREFIX = 'https://dhamen-files.r2.cloudflarestorage.com/';
    const r2Key = bulletin.scan_url.startsWith(R2_URL_PREFIX)
      ? bulletin.scan_url.slice(R2_URL_PREFIX.length)
      : bulletin.scan_url;
    const object = await storage.get(r2Key);
    if (!object) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Fichier non trouvé' },
      }, 404);
    }

    // Return the file
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('Error getting scan:', error);
    return c.json({
      success: false,
      error: { code: 'STORAGE_ERROR', message: 'Erreur lors du chargement' },
    }, 500);
  }
});

// Helper function to parse CSV line with proper quote handling
function parseCSVLine(line: string, delimiter: string = ';'): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

export { bulletinsArchive };
