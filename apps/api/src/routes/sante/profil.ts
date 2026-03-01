/**
 * SoinFlow Profil routes - Adherent profile and coverage info
 */
import { Hono } from 'hono';
import { success, notFound } from '../../lib/response';
import { authMiddleware, requireRole } from '../../middleware/auth';
import type { Bindings, Variables } from '../../types';
import { getDb } from '../../lib/db';

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
  const adherent = await getDb(c).prepare(`
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
    formule = await getDb(c).prepare(`
      SELECT id, code, nom, plafond_global, tarif_mensuel, taux_couverture_json
      FROM sante_garanties_formules
      WHERE id = ? AND is_active = 1
    `)
      .bind(adherent.formule_id)
      .first<FormuleRow>();
  }

  // Get plafonds consumed for current year
  const { results: plafondsConsommes } = await getDb(c).prepare(`
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

/**
 * GET /api/v1/sante/profil/guarantees
 * Get detailed guarantees for the current adherent
 */
profil.get('/guarantees', requireRole('ADHERENT'), async (c) => {
  const user = c.get('user');
  const adherentId = user.sub;
  const currentYear = new Date().getFullYear();

  // Get adherent with formule
  const adherent = await getDb(c).prepare(`
    SELECT a.id, sa.formule_id
    FROM adherents a
    LEFT JOIN sante_adherents sa ON a.id = sa.adherent_id
    WHERE a.id = ? AND a.deleted_at IS NULL
  `)
    .bind(adherentId)
    .first<{ id: string; formule_id: string | null }>();

  if (!adherent) {
    return notFound(c, 'Adherent non trouve');
  }

  if (!adherent.formule_id) {
    return success(c, { formule: null, garanties: [] });
  }

  // Get formule details
  const formule = await getDb(c).prepare(`
    SELECT id, code, nom, description, taux_couverture_json, plafond_global,
           date_effet, date_fin
    FROM sante_garanties_formules
    WHERE id = ? AND is_active = 1
  `)
    .bind(adherent.formule_id)
    .first<{
      id: string;
      code: string;
      nom: string;
      description: string;
      taux_couverture_json: string;
      plafond_global: number | null;
      date_effet: string;
      date_fin: string | null;
    }>();

  if (!formule) {
    return success(c, { formule: null, garanties: [] });
  }

  // Parse coverage rates
  let tauxCouverture: Record<string, number> = {};
  try {
    tauxCouverture = JSON.parse(formule.taux_couverture_json);
  } catch {
    // Default to empty
  }

  // Get plafonds consumed for current year
  const { results: plafondsConsommes } = await getDb(c).prepare(`
    SELECT type_soin, montant_plafond, montant_consomme
    FROM sante_plafonds_consommes
    WHERE adherent_id = ? AND annee = ?
  `)
    .bind(adherentId, currentYear)
    .all<PlafondRow>();

  const consommeMap = new Map(plafondsConsommes.map(p => [p.type_soin, p]));

  // Get actes for the formule (if configured)
  const { results: actes } = await getDb(c).prepare(`
    SELECT code_acte, libelle_acte, type_soin, taux_couverture,
           plafond_acte, franchise_acte, delai_carence, is_active
    FROM sante_actes
    WHERE formule_id = ?
  `)
    .bind(formule.id)
    .all<{
      code_acte: string;
      libelle_acte: string;
      type_soin: string;
      taux_couverture: number;
      plafond_acte: number | null;
      franchise_acte: number;
      delai_carence: number;
      is_active: number;
    }>();

  // Group actes by type_soin
  const actesMap = new Map<string, typeof actes>();
  for (const acte of actes) {
    if (!actesMap.has(acte.type_soin)) {
      actesMap.set(acte.type_soin, []);
    }
    actesMap.get(acte.type_soin)?.push(acte);
  }

  // Build garanties
  const typeLabels: Record<string, string> = {
    consultation: 'Consultation',
    pharmacie: 'Pharmacie',
    hospitalisation: 'Hospitalisation',
    analyse: 'Analyses',
    radiologie: 'Radiologie',
    dentaire: 'Dentaire',
    optique: 'Optique',
    maternite: 'Maternite',
    autre: 'Autres soins',
  };

  const garanties = Object.entries(tauxCouverture).map(([typeSoin, tauxBase]) => {
    const consomme = consommeMap.get(typeSoin);
    const montantPlafond = consomme?.montant_plafond ?? formule.plafond_global ?? 0;
    const montantConsomme = consomme?.montant_consomme ?? 0;
    const montantRestant = Math.max(0, montantPlafond - montantConsomme);
    const pourcentageUtilise = montantPlafond > 0 ? (montantConsomme / montantPlafond) * 100 : 0;

    const actesTypeSoin = actesMap.get(typeSoin) || [];

    return {
      typeSoin,
      libelle: typeLabels[typeSoin] || typeSoin,
      tauxBase,
      plafondAnnuel: montantPlafond || null,
      montantConsomme,
      montantRestant,
      pourcentageUtilise,
      actes: actesTypeSoin.map(a => ({
        codeActe: a.code_acte,
        libelleActe: a.libelle_acte,
        tauxCouverture: a.taux_couverture,
        plafondActe: a.plafond_acte,
        franchiseActe: a.franchise_acte,
        delaiCarence: a.delai_carence,
        estActif: a.is_active === 1,
      })),
    };
  });

  return success(c, {
    formule: {
      id: formule.id,
      code: formule.code,
      nom: formule.nom,
      description: formule.description || '',
      dateEffet: formule.date_effet,
      dateFin: formule.date_fin,
    },
    garanties,
  });
});

interface PaiementRow {
  id: string;
  numero_paiement: string;
  demande_id: string;
  numero_demande: string;
  montant_rembourse: number;
  montant_demande: number;
  taux_remboursement: number;
  date_remboursement: string;
  methode_paiement: string;
  reference_virement: string | null;
  statut: string;
  type_soin: string;
  praticien_nom: string | null;
  praticien_specialite: string | null;
}

/**
 * GET /api/v1/sante/profil/reimbursements
 * Get reimbursement history for the current adherent
 */
profil.get('/reimbursements', requireRole('ADHERENT'), async (c) => {
  const user = c.get('user');
  const adherentId = user.sub;
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 50);
  const offset = (page - 1) * limit;

  // Count total
  const countResult = await getDb(c).prepare(`
    SELECT COUNT(*) as total
    FROM sante_paiements p
    JOIN sante_demandes d ON p.demande_id = d.id
    WHERE d.adherent_id = ?
  `)
    .bind(adherentId)
    .first<{ total: number }>();

  const total = countResult?.total || 0;

  // Get reimbursements
  const { results: paiements } = await getDb(c).prepare(`
    SELECT
      p.id,
      p.numero_paiement,
      p.demande_id,
      d.numero_demande,
      p.montant as montant_rembourse,
      d.montant_approuve as montant_demande,
      ROUND((p.montant * 100.0 / NULLIF(d.montant_demande, 0)), 1) as taux_remboursement,
      p.date_paiement as date_remboursement,
      p.mode_paiement as methode_paiement,
      p.reference_virement,
      p.statut,
      d.type_soin,
      pr.nom as praticien_nom,
      pr.specialite as praticien_specialite
    FROM sante_paiements p
    JOIN sante_demandes d ON p.demande_id = d.id
    LEFT JOIN sante_praticiens pr ON d.praticien_id = pr.id
    WHERE d.adherent_id = ?
    ORDER BY p.date_paiement DESC
    LIMIT ? OFFSET ?
  `)
    .bind(adherentId, limit, offset)
    .all<PaiementRow>();

  // Summary
  const summaryResult = await getDb(c).prepare(`
    SELECT
      SUM(p.montant) as total_rembourse,
      COUNT(*) as nombre_remboursements,
      AVG(p.montant * 100.0 / NULLIF(d.montant_demande, 0)) as moyenne_taux,
      MAX(p.date_paiement) as dernier_remboursement
    FROM sante_paiements p
    JOIN sante_demandes d ON p.demande_id = d.id
    WHERE d.adherent_id = ?
  `)
    .bind(adherentId)
    .first<{
      total_rembourse: number;
      nombre_remboursements: number;
      moyenne_taux: number;
      dernier_remboursement: string | null;
    }>();

  return success(c, {
    summary: {
      totalRembourse: summaryResult?.total_rembourse || 0,
      nombreRemboursements: summaryResult?.nombre_remboursements || 0,
      moyenneTaux: summaryResult?.moyenne_taux || 0,
      dernierRemboursement: summaryResult?.dernier_remboursement,
    },
    remboursements: paiements.map(p => ({
      id: p.id,
      numeroPaiement: p.numero_paiement,
      demandeId: p.demande_id,
      numeroDemande: p.numero_demande,
      montantRembourse: p.montant_rembourse,
      montantDemande: p.montant_demande || 0,
      tauxRemboursement: p.taux_remboursement || 0,
      dateRemboursement: p.date_remboursement,
      methodePaiement: p.methode_paiement,
      referenceVirement: p.reference_virement,
      statut: p.statut,
      typeSoin: p.type_soin,
      praticien: p.praticien_nom
        ? {
            nom: p.praticien_nom,
            specialite: p.praticien_specialite || '',
          }
        : null,
    })),
    pagination: {
      page,
      limit,
      total,
    },
  });
});

export { profil };
