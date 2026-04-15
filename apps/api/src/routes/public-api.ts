/**
 * Public API Routes
 *
 * External API for partners (insurers, providers, third-party systems)
 * Requires API key authentication
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables, ApiKeyContext } from '../types';
import { getDb } from '../lib/db';
import { generateId, generatePrefixedId } from '../lib/ulid';
import { logAudit } from '../middleware/audit-trail';

const publicApi = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// =============================================================================
// API Key Middleware
// =============================================================================

// Encoder for hashing
const encoder = new TextEncoder();

/**
 * Hash API key using SHA-256 for secure storage/lookup
 */
async function hashApiKey(apiKey: string): Promise<string> {
  const data = encoder.encode(apiKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Use shared ApiKeyContext type from types.ts
type ApiKeyInfo = Required<Pick<ApiKeyContext, 'id' | 'name' | 'partnerId' | 'partnerType' | 'permissions' | 'rateLimit' | 'isActive'>>;

async function apiKeyAuth(c: any, next: () => Promise<void>) {
  const apiKey = c.req.header('X-API-Key');

  if (!apiKey) {
    return c.json(
      { success: false, error: { code: 'MISSING_API_KEY', message: 'API key required' } },
      401
    );
  }

  // Validate API key format (must start with pk_live_ or pk_test_)
  if (!apiKey.startsWith('pk_live_') && !apiKey.startsWith('pk_test_')) {
    return c.json(
      { success: false, error: { code: 'INVALID_API_KEY_FORMAT', message: 'Invalid API key format' } },
      401
    );
  }

  // Look up API key in database using hash
  const keyInfo = await validateApiKey(c.env, c, apiKey);

  if (!keyInfo || !keyInfo.isActive) {
    return c.json(
      { success: false, error: { code: 'INVALID_API_KEY', message: 'Invalid or inactive API key' } },
      401
    );
  }

  // Set API key info in context
  c.set('apiKey', keyInfo);

  await next();
}

async function validateApiKey(env: Bindings, c: any, apiKey: string): Promise<ApiKeyInfo | null> {
  const db = getDb(c);
  const keyHash = await hashApiKey(apiKey);

  // Query D1 for API key by hash
  const result = await db.prepare(`
    SELECT
      ak.id, ak.name, ak.type, ak.scopes, ak.rate_limit, ak.is_active,
      ak.insurer_id, ak.provider_id, ak.expires_at,
      i.name as insurer_name,
      p.name as provider_name
    FROM api_keys ak
    LEFT JOIN insurers i ON ak.insurer_id = i.id
    LEFT JOIN providers p ON ak.provider_id = p.id
    WHERE ak.key_hash = ? OR ak.key = ?
  `).bind(keyHash, apiKey).first<{
    id: string;
    name: string;
    type: string;
    scopes: string;
    rate_limit: string;
    is_active: number;
    insurer_id: string | null;
    provider_id: string | null;
    expires_at: string | null;
    insurer_name: string | null;
    provider_name: string | null;
  }>();

  if (!result) {
    console.warn(`[API_KEY_AUTH] Invalid key attempt: ${apiKey.slice(0, 12)}...`);
    return null;
  }

  // Check if key is expired
  if (result.expires_at && new Date(result.expires_at) < new Date()) {
    console.warn(`[API_KEY_AUTH] Expired key used: ${result.id}`);
    return null;
  }

  // Parse scopes/permissions from JSON
  let permissions: string[] = [];
  try {
    permissions = JSON.parse(result.scopes || '[]');
  } catch {
    permissions = [];
  }

  // Parse rate limit from JSON
  let rateLimit = 1000;
  try {
    const rateLimitObj = JSON.parse(result.rate_limit || '{}');
    rateLimit = rateLimitObj.requests || 1000;
  } catch {
    rateLimit = 1000;
  }

  // Determine partner info
  const partnerId = result.insurer_id || result.provider_id || result.id;
  let partnerType: 'insurer' | 'provider' | 'pharmacy' | 'lab' | 'third_party' = 'third_party';
  if (result.insurer_id) partnerType = 'insurer';
  else if (result.provider_id) partnerType = 'provider';

  // Update last_used_at timestamp
  await db.prepare('UPDATE api_keys SET last_used_at = datetime(\'now\') WHERE id = ?')
    .bind(result.id)
    .run();

  return {
    id: result.id,
    name: result.name,
    partnerId,
    partnerType,
    permissions,
    rateLimit,
    isActive: result.is_active === 1,
  };
}

function requirePermission(...permissions: string[]) {
  return async (c: any, next: () => Promise<void>) => {
    const apiKey = c.get('apiKey') as ApiKeyInfo;

    const hasPermission = permissions.some((p) => apiKey.permissions.includes(p));
    if (!hasPermission) {
      return c.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: `Required permissions: ${permissions.join(' or ')}`,
          },
        },
        403
      );
    }

    await next();
  };
}

