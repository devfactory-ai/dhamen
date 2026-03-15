import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { generateId } from '../lib/ulid';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';
import { extractBulletinData } from '../agents/ocr/ocr.agent';
import { PushNotificationService } from '../services/push-notification.service';
import { RealtimeNotificationsService } from '../services/realtime-notifications.service';

const bulletinsSoins = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
bulletinsSoins.use('*', authMiddleware());

const R2_URL_PREFIX = 'https://dhamen-files.r2.cloudflarestorage.com/';

/** Extract R2 key from full URL or return as-is if already a key */
function extractR2Key(scanUrl: string): string {
  if (scanUrl.startsWith(R2_URL_PREFIX)) {
    return scanUrl.slice(R2_URL_PREFIX.length);
  }
  if (scanUrl.startsWith('https://')) {
    // Other URL format — extract path after host
    const url = new URL(scanUrl);
    return url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
  }
  return scanUrl; // Already a key
}

/**
 * GET /bulletins-soins/me - Get current adherent's bulletins
 */
bulletinsSoins.get('/me', async (c) => {
  const user = c.get('user');
  const db = getDb(c);

  // Check if user is an adherent
  if (user.role !== 'ADHERENT') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux adhérents' },
    }, 403);
  }

  // Get query params
  const status = c.req.query('status');
  const careType = c.req.query('care_type');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = (page - 1) * limit;

  // First get the adherent ID
  const adherent = await db.prepare(`
    SELECT id FROM adherents WHERE email = ? AND deleted_at IS NULL
  `).bind(user.email).first<{ id: string }>();

  if (!adherent) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Adhérent non trouvé' },
    }, 404);
  }

  // Build query with filters
  let whereClause = 'WHERE bs.adherent_id = ?';
  const params: (string | number)[] = [adherent.id];

  if (status) {
    whereClause += ' AND bs.status = ?';
    params.push(status);
  }

  if (careType) {
    whereClause += ' AND bs.care_type = ?';
    params.push(careType);
  }

  // Get total count
  const countResult = await db.prepare(`
    SELECT COUNT(*) as total FROM bulletins_soins bs ${whereClause}
  `).bind(...params).first<{ total: number }>();

  // Get bulletins with pagination
  const bulletins = await db.prepare(`
    SELECT
      bs.*,
      b.full_name as beneficiary_name,
      b.relationship as beneficiary_relationship
    FROM bulletins_soins bs
    LEFT JOIN beneficiaries b ON bs.beneficiary_id = b.id
    ${whereClause}
    ORDER BY bs.bulletin_date DESC, bs.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return c.json({
    success: true,
    data: bulletins.results,
    meta: {
      page,
      limit,
      total: countResult?.total || 0,
      totalPages: Math.ceil((countResult?.total || 0) / limit),
    },
  });
});

/**
 * GET /bulletins-soins/me/stats - Get bulletin statistics
 * Must be defined BEFORE /me/:id to avoid being caught by the dynamic param
 */
bulletinsSoins.get('/me/stats', async (c) => {
  const user = c.get('user');
  const db = getDb(c);

  if (user.role !== 'ADHERENT') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux adhérents' },
    }, 403);
  }

  // Get adherent ID (same query as /me list endpoint)
  const adherent = await db.prepare(`
    SELECT id FROM adherents WHERE email = ? AND deleted_at IS NULL
  `).bind(user.email).first<{ id: string }>();

  if (!adherent) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Adhérent non trouvé' },
    }, 404);
  }

  // Get statistics with new workflow statuses
  const stats = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status IN ('submitted', 'scan_uploaded') THEN 1 ELSE 0 END) as scan_uploaded,
      SUM(CASE WHEN status = 'paper_received' THEN 1 ELSE 0 END) as paper_received,
      SUM(CASE WHEN status IN ('processing', 'paper_complete', 'paper_incomplete') THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status = 'reimbursed' THEN 1 ELSE 0 END) as reimbursed,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
      COALESCE(SUM(total_amount), 0) as total_amount,
      COALESCE(SUM(reimbursed_amount), 0) as total_reimbursed
    FROM bulletins_soins
    WHERE adherent_id = ?
  `).bind(adherent.id).first();

  return c.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /bulletins-soins/me/:id/scan - Download scan file for a bulletin (adherent)
 * IMPORTANT: Must be defined BEFORE /me/:id to avoid being caught by the dynamic param
 */
bulletinsSoins.get('/me/:id/scan', async (c) => {
  const user = c.get('user');

  if (user.role !== 'ADHERENT') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Acces reserve aux adherents' },
    }, 403);
  }

  const bulletinId = c.req.param('id');
  const db = getDb(c);
  const storage = c.env.STORAGE;

  // Verify ownership
  const adherent = await db.prepare(`
    SELECT id FROM adherents WHERE email = ? AND deleted_at IS NULL
  `).bind(user.email).first<{ id: string }>();

  if (!adherent) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Adherent non trouve' } }, 404);
  }

  const bulletin = await db.prepare(`
    SELECT scan_url FROM bulletins_soins WHERE id = ? AND adherent_id = ?
  `).bind(bulletinId, adherent.id).first<{ scan_url: string | null }>();

  if (!bulletin?.scan_url) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Scan non trouve' } }, 404);
  }

  try {
    const r2Key = extractR2Key(bulletin.scan_url);
    const object = await storage.get(r2Key);
    if (!object) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Fichier non trouve' } }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('Error getting scan:', error);
    return c.json({ success: false, error: { code: 'STORAGE_ERROR', message: 'Erreur chargement' } }, 500);
  }
});

/**
 * GET /bulletins-soins/me/:id - Get a specific bulletin
 */
bulletinsSoins.get('/me/:id', async (c) => {
  const user = c.get('user');
  const bulletinId = c.req.param('id');
  const db = getDb(c);

  if (user.role !== 'ADHERENT') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux adhérents' },
    }, 403);
  }

  // Get adherent ID
  const adherent = await db.prepare(`
    SELECT id FROM adherents WHERE email = ? AND deleted_at IS NULL
  `).bind(user.email).first<{ id: string }>();

  if (!adherent) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Adhérent non trouvé' },
    }, 404);
  }

  // Get bulletin
  const bulletin = await db.prepare(`
    SELECT
      bs.*,
      b.full_name as beneficiary_name,
      b.relationship as beneficiary_relationship
    FROM bulletins_soins bs
    LEFT JOIN beneficiaries b ON bs.beneficiary_id = b.id
    WHERE bs.id = ? AND bs.adherent_id = ?
  `).bind(bulletinId, adherent.id).first();

  if (!bulletin) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Bulletin non trouvé' },
    }, 404);
  }

  return c.json({
    success: true,
    data: bulletin,
  });
});

/**
 * POST /bulletins-soins/me - Submit a new bulletin (with scan upload)
 */
bulletinsSoins.post('/me', async (c) => {
  const user = c.get('user');
  const db = getDb(c);

  if (user.role !== 'ADHERENT') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux adhérents' },
    }, 403);
  }

  const body = await c.req.json();

  // Get adherent ID
  const adherent = await db.prepare(`
    SELECT id FROM adherents WHERE email = ? AND deleted_at IS NULL
  `).bind(user.email).first<{ id: string }>();

  if (!adherent) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Adhérent non trouvé' },
    }, 404);
  }

  const id = generateId();
  const bulletinNumber = `BS-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  await db.prepare(`
    INSERT INTO bulletins_soins (
      id, adherent_id, beneficiary_id, bulletin_number, bulletin_date,
      provider_name, provider_specialty, care_type, care_description,
      total_amount, status, submission_date, scan_url, scan_filename,
      additional_documents, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    adherent.id,
    body.beneficiary_id || null,
    bulletinNumber,
    body.bulletin_date,
    body.provider_name || null,
    body.provider_specialty || null,
    body.care_type || 'consultation',
    body.care_description || null,
    body.total_amount || null,
    now,
    body.scan_url || null,
    body.scan_filename || null,
    body.additional_documents ? JSON.stringify(body.additional_documents) : null,
    now,
    now
  ).run();

  return c.json({
    success: true,
    data: {
      id,
      bulletin_number: bulletinNumber,
      message: 'Bulletin soumis avec succès',
    },
  }, 201);
});

/**
 * GET /bulletins-soins/blank-pdf - Generate blank bulletin PDF
 */
