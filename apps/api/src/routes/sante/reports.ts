/**
 * SoinFlow Reports Routes
 *
 * API endpoints for report generation (PDF/Excel/CSV)
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables } from '../../types';
import { getDb } from '../../lib/db';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { generatePrefixedId } from '../../lib/ulid';

const reports = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
reports.use('*', authMiddleware());

// Schemas
const listReportsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  templateId: z.string().optional(),
  format: z.enum(['pdf', 'excel', 'csv']).optional(),
});

const generateReportSchema = z.object({
  templateId: z.string().min(1),
  format: z.enum(['pdf', 'excel', 'csv']),
  parametres: z.record(z.unknown()),
});

// Report templates
const TEMPLATES = [
  {
    id: 'tpl-1',
    code: 'demandes-periode',
    nom: 'Rapport des demandes par periode',
    description: 'Liste des demandes de soins avec details et statuts',
    categorie: 'demandes',
    parametres: [
      { code: 'dateRange', label: 'Periode', type: 'dateRange', required: true },
      {
        code: 'statut',
        label: 'Statut',
        type: 'multiSelect',
        required: false,
        options: [
          { value: 'en_attente', label: 'En attente' },
          { value: 'approuvee', label: 'Approuvee' },
          { value: 'rejetee', label: 'Rejetee' },
          { value: 'payee', label: 'Payee' },
        ],
      },
    ],
    formats: ['pdf', 'excel', 'csv'],
  },
  {
    id: 'tpl-2',
    code: 'paiements-praticiens',
    nom: 'Paiements par praticien',
    description: 'Detail des paiements effectues par praticien',
    categorie: 'paiements',
    parametres: [
      { code: 'dateRange', label: 'Periode', type: 'dateRange', required: true },
    ],
    formats: ['pdf', 'excel'],
  },
  {
    id: 'tpl-3',
    code: 'statistiques-mensuelles',
    nom: 'Statistiques mensuelles',
    description: 'Resume statistique mensuel des activites',
    categorie: 'statistiques',
    parametres: [
      { code: 'mois', label: 'Mois', type: 'date', required: true },
    ],
    formats: ['pdf', 'excel'],
  },
  {
    id: 'tpl-4',
    code: 'fraude-alertes',
    nom: 'Alertes de fraude',
    description: 'Liste des alertes de fraude detectees',
    categorie: 'fraude',
    parametres: [
      { code: 'dateRange', label: 'Periode', type: 'dateRange', required: true },
    ],
    formats: ['pdf', 'excel'],
  },
  {
    id: 'tpl-5',
    code: 'adherents-consommation',
    nom: 'Consommation par adherent',
    description: 'Detail de la consommation par adherent',
    categorie: 'adherents',
    parametres: [
      { code: 'dateRange', label: 'Periode', type: 'dateRange', required: true },
    ],
    formats: ['pdf', 'excel', 'csv'],
  },
  {
    id: 'tpl-6',
    code: 'praticiens-activite',
    nom: 'Activite des praticiens',
    description: "Resume de l'activite par praticien",
    categorie: 'praticiens',
    parametres: [
      { code: 'dateRange', label: 'Periode', type: 'dateRange', required: true },
    ],
    formats: ['pdf', 'excel'],
  },
];

/**
 * GET /sante/reports/templates
 * Get available report templates
 */
reports.get('/templates', async (c) => {
  const categorie = c.req.query('categorie');

  let templates = [...TEMPLATES];
  if (categorie) {
    templates = templates.filter((t) => t.categorie === categorie);
  }

  return c.json({
    success: true,
    data: templates,
  });
});

/**
 * GET /sante/reports/stats
 * Get report generation statistics
 */
