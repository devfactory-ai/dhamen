/**
 * SoinFlow Eligibility Rules
 *
 * Business rules for determining health reimbursement eligibility
 * based on formules de garantie, plafonds, and praticien network.
 */

import type { SanteTypeSoin } from '@dhamen/shared';
import type {
  EligibilityRaison,
  AdherentRow,
  FormuleRow,
  PraticienRow,
  PlafondConsommeRow,
  PlafondInfo,
} from './sante-eligibility.types';

/**
 * Rule 1: Adherent Status Check
 * Verifies the adherent exists and is active
 */
export function checkAdherentStatus(adherent: AdherentRow | null): EligibilityRaison[] {
  const raisons: EligibilityRaison[] = [];

  if (!adherent) {
    raisons.push({
      code: 'ADHERENT_NON_TROUVE',
      message: 'Adhérent non trouvé dans le système',
      severite: 'erreur',
    });
    return raisons;
  }

  if (adherent.is_active !== 1) {
    raisons.push({
      code: 'ADHERENT_INACTIF',
      message: 'L\'adhérent n\'est plus actif',
      severite: 'erreur',
    });
    return raisons;
  }

  raisons.push({
    code: 'ADHERENT_ACTIF',
    message: 'Adhérent actif et valide',
    severite: 'info',
  });

  return raisons;
}

/**
 * Rule 2: Formule Validity Check
 * Verifies the formule exists and is active for the service date
 */
export function checkFormuleValidity(
  formule: FormuleRow | null,
  dateSoin: string
): EligibilityRaison[] {
  const raisons: EligibilityRaison[] = [];

  if (!formule) {
    raisons.push({
      code: 'FORMULE_NON_TROUVEE',
      message: 'Aucune formule de garantie associée à cet adhérent',
      severite: 'erreur',
    });
    return raisons;
  }

  if (formule.is_active !== 1) {
    raisons.push({
      code: 'FORMULE_EXPIREE',
      message: 'La formule de garantie n\'est plus active',
      severite: 'erreur',
    });
    return raisons;
  }

  // Check effective dates
  if (dateSoin < formule.effective_from) {
    raisons.push({
      code: 'FORMULE_EXPIREE',
      message: 'La formule n\'était pas encore active à la date de soin',
      severite: 'erreur',
      details: { effectiveFrom: formule.effective_from, dateSoin },
    });
    return raisons;
  }

  if (formule.effective_to && dateSoin > formule.effective_to) {
    raisons.push({
      code: 'FORMULE_EXPIREE',
      message: 'La formule a expiré',
      severite: 'erreur',
      details: { effectiveTo: formule.effective_to, dateSoin },
    });
    return raisons;
  }

  raisons.push({
    code: 'FORMULE_VALIDE',
    message: `Formule ${formule.code} - ${formule.nom} active`,
    severite: 'info',
  });

  return raisons;
}

/**
 * Rule 3: Care Type Coverage Check
 * Verifies the type of care is covered by the formule
 */
export function checkTypeSoinCoverage(
  formule: FormuleRow | null,
  typeSoin: SanteTypeSoin
): EligibilityRaison[] {
  const raisons: EligibilityRaison[] = [];

  if (!formule) {
    return raisons;
  }

  try {
    const tauxCouverture = JSON.parse(formule.taux_couverture_json) as Record<string, number>;
    const taux = tauxCouverture[typeSoin];

    if (taux === undefined || taux === 0) {
      raisons.push({
        code: 'TYPE_SOIN_NON_COUVERT',
        message: `Les soins de type "${typeSoin}" ne sont pas couverts par cette formule`,
        severite: 'erreur',
        details: { typeSoin, formuleCode: formule.code },
      });
      return raisons;
    }

    raisons.push({
      code: 'TYPE_SOIN_COUVERT',
      message: `Couverture de ${taux}% pour "${typeSoin}"`,
      severite: 'info',
      details: { typeSoin, tauxCouverture: taux },
    });
  } catch {
    raisons.push({
      code: 'TYPE_SOIN_NON_COUVERT',
      message: 'Erreur de lecture des taux de couverture',
      severite: 'erreur',
    });
  }

  return raisons;
}

/**
 * Rule 4: Ceiling/Plafond Check
 * Verifies the amount doesn't exceed available ceilings
 */
