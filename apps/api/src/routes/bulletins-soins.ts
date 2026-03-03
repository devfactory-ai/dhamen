import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { generateId } from '../lib/ulid';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const bulletinsSoins = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
bulletinsSoins.use('*', authMiddleware());

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
 * Must be registered BEFORE /me/:id to avoid route conflict
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

  // Get total count
  const countResult = await db.prepare(`
    SELECT COUNT(*) as total
    FROM bulletins_soins bs
    JOIN adherents a ON bs.adherent_id = a.id
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

  const stats = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'scan_uploaded' THEN 1 ELSE 0 END) as scan_uploaded,
      SUM(CASE WHEN status = 'paper_received' THEN 1 ELSE 0 END) as paper_received,
      SUM(CASE WHEN status = 'paper_incomplete' THEN 1 ELSE 0 END) as paper_incomplete,
      SUM(CASE WHEN status = 'paper_complete' THEN 1 ELSE 0 END) as paper_complete,
      SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status = 'pending_payment' THEN 1 ELSE 0 END) as pending_payment,
      SUM(CASE WHEN status = 'reimbursed' THEN 1 ELSE 0 END) as reimbursed,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
      COALESCE(SUM(total_amount), 0) as total_amount,
      COALESCE(SUM(reimbursed_amount), 0) as total_reimbursed,
      COALESCE(SUM(CASE WHEN status IN ('approved', 'pending_payment') THEN COALESCE(approved_amount, total_amount) ELSE 0 END), 0) as awaiting_payment_amount,
      COALESCE(SUM(CASE WHEN status NOT IN ('reimbursed', 'rejected') THEN total_amount ELSE 0 END), 0) as pending_amount
    FROM bulletins_soins
  `).first();

  return c.json({
    success: true,
    data: stats,
  });
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
      c.contract_number,
      c.plan_type,
      c.coverage_json,
      i.name as insurer_name
    FROM bulletins_soins bs
    JOIN adherents a ON bs.adherent_id = a.id
    LEFT JOIN beneficiaries b ON bs.beneficiary_id = b.id
    LEFT JOIN contracts c ON c.adherent_id = a.id AND c.status = 'active'
    LEFT JOIN insurers i ON c.insurer_id = i.id
    WHERE bs.id = ?
  `).bind(bulletinId).first();

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

  // Get current bulletin
  const bulletin = await db.prepare(`
    SELECT * FROM bulletins_soins WHERE id = ?
  `).bind(bulletinId).first();

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
    INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
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
  const { approved_amount, notes } = body;

  if (!approved_amount || approved_amount <= 0) {
    return c.json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Montant approuvé requis' },
    }, 400);
  }

  const bulletin = await db.prepare(`
    SELECT * FROM bulletins_soins WHERE id = ?
  `).bind(bulletinId).first();

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
        approved_by = ?,
        validated_by = ?,
        agent_notes = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(approved_amount, now, user.id, user.id, notes || null, now, bulletinId).run();

  // Audit log
  await db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
    VALUES (?, ?, 'bulletin_approved', 'bulletins_soins', ?, ?, ?, datetime('now'))
  `).bind(
    generateId(),
    user.id,
    bulletinId,
    JSON.stringify({ approved_amount, notes }),
    c.req.header('CF-Connecting-IP') || 'unknown'
  ).run();

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

  const bulletin = await db.prepare(`
    SELECT * FROM bulletins_soins WHERE id = ?
  `).bind(bulletinId).first();

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
        validated_by = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(reason, user.id, now, bulletinId).run();

  // Audit log
  await db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
    VALUES (?, ?, 'bulletin_rejected', 'bulletins_soins', ?, ?, ?, datetime('now'))
  `).bind(
    generateId(),
    user.id,
    bulletinId,
    JSON.stringify({ reason }),
    c.req.header('CF-Connecting-IP') || 'unknown'
  ).run();

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

  const status = c.req.query('status') || 'approved,pending_payment';
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '50');
  const offset = (page - 1) * limit;

  const statuses = status.split(',').map(s => s.trim());
  const placeholders = statuses.map(() => '?').join(',');

  const countResult = await db.prepare(`
    SELECT COUNT(*) as total FROM bulletins_soins WHERE status IN (${placeholders})
  `).bind(...statuses).first<{ total: number }>();

  const bulletins = await db.prepare(`
    SELECT
      bs.*,
      a.first_name as adherent_first_name,
      a.last_name as adherent_last_name,
      a.national_id_encrypted as adherent_national_id,
      a.rib_encrypted as adherent_rib,
      c.contract_number,
      i.name as insurer_name
    FROM bulletins_soins bs
    JOIN adherents a ON bs.adherent_id = a.id
    LEFT JOIN contracts c ON c.adherent_id = a.id AND c.status = 'active'
    LEFT JOIN insurers i ON c.insurer_id = i.id
    WHERE bs.status IN (${placeholders})
    ORDER BY bs.approved_date ASC
    LIMIT ? OFFSET ?
  `).bind(...statuses, limit, offset).all();

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

  const stats = await db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
      SUM(CASE WHEN status = 'approved' THEN COALESCE(approved_amount, 0) ELSE 0 END) as approved_amount,
      SUM(CASE WHEN status = 'pending_payment' THEN 1 ELSE 0 END) as pending_payment_count,
      SUM(CASE WHEN status = 'pending_payment' THEN COALESCE(approved_amount, 0) ELSE 0 END) as pending_payment_amount,
      SUM(CASE WHEN status = 'reimbursed' AND date(reimbursement_date) = date('now') THEN 1 ELSE 0 END) as today_paid_count,
      SUM(CASE WHEN status = 'reimbursed' AND date(reimbursement_date) = date('now') THEN COALESCE(reimbursed_amount, 0) ELSE 0 END) as today_paid_amount,
      SUM(CASE WHEN status = 'reimbursed' AND date(reimbursement_date) >= date('now', '-7 days') THEN 1 ELSE 0 END) as week_paid_count,
      SUM(CASE WHEN status = 'reimbursed' AND date(reimbursement_date) >= date('now', '-7 days') THEN COALESCE(reimbursed_amount, 0) ELSE 0 END) as week_paid_amount
    FROM bulletins_soins
  `).first();

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

  const bulletin = await db.prepare(`
    SELECT * FROM bulletins_soins WHERE id = ? AND status IN ('approved', 'pending_payment')
  `).bind(bulletin_id).first();

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
    INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
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
      const bulletin = await db.prepare(`
        SELECT * FROM bulletins_soins WHERE id = ? AND status IN ('approved', 'pending_payment')
      `).bind(bulletinId).first();

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
        INSERT INTO audit_logs (id, user_id, action, resource_type, resource_id, details, ip_address, created_at)
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

  const bulletin = await db.prepare(`
    SELECT * FROM bulletins_soins WHERE id = ? AND status = 'approved'
  `).bind(bulletinId).first();

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

export { bulletinsSoins };
