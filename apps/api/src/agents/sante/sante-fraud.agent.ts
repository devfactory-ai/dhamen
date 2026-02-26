/**
 * SoinFlow Fraud Detection Agent
 *
 * Main agent for detecting potentially fraudulent health reimbursement claims.
 * Uses frequency analysis, amount anomalies, and pattern detection.
 */

import type { Context } from 'hono';
import type { SanteTypeSoin } from '@dhamen/shared';
import type { Bindings, Variables } from '../../types';
import type {
  SanteFraudRequest,
  SanteFraudResult,
  RegleFraudeActivee,
  FrequenceAnalyse,
  MontantAnalyse,
  DemandeSimilaire,
  RegleFraudeConfig,
} from './sante-fraud.types';
import { getNiveauRisque, getActionRecommandee } from './sante-fraud.types';

// Seuils par défaut
const SEUIL_DEMANDES_JOUR = 3;
const SEUIL_DEMANDES_SEMAINE = 10;
const SEUIL_SCORE_Z = 3;
const SEUIL_SIMILARITE = 0.9;
const HEURES_SUSPECTES = [0, 1, 2, 3, 4, 5, 23];

/**
 * Main fraud detection function for SoinFlow
 */
export async function detectSanteFraud(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  request: SanteFraudRequest
): Promise<SanteFraudResult> {
  const startTime = Date.now();

  // Fetch all required data in parallel
  const [
    reglesFraude,
    demandesRecentes,
    frequenceData,
    statistiquesMontant,
    volumePraticien,
  ] = await Promise.all([
    getReglesFraude(c, request.typeSoin),
    getDemandesRecentes(c, request),
    getFrequenceDemandes(c, request.adherentId, request.dateSoin),
    getStatistiquesMontant(c, request.typeSoin),
    request.praticienId
      ? getVolumePraticien(c, request.praticienId, request.dateSoin)
      : Promise.resolve(0),
  ]);

  const reglesActivees: RegleFraudeActivee[] = [];
  const reglesParCode = new Map(reglesFraude.map((r) => [r.code, r]));

  // ============================================
  // Check 1: Duplicate detection
  // ============================================
  const doublon = detectDoublon(request, demandesRecentes);
  if (doublon) {
    const regle = reglesParCode.get('DOUBLON_DEMANDE');
    reglesActivees.push({
      code: 'DOUBLON_DEMANDE',
      nom: regle?.nom ?? 'Doublon détecté',
      description: `Demande similaire détectée (${Math.round(doublon.similarite * 100)}% de similarité)`,
      severite: 'elevee',
      impactScore: regle?.scoreBase ?? 40,
      details: {
        demandeId: doublon.id,
        dateSoin: doublon.dateSoin,
        similarite: doublon.similarite,
      },
    });
  }

  // ============================================
  // Check 2: Frequency analysis
  // ============================================
  const analyseFrequence: FrequenceAnalyse = {
    demandesAujourdhui: frequenceData.jour,
    demandesSemaine: frequenceData.semaine,
    demandesMois: frequenceData.mois,
    moyenneMensuelle: frequenceData.moyenneMensuelle,
    estAnormale: false,
  };

  if (frequenceData.jour >= SEUIL_DEMANDES_JOUR) {
    analyseFrequence.estAnormale = true;
    analyseFrequence.raisonAnomalie = `${frequenceData.jour} demandes aujourd'hui`;

    const regle = reglesParCode.get('FREQUENCE_ELEVEE');
    reglesActivees.push({
      code: 'FREQUENCE_ELEVEE',
      nom: regle?.nom ?? 'Fréquence élevée',
      description: `${frequenceData.jour} demandes le même jour`,
      severite: 'moyenne',
      impactScore: regle?.scoreBase ?? 20,
      details: { demandesJour: frequenceData.jour, seuil: SEUIL_DEMANDES_JOUR },
    });
  } else if (frequenceData.semaine >= SEUIL_DEMANDES_SEMAINE) {
    analyseFrequence.estAnormale = true;
    analyseFrequence.raisonAnomalie = `${frequenceData.semaine} demandes cette semaine`;

    const regle = reglesParCode.get('FREQUENCE_ELEVEE');
    reglesActivees.push({
      code: 'FREQUENCE_ELEVEE',
      nom: regle?.nom ?? 'Fréquence élevée',
      description: `${frequenceData.semaine} demandes cette semaine`,
      severite: 'faible',
      impactScore: Math.round((regle?.scoreBase ?? 20) * 0.5),
      details: { demandesSemaine: frequenceData.semaine, seuil: SEUIL_DEMANDES_SEMAINE },
    });
  }

  // ============================================
  // Check 3: Amount analysis
  // ============================================
  const scoreZ = calculateScoreZ(
    request.montant,
    statistiquesMontant.moyenne,
    statistiquesMontant.ecartType
  );

  const analyseMontant: MontantAnalyse = {
    montantDemande: request.montant,
    montantMoyen: statistiquesMontant.moyenne,
    ecartType: statistiquesMontant.ecartType,
    scoreZ,
    estAnormal: Math.abs(scoreZ) >= SEUIL_SCORE_Z,
  };

  if (analyseMontant.estAnormal) {
    const regle = reglesParCode.get('MONTANT_ANORMAL');
    reglesActivees.push({
      code: 'MONTANT_ANORMAL',
      nom: regle?.nom ?? 'Montant anormal',
      description: `Montant ${scoreZ > 0 ? 'anormalement élevé' : 'anormalement bas'} (Z-score: ${scoreZ.toFixed(2)})`,
      severite: Math.abs(scoreZ) >= 5 ? 'elevee' : 'moyenne',
      impactScore: Math.min(50, Math.abs(scoreZ) * 10),
      details: { scoreZ, moyenne: statistiquesMontant.moyenne, montant: request.montant },
    });
  }

  // ============================================
  // Check 4: Suspicious hours
  // ============================================
  if (request.heureSoin) {
    const heureParts = request.heureSoin.split(':');
    const heure = Number.parseInt(heureParts[0] ?? '0', 10);
    if (HEURES_SUSPECTES.includes(heure)) {
      const regle = reglesParCode.get('HEURE_SUSPECTE');
      reglesActivees.push({
        code: 'HEURE_SUSPECTE',
        nom: regle?.nom ?? 'Heure suspecte',
        description: `Soin déclaré à ${request.heureSoin} (heure inhabituelle)`,
        severite: 'faible',
        impactScore: regle?.scoreBase ?? 10,
        details: { heure: request.heureSoin },
      });
    }
  }

  // ============================================
  // Check 5: Provider volume
  // ============================================
  if (request.praticienId && volumePraticien > 50) {
    const regle = reglesParCode.get('PRATICIEN_VOLUME_ELEVE');
    reglesActivees.push({
      code: 'PRATICIEN_VOLUME_ELEVE',
      nom: regle?.nom ?? 'Volume praticien élevé',
      description: `Praticien avec ${volumePraticien} demandes aujourd'hui`,
      severite: volumePraticien > 100 ? 'elevee' : 'moyenne',
      impactScore: Math.min(30, volumePraticien * 0.3),
      details: { volumePraticien },
    });
  }

  // ============================================
  // Calculate final score
  // ============================================
  const scoreFraude = calculateScoreFinal(reglesActivees);
  const niveauRisque = getNiveauRisque(scoreFraude);
  const actionRecommandee = getActionRecommandee(niveauRisque, reglesActivees);

  return {
    demandeId: request.demandeId,
    scoreFraude,
    niveauRisque,
    actionRecommandee,
    reglesActivees,
    analyseFrequence,
    analyseMontant,
    tempsAnalyse: Date.now() - startTime,
  };
}

