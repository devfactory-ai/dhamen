/**
 * SoinFlow Tarification Agent
 *
 * Main agent for calculating health reimbursement coverage amounts.
 * Uses formules de garantie, taux de couverture, and plafonds
 * to determine how much is covered and patient's out-of-pocket.
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../types';
import type {
  SanteTarificationRequest,
  SanteTarificationResult,
  TarificationDetails,
  TarificationAvertissement,
  FormuleRow,
  PraticienRow,
  PlafondConsommeRow,
} from './sante-tarification.types';

// Bonus for conventionné praticien (extra 10%)
const BONUS_CONVENTIONNE = 10;

// Threshold for high amount warning (in millimes = 1000 DT)
const SEUIL_MONTANT_ELEVE = 1000000;

/**
 * Main tarification calculation function for SoinFlow
 */
export async function calculateSanteTarification(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  request: SanteTarificationRequest
): Promise<SanteTarificationResult> {
  const startTime = Date.now();
  const avertissements: TarificationAvertissement[] = [];

  // Fetch required data in parallel
  const [formule, praticien, plafondsConsommes] = await Promise.all([
    getFormule(c, request.formuleId),
    request.praticienId ? getPraticien(c, request.praticienId) : Promise.resolve(null),
    getPlafondsConsommes(c, request.adherentId, request.dateSoin),
  ]);

  // If no formule found, return zero coverage
  if (!formule) {
    avertissements.push({
      code: 'FORMULE_NON_TROUVEE',
      message: 'Formule de garantie non trouvée',
      severite: 'erreur',
    });

    return buildZeroResult(request.montantDemande, avertissements, startTime);
  }

  // Parse formule rates and ceilings
  let tauxCouverture: Record<string, number>;
  let plafonds: Record<string, number>;

  try {
    tauxCouverture = JSON.parse(formule.taux_couverture_json);
    plafonds = JSON.parse(formule.plafonds_json);
  } catch {
    avertissements.push({
      code: 'FORMULE_NON_TROUVEE',
      message: 'Erreur de lecture de la formule',
      severite: 'erreur',
    });
    return buildZeroResult(request.montantDemande, avertissements, startTime);
  }

  // Get base rate for this type of care
  const tauxBase = tauxCouverture[request.typeSoin] ?? 0;

  if (tauxBase === 0) {
    avertissements.push({
      code: 'TYPE_SOIN_NON_COUVERT',
      message: `Le type de soin "${request.typeSoin}" n'est pas couvert par cette formule`,
      severite: 'erreur',
    });
    return buildZeroResult(request.montantDemande, avertissements, startTime);
  }

  // Check if praticien is conventionné
  const estConventionne = praticien?.est_conventionne === 1;
  const bonusConventionne = estConventionne ? BONUS_CONVENTIONNE : 0;

  if (praticien && !estConventionne) {
    avertissements.push({
      code: 'PRATICIEN_NON_CONVENTIONNE',
      message: 'Praticien hors réseau conventionné',
      severite: 'avertissement',
    });
  }

  // Calculate final rate (base + bonus, max 100%)
  const tauxFinal = Math.min(100, tauxBase + bonusConventionne);

  // Calculate coverage before ceiling
  const montantAvantPlafond = Math.round((request.montantDemande * tauxFinal) / 100);

  // Get applicable ceiling
  const plafondTypeSoin = plafonds[request.typeSoin] ?? null;
  const plafondGlobal = formule.plafond_global;

  // Calculate consumed amounts
  const consommeTypeSoin = plafondsConsommes
    .filter((p) => p.type_soin === request.typeSoin)
    .reduce((sum, p) => sum + p.montant_consomme, 0);

  const consommeGlobal = plafondsConsommes
    .filter((p) => p.type_soin === 'global')
    .reduce((sum, p) => sum + p.montant_consomme, 0);

  // Calculate remaining ceiling
  let plafondRestant: number | null = null;

  if (plafondTypeSoin !== null) {
    const restantTypeSoin = plafondTypeSoin - consommeTypeSoin;
    plafondRestant = restantTypeSoin;
  }

  if (plafondGlobal !== null) {
    const restantGlobal = plafondGlobal - consommeGlobal;
    if (plafondRestant === null || restantGlobal < plafondRestant) {
      plafondRestant = restantGlobal;
    }
  }

  // Apply ceiling
  let montantApresPlafond = montantAvantPlafond;
  let plafondApplique = false;

  if (plafondRestant !== null && plafondRestant < montantAvantPlafond) {
    montantApresPlafond = Math.max(0, plafondRestant);
    plafondApplique = true;

    if (plafondRestant <= 0) {
      avertissements.push({
        code: 'PLAFOND_DEPASSE',
        message: 'Plafond annuel épuisé',
        severite: 'erreur',
        details: { plafondRestant: 0 },
      });
    } else {
      avertissements.push({
        code: 'PLAFOND_DEPASSE',
        message: `Couverture limitée au plafond restant de ${plafondRestant} millimes`,
        severite: 'avertissement',
        details: { plafondRestant, montantReduit: montantAvantPlafond - montantApresPlafond },
      });
    }
  } else if (
    plafondRestant !== null &&
    montantAvantPlafond > plafondRestant * 0.8
  ) {
    // Warn if using more than 80% of remaining ceiling
    avertissements.push({
      code: 'PLAFOND_PROCHE',
      message: 'Plafond annuel bientôt atteint',
      severite: 'info',
      details: { plafondRestant, pourcentageUtilise: Math.round((montantAvantPlafond / plafondRestant) * 100) },
    });
  }

  // Calculate final amounts
  const montantCouvert = montantApresPlafond;
  const montantResteCharge = request.montantDemande - montantCouvert;

  // Check for high amount
  if (request.montantDemande > SEUIL_MONTANT_ELEVE) {
    avertissements.push({
      code: 'MONTANT_ELEVE',
      message: 'Montant élevé - vérification recommandée',
      severite: 'info',
      details: { seuil: SEUIL_MONTANT_ELEVE },
    });
  }

  // Build details
  const details: TarificationDetails = {
    formuleCode: formule.code,
    formuleName: formule.nom,
    typeSoin: request.typeSoin,
    tauxBase,
    bonusConventionne,
    tauxFinal,
    plafondTypeSoin,
    plafondRestant,
    montantAvantPlafond,
    montantApresPlafond,
    depassementHonoraires: 0, // Could be extended for honorary excess
  };

  return {
    montantDemande: request.montantDemande,
    montantEligible: request.montantDemande,
    montantCouvert,
    montantResteCharge,
    tauxCouverture: tauxFinal,
    plafondApplique,
    details,
    avertissements,
    tempsCalcul: Date.now() - startTime,
  };
}