bulletinsSoins.get('/blank-pdf', async (c) => {
  const user = c.get('user');
  const db = getDb(c);

  if (user.role !== 'ADHERENT') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux adhérents' },
    }, 403);
  }

  // Get adherent info
  const adherent = await db.prepare(`
    SELECT
      a.*,
      a.first_name, a.last_name, a.email,
      c.contract_number as policy_number, c.start_date, c.end_date,
      i.name as insurer_name
    FROM adherents a
    LEFT JOIN contracts c ON c.adherent_id = a.id AND UPPER(c.status) = 'ACTIVE'
    LEFT JOIN insurers i ON c.insurer_id = i.id
    WHERE a.email = ? AND a.deleted_at IS NULL
  `).bind(user.email).first();

  if (!adherent) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Adhérent non trouvé' },
    }, 404);
  }

  // Generate PDF content (HTML template for now, can be converted to PDF)
  const bulletinNumber = `BS-${new Date().getFullYear()}-XXXXXX`;
  const currentDate = new Date().toLocaleDateString('fr-TN');

  const htmlContent = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Bulletin de Soins - Dhamen</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.4; }
    .header { text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 15px; margin-bottom: 20px; }
    .logo { font-size: 24pt; font-weight: bold; color: #2563eb; }
    .logo-ar { font-size: 18pt; color: #64748b; }
    .title { font-size: 16pt; font-weight: bold; margin: 15px 0; }
    .bulletin-number { font-size: 12pt; color: #64748b; }
    .section { margin: 20px 0; padding: 15px; border: 1px solid #e2e8f0; border-radius: 8px; }
    .section-title { font-weight: bold; color: #2563eb; margin-bottom: 10px; border-bottom: 1px solid #e2e8f0; padding-bottom: 5px; }
    .row { display: flex; margin: 8px 0; }
    .label { width: 180px; font-weight: 500; color: #475569; }
    .value { flex: 1; border-bottom: 1px dotted #94a3b8; min-height: 20px; }
    .pre-filled { color: #1e293b; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    .checkbox-row { display: flex; align-items: center; margin: 5px 0; }
    .checkbox { width: 15px; height: 15px; border: 1px solid #94a3b8; margin-right: 8px; }
    .signature-box { border: 1px dashed #94a3b8; height: 80px; margin-top: 10px; display: flex; align-items: center; justify-content: center; color: #94a3b8; }
    .footer { margin-top: 30px; text-align: center; font-size: 9pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 15px; }
    .important { background: #fef3c7; padding: 10px; border-radius: 5px; font-size: 10pt; margin: 15px 0; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th, td { border: 1px solid #e2e8f0; padding: 8px; text-align: left; }
    th { background: #f1f5f9; font-weight: 500; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">Dhamen <span class="logo-ar">ضامن</span></div>
    <div class="title">BULLETIN DE SOINS</div>
    <div class="bulletin-number">N° ${bulletinNumber} | Date: ${currentDate}</div>
  </div>

  <div class="section">
    <div class="section-title">INFORMATIONS ASSURÉ</div>
    <div class="grid-2">
      <div class="row">
        <span class="label">Nom et Prénom:</span>
        <span class="value pre-filled">${(adherent as Record<string, unknown>).last_name} ${(adherent as Record<string, unknown>).first_name}</span>
      </div>
      <div class="row">
        <span class="label">N° Matricule:</span>
        <span class="value pre-filled">${(adherent as Record<string, unknown>).matricule || ''}</span>
      </div>
      <div class="row">
        <span class="label">N° Contrat:</span>
        <span class="value pre-filled">${(adherent as Record<string, unknown>).policy_number || ''}</span>
      </div>
      <div class="row">
        <span class="label">Assureur:</span>
        <span class="value pre-filled">${(adherent as Record<string, unknown>).insurer_name || ''}</span>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">BÉNÉFICIAIRE DES SOINS</div>
    <div class="checkbox-row">
      <div class="checkbox"></div> Assuré principal
    </div>
    <div class="checkbox-row">
      <div class="checkbox"></div> Conjoint(e)
    </div>
    <div class="checkbox-row">
      <div class="checkbox"></div> Enfant - Nom: __________________ Prénom: __________________
    </div>
    <div class="row" style="margin-top: 10px;">
      <span class="label">Date de naissance:</span>
      <span class="value"></span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">TYPE DE SOINS</div>
    <div class="grid-2">
      <div class="checkbox-row"><div class="checkbox"></div> Consultation médicale</div>
      <div class="checkbox-row"><div class="checkbox"></div> Pharmacie</div>
      <div class="checkbox-row"><div class="checkbox"></div> Analyses médicales</div>
      <div class="checkbox-row"><div class="checkbox"></div> Radiologie</div>
      <div class="checkbox-row"><div class="checkbox"></div> Hospitalisation</div>
      <div class="checkbox-row"><div class="checkbox"></div> Autre: ______________</div>
    </div>
  </div>

  <div class="section">
    <div class="section-title">INFORMATIONS PRATICIEN</div>
    <div class="row">
      <span class="label">Nom du praticien:</span>
      <span class="value"></span>
    </div>
    <div class="row">
      <span class="label">Spécialité:</span>
      <span class="value"></span>
    </div>
    <div class="row">
      <span class="label">Adresse:</span>
      <span class="value"></span>
    </div>
    <div class="row">
      <span class="label">Matricule fiscal:</span>
      <span class="value"></span>
    </div>
  </div>

  <div class="section">
    <div class="section-title">DÉTAILS DES SOINS</div>
    <table>
      <thead>
        <tr>
          <th style="width: 40%">Description</th>
          <th style="width: 15%">Date</th>
          <th style="width: 15%">Quantité</th>
          <th style="width: 15%">Prix unitaire</th>
          <th style="width: 15%">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>
        <tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>
        <tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>
        <tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>
        <tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>
        <tr>
          <td colspan="4" style="text-align: right; font-weight: bold;">TOTAL:</td>
          <td></td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="important">
    <strong>Important:</strong> Ce bulletin doit être accompagné des justificatifs originaux (ordonnances, factures, tickets de caisse).
    Le remboursement sera effectué selon les conditions de votre contrat.
  </div>

  <div class="grid-2">
    <div class="section">
      <div class="section-title">SIGNATURE PRATICIEN</div>
      <div class="row">
        <span class="label">Date:</span>
        <span class="value"></span>
      </div>
      <div class="signature-box">Cachet et signature</div>
    </div>
    <div class="section">
      <div class="section-title">SIGNATURE ASSURÉ</div>
      <div class="row">
        <span class="label">Date:</span>
        <span class="value"></span>
      </div>
      <div class="signature-box">Signature</div>
    </div>
  </div>

  <div class="footer">
    <p><strong>Dhamen</strong> - Plateforme de tiers payant santé | www.dhamen.tn</p>
    <p>Pour toute question: support@dhamen.tn | Tél: +216 71 XXX XXX</p>
    <p style="margin-top: 10px; font-size: 8pt;">
      Ce document est généré automatiquement. Veuillez le remplir lisiblement et joindre tous les justificatifs nécessaires.
    </p>
  </div>
</body>
</html>
  `;

  // Return HTML that can be printed as PDF by browser
  return new Response(htmlContent, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `inline; filename="bulletin-soins-${bulletinNumber}.html"`,
    },
  });
});

/**
 * POST /bulletins-soins/ocr-extract - Extract bulletin info from scanned image
 * Used by mobile app after camera capture
 */
bulletinsSoins.post('/ocr-extract', async (c) => {
  const user = c.get('user');

  if (user.role !== 'ADHERENT') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux adhérents' },
    }, 403);
  }

  try {
    const formData = await c.req.formData();
    const imageFile = formData.get('image') as File | null;

    if (!imageFile || imageFile.size === 0) {
      return c.json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Image requise' },
      }, 400);
    }

    const imageBuffer = await imageFile.arrayBuffer();

    let extractedData;
    try {
      extractedData = await extractBulletinData(c, imageBuffer);
    } catch (err) {
      console.warn('OCR agent error, using fallback:', err);
      extractedData = null;
    }

    // If AI extraction returned nothing useful, return empty result for manual entry
    const hasUsefulData = extractedData &&
      extractedData.confidence > 0 &&
      (extractedData.dateSoin || extractedData.montantTotal > 0 || extractedData.praticien?.nom);

    if (!hasUsefulData) {
      return c.json({
        success: true,
        data: {
          dateSoin: null,
          typeSoin: null,
          montantTotal: 0,
          praticienNom: null,
          praticienSpecialite: null,
          description: null,
          adherentNom: null,
          adherentMatricule: null,
          confidence: 0,
          warnings: ['Extraction automatique non disponible. Veuillez remplir les champs manuellement.'],
        },
      });
    }

    const data = extractedData!;
    return c.json({
      success: true,
      data: {
        dateSoin: data.dateSoin || null,
        typeSoin: data.typeSoin || null,
        montantTotal: data.montantTotal || 0,
        praticienNom: data.praticien?.nom || null,
        praticienSpecialite: data.praticien?.specialite || null,
        description: data.lignes.map(l => l.libelle).filter(Boolean).join(', ') || null,
        adherentNom: data.adherentNom || null,
        adherentMatricule: data.adherentMatricule || null,
        confidence: data.confidence,
        warnings: data.warnings,
      },
    });
  } catch (error) {
    console.error('OCR extraction error:', error);
    return c.json({
      success: false,
      error: { code: 'OCR_ERROR', message: 'Erreur lors de l\'extraction' },
    }, 500);
  }
});

/**
 * POST /bulletins-soins/submit - Submit bulletin with file upload (FormData)
 * Used by adherent portal
 */
bulletinsSoins.post('/submit', async (c) => {
  const user = c.get('user');
  const db = getDb(c);
  const storage = c.env.STORAGE;

  if (user.role !== 'ADHERENT') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux adhérents' },
    }, 403);
  }

  // Get adherent ID
  const adherent = await db.prepare(`
    SELECT id FROM adherents WHERE email = ? AND deleted_at IS NULL
  `).bind(user.email).first<{ id: string }>();

  if (!adherent) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Adhérent non trouvé' },
    }, 404);
  }

  // Parse multipart form data
  const formData = await c.req.formData();

  // Extract form fields
  const careType = formData.get('care_type') as string || 'consultation';
  const bulletinDate = formData.get('bulletin_date') as string;
  const providerName = formData.get('provider_name') as string;
  const providerSpecialty = formData.get('provider_specialty') as string || null;
  const totalAmountStr = formData.get('total_amount') as string;
  const totalAmount = totalAmountStr ? parseFloat(totalAmountStr) : null;
  const careDescription = formData.get('care_description') as string || null;
  const beneficiaryType = formData.get('beneficiary_type') as string || 'self';
  const beneficiaryFirstName = formData.get('beneficiary_first_name') as string || null;
  const beneficiaryLastName = formData.get('beneficiary_last_name') as string || null;
  const beneficiaryRelationship = formData.get('beneficiary_relationship') as string || null;

  // Validate required fields
  if (!bulletinDate) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Date du bulletin requise' },
    }, 400);
  }

  if (!providerName) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Nom du praticien requis' },
    }, 400);
  }

  // Generate bulletin ID and number
  const id = generateId();
  const bulletinNumber = `BS-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const now = new Date().toISOString();

  // Handle file uploads
  const uploadedFiles: { url: string; filename: string }[] = [];

  for (const [key, value] of formData.entries()) {
    if (key.startsWith('scan_') && typeof value === 'object' && 'arrayBuffer' in value) {
      const file = value as File;
      if (file.size > 0) {
        const filename = `bulletins/${adherent.id}/${id}/${Date.now()}-${file.name}`;
        const arrayBuffer = await file.arrayBuffer();

        await storage.put(filename, arrayBuffer, {
          httpMetadata: {
            contentType: file.type,
          },
        });

        uploadedFiles.push({
          url: `https://dhamen-files.r2.cloudflarestorage.com/${filename}`,
          filename: file.name,
        });
      }
    }
  }

  const firstFile = uploadedFiles[0];
  if (!firstFile) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Au moins un fichier scan requis' },
    }, 400);
  }

  // Handle beneficiary if it's not self
  let beneficiaryId: string | null = null;
  if (beneficiaryType === 'beneficiary' && beneficiaryFirstName && beneficiaryLastName) {
    const fullName = `${beneficiaryFirstName} ${beneficiaryLastName}`;
    // Check if beneficiary exists or create one
    const existingBeneficiary = await db.prepare(`
      SELECT id FROM beneficiaries
      WHERE adherent_id = ? AND full_name = ?
    `).bind(adherent.id, fullName).first<{ id: string }>();

    if (existingBeneficiary) {
      beneficiaryId = existingBeneficiary.id;
    } else {
      // Create beneficiary
      beneficiaryId = generateId();
      await db.prepare(`
        INSERT INTO beneficiaries (id, adherent_id, full_name, relationship, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(beneficiaryId, adherent.id, fullName, beneficiaryRelationship || 'other', now, now).run();
    }
  }

  // Insert bulletin
  await db.prepare(`
    INSERT INTO bulletins_soins (
      id, adherent_id, beneficiary_id, bulletin_number, bulletin_date,
      provider_name, provider_specialty, care_type, care_description,
      total_amount, status, submission_date, scan_url, scan_filename,
      additional_documents, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scan_uploaded', ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    adherent.id,
    beneficiaryId,
    bulletinNumber,
    bulletinDate,
    providerName,
    providerSpecialty,
    careType,
    careDescription,
    totalAmount,
    now,
    firstFile.url,
    firstFile.filename,
    uploadedFiles.length > 1 ? JSON.stringify(uploadedFiles.slice(1)) : null,
    now,
    now
  ).run();

  return c.json({
    success: true,
    data: {
      id,
      bulletin_number: bulletinNumber,
      status: 'scan_uploaded',
      message: 'Bulletin soumis avec succès. N\'oubliez pas d\'envoyer le bulletin papier original.',
      uploaded_files: uploadedFiles.length,
    },
  }, 201);
});

/**
 * POST /bulletins-soins/me/:id/upload-scan - Upload scanned document
 */
bulletinsSoins.post('/me/:id/upload-scan', async (c) => {
  const user = c.get('user');
  const bulletinId = c.req.param('id');
  const db = getDb(c);
  const storage = c.env.STORAGE;

  if (user.role !== 'ADHERENT') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux adhérents' },
    }, 403);
  }

  // Get adherent ID
  const adherent = await db.prepare(`
    SELECT id FROM adherents WHERE email = ? AND deleted_at IS NULL
  `).bind(user.email).first<{ id: string }>();

  if (!adherent) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Adhérent non trouvé' },
    }, 404);
  }

  // Verify bulletin belongs to adherent
  const bulletin = await db.prepare(`
    SELECT id FROM bulletins_soins WHERE id = ? AND adherent_id = ?
  `).bind(bulletinId, adherent.id).first();

  if (!bulletin) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Bulletin non trouvé' },
    }, 404);
  }

  // Parse multipart form data
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Fichier requis' },
    }, 400);
  }

  // Upload to R2
  const filename = `bulletins/${adherent.id}/${bulletinId}/${Date.now()}-${file.name}`;
  const arrayBuffer = await file.arrayBuffer();

  await storage.put(filename, arrayBuffer, {
    httpMetadata: {
      contentType: file.type,
    },
  });

  // Update bulletin with scan URL
  const scanUrl = `https://dhamen-files.r2.cloudflarestorage.com/${filename}`;

  await db.prepare(`
    UPDATE bulletins_soins
    SET scan_url = ?, scan_filename = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(scanUrl, file.name, bulletinId).run();

  return c.json({
    success: true,
    data: {
      scan_url: scanUrl,
      filename: file.name,
    },
  });
});

// ============================================
// INSURER AGENT ROUTES - Bulletin Validation
// ============================================

/**
 * GET /bulletins-soins/manage - List all bulletins for validation (INSURER_AGENT, INSURER_ADMIN)
 */
bulletinsSoins.get('/manage', async (c) => {
  const user = c.get('user');
  const db = getDb(c);

  // Check if user is an insurer agent or admin
  if (!['INSURER_AGENT', 'INSURER_ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux agents assureur' },
    }, 403);
  }

  // Get query params
  const status = c.req.query('status');
  const careType = c.req.query('care_type');
  const search = c.req.query('search');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = (page - 1) * limit;

  // Build query with filters
  let whereClause = 'WHERE 1=1';
  const params: (string | number)[] = [];

  if (status) {
    // Handle multiple statuses (comma-separated)
    const statuses = status.split(',').map(s => s.trim());
    if (statuses.length === 1 && statuses[0]) {
      whereClause += ' AND bs.status = ?';
      params.push(statuses[0]);
    } else {
      whereClause += ` AND bs.status IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }
  }

  if (careType) {
    whereClause += ' AND bs.care_type = ?';
    params.push(careType);
  }

  if (search) {
    whereClause += ' AND (bs.bulletin_number LIKE ? OR a.first_name LIKE ? OR a.last_name LIKE ? OR a.national_id_encrypted LIKE ? OR bs.provider_name LIKE ?)';
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
  }

  // Filter by insurer
  if (user.insurerId) {
    whereClause += ' AND co.insurer_id = ?';
    params.push(user.insurerId);
  }

  // Get total count
  const countResult = await db.prepare(`
    SELECT COUNT(*) as total
    FROM bulletins_soins bs
    JOIN adherents a ON bs.adherent_id = a.id
    JOIN companies co ON a.company_id = co.id
    ${whereClause}
  `).bind(...params).first<{ total: number }>();

  // Get bulletins with pagination
  const bulletins = await db.prepare(`
    SELECT
      bs.*,
      a.first_name as adherent_first_name,
      a.last_name as adherent_last_name,
      a.national_id_encrypted as adherent_national_id,
      b.full_name as beneficiary_name,
      b.relationship as beneficiary_relationship
    FROM bulletins_soins bs
    JOIN adherents a ON bs.adherent_id = a.id
    JOIN companies co ON a.company_id = co.id
    LEFT JOIN beneficiaries b ON bs.beneficiary_id = b.id
    ${whereClause}
    ORDER BY
      CASE bs.status
        WHEN 'scan_uploaded' THEN 1
        WHEN 'paper_received' THEN 2
        WHEN 'paper_incomplete' THEN 3
        WHEN 'paper_complete' THEN 4
        WHEN 'processing' THEN 5
        ELSE 6
      END,
      bs.submission_date DESC
    LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();

  return c.json({
    success: true,
    data: bulletins.results,
    meta: {
      page,
      limit,
      total: countResult?.total || 0,
      totalPages: Math.ceil((countResult?.total || 0) / limit),
    },
  });
});

/**
 * GET /bulletins-soins/manage/stats - Get statistics for insurer agents
 */
bulletinsSoins.get('/manage/stats', async (c) => {
  const user = c.get('user');
  const db = getDb(c);

  if (!['INSURER_AGENT', 'INSURER_ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux agents assureur' },
    }, 403);
  }

  // Build insurer filter
  let statsWhere = 'WHERE 1=1';
  const statsParams: string[] = [];
  if (user.insurerId) {
    statsWhere += ' AND co.insurer_id = ?';
    statsParams.push(user.insurerId);
  }

  const stats = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN bs.status = 'scan_uploaded' THEN 1 ELSE 0 END) as scan_uploaded,
      SUM(CASE WHEN bs.status = 'paper_received' THEN 1 ELSE 0 END) as paper_received,
      SUM(CASE WHEN bs.status = 'paper_incomplete' THEN 1 ELSE 0 END) as paper_incomplete,
      SUM(CASE WHEN bs.status = 'paper_complete' THEN 1 ELSE 0 END) as paper_complete,
      SUM(CASE WHEN bs.status = 'processing' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN bs.status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN bs.status = 'pending_payment' THEN 1 ELSE 0 END) as pending_payment,
      SUM(CASE WHEN bs.status = 'reimbursed' THEN 1 ELSE 0 END) as reimbursed,
      SUM(CASE WHEN bs.status = 'rejected' THEN 1 ELSE 0 END) as rejected,
      COALESCE(SUM(bs.total_amount), 0) as total_amount,
      COALESCE(SUM(bs.reimbursed_amount), 0) as total_reimbursed,
      COALESCE(SUM(CASE WHEN bs.status IN ('approved', 'pending_payment') THEN bs.total_amount ELSE 0 END), 0) as awaiting_payment_amount,
      COALESCE(SUM(CASE WHEN bs.status NOT IN ('reimbursed', 'rejected') THEN bs.total_amount ELSE 0 END), 0) as pending_amount
    FROM bulletins_soins bs
    JOIN adherents a ON bs.adherent_id = a.id
    JOIN companies co ON a.company_id = co.id
    ${statsWhere}
  `).bind(...statsParams).first();

  return c.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /bulletins-soins/manage/:id/scan - Download scan file for a bulletin (insurer agents)
 * IMPORTANT: Must be defined BEFORE /manage/:id to avoid being caught by the dynamic param
 */