// =============================================================================
// Rule Functions
// =============================================================================

/**
 * Detect duplicate/similar claims
 */
function detectDoublon(
  request: SanteFraudRequest,
  demandesRecentes: DemandeSimilaire[]
): DemandeSimilaire | null {
  for (const demande of demandesRecentes) {
    if (demande.similarite >= SEUIL_SIMILARITE) {
      return demande;
    }
  }
  return null;
}

/**
 * Calculate Z-score for amount
 */
function calculateScoreZ(montant: number, moyenne: number, ecartType: number): number {
  if (ecartType === 0) {
    return 0;
  }
  return (montant - moyenne) / ecartType;
}

/**
 * Calculate final fraud score from triggered rules
 */
function calculateScoreFinal(regles: RegleFraudeActivee[]): number {
  if (regles.length === 0) {
    return 0;
  }

  // Sum impacts with diminishing returns
  let score = 0;
  const sortedRules = [...regles].sort((a, b) => b.impactScore - a.impactScore);

  for (let i = 0; i < sortedRules.length; i++) {
    // Each subsequent rule contributes less
    const factor = 1 / (1 + i * 0.5);
    const rule = sortedRules[i];
    if (rule) {
      score += rule.impactScore * factor;
    }
  }

  return Math.min(100, Math.round(score));
}

/**
 * Calculate similarity between two claims
 */
function calculateSimilarite(
  request: SanteFraudRequest,
  demande: { dateSoin: string; montant: number; typeSoin: string }
): number {
  let score = 0;
  let factors = 0;

  // Same day = high weight
  if (request.dateSoin === demande.dateSoin) {
    score += 0.4;
  }
  factors += 0.4;

  // Same type = medium weight
  if (request.typeSoin === demande.typeSoin) {
    score += 0.3;
  }
  factors += 0.3;

  // Similar amount (within 5%) = medium weight
  const amountDiff = Math.abs(request.montant - demande.montant) / Math.max(request.montant, demande.montant);
  if (amountDiff < 0.05) {
    score += 0.3;
  } else if (amountDiff < 0.1) {
    score += 0.15;
  }
  factors += 0.3;

  return score / factors;
}

