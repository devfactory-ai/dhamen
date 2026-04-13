/**
 * SoinFlow Export routes
 *
 * PDF and CSV exports for demandes, bordereaux, stats
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware, requireRole } from '../../middleware/auth';
import type { Bindings, Variables } from '../../types';
import { getDb } from '../../lib/db';
import {
  generatePDFHTML,
  generateCSV,
  formatAmount,
  formatDate,
  getStatusBadge,
  type TableColumn,
  type PDFContent,
} from '../../services/pdf-generator.service';

const exports = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
exports.use('*', authMiddleware());

// Query schemas
const demandesExportSchema = z.object({
  format: z.enum(['pdf', 'csv']).default('pdf'),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  statut: z.string().optional(),
  typeSoin: z.string().optional(),
});

const bordereauxExportSchema = z.object({
  format: z.enum(['pdf', 'csv']).default('pdf'),
  bordereauxId: z.string(),
});

/**
 * GET /api/v1/sante/exports/demandes
 * Export demandes list
 */
exports.get(
  '/demandes',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('query', demandesExportSchema),
  async (c) => {
    const { format, dateFrom, dateTo, statut, typeSoin } = c.req.valid('query');

    // Build query
    let query = `
      SELECT
        d.numero_demande,
        d.type_soin,
        d.statut,
        d.montant_demande,
        d.montant_rembourse,
        d.date_soin,
        d.created_at,
        a.first_name || ' ' || a.last_name as adherent_nom,
        COALESCE(sa.matricule, a.id) as matricule,
        p.nom as praticien_nom
      FROM sante_demandes d
      LEFT JOIN adherents a ON d.adherent_id = a.id
      LEFT JOIN sante_adherents sa ON a.id = sa.adherent_id
      LEFT JOIN sante_praticiens p ON d.praticien_id = p.id
      WHERE d.deleted_at IS NULL
    `;

    const params: unknown[] = [];

    if (dateFrom) {
      query += ` AND d.created_at >= ?`;
      params.push(dateFrom);
    }
    if (dateTo) {
      query += ` AND d.created_at <= ?`;
      params.push(dateTo + 'T23:59:59');
    }
    if (statut) {
      query += ` AND d.statut = ?`;
      params.push(statut);
    }
    if (typeSoin) {
      query += ` AND d.type_soin = ?`;
      params.push(typeSoin);
    }

    query += ` ORDER BY d.created_at DESC LIMIT 500`;

    const stmt = getDb(c).prepare(query);
    const { results } = await stmt.bind(...params).all<{
      numero_demande: string;
      type_soin: string;
      statut: string;
      montant_demande: number;
      montant_rembourse: number | null;
      date_soin: string;
      created_at: string;
      adherent_nom: string;
      matricule: string;
      praticien_nom: string | null;
    }>();

    const columns: TableColumn[] = [
      { key: 'numero_demande', header: 'N° Demande' },
      { key: 'matricule', header: 'Matricule' },
      { key: 'adherent_nom', header: 'Adherent' },
      { key: 'type_soin', header: 'Type' },
      { key: 'date_soin', header: 'Date Soin', format: (v) => formatDate(v as string) },
      {
        key: 'montant_demande',
        header: 'Montant',
        align: 'right',
        format: (v) => formatAmount(v as number),
      },
      {
        key: 'montant_rembourse',
        header: 'Rembourse',
        align: 'right',
        format: (v) => (v ? formatAmount(v as number) : '-'),
      },
      {
        key: 'statut',
        header: 'Statut',
        format: (v) => (format === 'pdf' ? getStatusBadge(v as string) : (v as string)),
      },
    ];

    if (format === 'csv') {
      const csv = generateCSV(columns, results);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="demandes_${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    // PDF (HTML)
    const totalDemande = results.reduce((s, r) => s + r.montant_demande, 0);
    const totalRembourse = results.reduce((s, r) => s + (r.montant_rembourse || 0), 0);

    const contents: PDFContent[] = [
      {
        type: 'summary',
        data: {
          items: [
            { label: 'Nombre de demandes', value: results.length.toString() },
            { label: 'Montant total demande', value: formatAmount(totalDemande) },
            { label: 'Montant total rembourse', value: formatAmount(totalRembourse) },
            {
              label: 'Taux de remboursement',
              value: totalDemande > 0 ? `${((totalRembourse / totalDemande) * 100).toFixed(1)}%` : '-',
            },
          ],
        },
      },
      { type: 'spacer', data: null },
      { type: 'heading', data: 'Liste des demandes' },
      { type: 'table', data: { columns, rows: results } },
    ];

    const html = generatePDFHTML(
      {
        title: 'Export Demandes de Remboursement',
        subtitle: `Periode: ${dateFrom || 'Debut'} - ${dateTo || "Aujourd'hui"}`,
      },
      contents
    );

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }
);

/**
 * GET /api/v1/sante/exports/bordereau/:id
 * Export single bordereau
 */
exports.get(
  '/bordereau/:id',
  requireRole('SOIN_GESTIONNAIRE', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator('query', z.object({ format: z.enum(['pdf', 'csv']).default('pdf') })),
  async (c) => {
    const id = c.req.param('id');
    const { format } = c.req.valid('query');

    // Get bordereau info
    const bordereau = await getDb(c).prepare(`
      SELECT
        b.*,
        p.nom as praticien_nom,
        p.adresse as praticien_adresse,
        p.ville as praticien_ville
      FROM sante_bordereaux b
      LEFT JOIN sante_praticiens p ON b.praticien_id = p.id
      WHERE b.id = ? AND b.deleted_at IS NULL
    `)
      .bind(id)
      .first<{
        id: string;
        numero_bordereau: string;
        praticien_id: string;
        date_debut: string;
        date_fin: string;
        montant_total: number;
        nb_demandes: number;
        statut: string;
        praticien_nom: string;
        praticien_adresse: string | null;
        praticien_ville: string | null;
      }>();

    if (!bordereau) {
      return c.json({ success: false, error: { message: 'Bordereau non trouve' } }, 404);
    }

    // Get demandes
    const { results: demandes } = await getDb(c).prepare(`
      SELECT
        d.numero_demande,
        d.type_soin,
        d.date_soin,
        d.montant_demande,
        d.montant_rembourse,
        a.first_name || ' ' || a.last_name as adherent_nom,
        COALESCE(sa.matricule, a.id) as matricule
      FROM sante_demandes d
      LEFT JOIN adherents a ON d.adherent_id = a.id
      LEFT JOIN sante_adherents sa ON a.id = sa.adherent_id
      WHERE d.bordereau_id = ? AND d.deleted_at IS NULL
      ORDER BY d.date_soin
    `)
      .bind(id)
      .all<{
        numero_demande: string;
        type_soin: string;
        date_soin: string;
        montant_demande: number;
        montant_rembourse: number | null;
        adherent_nom: string;
        matricule: string;
      }>();

    const columns: TableColumn[] = [
      { key: 'numero_demande', header: 'N° Demande' },
      { key: 'matricule', header: 'Matricule' },
      { key: 'adherent_nom', header: 'Adherent' },
      { key: 'type_soin', header: 'Type' },
      { key: 'date_soin', header: 'Date', format: (v) => formatDate(v as string) },
      {
        key: 'montant_demande',
        header: 'Demande',
        align: 'right',
        format: (v) => formatAmount(v as number),
      },
      {
        key: 'montant_rembourse',
        header: 'Rembourse',
        align: 'right',
        format: (v) => (v ? formatAmount(v as number) : '-'),
      },
    ];

    if (format === 'csv') {
      const csv = generateCSV(columns, demandes);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="bordereau_${bordereau.numero_bordereau}.csv"`,
        },
      });
    }

    // PDF (HTML)
    const contents: PDFContent[] = [
      {
        type: 'summary',
        data: {
          items: [
            { label: 'Numero Bordereau', value: bordereau.numero_bordereau },
            { label: 'Praticien', value: bordereau.praticien_nom },
            { label: 'Adresse', value: `${bordereau.praticien_adresse || ''}, ${bordereau.praticien_ville || ''}` },
            { label: 'Periode', value: `${formatDate(bordereau.date_debut)} - ${formatDate(bordereau.date_fin)}` },
            { label: 'Nombre de demandes', value: bordereau.nb_demandes.toString() },
            { label: 'Montant total', value: formatAmount(bordereau.montant_total) },
          ],
        },
      },
      { type: 'spacer', data: null },
      { type: 'heading', data: 'Detail des demandes' },
      { type: 'table', data: { columns, rows: demandes } },
    ];

    const html = generatePDFHTML(
      {
        title: `Bordereau ${bordereau.numero_bordereau}`,
        subtitle: `${bordereau.praticien_nom} - ${bordereau.praticien_ville || ''}`,
      },
      contents
    );

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }
);

/**
 * GET /api/v1/sante/exports/stats
 * Export statistics report
 */
exports.get(
  '/stats',
  requireRole('SOIN_GESTIONNAIRE', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN'),
  zValidator(
    'query',
    z.object({
      period: z.enum(['week', 'month', 'year']).default('month'),
    })
  ),
  async (c) => {
    const { period } = c.req.valid('query');

    let daysBack: number;
    let periodLabel: string;
    switch (period) {
      case 'week':
        daysBack = 7;
        periodLabel = 'Cette semaine';
        break;
      case 'year':
        daysBack = 365;
        periodLabel = 'Cette annee';
        break;
      default:
        daysBack = 30;
        periodLabel = 'Ce mois';
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Get stats
    const [globalStats, byTypeSoin, byStatut] = await Promise.all([
      getDb(c).prepare(`
        SELECT
          COUNT(*) as total,
          SUM(montant_demande) as montant_demande,
          SUM(COALESCE(montant_rembourse, 0)) as montant_rembourse
        FROM sante_demandes
        WHERE deleted_at IS NULL AND created_at >= ?
      `)
        .bind(startDate.toISOString())
        .first<{ total: number; montant_demande: number; montant_rembourse: number }>(),

      getDb(c).prepare(`
        SELECT
          type_soin,
          COUNT(*) as count,
          SUM(montant_demande) as montant
        FROM sante_demandes
        WHERE deleted_at IS NULL AND created_at >= ?
        GROUP BY type_soin
        ORDER BY count DESC
      `)
        .bind(startDate.toISOString())
        .all<{ type_soin: string; count: number; montant: number }>(),

      getDb(c).prepare(`
        SELECT
          statut,
          COUNT(*) as count
        FROM sante_demandes
        WHERE deleted_at IS NULL AND created_at >= ?
        GROUP BY statut
      `)
        .bind(startDate.toISOString())
        .all<{ statut: string; count: number }>(),
    ]);

    const contents: PDFContent[] = [
      {
        type: 'summary',
        data: {
          items: [
            { label: 'Periode', value: periodLabel },
            { label: 'Total demandes', value: (globalStats?.total || 0).toString() },
            { label: 'Montant total demande', value: formatAmount(globalStats?.montant_demande || 0) },
            { label: 'Montant total rembourse', value: formatAmount(globalStats?.montant_rembourse || 0) },
            {
              label: 'Taux remboursement',
              value:
                globalStats && globalStats.montant_demande > 0
                  ? `${((globalStats.montant_rembourse / globalStats.montant_demande) * 100).toFixed(1)}%`
                  : '-',
            },
          ],
        },
      },
      { type: 'spacer', data: null },
      { type: 'heading', data: 'Repartition par type de soin' },
      {
        type: 'table',
        data: {
          columns: [
            { key: 'type_soin', header: 'Type de Soin' },
            { key: 'count', header: 'Nombre', align: 'right' as const },
            { key: 'montant', header: 'Montant', align: 'right' as const, format: (v: unknown) => formatAmount(v as number) },
          ],
          rows: byTypeSoin.results,
        },
      },
      { type: 'heading', data: 'Repartition par statut' },
      {
        type: 'table',
        data: {
          columns: [
            { key: 'statut', header: 'Statut', format: (v: unknown) => getStatusBadge(v as string) },
            { key: 'count', header: 'Nombre', align: 'right' as const },
          ],
          rows: byStatut.results,
        },
      },
    ];

    const html = generatePDFHTML(
      {
        title: 'Rapport Statistiques SoinFlow',
        subtitle: periodLabel,
      },
      contents
    );

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }
);

/**
 * GET /api/v1/sante/exports/attestation/:adherentId
 * Generate attestation de droits
 */
exports.get(
  '/attestation/:adherentId',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'INSURER_ADMIN', 'INSURER_AGENT', 'ADMIN', 'ADHERENT'),
  async (c) => {
    const adherentId = c.req.param('adherentId');

    // Get adherent and formule info
    const adherent = await getDb(c).prepare(`
      SELECT
        a.id, a.first_name, a.last_name, a.birth_date, a.national_id,
        COALESCE(sa.matricule, a.id) as matricule,
        f.nom as formule_nom, f.code as formule_code, f.plafond_global
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
        birth_date: string | null;
        national_id: string | null;
        matricule: string;
        formule_nom: string | null;
        formule_code: string | null;
        plafond_global: number | null;
      }>();

    if (!adherent) {
      return c.json({ success: false, error: { message: 'Adherent non trouve' } }, 404);
    }

    // Get plafonds
    const year = new Date().getFullYear();
    const { results: plafonds } = await getDb(c).prepare(`
      SELECT type_soin, montant_plafond, montant_consomme
      FROM sante_plafonds_consommes
      WHERE adherent_id = ? AND annee = ?
    `)
      .bind(adherentId, year)
      .all<{ type_soin: string; montant_plafond: number; montant_consomme: number }>();

    const contents: PDFContent[] = [
      { type: 'heading', data: 'Informations Adherent' },
      {
        type: 'summary',
        data: {
          items: [
            { label: 'Nom', value: `${adherent.first_name} ${adherent.last_name}` },
            { label: 'Matricule', value: adherent.matricule },
            { label: 'Date de naissance', value: adherent.birth_date ? formatDate(adherent.birth_date) : '-' },
            { label: 'CIN', value: adherent.national_id || '-' },
          ],
        },
      },
      { type: 'spacer', data: null },
      { type: 'heading', data: 'Formule de Garantie' },
      {
        type: 'summary',
        data: {
          items: [
            { label: 'Formule', value: adherent.formule_nom || 'Non attribuee' },
            { label: 'Code', value: adherent.formule_code || '-' },
            { label: 'Plafond global', value: adherent.plafond_global ? formatAmount(adherent.plafond_global) : 'Illimite' },
          ],
        },
      },
    ];

    if (plafonds.length > 0) {
      contents.push({ type: 'spacer', data: null });
      contents.push({ type: 'heading', data: `Consommation ${year}` });
      contents.push({
        type: 'table',
        data: {
          columns: [
            { key: 'type_soin', header: 'Type de Soin' },
            { key: 'montant_plafond', header: 'Plafond', align: 'right' as const, format: (v: unknown) => formatAmount(v as number) },
            { key: 'montant_consomme', header: 'Consomme', align: 'right' as const, format: (v: unknown) => formatAmount(v as number) },
            {
              key: 'restant',
              header: 'Restant',
              align: 'right' as const,
              format: (_: unknown, row: unknown) => {
                const r = row as { montant_plafond: number; montant_consomme: number };
                return formatAmount(r.montant_plafond - r.montant_consomme);
              },
            },
          ],
          rows: plafonds.map((p) => ({ ...p, restant: p.montant_plafond - p.montant_consomme })),
        },
      });
    }

    const html = generatePDFHTML(
      {
        title: 'Attestation de Droits',
        subtitle: `${adherent.first_name} ${adherent.last_name} - ${adherent.matricule}`,
      },
      contents
    );

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  }
);

export { exports };