bulletinsSoins.get('/manage/:id/scan', async (c) => {
  const user = c.get('user');

  if (!['INSURER_AGENT', 'INSURER_ADMIN', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents' },
    }, 403);
  }

  const bulletinId = c.req.param('id');
  const db = getDb(c);
  const storage = c.env.STORAGE;

  try {
    // Verify bulletin belongs to this insurer
    let scanQuery = `SELECT bs.scan_url FROM bulletins_soins bs LEFT JOIN adherents a ON bs.adherent_id = a.id LEFT JOIN companies co ON a.company_id = co.id WHERE bs.id = ?`;
    const scanParams: string[] = [bulletinId];
    if (user.insurerId) {
      scanQuery += ' AND co.insurer_id = ?';
      scanParams.push(user.insurerId);
    }
    const bulletin = await db.prepare(scanQuery).bind(...scanParams).first<{ scan_url: string | null }>();

    if (!bulletin?.scan_url) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Scan non trouve' },
      }, 404);
    }

    const r2Key = extractR2Key(bulletin.scan_url);
    const object = await storage.get(r2Key);
    if (!object) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Fichier non trouve dans le stockage' },
      }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('Error getting scan:', error);
    return c.json({
      success: false,
      error: { code: 'STORAGE_ERROR', message: 'Erreur lors du chargement du scan' },
    }, 500);
  }
});