// =============================================================================
// Database Queries
// =============================================================================

/**
 * Get fraud rules configuration
 */
async function getReglesFraude(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  typeSoin: SanteTypeSoin
): Promise<RegleFraudeConfig[]> {
  const results = await c.env.DB.prepare(`
    SELECT
      id, rule_code as code, rule_name as nom, rule_description as description,
      base_score as scoreBase, threshold_value as seuilActivation,
      severity as severite, care_type as typeSoin, is_active as estActive
    FROM fraud_rules_config
    WHERE (care_type = ? OR care_type IS NULL)
      AND is_active = 1
  `)
    .bind(typeSoin)
    .all<RegleFraudeConfig>();

  return (results.results || []).map((r) => ({
    ...r,
    estActive: Boolean(r.estActive),
  }));
}

/**
 * Get recent similar claims for duplicate detection
 */
async function getDemandesRecentes(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  request: SanteFraudRequest
): Promise<DemandeSimilaire[]> {
  const results = await c.env.DB.prepare(`
    SELECT id, date_soin as dateSoin, montant_demande as montant, type_soin as typeSoin
    FROM sante_demandes
    WHERE adherent_id = ?
      AND date_soin >= date(?, '-7 days')
      AND date_soin <= ?
      AND id != ?
    ORDER BY created_at DESC
    LIMIT 20
  `)
    .bind(request.adherentId, request.dateSoin, request.dateSoin, request.demandeId)
    .all<{ id: string; dateSoin: string; montant: number; typeSoin: string }>();

  return (results.results || []).map((demande) => ({
    id: demande.id,
    dateSoin: demande.dateSoin,
    montant: demande.montant,
    typeSoin: demande.typeSoin,
    similarite: calculateSimilarite(request, demande),
  }));
}

/**
 * Get claim frequency for adherent
 */
async function getFrequenceDemandes(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  adherentId: string,
  dateSoin: string
): Promise<{ jour: number; semaine: number; mois: number; moyenneMensuelle: number }> {
  const jourResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM sante_demandes
    WHERE adherent_id = ? AND date_soin = ?
  `)
    .bind(adherentId, dateSoin)
    .first<{ count: number }>();

  const semaineResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM sante_demandes
    WHERE adherent_id = ?
      AND date_soin >= date(?, '-7 days')
      AND date_soin <= ?
  `)
    .bind(adherentId, dateSoin, dateSoin)
    .first<{ count: number }>();

  const moisResult = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM sante_demandes
    WHERE adherent_id = ?
      AND date_soin >= date(?, '-30 days')
      AND date_soin <= ?
  `)
    .bind(adherentId, dateSoin, dateSoin)
    .first<{ count: number }>();

  // Average over last 6 months
  const moyenneResult = await c.env.DB.prepare(`
    SELECT COUNT(*) / 6.0 as avg FROM sante_demandes
    WHERE adherent_id = ?
      AND date_soin >= date(?, '-180 days')
      AND date_soin < date(?, '-30 days')
  `)
    .bind(adherentId, dateSoin, dateSoin)
    .first<{ avg: number }>();

  return {
    jour: jourResult?.count ?? 0,
    semaine: semaineResult?.count ?? 0,
    mois: moisResult?.count ?? 0,
    moyenneMensuelle: moyenneResult?.avg ?? 0,
  };
}

/**
 * Get amount statistics for care type
 */
async function getStatistiquesMontant(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  typeSoin: SanteTypeSoin
): Promise<{ moyenne: number; ecartType: number }> {
  const result = await c.env.DB.prepare(`
    SELECT
      AVG(montant_demande) as moyenne,
      SQRT(AVG(montant_demande * montant_demande) - AVG(montant_demande) * AVG(montant_demande)) as ecartType
    FROM sante_demandes
    WHERE type_soin = ?
      AND date_soin >= date('now', '-90 days')
      AND statut IN ('approuvee', 'payee')
  `)
    .bind(typeSoin)
    .first<{ moyenne: number; ecartType: number }>();

  return {
    moyenne: result?.moyenne ?? 0,
    ecartType: result?.ecartType ?? 1,
  };
}

/**
 * Get provider claims volume for today
 */
async function getVolumePraticien(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  praticienId: string,
  dateSoin: string
): Promise<number> {
  const result = await c.env.DB.prepare(`
    SELECT COUNT(*) as count FROM sante_demandes
    WHERE praticien_id = ? AND date_soin = ?
  `)
    .bind(praticienId, dateSoin)
    .first<{ count: number }>();

  return result?.count ?? 0;
}
