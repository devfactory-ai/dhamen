/**
 * SoinFlow Eligibility routes - IA-powered eligibility verification
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { success, badRequest } from '../../lib/response';
import { authMiddleware, requireRole } from '../../middleware/auth';
import type { Bindings, Variables } from '../../types';
import { getDb } from '../../lib/db';
import { santeTypeSoinSchema } from '@dhamen/shared';
import { checkSanteEligibility } from '../../agents/sante';
import { calculateSanteTarification } from '../../agents/sante';
import { detectSanteFraud } from '../../agents/sante';

const eligibility = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
eligibility.use('*', authMiddleware());

// =============================================================================
// Schemas
// =============================================================================

const eligibilityCheckSchema = z.object({
  adherentId: z.string().min(1),
  typeSoin: santeTypeSoinSchema,
  montant: z.number().positive(),
  dateSoin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  praticienId: z.string().optional(),
});

const tarificationSchema = z.object({
  adherentId: z.string().min(1),
  formuleId: z.string().min(1),
  typeSoin: santeTypeSoinSchema,
  montantDemande: z.number().positive(),
  dateSoin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  praticienId: z.string().optional(),
  codeActe: z.string().optional(),
});

const fraudCheckSchema = z.object({
  demandeId: z.string().min(1),
  adherentId: z.string().min(1),
  praticienId: z.string().optional(),
  typeSoin: santeTypeSoinSchema,
  source: z.enum(['adherent', 'praticien']),
  montant: z.number().positive(),
  dateSoin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  heureSoin: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  medicaments: z.array(z.string()).optional(),
});

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /api/v1/sante/eligibility/check
 * Check adherent eligibility for a care type
 *
 * SLA: < 100ms (cached)
 */
eligibility.post(
  '/check',
  requireRole('PRATICIEN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', eligibilityCheckSchema),
  async (c) => {
    const data = c.req.valid('json');

    const result = await checkSanteEligibility(c, {
      adherentId: data.adherentId,
      typeSoin: data.typeSoin,
      montant: data.montant,
      dateSoin: data.dateSoin,
      praticienId: data.praticienId,
    });

    return success(c, result);
  }
);

/**
 * POST /api/v1/sante/eligibility/tarification
 * Calculate coverage amounts for a claim
 */
eligibility.post(
  '/tarification',
  requireRole('PRATICIEN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', tarificationSchema),
  async (c) => {
    const data = c.req.valid('json');

    const result = await calculateSanteTarification(c, {
      adherentId: data.adherentId,
      formuleId: data.formuleId,
      typeSoin: data.typeSoin,
      montantDemande: data.montantDemande,
      dateSoin: data.dateSoin,
      praticienId: data.praticienId,
      codeActe: data.codeActe,
    });

    return success(c, result);
  }
);

/**
 * POST /api/v1/sante/eligibility/fraud-check
 * Run fraud detection on a claim
 */
eligibility.post(
  '/fraud-check',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('json', fraudCheckSchema),
  async (c) => {
    const data = c.req.valid('json');

    const result = await detectSanteFraud(c, {
      demandeId: data.demandeId,
      adherentId: data.adherentId,
      praticienId: data.praticienId,
      typeSoin: data.typeSoin,
      source: data.source,
      montant: data.montant,
      dateSoin: data.dateSoin,
      heureSoin: data.heureSoin,
      medicaments: data.medicaments,
    });

    return success(c, result);
  }
);

/**
 * POST /api/v1/sante/eligibility/full-check
 * Run all checks: eligibility + tarification + fraud
 */
eligibility.post(
  '/full-check',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator(
    'json',
    z.object({
      demandeId: z.string().min(1),
      adherentId: z.string().min(1),
      formuleId: z.string().min(1),
      typeSoin: santeTypeSoinSchema,
      source: z.enum(['adherent', 'praticien']),
      montant: z.number().positive(),
      dateSoin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      praticienId: z.string().optional(),
      heureSoin: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    })
  ),
  async (c) => {
    const data = c.req.valid('json');

    // Run all checks in parallel
    const [eligibilityResult, tarificationResult, fraudResult] = await Promise.all([
      checkSanteEligibility(c, {
        adherentId: data.adherentId,
        typeSoin: data.typeSoin,
        montant: data.montant,
        dateSoin: data.dateSoin,
        praticienId: data.praticienId,
      }),
      calculateSanteTarification(c, {
        adherentId: data.adherentId,
        formuleId: data.formuleId,
        typeSoin: data.typeSoin,
        montantDemande: data.montant,
        dateSoin: data.dateSoin,
        praticienId: data.praticienId,
      }),
      detectSanteFraud(c, {
        demandeId: data.demandeId,
        adherentId: data.adherentId,
        praticienId: data.praticienId,
        typeSoin: data.typeSoin,
        source: data.source,
        montant: data.montant,
        dateSoin: data.dateSoin,
        heureSoin: data.heureSoin,
      }),
    ]);

    // Determine overall recommendation
    let recommandation: 'auto_approuver' | 'revue_manuelle' | 'rejeter' = 'auto_approuver';
    const motifs: string[] = [];

    if (!eligibilityResult.eligible) {
      recommandation = 'rejeter';
      motifs.push('Adhérent non éligible');
    }

    if (fraudResult.niveauRisque === 'critique' || fraudResult.niveauRisque === 'eleve') {
      recommandation = 'revue_manuelle';
      motifs.push(`Score fraude élevé (${fraudResult.scoreFraude})`);
    }

    if (tarificationResult.montantCouvert === 0) {
      recommandation = 'rejeter';
      motifs.push('Aucune couverture disponible');
    }

    return success(c, {
      eligibility: eligibilityResult,
      tarification: tarificationResult,
      fraud: fraudResult,
      synthese: {
        recommandation,
        motifs,
        montantPropose: tarificationResult.montantCouvert,
        tempsTotal:
          eligibilityResult.tempsVerification +
          tarificationResult.tempsCalcul +
          fraudResult.tempsAnalyse,
      },
    });
  }
);