/**
 * GET /bulletins-soins/manage/:id - Get specific bulletin details (INSURER_AGENT)
 */
bulletinsSoins.get('/manage/:id', async (c) => {
  const user = c.get('user');
  const bulletinId = c.req.param('id');
  const db = getDb(c);

  if (!['INSURER_AGENT', 'INSURER_ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux agents assureur' },
    }, 403);
  }

  let detailWhere = 'WHERE bs.id = ?';
  const detailParams: string[] = [bulletinId];
  if (user.insurerId) {
    detailWhere += ' AND co.insurer_id = ?';
    detailParams.push(user.insurerId);
  }

  const bulletin = await db.prepare(`
    SELECT
      bs.*,
      a.first_name as adherent_first_name,
      a.last_name as adherent_last_name,
      a.matricule as adherent_matricule,
      a.email as adherent_email,
      a.phone_encrypted as adherent_phone,
      b.full_name as beneficiary_name,
      b.relationship as beneficiary_relationship,
      ct.contract_number,
      ct.plan_type,
      ct.coverage_json,
      i.name as insurer_name
    FROM bulletins_soins bs
    JOIN adherents a ON bs.adherent_id = a.id
    JOIN companies co ON a.company_id = co.id
    LEFT JOIN beneficiaries b ON bs.beneficiary_id = b.id
    LEFT JOIN contracts ct ON ct.adherent_id = a.id AND ct.status = 'active'
    LEFT JOIN insurers i ON ct.insurer_id = i.id
    ${detailWhere}
  `).bind(...detailParams).first();

  if (!bulletin) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Bulletin non trouvé' },
    }, 404);
  }

  return c.json({
    success: true,
    data: bulletin,
  });
});

/**
 * PUT /bulletins-soins/manage/:id/status - Update bulletin status (validation workflow)
 */
bulletinsSoins.put('/manage/:id/status', async (c) => {
  const user = c.get('user');
  const bulletinId = c.req.param('id');
  const db = getDb(c);

  if (!['INSURER_AGENT', 'INSURER_ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux agents assureur' },
    }, 403);
  }

  const body = await c.req.json();
  const { status, notes, missing_documents, reimbursed_amount } = body;

  // Validate status
  const validStatuses = ['paper_received', 'paper_incomplete', 'paper_complete', 'processing', 'approved', 'pending_payment', 'reimbursed', 'rejected'];
  if (!validStatuses.includes(status)) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Statut invalide' },
    }, 400);
  }

  // Get current bulletin (verify insurer ownership)
  let statusQuery = `SELECT bs.* FROM bulletins_soins bs LEFT JOIN adherents a ON bs.adherent_id = a.id LEFT JOIN companies co ON a.company_id = co.id WHERE bs.id = ?`;
  const statusParams: string[] = [bulletinId];
  if (user.insurerId) {
    statusQuery += ' AND co.insurer_id = ?';
    statusParams.push(user.insurerId);
  }
  const bulletin = await db.prepare(statusQuery).bind(...statusParams).first();

  if (!bulletin) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Bulletin non trouvé' },
    }, 404);
  }

  const now = new Date().toISOString();
  let updateFields = 'status = ?, updated_at = ?, validated_by = ?';
  const updateParams: (string | number | null)[] = [status, now, user.id];

  // Handle specific status updates
  if (status === 'processing') {
    updateFields += ', processing_date = ?';
    updateParams.push(now);
  }

  if (status === 'approved') {
    // Agent approves the bulletin for payment
    const approvedAmount = body.approved_amount || (bulletin as Record<string, unknown>).total_amount;
    updateFields += ', approved_date = ?, approved_by = ?, approved_amount = ?';
    updateParams.push(now, user.id, approvedAmount);
  }

  if (status === 'pending_payment') {
    // Insurance is processing payment
    const { payment_method } = body;
    if (payment_method) {
      updateFields += ', payment_method = ?';
      updateParams.push(payment_method);
    }
  }

  if (status === 'reimbursed') {
    // Payment completed
    const { payment_reference, payment_method } = body;
    const finalAmount = body.reimbursed_amount || (bulletin as Record<string, unknown>).approved_amount || (bulletin as Record<string, unknown>).total_amount;
    updateFields += ', reimbursed_amount = ?, reimbursement_date = ?, payment_date = ?';
    updateParams.push(finalAmount, now, now);
    if (payment_reference) {
      updateFields += ', payment_reference = ?';
      updateParams.push(payment_reference);
    }
    if (payment_method) {
      updateFields += ', payment_method = ?';
      updateParams.push(payment_method);
    }
    if (body.payment_notes) {
      updateFields += ', payment_notes = ?';
      updateParams.push(body.payment_notes);
    }
  }

  if (status === 'rejected') {
    updateFields += ', rejection_reason = ?';
    updateParams.push(notes || 'Non spécifié');
  }

  if (status === 'paper_incomplete' && missing_documents) {
    updateFields += ', missing_documents = ?';
    updateParams.push(JSON.stringify(missing_documents));
  }

  if (notes) {
    updateFields += ', agent_notes = ?';
    updateParams.push(notes);
  }

  await db.prepare(`
    UPDATE bulletins_soins SET ${updateFields} WHERE id = ?
  `).bind(...updateParams, bulletinId).run();

  // Log the action
  await db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
    VALUES (?, ?, ?, 'bulletins_soins', ?, ?, ?, datetime('now'))
  `).bind(
    generateId(),
    user.id,
    `bulletin_${status}`,
    bulletinId,
    JSON.stringify({ previous_status: (bulletin as Record<string, unknown>).status, new_status: status, notes }),
    c.req.header('CF-Connecting-IP') || 'unknown'
  ).run();

  return c.json({
    success: true,
    data: {
      id: bulletinId,
      status,
      message: `Bulletin mis à jour: ${status}`,
    },
  });
});

/**
 * POST /bulletins-soins/manage/:id/approve - Approve bulletin for payment (Agent validates)
 * This sets status to 'approved' - payment processing is done separately by INSURER_ADMIN
 */
bulletinsSoins.post('/manage/:id/approve', async (c) => {
  const user = c.get('user');
  const bulletinId = c.req.param('id');
  const db = getDb(c);

  if (!['INSURER_AGENT', 'INSURER_ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux agents assureur' },
    }, 403);
  }

  const body = await c.req.json();
  const approved_amount = body.approved_amount || body.reimbursed_amount;
  const notes = body.notes;

  if (!approved_amount || approved_amount <= 0) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Montant approuvé requis' },
    }, 400);
  }

  // Verify bulletin belongs to this insurer
  let approveQuery = `SELECT bs.* FROM bulletins_soins bs LEFT JOIN adherents a ON bs.adherent_id = a.id LEFT JOIN companies co ON a.company_id = co.id WHERE bs.id = ?`;
  const approveParams: string[] = [bulletinId];
  if (user.insurerId) {
    approveQuery += ' AND co.insurer_id = ?';
    approveParams.push(user.insurerId);
  }
  const bulletin = await db.prepare(approveQuery).bind(...approveParams).first();

  if (!bulletin) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Bulletin non trouvé' },
    }, 404);
  }

  const now = new Date().toISOString();

  await db.prepare(`
    UPDATE bulletins_soins
    SET status = 'approved',
        approved_amount = ?,
        approved_date = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(approved_amount, now, now, bulletinId).run();

  // Audit log
  await db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
    VALUES (?, ?, 'bulletin_approved', 'bulletins_soins', ?, ?, ?, datetime('now'))
  `).bind(
    generateId(),
    user.id,
    bulletinId,
    JSON.stringify({ approved_amount, notes }),
    c.req.header('CF-Connecting-IP') || 'unknown'
  ).run();

  // Fire-and-forget: notify adherent
  const bulletinNumber = bulletin.bulletin_number as string;
  const careType = bulletin.care_type as string || 'soin';
  const formatAmount = (v: number) => (v / 1000).toFixed(3);
  const notifBody = `Votre bulletin ${bulletinNumber} (${careType}) a ete approuve. Montant rembourse : ${formatAmount(approved_amount)} TND.`;

  // Find the user account linked to this adherent (via email)
  // Write notification to both tenant DB and platform DB (mobile may read from either)
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const adherent = await db.prepare(`SELECT email FROM adherents WHERE id = ?`).bind(bulletin.adherent_id).first<{ email: string }>();
        if (!adherent) return;

        // Look up user in tenant DB first, then platform DB
        let userId: string | null = null;
        const tenantUser = await db.prepare(`SELECT id FROM users WHERE email = ? AND is_active = 1`).bind(adherent.email).first<{ id: string }>();
        if (tenantUser) userId = tenantUser.id;
        if (!userId) {
          const platformUser = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ? AND is_active = 1`).bind(adherent.email).first<{ id: string }>();
          if (platformUser) userId = platformUser.id;
        }
        if (!userId) return;

        const notifId = generateId();
        const notifTitle = `Bulletin ${bulletinNumber} approuve`;

        // 1. In-app notification — write to tenant DB
        await db.prepare(`
          INSERT INTO notifications (id, user_id, type, event_type, title, body, entity_id, entity_type, status, created_at)
          VALUES (?, ?, 'IN_APP', 'SANTE_DEMANDE_APPROUVEE', ?, ?, ?, 'bulletin', 'PENDING', ?)
        `).bind(notifId, userId, notifTitle, notifBody, bulletinId, now).run();

        // Also write to platform DB so mobile can see it (mobile may not send tenant header)
        if (db !== c.env.DB) {
          await c.env.DB.prepare(`
            INSERT INTO notifications (id, user_id, type, event_type, title, body, entity_id, entity_type, status, created_at)
            VALUES (?, ?, 'IN_APP', 'SANTE_DEMANDE_APPROUVEE', ?, ?, ?, 'bulletin', 'PENDING', ?)
          `).bind(notifId, userId, notifTitle, notifBody, bulletinId, now).run().catch(() => {});
        }

        // 2. Push notification
        const pushService = new PushNotificationService(c.env);
        await pushService.sendSanteNotification(userId, 'SANTE_DEMANDE_APPROUVEE', {
          demandeId: bulletinId, numeroDemande: bulletinNumber, typeSoin: careType,
          dateSoin: (bulletin.bulletin_date as string) || '', montantRembourse: String(approved_amount),
        }).catch(() => {});

        // 3. Realtime WebSocket
        if (c.env.NOTIFICATION_HUB) {
          const realtimeService = new RealtimeNotificationsService(c);
          await realtimeService.sendToUser(userId, {
            id: notifId, type: 'SANTE_DEMANDE_APPROUVEE',
            title: notifTitle, message: notifBody,
            createdAt: now, read: false,
            data: { demandeId: bulletinId, numeroDemande: bulletinNumber, statut: 'approved', typeSoin: careType, montantRembourse: approved_amount },
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Notification failed:', err);
      }
    })()
  );

  return c.json({
    success: true,
    data: {
      id: bulletinId,
      status: 'approved',
      approved_amount,
      message: 'Bulletin approuvé - en attente de paiement',
    },
  });
});

