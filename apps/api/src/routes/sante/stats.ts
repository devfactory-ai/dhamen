/**
 * SoinFlow Statistics routes
 *
 * Provides KPIs and dashboard data
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { success } from '../../lib/response';
import { authMiddleware, requireRole } from '../../middleware/auth';
import type { Bindings, Variables } from '../../types';

const stats = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
stats.use('*', authMiddleware());

// Period schema
const periodSchema = z.object({
  period: z.enum(['week', 'month', 'year']).optional().default('month'),
});

/**
 * GET /api/v1/sante/stats/kpis
 * Get KPI summary
 */
stats.get(
  '/kpis',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'ADMIN'),
  async (c) => {
    const today = new Date().toISOString().split('T')[0];
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      .toISOString()
      .split('T')[0];

    // Demandes stats
    const demandesStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN statut IN ('soumise', 'en_examen', 'info_requise') THEN 1 END) as en_cours,
        COUNT(CASE WHEN statut = 'approuvee' OR statut = 'payee' THEN 1 END) as approuvees,
        COUNT(CASE WHEN statut = 'rejetee' THEN 1 END) as rejetees,
        COUNT(CASE WHEN DATE(created_at) = ? THEN 1 END) as aujourdhui,
        SUM(montant_demande) as montant_total_demande,
        SUM(CASE WHEN montant_rembourse IS NOT NULL THEN montant_rembourse ELSE 0 END) as montant_total_rembourse,
        SUM(CASE WHEN statut IN ('approuvee', 'en_paiement') THEN montant_rembourse ELSE 0 END) as montant_en_attente,
        AVG(CASE WHEN statut IN ('approuvee', 'payee', 'rejetee')
          THEN (julianday(updated_at) - julianday(created_at)) * 24
          ELSE NULL END) as delai_moyen
      FROM sante_demandes
      WHERE deleted_at IS NULL
    `).bind(today).first<{
      total: number;
      en_cours: number;
      approuvees: number;
      rejetees: number;
      aujourdhui: number;
      montant_total_demande: number;
      montant_total_rembourse: number;
      montant_en_attente: number;
      delai_moyen: number | null;
    }>();

    // Fraud alerts
    const fraudStats = await c.env.DB.prepare(`
      SELECT
        COUNT(CASE WHEN score_fraude >= 70 THEN 1 END) as alertes,
        AVG(score_fraude) as score_moyen
      FROM sante_demandes
      WHERE deleted_at IS NULL AND score_fraude IS NOT NULL
    `).first<{ alertes: number; score_moyen: number | null }>();

    // Adherents stats
    const adherentsStats = await c.env.DB.prepare(`
      SELECT
        COUNT(CASE WHEN a.is_active = 1 THEN 1 END) as actifs,
        COUNT(CASE WHEN DATE(a.created_at) >= ? THEN 1 END) as nouveaux
      FROM adherents a
      JOIN sante_adherents sa ON a.id = sa.adherent_id
      WHERE a.deleted_at IS NULL
    `).bind(startOfMonth).first<{ actifs: number; nouveaux: number }>();

    // Praticiens stats
    const praticiensStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as actifs,
        COUNT(CASE WHEN conventionnement = 'conventionne' THEN 1 END) as conventionnes
      FROM sante_praticiens
      WHERE deleted_at IS NULL AND est_actif = 1
    `).first<{ actifs: number; conventionnes: number }>();

    const total = demandesStats?.total || 0;
    const montantDemande = demandesStats?.montant_total_demande || 0;
    const montantRembourse = demandesStats?.montant_total_rembourse || 0;

    return success(c, {
      demandesTotal: total,
      demandesEnCours: demandesStats?.en_cours || 0,
      demandesApprouvees: demandesStats?.approuvees || 0,
      demandesRejetees: demandesStats?.rejetees || 0,
      demandesAujourdhui: demandesStats?.aujourdhui || 0,
      delaiMoyenTraitement: demandesStats?.delai_moyen || 0,
      montantTotalDemande: montantDemande,
      montantTotalRembourse: montantRembourse,
      montantEnAttente: demandesStats?.montant_en_attente || 0,
      tauxRemboursementMoyen: montantDemande > 0 ? (montantRembourse / montantDemande) * 100 : 0,
      alertesFraude: fraudStats?.alertes || 0,
      scoreRisqueMoyen: fraudStats?.score_moyen || 0,
      adherentsActifs: adherentsStats?.actifs || 0,
      nouveauxAdherents: adherentsStats?.nouveaux || 0,
      praticiensActifs: praticiensStats?.actifs || 0,
      praticiensConventionnes: praticiensStats?.conventionnes || 0,
    });
  }
);