export function checkPlafonds(
  formule: FormuleRow | null,
  typeSoin: SanteTypeSoin,
  montant: number,
  plafondsConsommes: PlafondConsommeRow[]
): { raisons: EligibilityRaison[]; plafondRestant: number; montantMaxCouvert: number } {
  const raisons: EligibilityRaison[] = [];
  let plafondRestant = Number.MAX_SAFE_INTEGER;
  let montantMaxCouvert = montant;

  if (!formule) {
    return { raisons, plafondRestant: 0, montantMaxCouvert: 0 };
  }

  try {
    const plafonds = JSON.parse(formule.plafonds_json) as Record<string, number>;
    const plafondTypeSoin = plafonds[typeSoin];
    const plafondGlobal = formule.plafond_global;

    // Calculate consumed amounts
    const consommeGlobal = plafondsConsommes
      .filter((p) => p.type_soin === 'global')
      .reduce((sum, p) => sum + p.montant_consomme, 0);

    const consommeTypeSoin = plafondsConsommes
      .filter((p) => p.type_soin === typeSoin)
      .reduce((sum, p) => sum + p.montant_consomme, 0);

    // Check type-specific ceiling
    if (plafondTypeSoin) {
      const restantTypeSoin = plafondTypeSoin - consommeTypeSoin;
      if (restantTypeSoin <= 0) {
        raisons.push({
          code: 'PLAFOND_ATTEINT',
          message: `Plafond annuel pour "${typeSoin}" épuisé`,
          severite: 'erreur',
          details: { plafond: plafondTypeSoin, consomme: consommeTypeSoin },
        });
        return { raisons, plafondRestant: 0, montantMaxCouvert: 0 };
      }
      plafondRestant = Math.min(plafondRestant, restantTypeSoin);
    }

    // Check global ceiling
    if (plafondGlobal) {
      const restantGlobal = plafondGlobal - consommeGlobal;
      if (restantGlobal <= 0) {
        raisons.push({
          code: 'PLAFOND_ATTEINT',
          message: 'Plafond annuel global épuisé',
          severite: 'erreur',
          details: { plafondGlobal, consommeGlobal },
        });
        return { raisons, plafondRestant: 0, montantMaxCouvert: 0 };
      }
      plafondRestant = Math.min(plafondRestant, restantGlobal);
    }

    // Calculate max covered amount
    if (plafondRestant < Number.MAX_SAFE_INTEGER) {
      montantMaxCouvert = Math.min(montant, plafondRestant);

      if (montant > plafondRestant) {
        raisons.push({
          code: 'PLAFOND_PARTIEL',
          message: `Couverture partielle: ${plafondRestant} DT disponibles sur ${montant} DT demandés`,
          severite: 'avertissement',
          details: { montantDemande: montant, plafondRestant, montantCouvert: montantMaxCouvert },
        });
      } else {
        raisons.push({
          code: 'PLAFOND_DISPONIBLE',
          message: `Plafond suffisant: ${plafondRestant} DT disponibles`,
          severite: 'info',
          details: { plafondRestant },
        });
      }
    } else {
      raisons.push({
        code: 'PLAFOND_DISPONIBLE',
        message: 'Pas de plafond applicable',
        severite: 'info',
      });
    }
  } catch {
    raisons.push({
      code: 'PLAFOND_DISPONIBLE',
      message: 'Erreur de lecture des plafonds - couverture par défaut appliquée',
      severite: 'avertissement',
    });
  }

  return { raisons, plafondRestant, montantMaxCouvert };
}

/**
 * Rule 5: Praticien Network Check
 * Checks if the praticien is conventionné (in-network)
 */
export function checkPraticienNetwork(praticien: PraticienRow | null): EligibilityRaison[] {
  const raisons: EligibilityRaison[] = [];

  if (!praticien) {
    // Praticien optional for adherent-submitted claims
    return raisons;
  }

  if (praticien.is_active !== 1) {
    raisons.push({
      code: 'PRATICIEN_NON_CONVENTIONNE',
      message: 'Le praticien n\'est plus actif',
      severite: 'avertissement',
    });
    return raisons;
  }

  if (praticien.est_conventionne === 1) {
    raisons.push({
      code: 'PRATICIEN_CONVENTIONNE',
      message: `Praticien conventionné: ${praticien.nom}${praticien.prenom ? ` ${praticien.prenom}` : ''}`,
      severite: 'info',
    });
  } else {
    raisons.push({
      code: 'PRATICIEN_NON_CONVENTIONNE',
      message: 'Praticien hors réseau - taux de remboursement potentiellement réduit',
      severite: 'avertissement',
    });
  }

  return raisons;
}

/**
 * Build plafond info for the response
 */
export function buildPlafondsInfo(
  formule: FormuleRow | null,
  plafondsConsommes: PlafondConsommeRow[]
): PlafondInfo[] {
  const plafondsInfo: PlafondInfo[] = [];

  if (!formule) {
    return plafondsInfo;
  }

  try {
    const plafonds = JSON.parse(formule.plafonds_json) as Record<string, number>;

    // Add type-specific plafonds
    for (const [typeSoin, plafond] of Object.entries(plafonds)) {
      const consomme = plafondsConsommes
        .filter((p) => p.type_soin === typeSoin)
        .reduce((sum, p) => sum + p.montant_consomme, 0);

      plafondsInfo.push({
        typeSoin: typeSoin as SanteTypeSoin,
        montantPlafond: plafond,
        montantConsomme: consomme,
        montantRestant: Math.max(0, plafond - consomme),
        pourcentageUtilise: plafond > 0 ? Math.round((consomme / plafond) * 100) : 0,
      });
    }

    // Add global plafond
    if (formule.plafond_global) {
      const consommeGlobal = plafondsConsommes
        .filter((p) => p.type_soin === 'global')
        .reduce((sum, p) => sum + p.montant_consomme, 0);

      plafondsInfo.push({
        typeSoin: 'global',
        montantPlafond: formule.plafond_global,
        montantConsomme: consommeGlobal,
        montantRestant: Math.max(0, formule.plafond_global - consommeGlobal),
        pourcentageUtilise:
          formule.plafond_global > 0 ? Math.round((consommeGlobal / formule.plafond_global) * 100) : 0,
      });
    }
  } catch {
    // Return empty array on parse error
  }

  return plafondsInfo;
}

/**
 * Evaluate final eligibility from all rule results
 */
export function evaluateSanteEligibility(raisons: EligibilityRaison[]): {
  eligible: boolean;
  scoreConfiance: number;
} {
  const hasErrors = raisons.some((r) => r.severite === 'erreur');
  const hasWarnings = raisons.some((r) => r.severite === 'avertissement');

  // Calculate confidence score
  let scoreConfiance = 100;
  if (hasErrors) {
    scoreConfiance = 0;
  } else if (hasWarnings) {
    scoreConfiance = 80;
  }

  return {
    eligible: !hasErrors,
    scoreConfiance,
  };
}