/**
 * POST /bulletins-soins/manage/:id/reject - Reject bulletin
 */
bulletinsSoins.post('/manage/:id/reject', async (c) => {
  const user = c.get('user');
  const bulletinId = c.req.param('id');
  const db = getDb(c);

  if (!['INSURER_AGENT', 'INSURER_ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux agents assureur' },
    }, 403);
  }

  const body = await c.req.json();
  const { reason } = body;

  if (!reason) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Motif de rejet requis' },
    }, 400);
  }

  // Verify bulletin belongs to this insurer
  let rejectQuery = `SELECT bs.* FROM bulletins_soins bs LEFT JOIN adherents a ON bs.adherent_id = a.id LEFT JOIN companies co ON a.company_id = co.id WHERE bs.id = ?`;
  const rejectParams: string[] = [bulletinId];
  if (user.insurerId) {
    rejectQuery += ' AND co.insurer_id = ?';
    rejectParams.push(user.insurerId);
  }
  const bulletin = await db.prepare(rejectQuery).bind(...rejectParams).first();

  if (!bulletin) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Bulletin non trouvé' },
    }, 404);
  }

  const now = new Date().toISOString();

  await db.prepare(`
    UPDATE bulletins_soins
    SET status = 'rejected',
        rejection_reason = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(reason, now, bulletinId).run();

  // Audit log
  await db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
    VALUES (?, ?, 'bulletin_rejected', 'bulletins_soins', ?, ?, ?, datetime('now'))
  `).bind(
    generateId(),
    user.id,
    bulletinId,
    JSON.stringify({ reason }),
    c.req.header('CF-Connecting-IP') || 'unknown'
  ).run();

  // Fire-and-forget: notify adherent
  const bulletinNumber = bulletin.bulletin_number as string;
  const careType = bulletin.care_type as string || 'soin';
  const notifBody = `Votre bulletin ${bulletinNumber} (${careType}) a ete rejete. Motif : ${reason}.`;

  // Find the user account linked to this adherent (via email)
  // Write notification to both tenant DB and platform DB (mobile may read from either)
  c.executionCtx.waitUntil(
    (async () => {
      try {
        const adherent = await db.prepare(`SELECT email FROM adherents WHERE id = ?`).bind(bulletin.adherent_id).first<{ email: string }>();
        if (!adherent) return;

        // Look up user in tenant DB first, then platform DB
        let userId: string | null = null;
        const tenantUser = await db.prepare(`SELECT id FROM users WHERE email = ? AND is_active = 1`).bind(adherent.email).first<{ id: string }>();
        if (tenantUser) userId = tenantUser.id;
        if (!userId) {
          const platformUser = await c.env.DB.prepare(`SELECT id FROM users WHERE email = ? AND is_active = 1`).bind(adherent.email).first<{ id: string }>();
          if (platformUser) userId = platformUser.id;
        }
        if (!userId) return;

        const notifId = generateId();
        const notifTitle = `Bulletin ${bulletinNumber} rejete`;

        // 1. In-app notification — write to tenant DB
        await db.prepare(`
          INSERT INTO notifications (id, user_id, type, event_type, title, body, entity_id, entity_type, status, created_at)
          VALUES (?, ?, 'IN_APP', 'SANTE_DEMANDE_REJETEE', ?, ?, ?, 'bulletin', 'PENDING', ?)
        `).bind(notifId, userId, notifTitle, notifBody, bulletinId, now).run();

        // Also write to platform DB so mobile can see it (mobile may not send tenant header)
        if (db !== c.env.DB) {
          await c.env.DB.prepare(`
            INSERT INTO notifications (id, user_id, type, event_type, title, body, entity_id, entity_type, status, created_at)
            VALUES (?, ?, 'IN_APP', 'SANTE_DEMANDE_REJETEE', ?, ?, ?, 'bulletin', 'PENDING', ?)
          `).bind(notifId, userId, notifTitle, notifBody, bulletinId, now).run().catch(() => {});
        }

        // 2. Push notification
        const pushService = new PushNotificationService(c.env);
        await pushService.sendSanteNotification(userId, 'SANTE_DEMANDE_REJETEE', {
          demandeId: bulletinId, numeroDemande: bulletinNumber, typeSoin: careType,
          dateSoin: (bulletin.bulletin_date as string) || '', motifRejet: reason, montantRembourse: '0',
        }).catch(() => {});

        // 3. Realtime WebSocket
        if (c.env.NOTIFICATION_HUB) {
          const realtimeService = new RealtimeNotificationsService(c);
          await realtimeService.sendToUser(userId, {
            id: generateId(), type: 'SANTE_DEMANDE_REJETEE',
            title: notifTitle, message: notifBody,
            createdAt: now, read: false,
            data: { demandeId: bulletinId, numeroDemande: bulletinNumber, statut: 'rejected', typeSoin: careType, motifRejet: reason },
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Notification failed:', err);
      }
    })()
  );

  return c.json({
    success: true,
    data: {
      id: bulletinId,
      status: 'rejected',
      rejection_reason: reason,
      message: 'Bulletin rejeté',
    },
  });
});

// ============================================
// PAYMENT MANAGEMENT ROUTES - For INSURER_ADMIN
// ============================================

/**
 * GET /bulletins-soins/payments - List bulletins pending payment (INSURER_ADMIN only)
 */
bulletinsSoins.get('/payments', async (c) => {
  const user = c.get('user');
  const db = getDb(c);

  if (user.role !== 'INSURER_ADMIN') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux administrateurs assureur' },
    }, 403);
  }

  try {
    const status = c.req.query('status') || 'approved,pending_payment';
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = (page - 1) * limit;

    const statuses = status.split(',').map(s => s.trim());
    const placeholders = statuses.map(() => '?').join(',');

    // Build insurer filter
    let payInsurer = '';
    const payInsurerParams: string[] = [];
    if (user.insurerId) {
      payInsurer = ' AND co.insurer_id = ?';
      payInsurerParams.push(user.insurerId);
    }

    const countResult = await db.prepare(`
      SELECT COUNT(*) as total
      FROM bulletins_soins bs
      JOIN adherents a ON bs.adherent_id = a.id
      JOIN companies co ON a.company_id = co.id
      WHERE bs.status IN (${placeholders})${payInsurer}
    `).bind(...statuses, ...payInsurerParams).first<{ total: number }>();

    const bulletins = await db.prepare(`
      SELECT
        bs.*,
        a.first_name as adherent_first_name,
        a.last_name as adherent_last_name,
        a.national_id_encrypted as adherent_national_id,
        a.rib_encrypted as adherent_rib,
        ct.contract_number,
        ins.name as insurer_name
      FROM bulletins_soins bs
      JOIN adherents a ON bs.adherent_id = a.id
      JOIN companies co ON a.company_id = co.id
      LEFT JOIN contracts ct ON ct.adherent_id = a.id AND ct.status = 'active'
      LEFT JOIN insurers ins ON ct.insurer_id = ins.id
      WHERE bs.status IN (${placeholders})${payInsurer}
      ORDER BY bs.approved_date ASC
      LIMIT ? OFFSET ?
    `).bind(...statuses, ...payInsurerParams, limit, offset).all();

    return c.json({
      success: true,
      data: bulletins.results,
      meta: {
        page,
        limit,
        total: countResult?.total || 0,
        totalPages: Math.ceil((countResult?.total || 0) / limit),
      },
    });
  } catch (err) {
    console.error('Payments list error:', err);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: `Erreur chargement paiements: ${err instanceof Error ? err.message : String(err)}` },
    }, 500);
  }
});

