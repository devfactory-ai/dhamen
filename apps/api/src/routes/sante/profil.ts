/**
 * SoinFlow Profil routes - Adherent profile and coverage info
 */
import { Hono } from 'hono';
import { success, notFound } from '../../lib/response';
import { authMiddleware, requireRole } from '../../middleware/auth';
import type { Bindings, Variables } from '../../types';

const profil = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
profil.use('*', authMiddleware());

interface AdherentRow {
  id: string;
  matricule: string | null;
  date_of_birth: string;
  is_active: number;
  formule_id: string | null;
}

interface FormuleRow {
  id: string;
  code: string;
  nom: string;
  plafond_global: number | null;
  tarif_mensuel: number;
  taux_couverture_json: string;
}

interface PlafondRow {
  type_soin: string;
  montant_plafond: number;
  montant_consomme: number;
}

/**
 * GET /api/v1/sante/profil
 * Get current user's health profile with coverage and consumption
 */
profil.get('/', requireRole('ADHERENT'), async (c) => {
  const user = c.get('user');
  const adherentId = user.sub;
  const currentYear = new Date().getFullYear();

  // Get adherent info with sante extension
  const adherent = await c.env.DB.prepare(`
    SELECT a.id, COALESCE(sa.matricule, a.id) as matricule, a.date_of_birth, a.is_active, sa.formule_id
    FROM adherents a
    LEFT JOIN sante_adherents sa ON a.id = sa.adherent_id
    WHERE a.id = ? AND a.deleted_at IS NULL
  `)
    .bind(adherentId)
    .first<AdherentRow>();

  if (!adherent) {
    return notFound(c, 'Adherent non trouve');
  }

  // Get formule if exists
  let formule: FormuleRow | null = null;
  if (adherent.formule_id) {
    formule = await c.env.DB.prepare(`
      SELECT id, code, nom, plafond_global, tarif_mensuel, taux_couverture_json
      FROM sante_garanties_formules
      WHERE id = ? AND is_active = 1
    `)
      .bind(adherent.formule_id)
      .first<FormuleRow>();
  }

  // Get plafonds consumed for current year
  const { results: plafondsConsommes } = await c.env.DB.prepare(`
    SELECT type_soin, montant_plafond, montant_consomme
    FROM sante_plafonds_consommes
    WHERE adherent_id = ? AND annee = ?
  `)
    .bind(adherentId, currentYear)
    .all<PlafondRow>();

  // Build plafonds info
  const plafonds: Array<{
    typeSoin: string;
    montantPlafond: number;
    montantConsomme: number;
    montantRestant: number;
    pourcentageUtilise: number;
  }> = [];

  if (formule) {
    // Parse plafonds from formule
    let formPlafonds: Record<string, number> = {};
    try {
      formPlafonds = JSON.parse(formule.taux_couverture_json);
    } catch {
      // Ignore parse errors
    }

    // Merge with consumed
    const consommeMap = new Map(plafondsConsommes.map(p => [p.type_soin, p]));

    for (const [typeSoin] of Object.entries(formPlafonds)) {
      const consomme = consommeMap.get(typeSoin);
      const montantPlafond = consomme?.montant_plafond ?? formule.plafond_global ?? 0;
      const montantConsomme = consomme?.montant_consomme ?? 0;
      const montantRestant = Math.max(0, montantPlafond - montantConsomme);
      const pourcentageUtilise = montantPlafond > 0 ? (montantConsomme / montantPlafond) * 100 : 0;

      plafonds.push({
        typeSoin,
        montantPlafond,
        montantConsomme,
        montantRestant,
        pourcentageUtilise,
      });
    }

    // Add global if exists
    if (formule.plafond_global) {
      const globalConsomme = consommeMap.get('global');
      const montantConsomme = globalConsomme?.montant_consomme ?? 0;
      const montantRestant = Math.max(0, formule.plafond_global - montantConsomme);
      const pourcentageUtilise = (montantConsomme / formule.plafond_global) * 100;

      plafonds.unshift({
        typeSoin: 'global',
        montantPlafond: formule.plafond_global,
        montantConsomme,
        montantRestant,
        pourcentageUtilise,
      });
    }
  }

  return success(c, {
    adherent: {
      id: adherent.id,
      matricule: adherent.matricule,
      dateNaissance: adherent.date_of_birth,
      estActif: adherent.is_active === 1,
    },
    formule: formule
      ? {
          id: formule.id,
          code: formule.code,
          nom: formule.nom,
          plafondGlobal: formule.plafond_global,
          tarifMensuel: formule.tarif_mensuel,
        }
      : null,
    plafonds,
  });
});

export { profil };