/**
 * GET /api/v1/sante/stats/tendances
 * Get trends over time
 */
stats.get(
  '/tendances',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'ADMIN'),
  zValidator('query', periodSchema),
  async (c) => {
    const { period } = c.req.valid('query');

    let dateFormat: string;
    let daysBack: number;

    switch (period) {
      case 'week':
        dateFormat = '%Y-%m-%d';
        daysBack = 7;
        break;
      case 'year':
        dateFormat = '%Y-%m';
        daysBack = 365;
        break;
      default: // month
        dateFormat = '%Y-%m-%d';
        daysBack = 30;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const { results } = await c.env.DB.prepare(`
      SELECT
        strftime('${dateFormat}', created_at) as date,
        COUNT(*) as demandes,
        SUM(montant_demande) as montant_demande,
        SUM(COALESCE(montant_rembourse, 0)) as montant_rembourse
      FROM sante_demandes
      WHERE deleted_at IS NULL
        AND created_at >= ?
      GROUP BY strftime('${dateFormat}', created_at)
      ORDER BY date
    `).bind(startDate.toISOString()).all<{
      date: string;
      demandes: number;
      montant_demande: number;
      montant_rembourse: number;
    }>();

    return success(c, results.map((r) => ({
      date: r.date,
      demandes: r.demandes,
      montantDemande: r.montant_demande || 0,
      montantRembourse: r.montant_rembourse || 0,
    })));
  }
);

/**
 * GET /api/v1/sante/stats/par-type-soin
 * Get stats by care type
 */
stats.get(
  '/par-type-soin',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'ADMIN'),
  zValidator('query', periodSchema),
  async (c) => {
    const { period } = c.req.valid('query');

    let daysBack: number;
    switch (period) {
      case 'week':
        daysBack = 7;
        break;
      case 'year':
        daysBack = 365;
        break;
      default:
        daysBack = 30;
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const { results } = await c.env.DB.prepare(`
      SELECT
        type_soin,
        COUNT(*) as count,
        SUM(montant_demande) as montant_total,
        SUM(COALESCE(montant_rembourse, 0)) as montant_rembourse
      FROM sante_demandes
      WHERE deleted_at IS NULL
        AND created_at >= ?
      GROUP BY type_soin
      ORDER BY count DESC
    `).bind(startDate.toISOString()).all<{
      type_soin: string;
      count: number;
      montant_total: number;
      montant_rembourse: number;
    }>();

    const total = results.reduce((s, r) => s + r.count, 0);

    return success(c, results.map((r) => ({
      typeSoin: r.type_soin,
      count: r.count,
      montantTotal: r.montant_total || 0,
      montantRembourse: r.montant_rembourse || 0,
      pourcentage: total > 0 ? (r.count / total) * 100 : 0,
    })));
  }
);

/**
 * GET /api/v1/sante/stats/par-statut
 * Get stats by status
 */
stats.get(
  '/par-statut',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'ADMIN'),
  async (c) => {
    const { results } = await c.env.DB.prepare(`
      SELECT
        statut,
        COUNT(*) as count
      FROM sante_demandes
      WHERE deleted_at IS NULL
      GROUP BY statut
      ORDER BY count DESC
    `).all<{ statut: string; count: number }>();

    const total = results.reduce((s, r) => s + r.count, 0);

    return success(c, results.map((r) => ({
      statut: r.statut,
      count: r.count,
      pourcentage: total > 0 ? (r.count / total) * 100 : 0,
    })));
  }
);

/**
 * GET /api/v1/sante/stats/top-praticiens
 * Get top practitioners by volume
 */
