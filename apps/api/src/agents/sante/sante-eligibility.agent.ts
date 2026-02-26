/**
 * SoinFlow Eligibility Agent
 *
 * Main agent for verifying health reimbursement eligibility.
 * Uses formules de garantie, plafonds, and praticien network
 * to determine if a claim is eligible for coverage.
 *
 * SLA: < 100ms response time (uses KV caching)
 */

import type { Context } from 'hono';
import type { SanteTypeSoin } from '@dhamen/shared';
import type { Bindings, Variables } from '../../types';
import type {
  SanteEligibilityRequest,
  SanteEligibilityResult,
  AdherentRow,
  FormuleRow,
  PraticienRow,
  PlafondConsommeRow,
  EligibilityRaison,
  AdherentInfo,
  FormuleInfo,
  CouvertureInfo,
} from './sante-eligibility.types';
import {
  checkAdherentStatus,
  checkFormuleValidity,
  checkTypeSoinCoverage,
  checkPlafonds,
  checkPraticienNetwork,
  buildPlafondsInfo,
  evaluateSanteEligibility,
} from './sante-eligibility.rules';

// Cache TTL: 5 minutes for eligibility results
const CACHE_TTL_SECONDS = 300;

/**
 * Generate cache key for eligibility results
 */
function generateCacheKey(request: SanteEligibilityRequest): string {
  return `sante:eligibility:${request.adherentId}:${request.typeSoin}:${request.dateSoin}`;
}

/**
 * Main eligibility check function for SoinFlow
 */
export async function checkSanteEligibility(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  request: SanteEligibilityRequest
): Promise<SanteEligibilityResult> {
  const startTime = Date.now();
  const cacheKey = generateCacheKey(request);

  // Try cache first
  const cached = await getCachedResult(c, cacheKey);
  if (cached) {
    return {
      ...cached,
      cacheResult: true,
      tempsVerification: Date.now() - startTime,
    };
  }

  // Fetch all required data in parallel for performance
  const [adherent, praticien, plafondsConsommes] = await Promise.all([
    getAdherent(c, request.adherentId),
    request.praticienId ? getPraticien(c, request.praticienId) : Promise.resolve(null),
    getPlafondsConsommes(c, request.adherentId, request.dateSoin),
  ]);

  // Get formule if adherent has one
  const formule = adherent?.formule_id
    ? await getFormule(c, adherent.formule_id, request.dateSoin)
    : null;

  // Collect all raisons from rule checks
  const raisons: EligibilityRaison[] = [];

  // Rule 1: Adherent status
  raisons.push(...checkAdherentStatus(adherent));

  // If no valid adherent, skip remaining checks
  if (!adherent || raisons.some((r) => r.code === 'ADHERENT_NON_TROUVE' || r.code === 'ADHERENT_INACTIF')) {
    const result = buildResult(null, null, null, [], raisons, startTime, false);
    await cacheResult(c, cacheKey, result);
    return result;
  }

  // Rule 2: Formule validity
  raisons.push(...checkFormuleValidity(formule, request.dateSoin));

  // If no valid formule, skip remaining checks
  if (!formule || raisons.some((r) => r.severite === 'erreur' && r.code.startsWith('FORMULE_'))) {
    const adherentInfo = buildAdherentInfo(adherent);
    const result = buildResult(adherentInfo, null, null, [], raisons, startTime, false);
    await cacheResult(c, cacheKey, result);
    return result;
  }

  // Rule 3: Care type coverage
  raisons.push(...checkTypeSoinCoverage(formule, request.typeSoin));

  // Rule 4: Plafonds check
  const plafondResult = checkPlafonds(formule, request.typeSoin, request.montant, plafondsConsommes);
  raisons.push(...plafondResult.raisons);

  // Rule 5: Praticien network
  raisons.push(...checkPraticienNetwork(praticien));

  // Build response objects
  const adherentInfo = buildAdherentInfo(adherent);
  const formuleInfo = buildFormuleInfo(formule, request.typeSoin);
  const couvertureInfo = buildCouvertureInfo(
    formule,
    request.typeSoin,
    plafondResult.plafondRestant,
    plafondResult.montantMaxCouvert,
    praticien
  );
  const plafondsInfo = buildPlafondsInfo(formule, plafondsConsommes);

  // Evaluate eligibility
  const { eligible, scoreConfiance } = evaluateSanteEligibility(raisons);

  // Add final ELIGIBLE reason if eligible
  if (eligible) {
    raisons.push({
      code: 'ELIGIBLE',
      message: 'Adhérent éligible pour ce remboursement',
      severite: 'info',
    });
  }

  const result: SanteEligibilityResult = {
    eligible,
    adherent: adherentInfo,
    formule: formuleInfo,
    couverture: couvertureInfo,
    plafonds: plafondsInfo,
    raisons,
    scoreConfiance,
    tempsVerification: Date.now() - startTime,
    cacheResult: false,
  };

  // Cache the result
  await cacheResult(c, cacheKey, result);

  return result;
}

/**
 * Build adherent info for response
 */
function buildAdherentInfo(adherent: AdherentRow | null): AdherentInfo | null {
  if (!adherent) {
    return null;
  }

  return {
    id: adherent.id,
    nom: adherent.last_name,
    prenom: adherent.first_name,
    matricule: adherent.matricule,
    dateNaissance: adherent.date_of_birth,
    estActif: adherent.is_active === 1,
  };
}

