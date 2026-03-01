/**
 * SoinFlow Garanties routes
 */
import {
  findFormuleById,
  findFormuleByCode,
  listFormules,
  createFormule,
  updateFormule,
  listPlafondsConsommes,
  calculateCoverage,
} from '@dhamen/db';
import {
  santeGarantieFormuleCreateSchema,
  santeGarantieFormuleUpdateSchema,
  santeTypeSoinSchema,
} from '@dhamen/shared';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { Hono } from 'hono';
import { created, notFound, success, badRequest } from '../../lib/response';
import { generateId } from '../../lib/ulid';
import { logAudit } from '../../middleware/audit-trail';
import { authMiddleware, requireRole } from '../../middleware/auth';
import type { Bindings, Variables } from '../../types';
import { getDb } from '../../lib/db';

const garanties = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
garanties.use('*', authMiddleware());

/**
 * GET /api/v1/sante/garanties/formules
 * List all insurance formules
 */
garanties.get(
  '/formules',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'ADHERENT', 'ADMIN'),
  async (c) => {
    const formules = await listFormules(getDb(c));
    return success(c, formules);
  }
);

/**
 * GET /api/v1/sante/garanties/formules/:id
 * Get a formule by ID
 */
garanties.get(
  '/formules/:id',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'ADHERENT', 'ADMIN'),
  async (c) => {
    const id = c.req.param('id');
    const formule = await findFormuleById(getDb(c), id);

    if (!formule) {
      return notFound(c, 'Formule non trouvée');
    }

    return success(c, formule);
  }
);

/**
 * GET /api/v1/sante/garanties/formules/code/:code
 * Get a formule by code
 */
garanties.get(
  '/formules/code/:code',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'ADHERENT', 'ADMIN'),
  async (c) => {
    const code = c.req.param('code');
    const formule = await findFormuleByCode(getDb(c), code);

    if (!formule) {
      return notFound(c, 'Formule non trouvée');
    }

    return success(c, formule);
  }
);

/**
 * POST /api/v1/sante/garanties/formules
 * Create a new formule
 */
garanties.post(
  '/formules',
  requireRole('SOIN_GESTIONNAIRE', 'ADMIN'),
  zValidator('json', santeGarantieFormuleCreateSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');

    const id = generateId();
    const formule = await createFormule(getDb(c), id, data);

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_garanties.create',
      entityType: 'sante_garanties',
      entityId: id,
      changes: { code: data.code, nom: data.nom },
    });

    return created(c, formule);
  }
);

/**
 * PATCH /api/v1/sante/garanties/formules/:id
 * Update a formule
 */
garanties.patch(
  '/formules/:id',
  requireRole('SOIN_GESTIONNAIRE', 'ADMIN'),
  zValidator('json', santeGarantieFormuleUpdateSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    const formule = await updateFormule(getDb(c), id, data);

    if (!formule) {
      return notFound(c, 'Formule non trouvée');
    }

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'sante_garanties.update',
      entityType: 'sante_garanties',
      entityId: id,
      changes: { updatedFields: Object.keys(data) },
    });

    return success(c, formule);
  }
);

/**
 * GET /api/v1/sante/garanties/plafonds/:adherentId
 * Get plafonds consumed for an adherent
 */
garanties.get(
  '/plafonds/:adherentId',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'ADHERENT', 'ADMIN'),
  async (c) => {
    const adherentId = c.req.param('adherentId');
    const user = c.get('user');

    // Adherents can only see their own plafonds
    if (user.role === 'ADHERENT' && adherentId !== user.sub) {
      return notFound(c, 'Plafonds non trouvés');
    }

    const annee = Number.parseInt(c.req.query('annee') ?? new Date().getFullYear().toString());
    const plafonds = await listPlafondsConsommes(getDb(c), adherentId, annee);

    return success(c, plafonds);
  }
);

/**
 * POST /api/v1/sante/garanties/calculer-couverture
 * Calculate coverage for a potential claim
 */
const calculateCoverageSchema = z.object({
  formuleId: z.string().min(1),
  typeSoin: santeTypeSoinSchema,
  montantDemande: z.number().positive(),
  adherentId: z.string().min(1),
});

garanties.post(
  '/calculer-couverture',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'ADHERENT', 'ADMIN'),
  zValidator('json', calculateCoverageSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');

    // Adherents can only calculate their own coverage
    if (user.role === 'ADHERENT' && data.adherentId !== user.sub) {
      return badRequest(c, 'Accès non autorisé');
    }

    try {
      const result = await calculateCoverage(
        getDb(c),
        data.formuleId,
        data.typeSoin,
        data.montantDemande,
        data.adherentId
      );

      return success(c, {
        ...result,
        montantDemande: data.montantDemande,
        montantResteCharge: data.montantDemande - result.montantCouvert,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur de calcul';
      return badRequest(c, message);
    }
  }
);

export { garanties };
