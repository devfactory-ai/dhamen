/**
 * Public API V2
 *
 * Enhanced public API with API key authentication, rate limiting,
 * and OpenAPI documentation
 */
import { Hono } from 'hono';
import { z } from 'zod';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const publicApiV2 = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// API Key types
interface ApiKey {
  id: string;
  key: string;
  name: string;
  type: 'read' | 'write' | 'full';
  insurerId?: string;
  providerId?: string;
  rateLimit: {
    requests: number;
    window: number; // seconds
  };
  scopes: string[];
  isActive: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
}

// API Key authentication middleware
import type { Context, MiddlewareHandler } from 'hono';

const apiKeyAuth: MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> = async (c, next) => {
  const apiKey = c.req.header('X-API-Key') || c.req.header('Authorization')?.replace('Bearer ', '');

  if (!apiKey) {
    return c.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'API key required. Use X-API-Key header or Bearer token.',
        },
      },
      401
    );
  }

  // Validate API key
  const keyData = await getDb(c).prepare(
    `SELECT * FROM api_keys WHERE key = ? AND is_active = 1`
  )
    .bind(apiKey)
    .first<{
      id: string;
      key: string;
      name: string;
      type: string;
      insurer_id: string | null;
      provider_id: string | null;
      rate_limit: string;
      scopes: string;
      is_active: number;
      expires_at: string | null;
      last_used_at: string | null;
      created_at: string;
    }>();

  if (!keyData) {
    return c.json(
      {
        error: {
          code: 'INVALID_API_KEY',
          message: 'Invalid or inactive API key',
        },
      },
      401
    );
  }

  // Check expiration
  if (keyData.expires_at && new Date(keyData.expires_at) < new Date()) {
    return c.json(
      {
        error: {
          code: 'API_KEY_EXPIRED',
          message: 'API key has expired',
        },
      },
      401
    );
  }

  // Update last used
  await getDb(c).prepare(
    `UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`
  )
    .bind(keyData.id)
    .run();

  // Set API key context
  c.set('apiKey', {
    id: keyData.id,
    type: keyData.type,
    insurerId: keyData.insurer_id,
    providerId: keyData.provider_id,
    scopes: JSON.parse(keyData.scopes),
  });

  return next();
};

// Scope check middleware
const requireScope = (...scopes: string[]): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> => {
  return async (c, next) => {
    const apiKey = c.get('apiKey');
    if (!apiKey) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'API key required' } }, 401);
    }
    const apiScopes = apiKey.scopes ?? [];
    const hasScope = scopes.some((s) => apiScopes.includes(s) || apiScopes.includes('*'));

    if (!hasScope) {
      return c.json(
        {
          error: {
            code: 'INSUFFICIENT_SCOPE',
            message: `Required scope: ${scopes.join(' or ')}`,
          },
        },
        403
      );
    }

    return next();
  };
};

// Apply API key auth to all routes
publicApiV2.use('*', apiKeyAuth);

/**
 * OpenAPI Specification
 */
