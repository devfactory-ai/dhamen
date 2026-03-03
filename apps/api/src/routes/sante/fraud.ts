/**
 * SoinFlow Fraud Detection Routes
 *
 * API endpoints for fraud alerts management
 * Derives fraud alerts from sante_demandes.score_fraude
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables } from '../../types';
import { authMiddleware, requireRole } from '../../middleware/auth';
import { getDb } from '../../lib/db';
import { generateId } from '../../lib/ulid';

const fraud = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
fraud.use('*', authMiddleware());

// Fraud score threshold for alert generation
const FRAUD_ALERT_THRESHOLD = 30;

/**
 * Derive fraud alert niveau from score
 */
function getNiveau(score: number): 'faible' | 'moyen' | 'eleve' | 'critique' {
  if (score >= 85) return 'critique';
  if (score >= 70) return 'eleve';
  if (score >= 50) return 'moyen';
  return 'faible';
}

/**
 * Map claim statut to fraud alert statut
 */
function getAlertStatut(claimStatut: string): 'nouvelle' | 'en_investigation' | 'confirmee' | 'rejetee' {
  switch (claimStatut) {
    case 'soumise':
      return 'nouvelle';
    case 'en_examen':
    case 'info_requise':
      return 'en_investigation';
    case 'rejetee':
      return 'confirmee';
    case 'approuvee':
    case 'en_paiement':
    case 'payee':
      return 'rejetee';
    default:
      return 'nouvelle';
  }
}

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
 * Get fraud detection statistics from real data
 */
fraud.get('/stats', requireRole('ADMIN', 'SOIN_GESTIONNAIRE'), async (c) => {
  const db = getDb(c);

  // Get aggregate stats from sante_demandes with score_fraude >= threshold
  const [totalStats, niveauStats, trendData] = await Promise.all([
    db.prepare(`
      SELECT
        COUNT(*) as total_alertes,
        COUNT(CASE WHEN statut = 'soumise' THEN 1 END) as nouvelles,
        COUNT(CASE WHEN statut IN ('en_examen', 'info_requise') THEN 1 END) as en_investigation,
        COUNT(CASE WHEN statut = 'rejetee' THEN 1 END) as confirmees,
        COUNT(CASE WHEN statut IN ('approuvee', 'en_paiement', 'payee') THEN 1 END) as rejetees,
        COALESCE(AVG(score_fraude), 0) as score_moyen,
        COALESCE(SUM(montant_demande), 0) as montant_suspect
      FROM sante_demandes
      WHERE score_fraude >= ?
    `).bind(FRAUD_ALERT_THRESHOLD).first<{
      total_alertes: number;
      nouvelles: number;
      en_investigation: number;
      confirmees: number;
      rejetees: number;
      score_moyen: number;
      montant_suspect: number;
    }>(),

    db.prepare(`
      SELECT
        COUNT(CASE WHEN score_fraude >= 30 AND score_fraude < 50 THEN 1 END) as faible,
        COUNT(CASE WHEN score_fraude >= 50 AND score_fraude < 70 THEN 1 END) as moyen,
        COUNT(CASE WHEN score_fraude >= 70 AND score_fraude < 85 THEN 1 END) as eleve,
        COUNT(CASE WHEN score_fraude >= 85 THEN 1 END) as critique
      FROM sante_demandes
      WHERE score_fraude >= ?
    `).bind(FRAUD_ALERT_THRESHOLD).first<{
      faible: number;
      moyen: number;
      eleve: number;
      critique: number;
    }>(),

    db.prepare(`
      SELECT
        date(created_at, 'weekday 0', '-6 days') as date,
        COUNT(*) as alertes,
        COALESCE(SUM(montant_demande), 0) as montant
      FROM sante_demandes
      WHERE score_fraude >= ?
      GROUP BY date(created_at, 'weekday 0', '-6 days')
      ORDER BY date ASC
      LIMIT 12
    `).bind(FRAUD_ALERT_THRESHOLD).all<{
      date: string;
      alertes: number;
      montant: number;
    }>(),
  ]);

  const stats = {
    totalAlertes: totalStats?.total_alertes ?? 0,
    nouvelles: totalStats?.nouvelles ?? 0,
    enInvestigation: totalStats?.en_investigation ?? 0,
    confirmees: totalStats?.confirmees ?? 0,
    rejetees: totalStats?.rejetees ?? 0,
    scoreMoyen: Math.round(totalStats?.score_moyen ?? 0),
    montantSuspect: totalStats?.montant_suspect ?? 0,
    parNiveau: {
      faible: niveauStats?.faible ?? 0,
      moyen: niveauStats?.moyen ?? 0,
      eleve: niveauStats?.eleve ?? 0,
      critique: niveauStats?.critique ?? 0,
    },
    tendance: (trendData.results || []).map((t) => ({
      date: t.date,
      alertes: t.alertes,
      montant: t.montant,
    })),
  };

  return c.json({
    success: true,
    data: stats,
  });
});

