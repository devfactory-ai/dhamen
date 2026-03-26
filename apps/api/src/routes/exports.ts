/**
 * Export Routes
 *
 * PDF and document export endpoints
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';
import { authMiddleware, requireRole } from '../middleware/auth';
import { PDFService } from '../services/pdf.service';
import { logAudit } from '../middleware/audit-trail';

const exports = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
exports.use('*', authMiddleware());

// =============================================================================
// Schemas
// =============================================================================

const exportPDFSchema = z.object({
  type: z.enum(['report', 'bordereau', 'facture', 'attestation', 'releve']),
  templateId: z.string().optional(),
  data: z.record(z.unknown()),
  options: z
    .object({
      format: z.enum(['A4', 'A5', 'Letter']).optional(),
      orientation: z.enum(['portrait', 'landscape']).optional(),
      header: z.string().optional(),
      footer: z.string().optional(),
      watermark: z.string().optional(),
    })
    .optional(),
});

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /exports/pdf
 * Generate PDF document
 */
exports.post(
  '/pdf',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', exportPDFSchema),
  async (c) => {
    const request = c.req.valid('json');
    const user = c.get('user');

    const pdfService = new PDFService(c.env);
    const result = await pdfService.generatePDF(request);

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'export.pdf.generate',
      entityType: 'exports',
      entityId: result.id,
      changes: { type: request.type, filename: result.filename },
    });

    return c.json({
      success: true,
      data: result,
    });
  }
);

/**
 * POST /exports/bordereau/:id/pdf
 * Generate PDF for a specific bordereau
 */
exports.post(
  '/bordereau/:id/pdf',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'INSURER_ADMIN', 'INSURER_AGENT'),
  async (c) => {
    const bordereauId = c.req.param('id');
    const user = c.get('user');

    // Fetch bordereau data
    const bordereau = await getDb(c).prepare(`
      SELECT b.*, p.nom as praticien_nom, p.adresse as praticien_adresse
      FROM sante_bordereaux b
      LEFT JOIN providers p ON b.praticien_id = p.id
      WHERE b.id = ?
    `)
      .bind(bordereauId)
      .first<{
        id: string;
        numero: string;
        praticien_nom: string;
        praticien_adresse: string;
        date_debut: string;
        date_fin: string;
        total: number;
      }>();

    if (!bordereau) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Bordereau non trouvé' } }, 404);
    }

    // Fetch bordereau lines
    const { results: lignes } = await getDb(c).prepare(`
      SELECT d.numero_demande, a.first_name, a.last_name, d.montant_rembourse, d.date_soin
      FROM sante_demandes d
      LEFT JOIN adherents a ON d.adherent_id = a.id
      WHERE d.bordereau_id = ?
    `)
      .bind(bordereauId)
      .all<{
        numero_demande: string;
        first_name: string;
        last_name: string;
        montant_rembourse: number;
        date_soin: string;
      }>();

    const pdfService = new PDFService(c.env);
    const result = await pdfService.generatePDF({
      type: 'bordereau',
      data: {
        numero: bordereau.numero,
        praticien: {
          nom: bordereau.praticien_nom,
          adresse: bordereau.praticien_adresse,
        },
        periode: {
          debut: bordereau.date_debut,
          fin: bordereau.date_fin,
        },
        lignes: lignes.map((l) => ({
          demande: l.numero_demande,
          adherent: `${l.first_name} ${l.last_name}`,
          montant: l.montant_rembourse,
          date: l.date_soin,
        })),
        total: bordereau.total,
      },
    });

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'export.bordereau.pdf',
      entityType: 'sante_bordereaux',
      entityId: bordereauId,
      changes: { filename: result.filename },
    });

    return c.json({ success: true, data: result });
  }
);

/**
 * POST /exports/attestation/:adherentId
 * Generate affiliation attestation for an adherent
 */