/**
 * Build formule info for response
 */
function buildFormuleInfo(formule: FormuleRow | null, typeSoin: SanteTypeSoin): FormuleInfo | null {
  if (!formule) {
    return null;
  }

  let tauxCouverture = 0;
  try {
    const taux = JSON.parse(formule.taux_couverture_json) as Record<string, number>;
    tauxCouverture = taux[typeSoin] ?? 0;
  } catch {
    // Default to 0
  }

  return {
    id: formule.id,
    code: formule.code,
    nom: formule.nom,
    plafondGlobal: formule.plafond_global,
    tauxCouverture,
  };
}

/**
 * Build couverture info for response
 */
function buildCouvertureInfo(
  formule: FormuleRow | null,
  typeSoin: SanteTypeSoin,
  plafondRestant: number,
  montantMaxCouvert: number,
  praticien: PraticienRow | null
): CouvertureInfo | null {
  if (!formule) {
    return null;
  }

  let tauxCouverture = 0;
  let plafond: number | null = null;

  try {
    const taux = JSON.parse(formule.taux_couverture_json) as Record<string, number>;
    tauxCouverture = taux[typeSoin] ?? 0;

    const plafonds = JSON.parse(formule.plafonds_json) as Record<string, number>;
    plafond = plafonds[typeSoin] ?? formule.plafond_global ?? null;
  } catch {
    // Use defaults
  }

  return {
    typeSoin,
    tauxCouverture,
    plafond,
    plafondRestant: plafondRestant === Number.MAX_SAFE_INTEGER ? -1 : plafondRestant,
    montantMaxCouvert,
    estConventionne: praticien?.est_conventionne === 1,
  };
}

/**
 * Build result helper
 */
function buildResult(
  adherent: AdherentInfo | null,
  formule: FormuleInfo | null,
  couverture: CouvertureInfo | null,
  plafonds: SanteEligibilityResult['plafonds'],
  raisons: EligibilityRaison[],
  startTime: number,
  cacheResult: boolean
): SanteEligibilityResult {
  const { eligible, scoreConfiance } = evaluateSanteEligibility(raisons);

  return {
    eligible,
    adherent,
    formule,
    couverture,
    plafonds,
    raisons,
    scoreConfiance,
    tempsVerification: Date.now() - startTime,
    cacheResult,
  };
}

// =============================================================================
// Database Queries
// =============================================================================

/**
 * Get adherent with sante-specific fields
 */
async function getAdherent(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  adherentId: string
): Promise<AdherentRow | null> {
  const result = await c.env.DB.prepare(`
    SELECT
      a.id, a.first_name, a.last_name, a.date_of_birth, a.is_active,
      COALESCE(sa.matricule, a.id) as matricule,
      sa.formule_id, sa.plafond_global
    FROM adherents a
    LEFT JOIN sante_adherents sa ON a.id = sa.adherent_id
    WHERE a.id = ? AND a.deleted_at IS NULL
    LIMIT 1
  `)
    .bind(adherentId)
    .first<AdherentRow>();

  return result || null;
}

/**
 * Get formule by ID
 */
async function getFormule(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  formuleId: string,
  dateSoin: string
): Promise<FormuleRow | null> {
  const result = await c.env.DB.prepare(`
    SELECT
      id, code, nom, description, taux_couverture_json, plafonds_json,
      plafond_global, tarif_mensuel, is_active, effective_from, effective_to
    FROM sante_garanties_formules
    WHERE id = ?
      AND is_active = 1
      AND effective_from <= ?
      AND (effective_to IS NULL OR effective_to >= ?)
    LIMIT 1
  `)
    .bind(formuleId, dateSoin, dateSoin)
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
    SELECT id, nom, prenom, specialite, est_conventionne, is_active
    FROM sante_praticiens
    WHERE id = ?
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
    SELECT id, adherent_id, annee, type_soin, montant_consomme, montant_plafond
    FROM sante_plafonds_consommes
    WHERE adherent_id = ? AND annee = ?
  `)
    .bind(adherentId, year)
    .all<PlafondConsommeRow>();

  return results.results || [];
}

// =============================================================================
// Caching
// =============================================================================

/**
 * Get cached eligibility result
 */
async function getCachedResult(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  cacheKey: string
): Promise<SanteEligibilityResult | null> {
  try {
    const cached = await c.env.CACHE.get(cacheKey, 'json');
    return cached as SanteEligibilityResult | null;
  } catch {
    return null;
  }
}

/**
 * Cache eligibility result
 */
async function cacheResult(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  cacheKey: string,
  result: SanteEligibilityResult
): Promise<void> {
  try {
    await c.env.CACHE.put(cacheKey, JSON.stringify(result), {
      expirationTtl: CACHE_TTL_SECONDS,
    });
  } catch (error) {
    // Log but don't fail on cache errors
    console.error('Failed to cache sante eligibility result:', error);
  }
}

/**
 * Invalidate cached eligibility for an adherent
 */
export async function invalidateSanteCache(
  _c: Context<{ Bindings: Bindings; Variables: Variables }>,
  adherentId: string
): Promise<void> {
  // KV doesn't support prefix deletion
  // For production, implement a key tracking mechanism
  const _pattern = `sante:eligibility:${adherentId}:*`;
  // Manual invalidation would require listing and deleting each key
}