/**
 * GET /api/v1/sante/eligibility/check
 * Check eligibility by matricule or national ID (for web portal)
 */
eligibility.get(
  '/check',
  requireRole('PRATICIEN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN', 'PHARMACIST', 'DOCTOR', 'LAB_MANAGER'),
  async (c) => {
    const matricule = c.req.query('matricule');
    const nationalId = c.req.query('nationalId');

    if (!matricule && !nationalId) {
      return badRequest(c, 'Matricule ou CIN requis');
    }

    // Find adherent by matricule or national ID
    const adherentQuery = matricule
      ? getDb(c).prepare(`
          SELECT a.id, a.first_name, a.last_name, a.birth_date, a.national_id, a.is_active,
                 COALESCE(sa.matricule, a.id) as matricule,
                 sa.formule_id, sa.plafond_global,
                 f.code as formule_code, f.nom as formule_nom, f.plafond_global as formule_plafond,
                 c.id as contrat_id, c.contract_number, c.start_date, c.end_date, c.status
          FROM adherents a
          LEFT JOIN sante_adherents sa ON a.id = sa.adherent_id
          LEFT JOIN sante_garanties_formules f ON sa.formule_id = f.id
          LEFT JOIN contracts c ON a.contract_id = c.id
          WHERE (sa.matricule = ? OR a.id = ?) AND a.deleted_at IS NULL
        `).bind(matricule, matricule)
      : getDb(c).prepare(`
          SELECT a.id, a.first_name, a.last_name, a.birth_date, a.national_id, a.is_active,
                 COALESCE(sa.matricule, a.id) as matricule,
                 sa.formule_id, sa.plafond_global,
                 f.code as formule_code, f.nom as formule_nom, f.plafond_global as formule_plafond,
                 c.id as contrat_id, c.contract_number, c.start_date, c.end_date, c.status
          FROM adherents a
          LEFT JOIN sante_adherents sa ON a.id = sa.adherent_id
          LEFT JOIN sante_garanties_formules f ON sa.formule_id = f.id
          LEFT JOIN contracts c ON a.contract_id = c.id
          WHERE a.national_id = ? AND a.deleted_at IS NULL
        `).bind(nationalId);

    const adherent = await adherentQuery.first<{
      id: string;
      first_name: string;
      last_name: string;
      birth_date: string | null;
      national_id: string | null;
      is_active: number;
      matricule: string;
      formule_id: string | null;
      plafond_global: number | null;
      formule_code: string | null;
      formule_nom: string | null;
      formule_plafond: number | null;
      contrat_id: string | null;
      contract_number: string | null;
      start_date: string | null;
      end_date: string | null;
      status: string | null;
    }>();

    if (!adherent) {
      return badRequest(c, 'Adhérent non trouvé');
    }

    // Get consumed plafonds
    const year = new Date().getFullYear();
    const { results: plafonds } = await getDb(c).prepare(`
      SELECT type_soin, montant_consomme, montant_plafond
      FROM sante_plafonds_consommes
      WHERE adherent_id = ? AND annee = ?
    `).bind(adherent.id, year).all<{
      type_soin: string;
      montant_consomme: number;
      montant_plafond: number;
    }>();

    // Calculate plafonds with percentages
    const plafondsWithPercentage = plafonds.map((p) => ({
      typeSoin: p.type_soin,
      montantPlafond: p.montant_plafond,
      montantConsomme: p.montant_consomme,
      montantRestant: p.montant_plafond - p.montant_consomme,
      pourcentageUtilise: p.montant_plafond > 0
        ? Math.round((p.montant_consomme / p.montant_plafond) * 100)
        : 0,
    }));

    // Determine eligibility and warnings
    const warnings: string[] = [];
    let eligible = true;

    if (adherent.is_active !== 1) {
      eligible = false;
      warnings.push('Adherent inactif');
    }

    if (!adherent.formule_id) {
      eligible = false;
      warnings.push('Aucune formule de garantie attribuee');
    }

    if (adherent.contrat_id && adherent.status !== 'active') {
      eligible = false;
      warnings.push('Contrat non actif');
    }

    if (adherent.end_date) {
      const endDate = new Date(adherent.end_date);
      if (endDate < new Date()) {
        eligible = false;
        warnings.push('Contrat expire');
      } else {
        const daysUntilExpiry = Math.ceil((endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (daysUntilExpiry <= 30) {
          warnings.push(`Contrat expire dans ${daysUntilExpiry} jours`);
        }
      }
    }

    // Check global plafond
    const globalPlafond = plafonds.find((p) => p.type_soin === 'global');
    if (globalPlafond) {
      const remaining = globalPlafond.montant_plafond - globalPlafond.montant_consomme;
      if (remaining <= 0) {
        eligible = false;
        warnings.push('Plafond global epuise');
      } else if (remaining < globalPlafond.montant_plafond * 0.1) {
        warnings.push('Plafond global presque epuise (< 10%)');
      }
    }

    return success(c, {
      eligible,
      adherent: {
        id: adherent.id,
        matricule: adherent.matricule,
        nom: adherent.last_name,
        prenom: adherent.first_name,
        dateNaissance: adherent.birth_date || '',
        estActif: adherent.is_active === 1,
      },
      formule: adherent.formule_id
        ? {
            id: adherent.formule_id,
            code: adherent.formule_code || '',
            nom: adherent.formule_nom || '',
            plafondGlobal: adherent.formule_plafond,
          }
        : null,
      plafonds: plafondsWithPercentage,
      contrat: adherent.contrat_id
        ? {
            id: adherent.contrat_id,
            numero: adherent.contract_number || '',
            dateDebut: adherent.start_date || '',
            dateFin: adherent.end_date || '',
            estActif: adherent.status === 'active',
          }
        : undefined,
      warnings,
    });
  }
);

/**
 * GET /api/v1/sante/eligibility/quick/:adherentId
 * Quick eligibility lookup by adherent ID
 */
eligibility.get(
  '/quick/:adherentId',
  requireRole('PRATICIEN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  async (c) => {
    const adherentId = c.req.param('adherentId');
    const today = new Date().toISOString().split('T')[0];

    // Get adherent with formule info
    const adherent = await getDb(c).prepare(`
      SELECT
        a.id, a.first_name, a.last_name, a.is_active,
        COALESCE(sa.matricule, a.id) as matricule,
        sa.formule_id, sa.plafond_global,
        f.code as formule_code, f.nom as formule_nom
      FROM adherents a
      LEFT JOIN sante_adherents sa ON a.id = sa.adherent_id
      LEFT JOIN sante_garanties_formules f ON sa.formule_id = f.id
      WHERE a.id = ? AND a.deleted_at IS NULL
    `)
      .bind(adherentId)
      .first<{
        id: string;
        first_name: string;
        last_name: string;
        is_active: number;
        matricule: string;
        formule_id: string | null;
        plafond_global: number | null;
        formule_code: string | null;
        formule_nom: string | null;
      }>();

    if (!adherent) {
      return badRequest(c, 'Adhérent non trouvé');
    }

    // Get consumed plafonds
    const year = new Date().getFullYear();
    const { results: plafonds } = await getDb(c).prepare(`
      SELECT type_soin, montant_consomme, montant_plafond
      FROM sante_plafonds_consommes
      WHERE adherent_id = ? AND annee = ?
    `)
      .bind(adherentId, year)
      .all<{ type_soin: string; montant_consomme: number; montant_plafond: number }>();

    const plafondGlobal = plafonds.find((p) => p.type_soin === 'global');

    return success(c, {
      id: adherent.id,
      nom: adherent.last_name,
      prenom: adherent.first_name,
      matricule: adherent.matricule,
      estActif: adherent.is_active === 1,
      formule: adherent.formule_id
        ? {
            id: adherent.formule_id,
            code: adherent.formule_code,
            nom: adherent.formule_nom,
          }
        : null,
      plafonds: {
        global: plafondGlobal
          ? {
              plafond: plafondGlobal.montant_plafond,
              consomme: plafondGlobal.montant_consomme,
              restant: plafondGlobal.montant_plafond - plafondGlobal.montant_consomme,
            }
          : adherent.plafond_global
            ? { plafond: adherent.plafond_global, consomme: 0, restant: adherent.plafond_global }
            : null,
        parTypeSoin: plafonds
          .filter((p) => p.type_soin !== 'global')
          .map((p) => ({
            typeSoin: p.type_soin,
            plafond: p.montant_plafond,
            consomme: p.montant_consomme,
            restant: p.montant_plafond - p.montant_consomme,
          })),
      },
      eligible: adherent.is_active === 1 && adherent.formule_id !== null,
    });
  }
);

export { eligibility };