exports.post('/attestation/:adherentId', async (c) => {
  const adherentId = c.req.param('adherentId');
  const user = c.get('user');

  // Fetch adherent data
  const adherent = await getDb(c).prepare(`
    SELECT a.*, c.contract_number, c.name as contrat_nom, c.start_date, c.end_date,
           i.name as assureur_nom
    FROM adherents a
    LEFT JOIN contracts c ON a.contract_id = c.id
    LEFT JOIN insurers i ON c.insurer_id = i.id
    WHERE a.id = ?
  `)
    .bind(adherentId)
    .first<{
      id: string;
      first_name: string;
      last_name: string;
      matricule: string;
      date_of_birth: string;
      contract_number: string;
      contrat_nom: string;
      start_date: string;
      end_date: string;
      assureur_nom: string;
    }>();

  if (!adherent) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Adhérent non trouvé' } }, 404);
  }

  const pdfService = new PDFService(c.env);
  const result = await pdfService.generatePDF({
    type: 'attestation',
    data: {
      type: 'Assurance Santé - Tiers Payant',
      adherent: {
        nom: adherent.last_name,
        prenom: adherent.first_name,
        matricule: adherent.matricule,
        dateNaissance: adherent.date_of_birth,
      },
      contrat: {
        numero: adherent.contract_number,
        assureur: adherent.assureur_nom,
        validite: {
          debut: adherent.start_date,
          fin: adherent.end_date,
        },
      },
      garanties: [
        { type: 'Pharmacie', taux: 80, plafond: 2000000 },
        { type: 'Consultation', taux: 70, plafond: 1500000 },
        { type: 'Hospitalisation', taux: 80, plafond: 10000000 },
        { type: 'Laboratoire', taux: 70, plafond: 1000000 },
      ],
    },
  });

  await logAudit(getDb(c), {
    userId: user.sub,
    action: 'export.attestation.generate',
    entityType: 'adherents',
    entityId: adherentId,
    changes: { filename: result.filename },
  });

  return c.json({ success: true, data: result });
});

/**
 * POST /exports/releve/:adherentId
 * Generate consumption statement for an adherent
 */
exports.post('/releve/:adherentId', async (c) => {
  const adherentId = c.req.param('adherentId');
  const user = c.get('user');
  const dateFrom = c.req.query('dateFrom') || new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const dateTo = c.req.query('dateTo') || new Date().toISOString().split('T')[0];

  // Fetch adherent
  const adherent = await getDb(c).prepare('SELECT * FROM adherents WHERE id = ?')
    .bind(adherentId)
    .first<{ id: string; first_name: string; last_name: string; matricule: string }>();

  if (!adherent) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Adhérent non trouvé' } }, 404);
  }

  // Fetch demandes
  const { results: demandes } = await getDb(c).prepare(`
    SELECT numero_demande, type_soin, date_soin, montant_rembourse
    FROM sante_demandes
    WHERE adherent_id = ? AND date_soin BETWEEN ? AND ? AND statut = 'payee'
    ORDER BY date_soin DESC
  `)
    .bind(adherentId, dateFrom, dateTo)
    .all<{ numero_demande: string; type_soin: string; date_soin: string; montant_rembourse: number }>();

  const total = demandes.reduce((sum, d) => sum + (d.montant_rembourse || 0), 0);

  const pdfService = new PDFService(c.env);
  const result = await pdfService.generatePDF({
    type: 'releve',
    data: {
      adherent: {
        nom: `${adherent.first_name} ${adherent.last_name}`,
        matricule: adherent.matricule,
      },
      periode: { debut: dateFrom, fin: dateTo },
      operations: demandes.map((d) => ({
        date: d.date_soin,
        type: d.type_soin,
        description: d.numero_demande,
        montant: d.montant_rembourse,
      })),
      solde: total,
    },
  });

  await logAudit(getDb(c), {
    userId: user.sub,
    action: 'export.releve.generate',
    entityType: 'adherents',
    entityId: adherentId,
    changes: { filename: result.filename, periode: { dateFrom, dateTo } },
  });

  return c.json({ success: true, data: result });
});

/**
 * GET /exports/history
 * Get export history
 */
exports.get('/history', requireRole('ADMIN', 'SOIN_GESTIONNAIRE'), async (c) => {
  const page = parseInt(c.req.query('page') || '1');
  const limit = Math.min(parseInt(c.req.query('limit') || '20'), 100);

  // In production, fetch from audit logs
  const history = [
    {
      id: 'EXP-001',
      type: 'bordereau',
      filename: 'bordereau-2025-02-26-EXP001.pdf',
      createdBy: 'Admin User',
      createdAt: '2025-02-26T10:00:00Z',
    },
    {
      id: 'EXP-002',
      type: 'report',
      filename: 'report-2025-02-25-EXP002.pdf',
      createdBy: 'Gestionnaire',
      createdAt: '2025-02-25T14:30:00Z',
    },
  ];

  return c.json({
    success: true,
    data: {
      exports: history,
      meta: { page, limit, total: history.length },
    },
  });
});

export { exports };
