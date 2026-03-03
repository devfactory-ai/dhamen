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
    // Log failed attempt for security monitoring
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

const getClaimStatusSchema = z.object({
  claimId: z.string().optional(),
  externalRef: z.string().optional(),
});

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
 * Check adherent eligibility
 */
publicApi.post(
  '/eligibility/check',
  requirePermission('eligibility:read'),
  zValidator('json', checkEligibilitySchema),
  async (c) => {
    const { matricule, dateNaissance, typeSoin, dateSoin } = c.req.valid('json');
    const apiKey = c.get('apiKey') as ApiKeyInfo;

    // In production, query actual eligibility
    // For now, return mock response
    const eligible = Math.random() > 0.1; // 90% eligible
    const plafond = 500000 + Math.floor(Math.random() * 1000000);
    const consomme = Math.floor(Math.random() * plafond * 0.6);

    const response = {
      eligible,
      matricule,
      typeSoin,
      dateSoin: dateSoin || new Date().toISOString().split('T')[0],
      couverture: eligible
        ? {
            tauxRemboursement: typeSoin === 'pharmacie' ? 80 : 70,
            plafondAnnuel: plafond,
            consomme,
            disponible: plafond - consomme,
          }
        : null,
      motifNonEligible: !eligible ? 'Contrat expiré' : null,
      verificationId: generateId(),
      timestamp: new Date().toISOString(),
    };

    await logAudit(getDb(c), {
      userId: `API:${apiKey.partnerId}`,
      action: 'public_api.eligibility.check',
      entityType: 'eligibility',
      entityId: response.verificationId,
      changes: { matricule, typeSoin, eligible },
    });

    return c.json({ success: true, data: response });
  }
);

/**
 * POST /public/v1/claims
 * Create a new claim/demande
 */
publicApi.post(
  '/claims',
  requirePermission('claims:write'),
  zValidator('json', createClaimSchema),
  async (c) => {
    const data = c.req.valid('json');
    const apiKey = c.get('apiKey') as ApiKeyInfo;
    const now = new Date().toISOString();

    // Generate claim ID
    const claimId = generatePrefixedId('CLM');
    const numeroDemande = `DEM-${new Date().getFullYear()}-${claimId.slice(-6)}`;

    // Calculate totals
    const montantTotal = data.actes.reduce((sum, a) => sum + a.prixUnitaire * a.quantite, 0);
    const tauxRemboursement = data.typeSoin === 'pharmacie' ? 0.8 : 0.7;
    const montantRembourse = Math.floor(montantTotal * tauxRemboursement);
    const ticketModerateur = montantTotal - montantRembourse;

    // In production, insert into D1
    // await getDb(c).prepare(`INSERT INTO sante_demandes ...`)

    const response = {
      id: claimId,
      numeroDemande,
      externalRef: data.ordonnanceRef,
      adherentMatricule: data.adherentMatricule,
      typeSoin: data.typeSoin,
      dateSoin: data.dateSoin,
      statut: 'en_attente',
      montantTotal,
      montantRembourse,
      ticketModerateur,
      tauxRemboursement: tauxRemboursement * 100,
      actes: data.actes.map((a, i) => ({
        id: generateId(),
        ...a,
        montantTotal: a.prixUnitaire * a.quantite,
      })),
      createdAt: now,
      estimatedProcessingTime: '24-48h',
    };

    await logAudit(getDb(c), {
      userId: `API:${apiKey.partnerId}`,
      action: 'public_api.claims.create',
      entityType: 'sante_demandes',
      entityId: claimId,
      changes: { numeroDemande, montantTotal, typeSoin: data.typeSoin },
    });

    return c.json({ success: true, data: response }, 201);
  }
);

/**
 * GET /public/v1/claims/:id
 * Get claim status
 */