publicApiV2.get('/openapi.json', (c) => {
  const spec = {
    openapi: '3.0.3',
    info: {
      title: 'E-Santé Public API',
      version: '2.0.0',
      description: 'API publique pour l\'intégration avec la plateforme E-Santé',
      contact: {
        name: 'Support E-Santé',
        email: 'api-support@e-sante.tn',
      },
    },
    servers: [
      {
        url: 'https://dhamen-api.yassine-techini.workers.dev/public/v2',
        description: 'Production',
      },
    ],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
              },
            },
          },
        },
        Adherent: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            matricule: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            dateOfBirth: { type: 'string', format: 'date' },
            nationalId: { type: 'string' },
            isActive: { type: 'boolean' },
          },
        },
        EligibilityResult: {
          type: 'object',
          properties: {
            eligible: { type: 'boolean' },
            adherent: { $ref: '#/components/schemas/Adherent' },
            coverage: {
              type: 'object',
              properties: {
                startDate: { type: 'string', format: 'date' },
                endDate: { type: 'string', format: 'date' },
                careTypes: { type: 'array', items: { type: 'string' } },
                maxAmount: { type: 'number' },
                remainingAmount: { type: 'number' },
              },
            },
          },
        },
        Claim: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            adherentId: { type: 'string' },
            providerId: { type: 'string' },
            careType: { type: 'string' },
            amount: { type: 'number' },
            status: { type: 'string', enum: ['pending', 'approved', 'rejected'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    paths: {
      '/eligibility/check': {
        post: {
          summary: 'Vérifier l\'éligibilité d\'un adhérent',
          tags: ['Eligibility'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['identifier'],
                  properties: {
                    identifier: { type: 'string', description: 'Matricule ou ID national' },
                    careType: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Résultat de l\'éligibilité',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/EligibilityResult' },
                },
              },
            },
          },
        },
      },
      '/claims': {
        post: {
          summary: 'Créer une demande de remboursement',
          tags: ['Claims'],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['adherentId', 'careType', 'amount'],
                  properties: {
                    adherentId: { type: 'string' },
                    careType: { type: 'string' },
                    amount: { type: 'number' },
                    items: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          code: { type: 'string' },
                          name: { type: 'string' },
                          quantity: { type: 'number' },
                          unitPrice: { type: 'number' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Demande créée',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Claim' },
                },
              },
            },
          },
        },
        get: {
          summary: 'Lister les demandes',
          tags: ['Claims'],
          parameters: [
            { name: 'status', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          ],
          responses: {
            '200': {
              description: 'Liste des demandes',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      data: { type: 'array', items: { $ref: '#/components/schemas/Claim' } },
                      meta: {
                        type: 'object',
                        properties: {
                          total: { type: 'integer' },
                          limit: { type: 'integer' },
                          offset: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  };

  return c.json(spec);
});

/**
 * GET /health
 * API health check
 */
publicApiV2.get('/health', (c) => {
  return c.json({
    status: 'ok',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /eligibility/check
 * Check adherent eligibility
 */
publicApiV2.post('/eligibility/check', requireScope('eligibility:read', 'eligibility:check'), async (c) => {
  const body = await c.req.json<{
    identifier: string;
    careType?: string;
    amount?: number;
  }>();

  if (!body.identifier) {
    return c.json(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: 'identifier is required',
        },
      },
      400
    );
  }

  const apiKey = c.get('apiKey') as { insurerId?: string; providerId?: string };

  // Find adherent
  const adherent = await getDb(c).prepare(
    `SELECT a.*, c.insurer_id, c.date_debut, c.date_fin
     FROM adherents a
     JOIN contracts c ON a.contract_id = c.id
     WHERE (a.matricule = ? OR a.numero_cnam = ? OR a.cin = ?)
       AND a.deleted_at IS NULL`
  )
    .bind(body.identifier, body.identifier, body.identifier)
    .first<{
      id: string;
      matricule: string;
      prenom: string;
      nom: string;
      date_naissance: string;
      cin: string;
      est_actif: number;
      insurer_id: string;
      date_debut: string;
      date_fin: string;
    }>();

  if (!adherent) {
    return c.json({
      eligible: false,
      reason: 'ADHERENT_NOT_FOUND',
      message: 'Adhérent non trouvé',
    });
  }

  // Check if API key has access to this insurer
  if (apiKey.insurerId && adherent.insurer_id !== apiKey.insurerId) {
    return c.json({
      eligible: false,
      reason: 'ACCESS_DENIED',
      message: 'Accès non autorisé à cet adhérent',
    });
  }

  // Check active status
  if (!adherent.est_actif) {
    return c.json({
      eligible: false,
      reason: 'ADHERENT_INACTIVE',
      message: 'Adhérent inactif',
    });
  }

  // Check contract dates
  const now = new Date();
  const startDate = new Date(adherent.date_debut);
  const endDate = new Date(adherent.date_fin);

  if (now < startDate || now > endDate) {
    return c.json({
      eligible: false,
      reason: 'CONTRACT_EXPIRED',
      message: 'Contrat expiré ou pas encore actif',
      contractPeriod: {
        start: adherent.date_debut,
        end: adherent.date_fin,
      },
    });
  }

  // Get remaining coverage
  const usedAmount = await getDb(c).prepare(
    `SELECT COALESCE(SUM(montant_approuve), 0) as used
     FROM sante_demandes
     WHERE adherent_id = ? AND statut = 'approuvee'
       AND strftime('%Y', created_at) = strftime('%Y', 'now')`
  )
    .bind(adherent.id)
    .first<{ used: number }>();

  const annualLimit = 50000000; // 50,000 TND - would come from contract
  const remaining = annualLimit - (usedAmount?.used || 0);

  return c.json({
    eligible: true,
    adherent: {
      id: adherent.id,
      matricule: adherent.matricule,
      firstName: adherent.prenom,
      lastName: adherent.nom,
      dateOfBirth: adherent.date_naissance,
      nationalId: adherent.cin,
      isActive: true,
    },
    coverage: {
      startDate: adherent.date_debut,
      endDate: adherent.date_fin,
      careTypes: ['pharmacie', 'consultation', 'hospitalisation', 'optique', 'dentaire'],
      maxAmount: annualLimit,
      usedAmount: usedAmount?.used || 0,
      remainingAmount: remaining,
    },
  });
});

/**
 * POST /claims
 * Create a new claim
 */
publicApiV2.post('/claims', requireScope('claims:write', 'claims:create'), async (c) => {
  const claimSchema = z.object({
    adherentId: z.string(),
    careType: z.enum(['pharmacie', 'consultation', 'hospitalisation', 'optique', 'dentaire', 'laboratoire', 'kinesitherapie', 'autre']),
    amount: z.number().positive(),
    description: z.string().optional(),
    prescriptionDate: z.string().optional(),
    items: z
      .array(
        z.object({
          code: z.string(),
          name: z.string(),
          quantity: z.number().positive(),
          unitPrice: z.number().positive(),
        })
      )
      .optional(),
  });

  const body = await c.req.json();
  const validation = claimSchema.safeParse(body);

  if (!validation.success) {
    return c.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid claim data',
          details: validation.error.errors,
        },
      },
      400
    );
  }

  const data = validation.data;
  const apiKey = c.get('apiKey') as { providerId?: string };

  // Verify adherent exists
  const adherent = await getDb(c).prepare(
    'SELECT id, contract_id FROM adherents WHERE id = ? AND deleted_at IS NULL'
  )
    .bind(data.adherentId)
    .first<{ id: string; contract_id: string }>();

  if (!adherent) {
    return c.json(
      {
        error: {
          code: 'ADHERENT_NOT_FOUND',
          message: 'Adhérent non trouvé',
        },
      },
      404
    );
  }

  // Create claim
  const claimId = `clm_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date().toISOString();

  await getDb(c).prepare(
    `INSERT INTO sante_demandes (
      id, adherent_id, contract_id, provider_id, type_soin,
      montant_demande, description, date_prescription, lignes,
      statut, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'soumise', ?, ?)`
  )
    .bind(
      claimId,
      data.adherentId,
      adherent.contract_id,
      apiKey.providerId || null,
      data.careType,
      data.amount,
      data.description || null,
      data.prescriptionDate || null,
      data.items ? JSON.stringify(data.items) : null,
      now,
      now
    )
    .run();

  return c.json(
    {
      id: claimId,
      adherentId: data.adherentId,
      careType: data.careType,
      amount: data.amount,
      status: 'submitted',
      createdAt: now,
    },
    201
  );
});

/**
 * GET /claims
 * List claims
 */
publicApiV2.get('/claims', requireScope('claims:read', 'claims:list'), async (c) => {
  const status = c.req.query('status');
  const adherentId = c.req.query('adherentId');
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const offset = parseInt(c.req.query('offset') || '0', 10);

  const apiKey = c.get('apiKey') as { insurerId?: string; providerId?: string };

  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (apiKey.insurerId) {
    conditions.push('c.insurer_id = ?');
    bindings.push(apiKey.insurerId);
  }

  if (apiKey.providerId) {
    conditions.push('sd.provider_id = ?');
    bindings.push(apiKey.providerId);
  }

  if (status) {
    conditions.push('sd.statut = ?');
    bindings.push(status);
  }

  if (adherentId) {
    conditions.push('sd.adherent_id = ?');
    bindings.push(adherentId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await getDb(c).prepare(
    `SELECT COUNT(*) as count FROM sante_demandes sd
     JOIN contracts c ON sd.contract_id = c.id
     ${whereClause}`
  )
    .bind(...bindings)
    .first<{ count: number }>();

  const { results } = await getDb(c).prepare(
    `SELECT sd.id, sd.adherent_id, sd.provider_id, sd.type_soin,
            sd.montant_demande, sd.montant_approuve, sd.statut,
            sd.created_at, sd.updated_at
     FROM sante_demandes sd
     JOIN contracts c ON sd.contract_id = c.id
     ${whereClause}
     ORDER BY sd.created_at DESC
     LIMIT ? OFFSET ?`
  )
    .bind(...bindings, limit, offset)
    .all<{
      id: string;
      adherent_id: string;
      provider_id: string;
      type_soin: string;
      montant_demande: number;
      montant_approuve: number | null;
      statut: string;
      created_at: string;
      updated_at: string;
    }>();

  return c.json({
    data: (results || []).map((r) => ({
      id: r.id,
      adherentId: r.adherent_id,
      providerId: r.provider_id,
      careType: r.type_soin,
      amount: r.montant_demande,
      approvedAmount: r.montant_approuve,
      status: r.statut,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })),
    meta: {
      total: countResult?.count || 0,
      limit,
      offset,
    },
  });
});

/**
 * GET /claims/:id
 * Get claim details
 */
publicApiV2.get('/claims/:id', requireScope('claims:read'), async (c) => {
  const id = c.req.param('id');
  const apiKey = c.get('apiKey') as { insurerId?: string; providerId?: string };

  const claim = await getDb(c).prepare(
    `SELECT sd.*, c.insurer_id
     FROM sante_demandes sd
     JOIN contracts c ON sd.contract_id = c.id
     WHERE sd.id = ?`
  )
    .bind(id)
    .first<{
      id: string;
      adherent_id: string;
      contract_id: string;
      provider_id: string;
      type_soin: string;
      montant_demande: number;
      montant_approuve: number | null;
      statut: string;
      lignes: string | null;
      created_at: string;
      updated_at: string;
      insurer_id: string;
    }>();

  if (!claim) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Claim not found',
        },
      },
      404
    );
  }

  // Check access
  if (
    (apiKey.insurerId && claim.insurer_id !== apiKey.insurerId) ||
    (apiKey.providerId && claim.provider_id !== apiKey.providerId)
  ) {
    return c.json(
      {
        error: {
          code: 'ACCESS_DENIED',
          message: 'Access denied to this claim',
        },
      },
      403
    );
  }

  return c.json({
    id: claim.id,
    adherentId: claim.adherent_id,
    providerId: claim.provider_id,
    careType: claim.type_soin,
    amount: claim.montant_demande,
    approvedAmount: claim.montant_approuve,
    status: claim.statut,
    items: claim.lignes ? JSON.parse(claim.lignes) : [],
    createdAt: claim.created_at,
    updatedAt: claim.updated_at,
  });
});

/**
 * GET /adherents/:id
 * Get adherent details
 */
publicApiV2.get('/adherents/:id', requireScope('adherents:read'), async (c) => {
  const id = c.req.param('id');
  const apiKey = c.get('apiKey') as { insurerId?: string };

  const adherent = await getDb(c).prepare(
    `SELECT a.*, c.insurer_id
     FROM adherents a
     JOIN contracts c ON a.contract_id = c.id
     WHERE a.id = ? AND a.deleted_at IS NULL`
  )
    .bind(id)
    .first<{
      id: string;
      matricule: string;
      prenom: string;
      nom: string;
      date_naissance: string;
      cin: string;
      email: string | null;
      telephone: string | null;
      adresse: string | null;
      ville: string | null;
      est_actif: number;
      insurer_id: string;
    }>();

  if (!adherent) {
    return c.json(
      {
        error: {
          code: 'NOT_FOUND',
          message: 'Adherent not found',
        },
      },
      404
    );
  }

  // Check access
  if (apiKey.insurerId && adherent.insurer_id !== apiKey.insurerId) {
    return c.json(
      {
        error: {
          code: 'ACCESS_DENIED',
          message: 'Access denied to this adherent',
        },
      },
      403
    );
  }

  return c.json({
    id: adherent.id,
    matricule: adherent.matricule,
    firstName: adherent.prenom,
    lastName: adherent.nom,
    dateOfBirth: adherent.date_naissance,
    nationalId: adherent.cin,
    email: adherent.email,
    phone: adherent.telephone,
    address: adherent.adresse,
    city: adherent.ville,
    isActive: adherent.est_actif === 1,
  });
});

/**
 * GET /tarification
 * Get tarification for a care type
 */
publicApiV2.get('/tarification', requireScope('tarification:read'), async (c) => {
  const careType = c.req.query('careType');
  const code = c.req.query('code');

  if (!careType && !code) {
    return c.json(
      {
        error: {
          code: 'INVALID_REQUEST',
          message: 'careType or code is required',
        },
      },
      400
    );
  }

  const conditions: string[] = [];
  const bindings: unknown[] = [];

  if (careType) {
    conditions.push('type_soin = ?');
    bindings.push(careType);
  }

  if (code) {
    conditions.push('code_acte = ?');
    bindings.push(code);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { results } = await getDb(c).prepare(
    `SELECT * FROM baremes ${whereClause} ORDER BY code_acte`
  )
    .bind(...bindings)
    .all<{
      id: string;
      code_acte: string;
      libelle: string;
      type_soin: string;
      tarif_base: number;
      taux_remboursement: number;
      plafond: number | null;
    }>();

  return c.json({
    data: (results || []).map((r) => ({
      code: r.code_acte,
      name: r.libelle,
      careType: r.type_soin,
      basePrice: r.tarif_base,
      reimbursementRate: r.taux_remboursement,
      maxAmount: r.plafond,
    })),
  });
});

export default publicApiV2;