// Apply API key auth to all public API routes
publicApi.use('*', apiKeyAuth);

// =============================================================================
// Schemas
// =============================================================================

const checkEligibilitySchema = z.object({
  matricule: z.string().min(1),
  dateNaissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  typeSoin: z.enum(['pharmacie', 'consultation', 'hospitalisation', 'optique', 'dentaire', 'laboratoire']),
  dateSoin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const createClaimSchema = z.object({
  adherentMatricule: z.string().min(1),
  dateNaissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  typeSoin: z.enum(['pharmacie', 'consultation', 'hospitalisation', 'optique', 'dentaire', 'laboratoire']),
  dateSoin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  montantTotal: z.number().positive(),
  actes: z.array(
    z.object({
      code: z.string(),
      libelle: z.string(),
      quantite: z.number().positive(),
      prixUnitaire: z.number().positive(),
    })
  ),
  praticienId: z.string().optional(),
  ordonnanceRef: z.string().optional(),
  documents: z.array(z.string()).optional(),
});

// Map public API typeSoin to DB type_soin
const CARE_TYPE_MAP: Record<string, string> = {
  pharmacie: 'pharmacie',
  consultation: 'consultation',
  hospitalisation: 'hospitalisation',
  optique: 'optique',
  dentaire: 'dentaire',
  laboratoire: 'laboratoire',
};

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /public/v1/health
 * Health check
 */
publicApi.get('/health', (c) => {
  return c.json({
    success: true,
    data: {
      status: 'healthy',
      version: 'v1',
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * POST /public/v1/eligibility/check
 * Check adherent eligibility — queries real DB
 */
publicApi.post(
  '/eligibility/check',
  requirePermission('eligibility:read'),
  zValidator('json', checkEligibilitySchema),
  async (c) => {
    const { matricule, dateNaissance, typeSoin, dateSoin } = c.req.valid('json');
    const apiKey = c.get('apiKey') as ApiKeyInfo;
    const db = getDb(c);

    // Look up adherent by matricule and date of birth
    const adherent = await db.prepare(`
      SELECT a.id, a.first_name, a.last_name, a.date_of_birth, a.matricule,
             c.id as contract_id, c.status as contract_status,
             c.annual_limit, c.coverage_json, c.start_date, c.end_date,
             c.plan_type,
             i.name as insurer_name
      FROM adherents a
      LEFT JOIN contracts c ON c.adherent_id = a.id AND c.status = 'active'
      LEFT JOIN insurers i ON c.insurer_id = i.id
      WHERE (a.matricule = ? OR a.national_id_encrypted LIKE ?)
        AND a.date_of_birth = ?
        AND a.deleted_at IS NULL
      LIMIT 1
    `).bind(matricule, `%${matricule}%`, dateNaissance).first<{
      id: string;
      first_name: string;
      last_name: string;
      date_of_birth: string;
      matricule: string | null;
      contract_id: string | null;
      contract_status: string | null;
      annual_limit: number | null;
      coverage_json: string | null;
      start_date: string | null;
      end_date: string | null;
      plan_type: string | null;
      insurer_name: string | null;
    }>();

    if (!adherent) {
      const verificationId = generateId();
      await logAudit(db, {
        userId: `API:${apiKey.partnerId}`,
        action: 'public_api.eligibility.check',
        entityType: 'eligibility',
        entityId: verificationId,
        changes: { matricule, typeSoin, eligible: false, reason: 'adherent_not_found' },
      });

      return c.json({
        success: true,
        data: {
          eligible: false,
          matricule,
          typeSoin,
          dateSoin: dateSoin || new Date().toISOString().split('T')[0],
          couverture: null,
          motifNonEligible: 'Adhérent non trouvé ou date de naissance incorrecte',
          verificationId,
          timestamp: new Date().toISOString(),
        },
      });
    }

    const eligible = !!adherent.contract_id && adherent.contract_status === 'active';
    const coverage = adherent.coverage_json ? JSON.parse(adherent.coverage_json) : {};

    // Get consumption for this year
    const consumption = await db.prepare(`
      SELECT COALESCE(SUM(montant_rembourse), 0) as consomme
      FROM sante_demandes
      WHERE adherent_id = ?
        AND statut IN ('approuvee', 'en_paiement', 'payee')
        AND strftime('%Y', date_soin) = strftime('%Y', 'now')
    `).bind(adherent.id).first<{ consomme: number }>();

    const plafond = adherent.annual_limit || 0;
    const consomme = consumption?.consomme || 0;

    // Determine coverage rate for this care type
    const tauxRemboursement = coverage[typeSoin] || (typeSoin === 'pharmacie' ? 80 : 70);

    let motifNonEligible: string | null = null;
    if (!eligible) {
      motifNonEligible = !adherent.contract_id
        ? 'Pas de contrat actif'
        : 'Contrat non actif';
    } else if (plafond > 0 && consomme >= plafond) {
      motifNonEligible = 'Plafond annuel atteint';
    }

    const verificationId = generateId();

    await logAudit(db, {
      userId: `API:${apiKey.partnerId}`,
      action: 'public_api.eligibility.check',
      entityType: 'eligibility',
      entityId: verificationId,
      changes: { matricule, typeSoin, eligible: eligible && !motifNonEligible },
    });

    return c.json({
      success: true,
      data: {
        eligible: eligible && !motifNonEligible,
        matricule,
        typeSoin,
        dateSoin: dateSoin || new Date().toISOString().split('T')[0],
        couverture: eligible
          ? {
              tauxRemboursement,
              plafondAnnuel: plafond,
              consomme,
              disponible: Math.max(0, plafond - consomme),
            }
          : null,
        motifNonEligible,
        verificationId,
        timestamp: new Date().toISOString(),
      },
    });
  }
);

/**
 * POST /public/v1/claims
 * Create a new claim — inserts into sante_demandes
 */
publicApi.post(
  '/claims',
  requirePermission('claims:write'),
  zValidator('json', createClaimSchema),
  async (c) => {
    const data = c.req.valid('json');
    const apiKey = c.get('apiKey') as ApiKeyInfo;
    const db = getDb(c);
    const now = new Date().toISOString();

    // Find adherent by matricule + dateNaissance
    const adherent = await db.prepare(`
      SELECT a.id, a.first_name, a.last_name,
             c.id as contract_id, c.coverage_json
      FROM adherents a
      LEFT JOIN contracts c ON c.adherent_id = a.id AND c.status = 'active'
      WHERE (a.matricule = ? OR a.national_id_encrypted LIKE ?)
        AND a.date_of_birth = ?
        AND a.deleted_at IS NULL
      LIMIT 1
    `).bind(data.adherentMatricule, `%${data.adherentMatricule}%`, data.dateNaissance).first<{
      id: string;
      first_name: string;
      last_name: string;
      contract_id: string | null;
      coverage_json: string | null;
    }>();

    if (!adherent) {
      return c.json(
        { success: false, error: { code: 'ADHERENT_NOT_FOUND', message: 'Adhérent non trouvé' } },
        404
      );
    }

    if (!adherent.contract_id) {
      return c.json(
        { success: false, error: { code: 'NO_ACTIVE_CONTRACT', message: 'Pas de contrat actif' } },
        400
      );
    }

    // Generate IDs
    const claimId = generatePrefixedId('DEM');
    const numeroDemande = `DEM-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

    // Calculate totals
    const montantTotal = data.actes.reduce((sum, a) => sum + a.prixUnitaire * a.quantite, 0);
    const coverage = adherent.coverage_json ? JSON.parse(adherent.coverage_json) : {};
    const tauxRemboursement = (coverage[data.typeSoin] || (data.typeSoin === 'pharmacie' ? 80 : 70)) / 100;
    const montantRembourse = Math.floor(montantTotal * tauxRemboursement);
    const ticketModerateur = montantTotal - montantRembourse;

    // Insert into sante_demandes
    await db.prepare(`
      INSERT INTO sante_demandes (
        id, numero_demande, adherent_id, praticien_id, source, type_soin,
        statut, montant_demande, date_soin, score_fraude, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'praticien', ?, 'soumise', ?, ?, 0, ?, ?)
    `).bind(
      claimId,
      numeroDemande,
      adherent.id,
      data.praticienId || null,
      CARE_TYPE_MAP[data.typeSoin] || data.typeSoin,
      montantTotal,
      data.dateSoin,
      now,
      now
    ).run();

    await logAudit(db, {
      userId: `API:${apiKey.partnerId}`,
      action: 'public_api.claims.create',
      entityType: 'sante_demandes',
      entityId: claimId,
      changes: { numeroDemande, montantTotal, typeSoin: data.typeSoin },
    });

    return c.json({
      success: true,
      data: {
        id: claimId,
        numeroDemande,
        externalRef: data.ordonnanceRef,
        adherentMatricule: data.adherentMatricule,
        typeSoin: data.typeSoin,
        dateSoin: data.dateSoin,
        statut: 'soumise',
        montantTotal,
        montantRembourse,
        ticketModerateur,
        tauxRemboursement: tauxRemboursement * 100,
        actes: data.actes.map((a) => ({
          id: generateId(),
          ...a,
          montantTotal: a.prixUnitaire * a.quantite,
        })),
        createdAt: now,
        estimatedProcessingTime: '24-48h',
      },
    }, 201);
  }
);

/**
 * GET /public/v1/claims/:id
 * Get claim status from DB
 */
publicApi.get('/claims/:id', requirePermission('claims:read'), async (c) => {
  const claimId = c.req.param('id');
  const apiKey = c.get('apiKey') as ApiKeyInfo;
  const db = getDb(c);

  const claim = await db.prepare(`
    SELECT sd.id, sd.numero_demande, sd.statut, sd.type_soin,
           sd.montant_demande, sd.montant_rembourse, sd.montant_reste_charge,
           sd.date_soin, sd.motif_rejet, sd.notes_internes,
           sd.date_traitement, sd.created_at, sd.updated_at,
           a.first_name || ' ' || a.last_name as adherent_nom,
           a.matricule as adherent_matricule,
           COALESCE(sp.nom || ' ' || COALESCE(sp.prenom, ''), sp.nom) as praticien_nom
    FROM sante_demandes sd
    JOIN adherents a ON sd.adherent_id = a.id
    LEFT JOIN sante_praticiens sp ON sd.praticien_id = sp.id
    WHERE sd.id = ?
  `).bind(claimId).first<{
    id: string;
    numero_demande: string;
    statut: string;
    type_soin: string;
    montant_demande: number;
    montant_rembourse: number | null;
    montant_reste_charge: number | null;
    date_soin: string;
    motif_rejet: string | null;
    notes_internes: string | null;
    date_traitement: string | null;
    created_at: string;
    updated_at: string;
    adherent_nom: string;
    adherent_matricule: string | null;
    praticien_nom: string | null;
  }>();

  if (!claim) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Demande non trouvee' } },
      404
    );
  }

  const tauxRemboursement = claim.montant_rembourse && claim.montant_demande > 0
    ? Math.round((claim.montant_rembourse / claim.montant_demande) * 100)
    : null;

  await logAudit(db, {
    userId: `API:${apiKey.partnerId}`,
    action: 'public_api.claims.get',
    entityType: 'sante_demandes',
    entityId: claimId,
    changes: {},
  });

  return c.json({
    success: true,
    data: {
      id: claim.id,
      numeroDemande: claim.numero_demande,
      statut: claim.statut,
      typeSoin: claim.type_soin,
      montantTotal: claim.montant_demande,
      montantRembourse: claim.montant_rembourse,
      ticketModerateur: claim.montant_reste_charge,
      tauxRemboursement,
      dateSoin: claim.date_soin,
      motifRejet: claim.motif_rejet,
      adherentNom: claim.adherent_nom,
      praticienNom: claim.praticien_nom,
      dateCreation: claim.created_at,
      dateTraitement: claim.date_traitement,
    },
  });
});

/**
 * GET /public/v1/claims
 * List claims with filters — from sante_demandes
 */
publicApi.get('/claims', requirePermission('claims:read'), async (c) => {
  const apiKey = c.get('apiKey') as ApiKeyInfo;
  const db = getDb(c);
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = Math.min(Math.max(1, parseInt(c.req.query('limit') || '20')), 100);
  const statut = c.req.query('statut');
  const dateFrom = c.req.query('dateFrom');
  const dateTo = c.req.query('dateTo');
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  const params: (string | number)[] = [];

  if (statut) {
    whereClause += ' AND sd.statut = ?';
    params.push(statut);
  }
  if (dateFrom) {
    whereClause += ' AND sd.date_soin >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    whereClause += ' AND sd.date_soin <= ?';
    params.push(dateTo);
  }

  // Scope to partner's provider if applicable
  if (apiKey.partnerType === 'provider') {
    whereClause += ' AND sd.praticien_id IN (SELECT id FROM sante_praticiens WHERE provider_id = ?)';
    params.push(apiKey.partnerId);
  }

  const [countResult, claimsResult] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as total FROM sante_demandes sd ${whereClause}`)
      .bind(...params)
      .first<{ total: number }>(),

    db.prepare(`
      SELECT sd.id, sd.numero_demande, sd.statut, sd.type_soin,
             sd.montant_demande, sd.montant_rembourse, sd.date_soin,
             sd.created_at,
             a.first_name || ' ' || a.last_name as adherent_nom
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      ${whereClause}
      ORDER BY sd.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all<{
      id: string;
      numero_demande: string;
      statut: string;
      type_soin: string;
      montant_demande: number;
      montant_rembourse: number | null;
      date_soin: string;
      created_at: string;
      adherent_nom: string;
    }>(),
  ]);

  return c.json({
    success: true,
    data: {
      claims: (claimsResult.results || []).map((r) => ({
        id: r.id,
        numeroDemande: r.numero_demande,
        statut: r.statut,
        montantTotal: r.montant_demande,
        montantRembourse: r.montant_rembourse,
        typeSoin: r.type_soin,
        dateSoin: r.date_soin,
        adherentNom: r.adherent_nom,
        dateCreation: r.created_at,
      })),
      meta: {
        page,
        limit,
        total: countResult?.total ?? 0,
      },
    },
  });
});

/**
 * GET /public/v1/providers
 * List conventioned providers from sante_praticiens
 */
publicApi.get('/providers', requirePermission('providers:read'), async (c) => {
  const db = getDb(c);
  const type = c.req.query('type');
  const ville = c.req.query('ville');
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = Math.min(Math.max(1, parseInt(c.req.query('limit') || '20')), 100);
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE sp.is_active = 1';
  const params: (string | number)[] = [];

  if (type) {
    whereClause += ' AND sp.type_praticien = ?';
    params.push(type);
  }
  if (ville) {
    whereClause += ' AND sp.ville = ?';
    params.push(ville);
  }

  const [countResult, providersResult] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as total FROM sante_praticiens sp ${whereClause}`)
      .bind(...params)
      .first<{ total: number }>(),

    db.prepare(`
      SELECT sp.id, sp.nom, sp.prenom, sp.type_praticien, sp.specialite,
             sp.est_conventionne, sp.telephone, sp.email, sp.adresse, sp.ville
      FROM sante_praticiens sp
      ${whereClause}
      ORDER BY sp.est_conventionne DESC, sp.nom ASC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all<{
      id: string;
      nom: string;
      prenom: string | null;
      type_praticien: string;
      specialite: string;
      est_conventionne: number;
      telephone: string | null;
      email: string | null;
      adresse: string | null;
      ville: string | null;
    }>(),
  ]);

  return c.json({
    success: true,
    data: {
      providers: (providersResult.results || []).map((p) => ({
        id: p.id,
        nom: p.prenom ? `${p.nom} ${p.prenom}` : p.nom,
        type: p.type_praticien,
        specialite: p.specialite,
        adresse: p.adresse,
        ville: p.ville,
        telephone: p.telephone,
        conventionne: p.est_conventionne === 1,
      })),
      meta: { page, limit, total: countResult?.total ?? 0 },
    },
  });
});

/**
 * GET /public/v1/tarifs
 * Get pricing information from baremes table
 */
publicApi.get('/tarifs', requirePermission('eligibility:read'), async (c) => {
  const db = getDb(c);
  const typeSoin = c.req.query('typeSoin');
  const codeActe = c.req.query('codeActe');

  let whereClause = 'WHERE b.is_active = 1';
  const params: (string | number)[] = [];

  if (typeSoin) {
    // Map French care types to English DB values
    const careTypeMap: Record<string, string> = {
      pharmacie: 'pharmacy',
      consultation: 'consultation',
      hospitalisation: 'hospitalization',
      optique: 'optical',
      dentaire: 'dental',
      laboratoire: 'lab',
    };
    whereClause += ' AND b.care_type = ?';
    params.push(careTypeMap[typeSoin] || typeSoin);
  }
  if (codeActe) {
    whereClause += ' AND b.act_code = ?';
    params.push(codeActe);
  }

  const tarifsResult = await db.prepare(`
    SELECT b.act_code, b.care_type, b.base_rate, b.coverage_percentage,
           b.max_amount, b.min_amount, b.plan_type,
           i.name as insurer_name
    FROM baremes b
    LEFT JOIN insurers i ON b.insurer_id = i.id
    ${whereClause}
    ORDER BY b.care_type, b.act_code
    LIMIT 50
  `).bind(...params).all<{
    act_code: string | null;
    care_type: string;
    base_rate: number;
    coverage_percentage: number;
    max_amount: number | null;
    min_amount: number;
    plan_type: string | null;
    insurer_name: string;
  }>();

  return c.json({
    success: true,
    data: {
      tarifs: (tarifsResult.results || []).map((t) => ({
        codeActe: t.act_code || t.care_type,
        libelle: `${t.care_type}${t.act_code ? ' - ' + t.act_code : ''}`,
        tarifConventionne: t.base_rate,
        tarifPlafond: t.max_amount,
        tauxRemboursement: t.coverage_percentage,
        planType: t.plan_type,
        assureur: t.insurer_name,
      })),
    },
  });
});

/**
 * POST /public/v1/documents/upload
 * Get presigned URL for document upload
 */
publicApi.post('/documents/upload', requirePermission('claims:write'), async (c) => {
  const apiKey = c.get('apiKey') as ApiKeyInfo;
  const { filename, contentType } = await c.req.json();

  const documentId = generatePrefixedId('DOC');
  const key = `partners/${apiKey.partnerId}/${documentId}/${filename}`;

  // In production, generate presigned URL for R2
  const presignedUrl = `https://dhamen-files.r2.dev/${key}?upload=true`;

  return c.json({
    success: true,
    data: {
      documentId,
      uploadUrl: presignedUrl,
      expiresIn: 3600,
    },
  });
});

/**
 * GET /public/v1/stats
 * Get partner statistics from real data
 */
publicApi.get('/stats', requirePermission('claims:read'), async (c) => {
  const apiKey = c.get('apiKey') as ApiKeyInfo;
  const db = getDb(c);
  const queryDateFrom = c.req.query('dateFrom');
  const queryDateTo = c.req.query('dateTo');
  const dateFrom = queryDateFrom || (new Date().getFullYear() + '-01-01');
  const dateTo = queryDateTo || new Date().toISOString().split('T')[0];

  let whereClause = 'WHERE sd.date_soin >= ? AND sd.date_soin <= ?';
  const params: (string | number)[] = [String(dateFrom), String(dateTo)];

  // Scope to partner's provider if applicable
  if (apiKey.partnerType === 'provider') {
    whereClause += ' AND sd.praticien_id IN (SELECT id FROM sante_praticiens WHERE provider_id = ?)';
    params.push(apiKey.partnerId);
  }

  const statsResult = await db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN statut = 'soumise' THEN 1 END) as en_attente,
      COUNT(CASE WHEN statut IN ('approuvee', 'en_paiement', 'payee') THEN 1 END) as approuvees,
      COUNT(CASE WHEN statut = 'rejetee' THEN 1 END) as rejetees,
      COALESCE(SUM(montant_demande), 0) as total_demande,
      COALESCE(SUM(CASE WHEN statut IN ('approuvee', 'en_paiement', 'payee') THEN montant_rembourse ELSE 0 END), 0) as total_rembourse,
      COALESCE(SUM(CASE WHEN statut IN ('soumise', 'en_examen') THEN montant_demande ELSE 0 END), 0) as en_attente_rembourse
    FROM sante_demandes sd
    ${whereClause}
  `).bind(...params).first<{
    total: number;
    en_attente: number;
    approuvees: number;
    rejetees: number;
    total_demande: number;
    total_rembourse: number;
    en_attente_rembourse: number;
  }>();

  const total = statsResult?.total ?? 0;
  const approuvees = statsResult?.approuvees ?? 0;
  const tauxApprobation = total > 0 ? Math.round((approuvees / total) * 1000) / 10 : 0;

  return c.json({
    success: true,
    data: {
      periode: { debut: dateFrom, fin: dateTo },
      demandes: {
        total,
        enAttente: statsResult?.en_attente ?? 0,
        approuvees,
        rejetees: statsResult?.rejetees ?? 0,
      },
      montants: {
        totalDemande: statsResult?.total_demande ?? 0,
        totalRembourse: statsResult?.total_rembourse ?? 0,
        enAttenteRembourse: statsResult?.en_attente_rembourse ?? 0,
      },
      tauxApprobation,
    },
  });
});

export { publicApi };