publicApi.get('/claims/:id', requirePermission('claims:read'), async (c) => {
  const claimId = c.req.param('id');
  const apiKey = c.get('apiKey') as ApiKeyInfo;

  // In production, query D1
  // Mock response
  const response = {
    id: claimId,
    numeroDemande: `DEM-2025-${claimId.slice(-6)}`,
    statut: 'approuvee',
    montantTotal: 150000,
    montantRembourse: 120000,
    ticketModerateur: 30000,
    tauxRemboursement: 80,
    dateCreation: '2025-02-25T10:00:00Z',
    dateTraitement: '2025-02-25T14:30:00Z',
    motifRejet: null,
    paiement: {
      statut: 'en_cours',
      methode: 'virement',
      dateEstimee: '2025-02-28',
    },
    historique: [
      { date: '2025-02-25T10:00:00Z', statut: 'en_attente', note: 'Demande reçue' },
      { date: '2025-02-25T12:00:00Z', statut: 'en_traitement', note: 'Vérification en cours' },
      { date: '2025-02-25T14:30:00Z', statut: 'approuvee', note: 'Demande approuvée' },
    ],
  };

  await logAudit(getDb(c), {
    userId: `API:${apiKey.partnerId}`,
    action: 'public_api.claims.get',
    entityType: 'sante_demandes',
    entityId: claimId,
    changes: {},
  });

  return c.json({ success: true, data: response });
});

/**
 * GET /public/v1/claims
 * List claims with filters
 */
publicApi.get('/claims', requirePermission('claims:read'), async (c) => {
  const apiKey = c.get('apiKey') as ApiKeyInfo;
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);
  const statut = c.req.query('statut');
  const dateFrom = c.req.query('dateFrom');
  const dateTo = c.req.query('dateTo');

  // Mock response
  const claims = [
    {
      id: 'CLM-001',
      numeroDemande: 'DEM-2025-0145',
      statut: 'approuvee',
      montantTotal: 150000,
      montantRembourse: 120000,
      typeSoin: 'pharmacie',
      dateCreation: '2025-02-25T10:00:00Z',
    },
    {
      id: 'CLM-002',
      numeroDemande: 'DEM-2025-0146',
      statut: 'en_attente',
      montantTotal: 85000,
      montantRembourse: 59500,
      typeSoin: 'consultation',
      dateCreation: '2025-02-26T09:00:00Z',
    },
  ];

  return c.json({
    success: true,
    data: {
      claims,
      meta: {
        page,
        limit,
        total: claims.length,
      },
    },
  });
});

/**
 * GET /public/v1/providers
 * List conventioned providers
 */
publicApi.get('/providers', requirePermission('providers:read'), async (c) => {
  const type = c.req.query('type');
  const ville = c.req.query('ville');
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);

  // Mock response
  const providers = [
    {
      id: 'PRV-001',
      nom: 'Pharmacie El Medina',
      type: 'pharmacy',
      adresse: '15 Rue de la République, Tunis',
      telephone: '+216 71 123 456',
      conventionne: true,
      horaires: 'Lun-Sam 8h-20h',
    },
    {
      id: 'PRV-002',
      nom: 'Dr. Karim Mansouri',
      type: 'doctor',
      specialite: 'Médecine générale',
      adresse: '25 Avenue Habib Bourguiba, Sfax',
      telephone: '+216 74 654 321',
      conventionne: true,
    },
  ];

  return c.json({
    success: true,
    data: {
      providers,
      meta: { page, limit, total: providers.length },
    },
  });
});

/**
 * GET /public/v1/tarifs
 * Get pricing information
 */
publicApi.get('/tarifs', requirePermission('eligibility:read'), async (c) => {
  const typeSoin = c.req.query('typeSoin');
  const codeActe = c.req.query('codeActe');

  // Mock response
  const tarifs = [
    {
      codeActe: 'CONS-GEN',
      libelle: 'Consultation médecine générale',
      tarifConventionne: 35000,
      tarifPlafond: 50000,
      tauxRemboursement: 70,
    },
    {
      codeActe: 'CONS-SPEC',
      libelle: 'Consultation spécialiste',
      tarifConventionne: 50000,
      tarifPlafond: 80000,
      tauxRemboursement: 70,
    },
  ];

  return c.json({ success: true, data: { tarifs } });
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
 * Get partner statistics
 */
publicApi.get('/stats', requirePermission('claims:read'), async (c) => {
  const apiKey = c.get('apiKey') as ApiKeyInfo;
  const dateFrom = c.req.query('dateFrom') || '2025-01-01';
  const dateTo = c.req.query('dateTo') || new Date().toISOString().split('T')[0];

  // Mock stats
  const stats = {
    periode: { debut: dateFrom, fin: dateTo },
    demandes: {
      total: 156,
      enAttente: 12,
      approuvees: 128,
      rejetees: 16,
    },
    montants: {
      totalDemande: 45000000,
      totalRembourse: 32500000,
      enAttenteRembourse: 4500000,
    },
    tauxApprobation: 88.9,
    delaiMoyenTraitement: '18h',
  };

  return c.json({ success: true, data: stats });
});

export { publicApi };