/**
 * GET /bulletins-soins/payments/stats - Payment statistics (INSURER_ADMIN only)
 */
bulletinsSoins.get('/payments/stats', async (c) => {
  const user = c.get('user');
  const db = getDb(c);

  if (user.role !== 'INSURER_ADMIN') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux administrateurs assureur' },
    }, 403);
  }

  // Build insurer filter
  let payStatsWhere = 'WHERE 1=1';
  const payStatsParams: string[] = [];
  if (user.insurerId) {
    payStatsWhere += ' AND co.insurer_id = ?';
    payStatsParams.push(user.insurerId);
  }

  const stats = await db.prepare(`
    SELECT
      SUM(CASE WHEN bs.status = 'approved' THEN 1 ELSE 0 END) as approved_count,
      SUM(CASE WHEN bs.status = 'approved' THEN COALESCE(bs.approved_amount, 0) ELSE 0 END) as approved_amount,
      SUM(CASE WHEN bs.status = 'pending_payment' THEN 1 ELSE 0 END) as pending_payment_count,
      SUM(CASE WHEN bs.status = 'pending_payment' THEN COALESCE(bs.approved_amount, 0) ELSE 0 END) as pending_payment_amount,
      SUM(CASE WHEN bs.status = 'reimbursed' AND date(bs.reimbursement_date) = date('now') THEN 1 ELSE 0 END) as today_paid_count,
      SUM(CASE WHEN bs.status = 'reimbursed' AND date(bs.reimbursement_date) = date('now') THEN COALESCE(bs.reimbursed_amount, 0) ELSE 0 END) as today_paid_amount,
      SUM(CASE WHEN bs.status = 'reimbursed' AND date(bs.reimbursement_date) >= date('now', '-7 days') THEN 1 ELSE 0 END) as week_paid_count,
      SUM(CASE WHEN bs.status = 'reimbursed' AND date(bs.reimbursement_date) >= date('now', '-7 days') THEN COALESCE(bs.reimbursed_amount, 0) ELSE 0 END) as week_paid_amount
    FROM bulletins_soins bs
    JOIN adherents a ON bs.adherent_id = a.id
    JOIN companies co ON a.company_id = co.id
    ${payStatsWhere}
  `).bind(...payStatsParams).first();

  return c.json({
    success: true,
    data: stats,
  });
});

/**
 * POST /bulletins-soins/payments/process - Process payment for a bulletin (INSURER_ADMIN only)
 */
bulletinsSoins.post('/payments/process', async (c) => {
  const user = c.get('user');
  const db = getDb(c);

  if (user.role !== 'INSURER_ADMIN') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux administrateurs assureur' },
    }, 403);
  }

  const body = await c.req.json();
  const { bulletin_id, payment_method, payment_reference, payment_notes } = body;

  if (!bulletin_id) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'ID du bulletin requis' },
    }, 400);
  }

  if (!payment_method) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Méthode de paiement requise' },
    }, 400);
  }

  // Verify bulletin belongs to this insurer
  let processQuery = `SELECT bs.* FROM bulletins_soins bs LEFT JOIN adherents a ON bs.adherent_id = a.id LEFT JOIN companies co ON a.company_id = co.id WHERE bs.id = ? AND bs.status IN ('approved', 'pending_payment')`;
  const processParams: (string)[] = [bulletin_id];
  if (user.insurerId) {
    processQuery += ' AND co.insurer_id = ?';
    processParams.push(user.insurerId);
  }
  const bulletin = await db.prepare(processQuery).bind(...processParams).first();

  if (!bulletin) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Bulletin non trouvé ou non éligible au paiement' },
    }, 404);
  }

  const now = new Date().toISOString();
  const approvedAmount = (bulletin as Record<string, unknown>).approved_amount || (bulletin as Record<string, unknown>).total_amount;

  await db.prepare(`
    UPDATE bulletins_soins
    SET status = 'reimbursed',
        reimbursed_amount = ?,
        reimbursement_date = ?,
        payment_date = ?,
        payment_method = ?,
        payment_reference = ?,
        payment_notes = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(approvedAmount, now, now, payment_method, payment_reference || null, payment_notes || null, now, bulletin_id).run();

  // Audit log
  await db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
    VALUES (?, ?, 'bulletin_payment_processed', 'bulletins_soins', ?, ?, ?, datetime('now'))
  `).bind(
    generateId(),
    user.id,
    bulletin_id,
    JSON.stringify({ payment_method, payment_reference, amount: approvedAmount }),
    c.req.header('CF-Connecting-IP') || 'unknown'
  ).run();

  return c.json({
    success: true,
    data: {
      id: bulletin_id,
      status: 'reimbursed',
      reimbursed_amount: approvedAmount,
      payment_method,
      payment_reference,
      message: 'Paiement effectué avec succès',
    },
  });
});

/**
 * POST /bulletins-soins/payments/batch - Process multiple payments at once (INSURER_ADMIN only)
 */