reports.get('/stats', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT', 'SOIN_GESTIONNAIRE'), async (c) => {
  const stats = {
    totalGenerated: 156,
    parFormat: {
      pdf: 89,
      excel: 52,
      csv: 15,
    },
    parCategorie: {
      demandes: 45,
      paiements: 32,
      statistiques: 28,
      fraude: 18,
      adherents: 22,
      praticiens: 11,
    },
    derniersRapports: [],
  };

  return c.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /sante/reports
 * List generated reports
 */
reports.get(
  '/',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('query', listReportsQuerySchema),
  async (c) => {
    const { page, limit } = c.req.valid('query');
    const user = c.get('user');

    // Mock generated reports
    const reportsData = [
      {
        id: 'RPT-001',
        templateId: 'tpl-1',
        templateNom: 'Rapport des demandes par periode',
        format: 'pdf' as const,
        statut: 'termine' as const,
        parametres: { dateRange: { start: '2025-02-01', end: '2025-02-26' } },
        fileUrl: 'https://dhamen-files.r2.dev/reports/RPT-001.pdf',
        fileSize: 245000,
        createdAt: '2025-02-26T10:30:00Z',
        completedAt: '2025-02-26T10:31:15Z',
        createdBy: { id: user.sub, nom: `${user.firstName} ${user.lastName}` },
      },
      {
        id: 'RPT-002',
        templateId: 'tpl-2',
        templateNom: 'Paiements par praticien',
        format: 'excel' as const,
        statut: 'termine' as const,
        parametres: { dateRange: { start: '2025-01-01', end: '2025-01-31' } },
        fileUrl: 'https://dhamen-files.r2.dev/reports/RPT-002.xlsx',
        fileSize: 128000,
        createdAt: '2025-02-25T14:20:00Z',
        completedAt: '2025-02-25T14:21:30Z',
        createdBy: { id: user.sub, nom: `${user.firstName} ${user.lastName}` },
      },
      {
        id: 'RPT-003',
        templateId: 'tpl-3',
        templateNom: 'Statistiques mensuelles',
        format: 'pdf' as const,
        statut: 'en_cours' as const,
        parametres: { mois: '2025-02' },
        createdAt: '2025-02-26T12:00:00Z',
        createdBy: { id: user.sub, nom: `${user.firstName} ${user.lastName}` },
      },
    ];

    return c.json({
      success: true,
      data: {
        reports: reportsData,
        meta: {
          page,
          limit,
          total: reportsData.length,
        },
      },
    });
  }
);

/**
 * POST /sante/reports/generate
 * Generate a new report
 */
reports.post(
  '/generate',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', generateReportSchema),
  async (c) => {
    const { templateId, format, parametres } = c.req.valid('json');
    const user = c.get('user');

    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) {
      return c.json(
        { success: false, error: { code: 'TEMPLATE_NOT_FOUND', message: 'Modele de rapport introuvable' } },
        404
      );
    }

    // Create report record
    const reportId = generatePrefixedId('RPT');
    const report = {
      id: reportId,
      templateId,
      templateNom: template.nom,
      format,
      statut: 'en_cours' as const,
      parametres,
      createdAt: new Date().toISOString(),
      createdBy: {
        id: user.sub,
        nom: `${user.firstName} ${user.lastName}`,
      },
    };

    // In production, queue report generation job
    // For now, simulate immediate completion
    const completedReport = {
      ...report,
      statut: 'termine' as const,
      fileUrl: `https://dhamen-files.r2.dev/reports/${reportId}.${format === 'excel' ? 'xlsx' : format}`,
      fileSize: Math.floor(Math.random() * 500000) + 50000,
      completedAt: new Date().toISOString(),
    };

    return c.json({
      success: true,
      data: completedReport,
    });
  }
);

/**
 * GET /sante/reports/:id/download
 * Get download URL for a report
 */
reports.get('/:id/download', async (c) => {
  const reportId = c.req.param('id');

  // In production, generate signed URL from R2
  const url = `https://dhamen-files.r2.dev/reports/${reportId}.pdf`;

  return c.json({
    success: true,
    data: { url },
  });
});

/**
 * DELETE /sante/reports/:id
 * Delete a generated report
 */
reports.delete('/:id', requireRole('ADMIN', 'SOIN_GESTIONNAIRE'), async (c) => {
  const reportId = c.req.param('id');

  // In production, delete from D1 and R2

  return c.json({
    success: true,
    message: 'Rapport supprime',
  });
});

export { reports };
