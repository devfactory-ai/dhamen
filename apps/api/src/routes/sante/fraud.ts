/**
 * SoinFlow Fraud Detection Routes
 *
 * API endpoints for fraud alerts management
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables } from '../../types';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { generateId } from '../../lib/ulid';

const fraud = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
fraud.use('*', authMiddleware());

// Schemas
const listAlertsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  niveau: z.enum(['faible', 'moyen', 'eleve', 'critique']).optional(),
  statut: z.enum(['nouvelle', 'en_investigation', 'confirmee', 'rejetee']).optional(),
});

const resolveAlertSchema = z.object({
  resolution: z.enum(['confirmee', 'rejetee']),
  notes: z.string().min(1),
  actions: z.array(z.string()).optional(),
});

/**
 * GET /sante/fraud/stats
 * Get fraud detection statistics
 */
fraud.get('/stats', requireRole('ADMIN', 'SOIN_GESTIONNAIRE'), async (c) => {
  // Mock stats for now - in production, query from D1
  const stats = {
    totalAlertes: 127,
    nouvelles: 23,
    enInvestigation: 18,
    confirmees: 45,
    rejetees: 41,
    scoreMoyen: 62,
    montantSuspect: 85000000, // 85,000 TND in millimes
    parNiveau: {
      faible: 35,
      moyen: 48,
      eleve: 32,
      critique: 12,
    },
    tendance: [
      { date: '2025-01-01', alertes: 8, montant: 5200000 },
      { date: '2025-01-08', alertes: 12, montant: 7800000 },
      { date: '2025-01-15', alertes: 15, montant: 9500000 },
      { date: '2025-01-22', alertes: 10, montant: 6200000 },
      { date: '2025-01-29', alertes: 18, montant: 11000000 },
      { date: '2025-02-05', alertes: 14, montant: 8900000 },
      { date: '2025-02-12', alertes: 21, montant: 13500000 },
      { date: '2025-02-19', alertes: 16, montant: 10200000 },
    ],
  };

  return c.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /sante/fraud/alerts
 * List fraud alerts with filtering
 */
fraud.get(
  '/alerts',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE'),
  zValidator('query', listAlertsQuerySchema),
  async (c) => {
    const { page, limit, niveau, statut } = c.req.valid('query');

    // Mock alerts data
    let alerts = [
      {
        id: 'FRD-001',
        demandeId: 'DEM-2025-0145',
        demande: {
          numero: 'DEM-2025-0145',
          montant: 2500000,
          typeSoin: 'pharmacie',
          praticienNom: 'Pharmacie El Medina',
          adherentNom: 'Mohamed Ben Ali',
        },
        score: 85,
        niveau: 'critique' as const,
        reglesActivees: [
          { code: 'FREQ_HIGH', nom: 'Frequence elevee', description: 'Plus de 5 demandes en 7 jours', severite: 'elevee' as const, impactScore: 30 },
          { code: 'MONTANT_ANORMAL', nom: 'Montant anormal', description: 'Montant 3x superieur a la moyenne', severite: 'moyenne' as const, impactScore: 25 },
        ],
        analyseIA: {
          score: 82,
          confidence: 0.89,
          reasoning: 'Pattern de consommation inhabituel detecte. Frequence et montants eleves par rapport au profil historique.',
          flags: ['multiple_visits_same_day', 'amount_spike', 'new_provider'],
        },
        statut: 'nouvelle' as const,
        createdAt: '2025-02-26T10:30:00Z',
        updatedAt: '2025-02-26T10:30:00Z',
      },
      {
        id: 'FRD-002',
        demandeId: 'DEM-2025-0132',
        demande: {
          numero: 'DEM-2025-0132',
          montant: 15000000,
          typeSoin: 'hospitalisation',
          praticienNom: 'Clinique Les Oliviers',
          adherentNom: 'Fatima Gharbi',
        },
        score: 72,
        niveau: 'eleve' as const,
        reglesActivees: [
          { code: 'DUREE_SEJOUR', nom: 'Duree de sejour suspecte', description: 'Sejour anormalement long', severite: 'moyenne' as const, impactScore: 20 },
        ],
        statut: 'en_investigation' as const,
        investigateurId: 'USR-001',
        investigateurNom: 'Ahmed Investigateur',
        createdAt: '2025-02-25T14:20:00Z',
        updatedAt: '2025-02-26T09:15:00Z',
      },
      {
        id: 'FRD-003',
        demandeId: 'DEM-2025-0098',
        demande: {
          numero: 'DEM-2025-0098',
          montant: 450000,
          typeSoin: 'consultation',
          praticienNom: 'Dr. Karim Mansouri',
          adherentNom: 'Salem Trabelsi',
        },
        score: 45,
        niveau: 'moyen' as const,
        reglesActivees: [
          { code: 'DOUBLE_FACTUR', nom: 'Double facturation potentielle', description: 'Acte similaire facture recemment', severite: 'faible' as const, impactScore: 15 },
        ],
        statut: 'rejetee' as const,
        notes: 'Verification effectuee - pas de double facturation, erreur de saisie corrigee',
        createdAt: '2025-02-24T16:45:00Z',
        updatedAt: '2025-02-25T11:00:00Z',
        resolvedAt: '2025-02-25T11:00:00Z',
      },
    ];

    // Apply filters
    if (niveau) {
      alerts = alerts.filter((a) => a.niveau === niveau);
    }
    if (statut) {
      alerts = alerts.filter((a) => a.statut === statut);
    }

    const total = alerts.length;
    const startIndex = (page - 1) * limit;
    const paginatedAlerts = alerts.slice(startIndex, startIndex + limit);

    return c.json({
      success: true,
      data: {
        alerts: paginatedAlerts,
        meta: {
          page,
          limit,
          total,
        },
      },
    });
  }
);

/**
 * GET /sante/fraud/alerts/:id
 * Get single fraud alert details
 */
fraud.get('/alerts/:id', requireRole('ADMIN', 'SOIN_GESTIONNAIRE'), async (c) => {
  const alertId = c.req.param('id');

  // Mock single alert
  const alert = {
    id: alertId,
    demandeId: 'DEM-2025-0145',
    demande: {
      numero: 'DEM-2025-0145',
      montant: 2500000,
      typeSoin: 'pharmacie',
      praticienNom: 'Pharmacie El Medina',
      adherentNom: 'Mohamed Ben Ali',
    },
    score: 85,
    niveau: 'critique' as const,
    reglesActivees: [
      { code: 'FREQ_HIGH', nom: 'Frequence elevee', description: 'Plus de 5 demandes en 7 jours', severite: 'elevee' as const, impactScore: 30 },
    ],
    analyseIA: {
      score: 82,
      confidence: 0.89,
      reasoning: 'Pattern de consommation inhabituel detecte.',
      flags: ['multiple_visits_same_day'],
    },
    statut: 'nouvelle' as const,
    createdAt: '2025-02-26T10:30:00Z',
    updatedAt: '2025-02-26T10:30:00Z',
  };

  return c.json({
    success: true,
    data: alert,
  });
});

/**
 * POST /sante/fraud/alerts/:id/investigate
 * Start investigation on an alert
 */
fraud.post('/alerts/:id/investigate', requireRole('ADMIN', 'SOIN_GESTIONNAIRE'), async (c) => {
  const alertId = c.req.param('id');
  const user = c.get('user');

  // In production, update D1 record
  const alert = {
    id: alertId,
    statut: 'en_investigation',
    investigateurId: user.sub,
    investigateurNom: `${user.firstName} ${user.lastName}`,
    updatedAt: new Date().toISOString(),
  };

  return c.json({
    success: true,
    data: alert,
  });
});

/**
 * POST /sante/fraud/alerts/:id/resolve
 * Resolve a fraud alert
 */
fraud.post(
  '/alerts/:id/resolve',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE'),
  zValidator('json', resolveAlertSchema),
  async (c) => {
    const alertId = c.req.param('id');
    const { resolution, notes, actions } = c.req.valid('json');

    // In production, update D1 record
    const alert = {
      id: alertId,
      statut: resolution,
      notes,
      actions,
      resolvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return c.json({
      success: true,
      data: alert,
    });
  }
);

/**
 * GET /sante/fraud/patterns
 * Get detected fraud patterns
 */
fraud.get('/patterns', requireRole('ADMIN', 'SOIN_GESTIONNAIRE'), async (c) => {
  const patterns = [
    {
      id: 'PAT-001',
      nom: 'Surfacturation medicaments',
      description: 'Medicaments factures au-dessus du prix de reference',
      occurrences: 23,
      montantTotal: 12500000,
      praticiens: ['Pharmacie El Medina', 'Pharmacie Centrale'],
      adherents: ['Mohamed Ben Ali', 'Fatima Gharbi'],
      periode: '2025-02',
    },
    {
      id: 'PAT-002',
      nom: 'Fractionnement ordonnances',
      description: 'Ordonnances divisees pour maximiser les remboursements',
      occurrences: 15,
      montantTotal: 8200000,
      praticiens: ['Pharmacie du Lac'],
      adherents: ['Salem Trabelsi', 'Amel Bouazizi'],
      periode: '2025-02',
    },
  ];

  return c.json({
    success: true,
    data: patterns,
  });
});

/**
 * GET /sante/fraud/demande/:demandeId
 * Get alerts for a specific demande
 */
fraud.get('/demande/:demandeId', async (c) => {
  const demandeId = c.req.param('demandeId');

  // Mock - return empty or single alert
  const alerts: unknown[] = [];

  return c.json({
    success: true,
    data: alerts,
  });
});

export { fraud };