/**
 * GET /sante/fraud/alerts
 * List fraud alerts with filtering (derived from sante_demandes with high score_fraude)
 */
fraud.get(
  '/alerts',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE'),
  zValidator('query', listAlertsQuerySchema),
  async (c) => {
    const { page, limit, niveau, statut } = c.req.valid('query');
    const db = getDb(c);

    // Build WHERE clause
    let whereClause = `WHERE sd.score_fraude >= ${FRAUD_ALERT_THRESHOLD}`;
    const params: (string | number)[] = [];

    // Filter by niveau (score range)
    if (niveau === 'faible') {
      whereClause += ' AND sd.score_fraude >= 30 AND sd.score_fraude < 50';
    } else if (niveau === 'moyen') {
      whereClause += ' AND sd.score_fraude >= 50 AND sd.score_fraude < 70';
    } else if (niveau === 'eleve') {
      whereClause += ' AND sd.score_fraude >= 70 AND sd.score_fraude < 85';
    } else if (niveau === 'critique') {
      whereClause += ' AND sd.score_fraude >= 85';
    }

    // Filter by alert statut (mapped from claim statut)
    if (statut === 'nouvelle') {
      whereClause += " AND sd.statut = 'soumise'";
    } else if (statut === 'en_investigation') {
      whereClause += " AND sd.statut IN ('en_examen', 'info_requise')";
    } else if (statut === 'confirmee') {
      whereClause += " AND sd.statut = 'rejetee'";
    } else if (statut === 'rejetee') {
      whereClause += " AND sd.statut IN ('approuvee', 'en_paiement', 'payee')";
    }

    const offset = (page - 1) * limit;

    const [countResult, alertsResult] = await Promise.all([
      db.prepare(`SELECT COUNT(*) as total FROM sante_demandes sd ${whereClause}`)
        .bind(...params)
        .first<{ total: number }>(),

      db.prepare(`
        SELECT
          sd.id, sd.numero_demande, sd.type_soin, sd.statut,
          sd.montant_demande, sd.score_fraude, sd.notes_internes,
          sd.motif_rejet, sd.date_soin, sd.traite_par,
          sd.created_at, sd.updated_at,
          a.first_name || ' ' || a.last_name as adherent_nom,
          COALESCE(sp.nom || ' ' || COALESCE(sp.prenom, ''), sp.nom) as praticien_nom,
          u.first_name || ' ' || u.last_name as investigateur_nom
        FROM sante_demandes sd
        JOIN adherents a ON sd.adherent_id = a.id
        LEFT JOIN sante_praticiens sp ON sd.praticien_id = sp.id
        LEFT JOIN users u ON sd.traite_par = u.id
        ${whereClause}
        ORDER BY sd.score_fraude DESC, sd.created_at DESC
        LIMIT ? OFFSET ?
      `)
        .bind(...params, limit, offset)
        .all<{
          id: string;
          numero_demande: string;
          type_soin: string;
          statut: string;
          montant_demande: number;
          score_fraude: number;
          notes_internes: string | null;
          motif_rejet: string | null;
          date_soin: string;
          traite_par: string | null;
          created_at: string;
          updated_at: string;
          adherent_nom: string;
          praticien_nom: string | null;
          investigateur_nom: string | null;
        }>(),
    ]);

    const alerts = (alertsResult.results || []).map((row) => {
      const alertStatut = getAlertStatut(row.statut);
      const niv = getNiveau(row.score_fraude);

      return {
        id: row.id,
        demandeId: row.id,
        demande: {
          numero: row.numero_demande,
          montant: row.montant_demande,
          typeSoin: row.type_soin,
          praticienNom: row.praticien_nom || 'Inconnu',
          adherentNom: row.adherent_nom,
          dateSoin: row.date_soin,
        },
        score: row.score_fraude,
        niveau: niv,
        statut: alertStatut,
        notes: row.notes_internes,
        motifRejet: row.motif_rejet,
        investigateurId: row.traite_par,
        investigateurNom: row.investigateur_nom,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    });

    return c.json({
      success: true,
      data: {
        alerts,
        meta: {
          page,
          limit,
          total: countResult?.total ?? 0,
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
  const db = getDb(c);

  const row = await db.prepare(`
    SELECT
      sd.id, sd.numero_demande, sd.type_soin, sd.statut,
      sd.montant_demande, sd.montant_rembourse, sd.score_fraude,
      sd.notes_internes, sd.motif_rejet, sd.date_soin,
      sd.traite_par, sd.date_traitement,
      sd.created_at, sd.updated_at,
      sd.adherent_id, sd.praticien_id,
      a.first_name || ' ' || a.last_name as adherent_nom,
      a.matricule as adherent_matricule,
      COALESCE(sp.nom || ' ' || COALESCE(sp.prenom, ''), sp.nom) as praticien_nom,
      sp.type_praticien,
      u.first_name || ' ' || u.last_name as investigateur_nom
    FROM sante_demandes sd
    JOIN adherents a ON sd.adherent_id = a.id
    LEFT JOIN sante_praticiens sp ON sd.praticien_id = sp.id
    LEFT JOIN users u ON sd.traite_par = u.id
    WHERE sd.id = ? AND sd.score_fraude >= ?
  `).bind(alertId, FRAUD_ALERT_THRESHOLD).first<{
    id: string;
    numero_demande: string;
    type_soin: string;
    statut: string;
    montant_demande: number;
    montant_rembourse: number | null;
    score_fraude: number;
    notes_internes: string | null;
    motif_rejet: string | null;
    date_soin: string;
    traite_par: string | null;
    date_traitement: string | null;
    created_at: string;
    updated_at: string;
    adherent_id: string;
    praticien_id: string | null;
    adherent_nom: string;
    adherent_matricule: string | null;
    praticien_nom: string | null;
    type_praticien: string | null;
    investigateur_nom: string | null;
  }>();

  if (!row) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Alerte fraude non trouvee' } },
      404
    );
  }

  // Get related claims by same adherent (for pattern detection)
  const relatedClaims = await db.prepare(`
    SELECT id, numero_demande, type_soin, montant_demande, score_fraude, statut, date_soin
    FROM sante_demandes
    WHERE adherent_id = ? AND id != ?
    ORDER BY created_at DESC
    LIMIT 10
  `).bind(row.adherent_id, alertId).all<{
    id: string;
    numero_demande: string;
    type_soin: string;
    montant_demande: number;
    score_fraude: number | null;
    statut: string;
    date_soin: string;
  }>();

  // Get fraud rules config for context
  const rules = await db.prepare(`
    SELECT rule_code, rule_name, rule_description, severity, base_score
    FROM fraud_rules_config
    WHERE is_active = 1
    ORDER BY base_score DESC
  `).all<{
    rule_code: string;
    rule_name: string;
    rule_description: string;
    severity: string;
    base_score: number;
  }>();

  const alertStatut = getAlertStatut(row.statut);
  const niv = getNiveau(row.score_fraude);

  // Build triggered rules based on score level
  const triggeredRules = (rules.results || [])
    .filter((r) => r.base_score <= row.score_fraude)
    .map((r) => ({
      code: r.rule_code,
      nom: r.rule_name,
      description: r.rule_description,
      severite: r.severity,
      impactScore: r.base_score,
    }));

  return c.json({
    success: true,
    data: {
      id: row.id,
      demandeId: row.id,
      demande: {
        numero: row.numero_demande,
        montant: row.montant_demande,
        montantRembourse: row.montant_rembourse,
        typeSoin: row.type_soin,
        praticienNom: row.praticien_nom || 'Inconnu',
        praticienType: row.type_praticien,
        adherentNom: row.adherent_nom,
        adherentMatricule: row.adherent_matricule,
        dateSoin: row.date_soin,
      },
      score: row.score_fraude,
      niveau: niv,
      reglesActivees: triggeredRules,
      statut: alertStatut,
      notes: row.notes_internes,
      motifRejet: row.motif_rejet,
      investigateurId: row.traite_par,
      investigateurNom: row.investigateur_nom,
      dateTraitement: row.date_traitement,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      historique: (relatedClaims.results || []).map((rc) => ({
        demandeId: rc.id,
        numero: rc.numero_demande,
        typeSoin: rc.type_soin,
        montant: rc.montant_demande,
        scoreFraude: rc.score_fraude,
        statut: rc.statut,
        dateSoin: rc.date_soin,
      })),
    },
  });
});

/**
 * POST /sante/fraud/alerts/:id/investigate
 * Start investigation on an alert — sets claim statut to en_examen
 */
fraud.post('/alerts/:id/investigate', requireRole('ADMIN', 'SOIN_GESTIONNAIRE'), async (c) => {
  const alertId = c.req.param('id');
  const user = c.get('user');
  const db = getDb(c);

  // Verify alert exists and is actionable
  const claim = await db.prepare(
    'SELECT id, statut, score_fraude FROM sante_demandes WHERE id = ? AND score_fraude >= ?'
  ).bind(alertId, FRAUD_ALERT_THRESHOLD).first<{
    id: string;
    statut: string;
    score_fraude: number;
  }>();

  if (!claim) {
    return c.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Alerte fraude non trouvee' } },
      404
    );
  }

  if (claim.statut !== 'soumise') {
    return c.json(
      { success: false, error: { code: 'INVALID_STATUS', message: 'Cette alerte est deja en cours de traitement' } },
      400
    );
  }

  // Update claim to en_examen
  await db.prepare(`
    UPDATE sante_demandes
    SET statut = 'en_examen', traite_par = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(user.sub, alertId).run();

  // Audit log
  await db.prepare(`
    INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `).bind(
    generateId(),
    user.sub,
    'FRAUD_INVESTIGATE',
    'sante_demandes',
    alertId,
    JSON.stringify({ previousStatut: claim.statut, scoreFraude: claim.score_fraude })
  ).run();

  return c.json({
    success: true,
    data: {
      id: alertId,
      statut: 'en_investigation',
      investigateurId: user.sub,
      investigateurNom: `${user.firstName} ${user.lastName}`,
      updatedAt: new Date().toISOString(),
    },
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
    const user = c.get('user');
    const db = getDb(c);

    // Verify alert exists
    const claim = await db.prepare(
      'SELECT id, statut, score_fraude FROM sante_demandes WHERE id = ? AND score_fraude >= ?'
    ).bind(alertId, FRAUD_ALERT_THRESHOLD).first<{
      id: string;
      statut: string;
      score_fraude: number;
    }>();

    if (!claim) {
      return c.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Alerte fraude non trouvee' } },
        404
      );
    }

    const now = new Date().toISOString();

    if (resolution === 'confirmee') {
      // Fraud confirmed → reject the claim
      await db.prepare(`
        UPDATE sante_demandes
        SET statut = 'rejetee',
            motif_rejet = ?,
            notes_internes = COALESCE(notes_internes || ' | ', '') || ?,
            traite_par = ?,
            date_traitement = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).bind(
        `Fraude confirmee: ${notes}`,
        `[FRAUDE] ${notes}${actions ? ' Actions: ' + actions.join(', ') : ''}`,
        user.sub,
        alertId
      ).run();
    } else {
      // False alarm → add note, keep claim proceeding
      await db.prepare(`
        UPDATE sante_demandes
        SET notes_internes = COALESCE(notes_internes || ' | ', '') || ?,
            traite_par = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `).bind(
        `[FAUX POSITIF] ${notes}`,
        user.sub,
        alertId
      ).run();
    }

    // Audit log
    await db.prepare(`
      INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      generateId(),
      user.sub,
      'FRAUD_RESOLVE',
      'sante_demandes',
      alertId,
      JSON.stringify({ resolution, notes, actions, previousStatut: claim.statut })
    ).run();

    return c.json({
      success: true,
      data: {
        id: alertId,
        statut: resolution,
        notes,
        actions,
        resolvedAt: now,
        updatedAt: now,
      },
    });
  }
);

/**
 * GET /sante/fraud/patterns
 * Get detected fraud patterns aggregated from real data
 */
fraud.get('/patterns', requireRole('ADMIN', 'SOIN_GESTIONNAIRE'), async (c) => {
  const db = getDb(c);

  // Aggregate patterns by type_soin and praticien
  const [byTypeSoin, byPraticien] = await Promise.all([
    db.prepare(`
      SELECT
        sd.type_soin,
        COUNT(*) as occurrences,
        SUM(sd.montant_demande) as montant_total,
        AVG(sd.score_fraude) as score_moyen,
        GROUP_CONCAT(DISTINCT a.first_name || ' ' || a.last_name) as adherents
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      WHERE sd.score_fraude >= ?
      GROUP BY sd.type_soin
      ORDER BY occurrences DESC
    `).bind(FRAUD_ALERT_THRESHOLD).all<{
      type_soin: string;
      occurrences: number;
      montant_total: number;
      score_moyen: number;
      adherents: string;
    }>(),

    db.prepare(`
      SELECT
        COALESCE(sp.nom || ' ' || COALESCE(sp.prenom, ''), sp.nom) as praticien_nom,
        COUNT(*) as occurrences,
        SUM(sd.montant_demande) as montant_total,
        AVG(sd.score_fraude) as score_moyen,
        GROUP_CONCAT(DISTINCT a.first_name || ' ' || a.last_name) as adherents
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      LEFT JOIN sante_praticiens sp ON sd.praticien_id = sp.id
      WHERE sd.score_fraude >= ?
      GROUP BY sd.praticien_id
      HAVING COUNT(*) >= 1
      ORDER BY occurrences DESC
    `).bind(FRAUD_ALERT_THRESHOLD).all<{
      praticien_nom: string | null;
      occurrences: number;
      montant_total: number;
      score_moyen: number;
      adherents: string;
    }>(),
  ]);

  const patterns = [
    ...(byTypeSoin.results || []).map((row, i) => ({
      id: `PAT-TYPE-${String(i + 1).padStart(3, '0')}`,
      nom: `Alertes ${row.type_soin}`,
      description: `Demandes suspectes de type ${row.type_soin}`,
      occurrences: row.occurrences,
      montantTotal: row.montant_total,
      scoreMoyen: Math.round(row.score_moyen),
      adherents: row.adherents ? row.adherents.split(',').slice(0, 5) : [],
      periode: new Date().toISOString().slice(0, 7),
    })),
    ...(byPraticien.results || [])
      .filter((r) => r.occurrences >= 2)
      .map((row, i) => ({
        id: `PAT-PRAT-${String(i + 1).padStart(3, '0')}`,
        nom: `Volume eleve: ${row.praticien_nom || 'Inconnu'}`,
        description: `Praticien avec plusieurs demandes suspectes`,
        occurrences: row.occurrences,
        montantTotal: row.montant_total,
        scoreMoyen: Math.round(row.score_moyen),
        praticiens: [row.praticien_nom || 'Inconnu'],
        adherents: row.adherents ? row.adherents.split(',').slice(0, 5) : [],
        periode: new Date().toISOString().slice(0, 7),
      })),
  ];

  return c.json({
    success: true,
    data: patterns,
  });
});

/**
 * GET /sante/fraud/demande/:demandeId
 * Get fraud info for a specific demande
 */
fraud.get('/demande/:demandeId', async (c) => {
  const demandeId = c.req.param('demandeId');
  const db = getDb(c);

  const row = await db.prepare(`
    SELECT id, numero_demande, score_fraude, statut, montant_demande, type_soin,
           notes_internes, motif_rejet, created_at
    FROM sante_demandes
    WHERE id = ?
  `).bind(demandeId).first<{
    id: string;
    numero_demande: string;
    score_fraude: number | null;
    statut: string;
    montant_demande: number;
    type_soin: string;
    notes_internes: string | null;
    motif_rejet: string | null;
    created_at: string;
  }>();

  if (!row) {
    return c.json({ success: true, data: [] });
  }

  const hasAlert = row.score_fraude !== null && row.score_fraude >= FRAUD_ALERT_THRESHOLD;

  if (!hasAlert) {
    return c.json({
      success: true,
      data: {
        demandeId: row.id,
        scoreFraude: row.score_fraude ?? 0,
        alertes: [],
      },
    });
  }

  return c.json({
    success: true,
    data: {
      demandeId: row.id,
      scoreFraude: row.score_fraude,
      niveau: getNiveau(row.score_fraude!),
      alerteStatut: getAlertStatut(row.statut),
      alertes: [
        {
          id: row.id,
          score: row.score_fraude,
          niveau: getNiveau(row.score_fraude!),
          statut: getAlertStatut(row.statut),
          notes: row.notes_internes,
          createdAt: row.created_at,
        },
      ],
    },
  });
});

export { fraud };