/**
 * Build zero coverage result
 */
function buildZeroResult(
  montantDemande: number,
  avertissements: TarificationAvertissement[],
  startTime: number
): SanteTarificationResult {
  return {
    montantDemande,
    montantEligible: 0,
    montantCouvert: 0,
    montantResteCharge: montantDemande,
    tauxCouverture: 0,
    plafondApplique: false,
    details: {
      formuleCode: '',
      formuleName: '',
      typeSoin: 'autre',
      tauxBase: 0,
      bonusConventionne: 0,
      tauxFinal: 0,
      plafondTypeSoin: null,
      plafondRestant: null,
      montantAvantPlafond: 0,
      montantApresPlafond: 0,
      depassementHonoraires: 0,
    },
    avertissements,
    tempsCalcul: Date.now() - startTime,
  };
}

// =============================================================================
// Database Queries
// =============================================================================

/**
 * Get formule by ID
 */
async function getFormule(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  formuleId: string
): Promise<FormuleRow | null> {
  const result = await c.env.DB.prepare(`
    SELECT id, code, nom, taux_couverture_json, plafonds_json, plafond_global
    FROM sante_garanties_formules
    WHERE id = ? AND is_active = 1
    LIMIT 1
  `)
    .bind(formuleId)
    .first<FormuleRow>();

  return result || null;
}

/**
 * Get praticien by ID
 */
async function getPraticien(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  praticienId: string
): Promise<PraticienRow | null> {
  const result = await c.env.DB.prepare(`
    SELECT id, est_conventionne
    FROM sante_praticiens
    WHERE id = ? AND is_active = 1
    LIMIT 1
  `)
    .bind(praticienId)
    .first<PraticienRow>();

  return result || null;
}

/**
 * Get consumed plafonds for current year
 */
async function getPlafondsConsommes(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  adherentId: string,
  dateSoin: string
): Promise<PlafondConsommeRow[]> {
  const year = new Date(dateSoin).getFullYear();

  const results = await c.env.DB.prepare(`
    SELECT type_soin, montant_consomme, montant_plafond
    FROM sante_plafonds_consommes
    WHERE adherent_id = ? AND annee = ?
  `)
    .bind(adherentId, year)
    .all<PlafondConsommeRow>();

  return results.results || [];
}