stats.get(
  '/top-praticiens',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'ADMIN'),
  zValidator('query', z.object({ limit: z.coerce.number().optional().default(10) })),
  async (c) => {
    const { limit } = c.req.valid('query');

    const { results } = await c.env.DB.prepare(`
      SELECT
        p.id,
        p.nom,
        p.specialite,
        COUNT(d.id) as nb_demandes,
        SUM(d.montant_demande) as montant_total
      FROM sante_praticiens p
      JOIN sante_demandes d ON d.praticien_id = p.id
      WHERE p.deleted_at IS NULL AND d.deleted_at IS NULL
      GROUP BY p.id
      ORDER BY nb_demandes DESC
      LIMIT ?
    `).bind(limit).all<{
      id: string;
      nom: string;
      specialite: string;
      nb_demandes: number;
      montant_total: number;
    }>();

    return success(c, results.map((r) => ({
      id: r.id,
      nom: r.nom,
      specialite: r.specialite || 'Non specifie',
      nbDemandes: r.nb_demandes,
      montantTotal: r.montant_total || 0,
    })));
  }
);

/**
 * GET /api/v1/sante/stats/dashboard
 * Get complete dashboard data
 */
stats.get(
  '/dashboard',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'ADMIN'),
  zValidator('query', periodSchema),
  async (c) => {
    const { period } = c.req.valid('query');

    // Fetch all data in parallel
    const [kpisRes, tendancesRes, typeSoinRes, statutRes, topPraticiensRes] = await Promise.all([
      // KPIs
      (async () => {
        const today = new Date().toISOString().split('T')[0];
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
          .toISOString()
          .split('T')[0];

        const [demandesStats, fraudStats, adherentsStats, praticiensStats] = await Promise.all([
          c.env.DB.prepare(`
            SELECT
              COUNT(*) as total,
              COUNT(CASE WHEN statut IN ('soumise', 'en_examen', 'info_requise') THEN 1 END) as en_cours,
              COUNT(CASE WHEN statut = 'approuvee' OR statut = 'payee' THEN 1 END) as approuvees,
              COUNT(CASE WHEN statut = 'rejetee' THEN 1 END) as rejetees,
              COUNT(CASE WHEN DATE(created_at) = ? THEN 1 END) as aujourdhui,
              SUM(montant_demande) as montant_total_demande,
              SUM(COALESCE(montant_rembourse, 0)) as montant_total_rembourse,
              SUM(CASE WHEN statut IN ('approuvee', 'en_paiement') THEN COALESCE(montant_rembourse, 0) ELSE 0 END) as montant_en_attente,
              AVG(CASE WHEN statut IN ('approuvee', 'payee', 'rejetee')
                THEN (julianday(updated_at) - julianday(created_at)) * 24
                ELSE NULL END) as delai_moyen
            FROM sante_demandes
            WHERE deleted_at IS NULL
          `).bind(today).first(),
          c.env.DB.prepare(`
            SELECT
              COUNT(CASE WHEN score_fraude >= 70 THEN 1 END) as alertes,
              AVG(score_fraude) as score_moyen
            FROM sante_demandes
            WHERE deleted_at IS NULL AND score_fraude IS NOT NULL
          `).first(),
          c.env.DB.prepare(`
            SELECT
              COUNT(CASE WHEN a.is_active = 1 THEN 1 END) as actifs,
              COUNT(CASE WHEN DATE(a.created_at) >= ? THEN 1 END) as nouveaux
            FROM adherents a
            JOIN sante_adherents sa ON a.id = sa.adherent_id
            WHERE a.deleted_at IS NULL
          `).bind(startOfMonth).first(),
          c.env.DB.prepare(`
            SELECT
              COUNT(*) as actifs,
              COUNT(CASE WHEN conventionnement = 'conventionne' THEN 1 END) as conventionnes
            FROM sante_praticiens
            WHERE deleted_at IS NULL AND est_actif = 1
          `).first(),
        ]);

        const ds = demandesStats as Record<string, number | null> | null;
        const fs = fraudStats as Record<string, number | null> | null;
        const as = adherentsStats as Record<string, number | null> | null;
        const ps = praticiensStats as Record<string, number | null> | null;

        const total = ds?.total || 0;
        const montantDemande = ds?.montant_total_demande || 0;
        const montantRembourse = ds?.montant_total_rembourse || 0;

        return {
          demandesTotal: total,
          demandesEnCours: ds?.en_cours || 0,
          demandesApprouvees: ds?.approuvees || 0,
          demandesRejetees: ds?.rejetees || 0,
          demandesAujourdhui: ds?.aujourdhui || 0,
          delaiMoyenTraitement: ds?.delai_moyen || 0,
          montantTotalDemande: montantDemande,
          montantTotalRembourse: montantRembourse,
          montantEnAttente: ds?.montant_en_attente || 0,
          tauxRemboursementMoyen: montantDemande > 0 ? (montantRembourse / montantDemande) * 100 : 0,
          alertesFraude: fs?.alertes || 0,
          scoreRisqueMoyen: fs?.score_moyen || 0,
          adherentsActifs: as?.actifs || 0,
          nouveauxAdherents: as?.nouveaux || 0,
          praticiensActifs: ps?.actifs || 0,
          praticiensConventionnes: ps?.conventionnes || 0,
        };
      })(),

      // Tendances
      (async () => {
        let daysBack: number;
        let dateFormat: string;
        switch (period) {
          case 'week':
            daysBack = 7;
            dateFormat = '%Y-%m-%d';
            break;
          case 'year':
            daysBack = 365;
            dateFormat = '%Y-%m';
            break;
          default:
            daysBack = 30;
            dateFormat = '%Y-%m-%d';
        }
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);

        const { results } = await c.env.DB.prepare(`
          SELECT
            strftime('${dateFormat}', created_at) as date,
            COUNT(*) as demandes,
            SUM(montant_demande) as montant_demande,
            SUM(COALESCE(montant_rembourse, 0)) as montant_rembourse
          FROM sante_demandes
          WHERE deleted_at IS NULL AND created_at >= ?
          GROUP BY strftime('${dateFormat}', created_at)
          ORDER BY date
        `).bind(startDate.toISOString()).all();

        return (results as Array<Record<string, unknown>>).map((r) => ({
          date: r.date as string,
          demandes: r.demandes as number,
          montantDemande: (r.montant_demande as number) || 0,
          montantRembourse: (r.montant_rembourse as number) || 0,
        }));
      })(),

      // Par type soin
      (async () => {
        let daysBack: number;
        switch (period) {
          case 'week':
            daysBack = 7;
            break;
          case 'year':
            daysBack = 365;
            break;
          default:
            daysBack = 30;
        }
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - daysBack);

        const { results } = await c.env.DB.prepare(`
          SELECT
            type_soin,
            COUNT(*) as count,
            SUM(montant_demande) as montant_total,
            SUM(COALESCE(montant_rembourse, 0)) as montant_rembourse
          FROM sante_demandes
          WHERE deleted_at IS NULL AND created_at >= ?
          GROUP BY type_soin
          ORDER BY count DESC
        `).bind(startDate.toISOString()).all();

        const total = (results as Array<{ count: number }>).reduce((s, r) => s + r.count, 0);
        return (results as Array<Record<string, unknown>>).map((r) => ({
          typeSoin: r.type_soin as string,
          count: r.count as number,
          montantTotal: (r.montant_total as number) || 0,
          montantRembourse: (r.montant_rembourse as number) || 0,
          pourcentage: total > 0 ? ((r.count as number) / total) * 100 : 0,
        }));
      })(),

      // Par statut
      (async () => {
        const { results } = await c.env.DB.prepare(`
          SELECT statut, COUNT(*) as count
          FROM sante_demandes
          WHERE deleted_at IS NULL
          GROUP BY statut
          ORDER BY count DESC
        `).all();

        const total = (results as Array<{ count: number }>).reduce((s, r) => s + r.count, 0);
        return (results as Array<Record<string, unknown>>).map((r) => ({
          statut: r.statut as string,
          count: r.count as number,
          pourcentage: total > 0 ? ((r.count as number) / total) * 100 : 0,
        }));
      })(),

      // Top praticiens
      (async () => {
        const { results } = await c.env.DB.prepare(`
          SELECT
            p.id, p.nom, p.specialite,
            COUNT(d.id) as nb_demandes,
            SUM(d.montant_demande) as montant_total
          FROM sante_praticiens p
          JOIN sante_demandes d ON d.praticien_id = p.id
          WHERE p.deleted_at IS NULL AND d.deleted_at IS NULL
          GROUP BY p.id
          ORDER BY nb_demandes DESC
          LIMIT 10
        `).all();

        return (results as Array<Record<string, unknown>>).map((r) => ({
          id: r.id as string,
          nom: r.nom as string,
          specialite: (r.specialite as string) || 'Non specifie',
          nbDemandes: r.nb_demandes as number,
          montantTotal: (r.montant_total as number) || 0,
        }));
      })(),
    ]);

    return success(c, {
      kpis: kpisRes,
      tendances: tendancesRes,
      parTypeSoin: typeSoinRes,
      parStatut: statutRes,
      topPraticiens: topPraticiensRes,
    });
  }
);

export { stats };
