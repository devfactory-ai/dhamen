/**
 * CNAM Routes
 *
 * Integration endpoints for Tunisia's National Health Insurance Fund
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';
import { authMiddleware, requireRole } from '../middleware/auth';
import { CNAMService } from '../services/cnam.service';
import { logAudit } from '../middleware/audit-trail';

const cnam = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
cnam.use('*', authMiddleware());

// =============================================================================
// Schemas
// =============================================================================

const verifyAffiliateSchema = z.object({
  matricule: z.string().min(8, 'Matricule invalide'),
});

const searchAffiliateSchema = z.object({
  matricule: z.string().optional(),
  cin: z.string().optional(),
  nom: z.string().optional(),
  prenom: z.string().optional(),
  dateNaissance: z.string().optional(),
});

const requestPECSchema = z.object({
  matriculeAssure: z.string().min(8),
  matriculePrestataire: z.string(),
  datePrestation: z.string(),
  typePrestation: z.enum(['CONSULTATION', 'PHARMACIE', 'ANALYSE', 'HOSPITALISATION', 'AUTRES']),
  actes: z.array(
    z.object({
      codeActe: z.string(),
      libelleActe: z.string(),
      quantite: z.number().min(1),
      prixUnitaire: z.number().min(0),
      montantTotal: z.number().min(0),
    })
  ),
  montantTotal: z.number().min(0),
});

const submitClaimSchema = z.object({
  numeroPEC: z.string(),
  matriculeAssure: z.string(),
  actes: z.array(
    z.object({
      codeActe: z.string(),
      libelleActe: z.string(),
      quantite: z.number(),
      prixUnitaire: z.number(),
      montantTotal: z.number(),
    })
  ),
  montantTotal: z.number(),
  justificatifs: z.array(z.string()).optional(),
});

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /cnam/verify
 * Verify affiliate status with CNAM
 */
cnam.post(
  '/verify',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PHARMACIST', 'DOCTOR', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', verifyAffiliateSchema),
  async (c) => {
    const { matricule } = c.req.valid('json');
    const user = c.get('user');

    const cnamService = new CNAMService(c.env);
    const affiliate = await cnamService.verifyAffiliate(matricule);

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'cnam.verify_affiliate',
      entityType: 'cnam_affiliates',
      entityId: matricule,
      changes: {
        found: !!affiliate,
        statut: affiliate?.statutAffiliation,
      },
    });

    if (!affiliate) {
      return c.json({
        success: false,
        error: {
          code: 'AFFILIATE_NOT_FOUND',
          message: 'Assuré non trouvé dans le fichier CNAM',
        },
      }, 404);
    }

    return c.json({
      success: true,
      data: affiliate,
    });
  }
);

/**
 * POST /cnam/search
 * Search for affiliate by various criteria
 */
cnam.post(
  '/search',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', searchAffiliateSchema),
  async (c) => {
    const criteria = c.req.valid('json');
    const user = c.get('user');

    const cnamService = new CNAMService(c.env);
    const results = await cnamService.searchAffiliate(criteria);

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'cnam.search_affiliate',
      entityType: 'cnam_affiliates',
      entityId: 'search',
      changes: {
        criteria,
        resultsCount: results.length,
      },
    });

    return c.json({
      success: true,
      data: results,
    });
  }
);

/**
 * POST /cnam/pec
 * Request authorization (Prise En Charge)
 */
cnam.post(
  '/pec',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PHARMACIST', 'DOCTOR'),
  zValidator('json', requestPECSchema),
  async (c) => {
    const request = c.req.valid('json');
    const user = c.get('user');

    const cnamService = new CNAMService(c.env);
    const response = await cnamService.requestPEC(request);

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'cnam.request_pec',
      entityType: 'cnam_pec',
      entityId: response.numeroPEC || 'rejected',
      changes: {
        matriculeAssure: request.matriculeAssure,
        montantTotal: request.montantTotal,
        statut: response.statut,
        montantPrisEnCharge: response.montantPrisEnCharge,
      },
    });

    return c.json({
      success: response.statut === 'ACCEPTEE',
      data: response,
    });
  }
);

/**
 * POST /cnam/claims
 * Submit reimbursement claim
 */
cnam.post(
  '/claims',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', submitClaimSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');

    const cnamService = new CNAMService(c.env);
    const result = await cnamService.submitClaim(data);

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'cnam.submit_claim',
      entityType: 'cnam_claims',
      entityId: result.numeroRemboursement,
      changes: {
        numeroPEC: data.numeroPEC,
        montantTotal: data.montantTotal,
        statut: result.statut,
      },
    });

    return c.json({
      success: true,
      data: result,
    });
  }
);

/**
 * GET /cnam/tarifs/:codeActe
 * Get tarification for an act
 */
cnam.get(
  '/tarifs/:codeActe',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PHARMACIST', 'DOCTOR'),
  async (c) => {
    const codeActe = c.req.param('codeActe');

    const cnamService = new CNAMService(c.env);
    const tarif = await cnamService.getTarif(codeActe);

    if (!tarif) {
      return c.json({
        success: false,
        error: {
          code: 'TARIF_NOT_FOUND',
          message: 'Code acte non trouvé',
        },
      }, 404);
    }

    return c.json({
      success: true,
      data: tarif,
    });
  }
);

/**
 * GET /cnam/providers
 * Get contracted healthcare providers
 */
cnam.get('/providers', async (c) => {
  const region = c.req.query('region');
  const specialite = c.req.query('specialite');
  const type = c.req.query('type');
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);

  const cnamService = new CNAMService(c.env);
  const result = await cnamService.getProvidersConventionnes({
    region: region || undefined,
    specialite: specialite || undefined,
    type: type || undefined,
    page,
    limit,
  });

  return c.json({
    success: true,
    data: result.providers,
    meta: {
      page,
      limit,
      total: result.total,
    },
  });
});

/**
 * GET /cnam/medicaments/:codeDCI
 * Check if medication is on CNAM formulary
 */
cnam.get(
  '/medicaments/:codeDCI',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PHARMACIST'),
  async (c) => {
    const codeDCI = c.req.param('codeDCI');

    const cnamService = new CNAMService(c.env);
    const medicament = await cnamService.checkMedicament(codeDCI);

    if (!medicament) {
      return c.json({
        success: true,
        data: {
          estRembourse: false,
          message: 'Médicament non inscrit au formulaire CNAM',
        },
      });
    }

    return c.json({
      success: true,
      data: medicament,
    });
  }
);

/**
 * GET /cnam/stats
 * Get CNAM integration statistics
 */
cnam.get('/stats', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'), async (c) => {
  // Mock stats
  const stats = {
    totalVerifications: 15420,
    totalPEC: 8520,
    pecAcceptees: 7890,
    pecRefusees: 630,
    tauxAcceptation: 92.6,
    montantTotalPrisEnCharge: 125000000000, // 125M TND
    delaiMoyenTraitement: 0.5, // seconds
    erreursCommunication: 12,
    derniereSynchronisation: new Date().toISOString(),
  };

  return c.json({
    success: true,
    data: stats,
  });
});

export { cnam };