bulletinsSoins.post('/payments/batch', async (c) => {
  const user = c.get('user');
  const db = getDb(c);

  if (user.role !== 'INSURER_ADMIN') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux administrateurs assureur' },
    }, 403);
  }

  const body = await c.req.json();
  const { bulletin_ids, payment_method, payment_reference, payment_notes } = body;

  if (!bulletin_ids || !Array.isArray(bulletin_ids) || bulletin_ids.length === 0) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Liste des bulletins requise' },
    }, 400);
  }

  if (!payment_method) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Méthode de paiement requise' },
    }, 400);
  }

  const now = new Date().toISOString();
  const results: { id: string; success: boolean; amount?: number; error?: string }[] = [];
  let totalAmount = 0;

  for (const bulletinId of bulletin_ids) {
    try {
      // Verify bulletin belongs to this insurer
      let batchQuery = `SELECT bs.* FROM bulletins_soins bs LEFT JOIN adherents a ON bs.adherent_id = a.id LEFT JOIN companies co ON a.company_id = co.id WHERE bs.id = ? AND bs.status IN ('approved', 'pending_payment')`;
      const batchParams: string[] = [bulletinId];
      if (user.insurerId) {
        batchQuery += ' AND co.insurer_id = ?';
        batchParams.push(user.insurerId);
      }
      const bulletin = await db.prepare(batchQuery).bind(...batchParams).first();

      if (!bulletin) {
        results.push({ id: bulletinId, success: false, error: 'Non trouvé ou non éligible' });
        continue;
      }

      const approvedAmount = (bulletin as Record<string, unknown>).approved_amount || (bulletin as Record<string, unknown>).total_amount;

      await db.prepare(`
        UPDATE bulletins_soins
        SET status = 'reimbursed',
            reimbursed_amount = ?,
            reimbursement_date = ?,
            payment_date = ?,
            payment_method = ?,
            payment_reference = ?,
            payment_notes = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(approvedAmount, now, now, payment_method, payment_reference || null, payment_notes || null, now, bulletinId).run();

      results.push({ id: bulletinId, success: true, amount: approvedAmount as number });
      totalAmount += (approvedAmount as number) || 0;

      // Audit log for each payment
      await db.prepare(`
        INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, changes_json, ip_address, created_at)
        VALUES (?, ?, 'bulletin_payment_batch', 'bulletins_soins', ?, ?, ?, datetime('now'))
      `).bind(
        generateId(),
        user.id,
        bulletinId,
        JSON.stringify({ payment_method, payment_reference, amount: approvedAmount, batch_size: bulletin_ids.length }),
        c.req.header('CF-Connecting-IP') || 'unknown'
      ).run();
    } catch (err) {
      results.push({ id: bulletinId, success: false, error: 'Erreur de traitement' });
    }
  }

  const successCount = results.filter(r => r.success).length;

  return c.json({
    success: true,
    data: {
      processed: successCount,
      failed: results.length - successCount,
      total_amount: totalAmount,
      payment_method,
      payment_reference,
      results,
      message: `${successCount} paiement(s) effectué(s) sur ${results.length}`,
    },
  });
});

/**
 * POST /bulletins-soins/payments/:id/mark-pending - Mark bulletin as pending payment (INSURER_ADMIN)
 */
bulletinsSoins.post('/payments/:id/mark-pending', async (c) => {
  const user = c.get('user');
  const bulletinId = c.req.param('id');
  const db = getDb(c);

  if (user.role !== 'INSURER_ADMIN') {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Accès réservé aux administrateurs assureur' },
    }, 403);
  }

  // Verify bulletin belongs to this insurer
  let markQuery = `SELECT bs.* FROM bulletins_soins bs LEFT JOIN adherents a ON bs.adherent_id = a.id LEFT JOIN companies co ON a.company_id = co.id WHERE bs.id = ? AND bs.status = 'approved'`;
  const markParams: string[] = [bulletinId];
  if (user.insurerId) {
    markQuery += ' AND co.insurer_id = ?';
    markParams.push(user.insurerId);
  }
  const bulletin = await db.prepare(markQuery).bind(...markParams).first();

  if (!bulletin) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Bulletin non trouvé ou non éligible' },
    }, 404);
  }

  const now = new Date().toISOString();

  await db.prepare(`
    UPDATE bulletins_soins
    SET status = 'pending_payment',
        updated_at = ?
    WHERE id = ?
  `).bind(now, bulletinId).run();

  return c.json({
    success: true,
    data: {
      id: bulletinId,
      status: 'pending_payment',
      message: 'Bulletin marqué en attente de paiement',
    },
  });
});

// ─────────────────────────────────────────────────────────────
// History endpoints (REQ-007)
// ─────────────────────────────────────────────────────────────

/**
 * GET /bulletins-soins/history/stats - Aggregated reimbursement statistics
 */
bulletinsSoins.get('/history/stats', async (c) => {
  const user = c.get('user');
  const db = getDb(c);

  if (!['INSURER_AGENT', 'INSURER_ADMIN', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents assureur' },
    }, 403);
  }

  const dateFrom = c.req.query('dateFrom');
  const dateTo = c.req.query('dateTo');

  let periodClause = '';
  const periodParams: string[] = [];

  // Filter by insurer
  if (user.insurerId) {
    periodClause += ' AND co.insurer_id = ?';
    periodParams.push(user.insurerId);
  }
  if (dateFrom) {
    periodClause += ' AND bs.bulletin_date >= ?';
    periodParams.push(dateFrom);
  }
  if (dateTo) {
    periodClause += ' AND bs.bulletin_date <= ?';
    periodParams.push(dateTo);
  }

  const histJoin = 'FROM bulletins_soins bs JOIN adherents a ON bs.adherent_id = a.id JOIN companies co ON a.company_id = co.id';

  try {
    // Count + sum by status
    const { results: byStatus } = await db.prepare(`
      SELECT bs.status, COUNT(*) as count, COALESCE(SUM(bs.total_amount), 0) as total_declared, COALESCE(SUM(bs.reimbursed_amount), 0) as total_reimbursed
      ${histJoin}
      WHERE bs.status IN ('approved', 'reimbursed', 'rejected')${periodClause}
      GROUP BY bs.status
    `).bind(...periodParams).all();

    // By care type
    const { results: byCareType } = await db.prepare(`
      SELECT bs.care_type, COUNT(*) as count, COALESCE(SUM(bs.reimbursed_amount), 0) as total_reimbursed
      ${histJoin}
      WHERE bs.status IN ('approved', 'reimbursed', 'rejected')${periodClause}
      GROUP BY bs.care_type
    `).bind(...periodParams).all();

    // Monthly evolution (last 12 months)
    const { results: monthly } = await db.prepare(`
      SELECT strftime('%Y-%m', bs.bulletin_date) as month, COUNT(*) as count, COALESCE(SUM(bs.reimbursed_amount), 0) as total_reimbursed
      ${histJoin}
      WHERE bs.status IN ('approved', 'reimbursed', 'rejected')${periodClause}
      GROUP BY strftime('%Y-%m', bs.bulletin_date)
      ORDER BY month DESC
      LIMIT 12
    `).bind(...periodParams).all();

    // Aggregate totals
    let totalBulletins = 0;
    let totalDeclared = 0;
    let totalReimbursed = 0;
    const statusCounts: Record<string, number> = { approved: 0, reimbursed: 0, rejected: 0 };

    for (const row of byStatus) {
      const count = Number(row.count) || 0;
      totalBulletins += count;
      totalDeclared += Number(row.total_declared) || 0;
      totalReimbursed += Number(row.total_reimbursed) || 0;
      statusCounts[row.status as string] = count;
    }

    return c.json({
      success: true,
      data: {
        totalBulletins,
        totalDeclared,
        totalReimbursed,
        byStatus: statusCounts,
        byCareType: byCareType.map((r) => ({
          careType: r.care_type,
          count: Number(r.count),
          totalReimbursed: Number(r.total_reimbursed),
        })),
        monthly: monthly.map((r) => ({
          month: r.month,
          count: Number(r.count),
          totalReimbursed: Number(r.total_reimbursed),
        })),
      },
    });
  } catch (err) {
    console.error('History stats error:', err);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: `Erreur statistiques: ${err instanceof Error ? err.message : String(err)}` },
    }, 500);
  }
});

/**
 * GET /bulletins-soins/history/export - Export history as CSV
 */
bulletinsSoins.get('/history/export', async (c) => {
  const user = c.get('user');
  const db = getDb(c);

  if (!['INSURER_AGENT', 'INSURER_ADMIN', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents assureur' },
    }, 403);
  }

  const adherentId = c.req.query('adherentId');
  const dateFrom = c.req.query('dateFrom');
  const dateTo = c.req.query('dateTo');
  const careType = c.req.query('careType');
  const status = c.req.query('status');

  let whereClause = "WHERE bs.status IN ('approved', 'reimbursed', 'rejected')";
  const params: (string | number)[] = [];

  // Filter by insurer
  if (user.insurerId) {
    whereClause += ' AND co.insurer_id = ?';
    params.push(user.insurerId);
  }
  if (adherentId) {
    whereClause += ' AND bs.adherent_id = ?';
    params.push(adherentId);
  }
  if (dateFrom) {
    whereClause += ' AND bs.bulletin_date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ' AND bs.bulletin_date <= ?';
    params.push(dateTo);
  }
  if (careType) {
    whereClause += ' AND bs.care_type = ?';
    params.push(careType);
  }
  if (status) {
    whereClause += ' AND bs.status = ?';
    params.push(status);
  }

  try {
    const { results } = await db.prepare(`
      SELECT bs.bulletin_number, bs.bulletin_date, bs.adherent_matricule,
             COALESCE(a.first_name, bs.adherent_first_name) as adherent_first_name,
             COALESCE(a.last_name, bs.adherent_last_name) as adherent_last_name,
             bs.care_type, bs.total_amount, bs.reimbursed_amount, bs.status, bs.validated_at
      FROM bulletins_soins bs
      LEFT JOIN adherents a ON bs.adherent_id = a.id
      LEFT JOIN companies co ON a.company_id = co.id
      ${whereClause}
      ORDER BY bs.bulletin_date DESC
      LIMIT 10000
    `).bind(...params).all();

    // Build CSV with BOM for Excel compatibility
    const BOM = '\uFEFF';
    const headerFields = [
      'Numero Bulletin',
      'Date',
      'Matricule Adherent',
      'Nom Adherent',
      'Prenom Adherent',
      'Type Soin',
      'Montant Declare',
      'Montant Rembourse',
      'Statut',
      'Date Validation',
    ];
    const header = headerFields.map(h => `"${h}"`).join(';');
    const lines = results.map((r) => {
      const fields = [
        r.bulletin_number || '',
        r.bulletin_date || '',
        r.adherent_matricule || '',
        r.adherent_last_name || '',
        r.adherent_first_name || '',
        r.care_type || '',
        r.total_amount != null ? String(r.total_amount) : '0',
        r.reimbursed_amount != null ? String(r.reimbursed_amount) : '0',
        r.status || '',
        r.validated_at || '',
      ];
      return fields.map(f => `"${String(f).replace(/"/g, '""')}"`).join(';');
    });

    const csv = BOM + header + '\n' + lines.join('\n');
    const today = new Date().toISOString().slice(0, 10);

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="historique-remboursements-${today}.csv"`,
      },
    });
  } catch (err) {
    console.error('History export error:', err);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: `Erreur export: ${err instanceof Error ? err.message : String(err)}` },
    }, 500);
  }
});

/**
 * GET /bulletins-soins/history/:id - Detailed view of a single bulletin
 */
bulletinsSoins.get('/history/:id', async (c) => {
  const user = c.get('user');
  const db = getDb(c);

  if (!['INSURER_AGENT', 'INSURER_ADMIN', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents assureur' },
    }, 403);
  }

  const bulletinId = c.req.param('id');

  try {
    let histDetailWhere = 'WHERE bs.id = ?';
    const histDetailParams: string[] = [bulletinId];
    if (user.insurerId) {
      histDetailWhere += ' AND co.insurer_id = ?';
      histDetailParams.push(user.insurerId);
    }

    const bulletin = await db.prepare(`
      SELECT bs.*,
             a.first_name as adh_first_name, a.last_name as adh_last_name,
             a.matricule as adh_matricule, a.national_id_encrypted as adh_national_id,
             a.plafond_global as adh_plafond_global, a.plafond_consomme as adh_plafond_consomme,
             a.email as adh_email
      FROM bulletins_soins bs
      LEFT JOIN adherents a ON bs.adherent_id = a.id
      LEFT JOIN companies co ON a.company_id = co.id
      ${histDetailWhere}
    `).bind(...histDetailParams).first();

    if (!bulletin) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Bulletin non trouve' },
      }, 404);
    }

    // Only show bulletins with final status
    const finalStatuses = ['approved', 'reimbursed', 'rejected'];
    if (!finalStatuses.includes(bulletin.status as string)) {
      return c.json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Ce bulletin n\'est pas encore dans un statut final' },
      }, 404);
    }

    // Get actes
    const { results: actes } = await db.prepare(`
      SELECT id, code, label, amount, taux_remboursement, montant_rembourse,
             remboursement_brut, plafond_depasse, acte_ref_id
      FROM actes_bulletin
      WHERE bulletin_id = ?
      ORDER BY created_at ASC
    `).bind(bulletinId).all();

    const plafondGlobal = Number(bulletin.adh_plafond_global) || 0;
    const plafondConsomme = Number(bulletin.adh_plafond_consomme) || 0;

    return c.json({
      success: true,
      data: {
        id: bulletin.id,
        bulletinNumber: bulletin.bulletin_number,
        bulletinDate: bulletin.bulletin_date,
        status: bulletin.status,
        careType: bulletin.care_type,
        careDescription: bulletin.care_description,
        providerName: bulletin.provider_name,
        providerSpecialty: bulletin.provider_specialty,
        totalAmount: bulletin.total_amount,
        reimbursedAmount: bulletin.reimbursed_amount,
        rejectionReason: bulletin.rejection_reason,
        scanUrl: bulletin.scan_url,
        scanFilename: bulletin.scan_filename,
        validatedAt: bulletin.validated_at,
        validatedBy: bulletin.validated_by,
        approvedDate: bulletin.approved_date,
        paymentDate: bulletin.payment_date,
        paymentMethod: bulletin.payment_method,
        paymentReference: bulletin.payment_reference,
        agentNotes: bulletin.agent_notes,
        createdAt: bulletin.created_at,
        adherent: {
          id: bulletin.adherent_id,
          firstName: bulletin.adh_first_name || bulletin.adherent_first_name,
          lastName: bulletin.adh_last_name || bulletin.adherent_last_name,
          matricule: bulletin.adh_matricule || bulletin.adherent_matricule,
          nationalId: bulletin.adh_national_id || bulletin.adherent_national_id,
          email: bulletin.adh_email || null,
          plafondGlobal,
          plafondConsomme,
          plafondRestant: Math.max(0, plafondGlobal - plafondConsomme),
        },
        beneficiary: bulletin.beneficiary_name ? {
          name: bulletin.beneficiary_name,
          relationship: bulletin.beneficiary_relationship,
        } : null,
        actes: actes.map((a) => ({
          id: a.id,
          code: a.code,
          label: a.label,
          amount: a.amount,
          tauxRemboursement: a.taux_remboursement,
          montantRembourse: a.montant_rembourse,
          remboursementBrut: a.remboursement_brut,
          plafondDepasse: a.plafond_depasse === 1,
          acteRefId: a.acte_ref_id,
        })),
        totaux: {
          totalDeclare: actes.reduce((sum, a) => sum + (Number(a.amount) || 0), 0),
          totalRembourse: actes.reduce((sum, a) => sum + (Number(a.montant_rembourse) || 0), 0),
          nbActes: actes.length,
          nbPlafondDepasse: actes.filter(a => a.plafond_depasse === 1).length,
        },
      },
    });
  } catch (err) {
    console.error('History detail error:', err);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: `Erreur detail: ${err instanceof Error ? err.message : String(err)}` },
    }, 500);
  }
});

/**
 * GET /bulletins-soins/history - List bulletins with final status (approved, reimbursed, rejected)
 */
bulletinsSoins.get('/history', async (c) => {
  const user = c.get('user');
  const db = getDb(c);

  if (!['INSURER_AGENT', 'INSURER_ADMIN', 'ADMIN'].includes(user.role)) {
    return c.json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Acces reserve aux agents assureur' },
    }, 403);
  }

  const adherentId = c.req.query('adherentId');
  const dateFrom = c.req.query('dateFrom');
  const dateTo = c.req.query('dateTo');
  const careType = c.req.query('careType');
  const status = c.req.query('status');
  const search = c.req.query('search');
  const sortBy = c.req.query('sortBy') || 'bulletin_date';
  const sortOrder = c.req.query('sortOrder') === 'asc' ? 'ASC' : 'DESC';
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const offset = (page - 1) * limit;

  // Whitelist sortBy to prevent SQL injection
  const allowedSortColumns: Record<string, string> = {
    bulletin_date: 'bs.bulletin_date',
    total_amount: 'bs.total_amount',
    reimbursed_amount: 'bs.reimbursed_amount',
    status: 'bs.status',
    created_at: 'bs.created_at',
  };
  const sortColumn = allowedSortColumns[sortBy] || 'bs.bulletin_date';

  let whereClause = "WHERE bs.status IN ('approved', 'reimbursed', 'rejected')";
  const params: (string | number)[] = [];

  // Filter by insurer
  if (user.insurerId) {
    whereClause += ' AND co.insurer_id = ?';
    params.push(user.insurerId);
  }
  if (adherentId) {
    whereClause += ' AND bs.adherent_id = ?';
    params.push(adherentId);
  }
  if (dateFrom) {
    whereClause += ' AND bs.bulletin_date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ' AND bs.bulletin_date <= ?';
    params.push(dateTo);
  }
  if (careType) {
    whereClause += ' AND bs.care_type = ?';
    params.push(careType);
  }
  if (status && ['approved', 'reimbursed', 'rejected'].includes(status)) {
    whereClause += ' AND bs.status = ?';
    params.push(status);
  }
  if (search) {
    whereClause += ' AND (bs.bulletin_number LIKE ? OR bs.adherent_first_name LIKE ? OR bs.adherent_last_name LIKE ? OR bs.adherent_matricule LIKE ? OR a.first_name LIKE ? OR a.last_name LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s, s, s);
  }

  try {
    // Count
    const countResult = await db.prepare(`
      SELECT COUNT(*) as total
      FROM bulletins_soins bs
      LEFT JOIN adherents a ON bs.adherent_id = a.id
      LEFT JOIN companies co ON a.company_id = co.id
      ${whereClause}
    `).bind(...params).first<{ total: number }>();

    const total = countResult?.total || 0;

    // Main query
    const { results } = await db.prepare(`
      SELECT bs.id, bs.bulletin_number, bs.bulletin_date, bs.care_type, bs.status,
             bs.total_amount, bs.reimbursed_amount, bs.validated_at, bs.payment_date,
             bs.scan_url, bs.adherent_id,
             COALESCE(a.first_name, bs.adherent_first_name) as adherent_first_name,
             COALESCE(a.last_name, bs.adherent_last_name) as adherent_last_name,
             COALESCE(a.matricule, bs.adherent_matricule) as adherent_matricule,
             (SELECT COUNT(*) FROM actes_bulletin ab WHERE ab.bulletin_id = bs.id) as actes_count
      FROM bulletins_soins bs
      LEFT JOIN adherents a ON bs.adherent_id = a.id
      LEFT JOIN companies co ON a.company_id = co.id
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    return c.json({
      success: true,
      data: results.map((r) => ({
        id: r.id,
        bulletinNumber: r.bulletin_number,
        bulletinDate: r.bulletin_date,
        careType: r.care_type,
        status: r.status,
        totalAmount: r.total_amount,
        reimbursedAmount: r.reimbursed_amount,
        validatedAt: r.validated_at,
        paymentDate: r.payment_date,
        hasScan: !!r.scan_url,
        adherentId: r.adherent_id,
        adherentFirstName: r.adherent_first_name,
        adherentLastName: r.adherent_last_name,
        adherentMatricule: r.adherent_matricule,
        actesCount: r.actes_count,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('History list error:', err);
    return c.json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: `Erreur historique: ${err instanceof Error ? err.message : String(err)}` },
    }, 500);
  }
});

export { bulletinsSoins };
