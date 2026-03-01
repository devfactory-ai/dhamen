/**
 * OCR Rules
 *
 * Parsing rules and validation for Tunisian health documents
 */

import type { BulletinExtractedData, BulletinLineItem } from './ocr.types';

/**
 * Common Tunisian drug names patterns
 */
const DRUG_PATTERNS = [
  /doliprane/i,
  /paracetamol/i,
  /amoxicilline/i,
  /augmentin/i,
  /clamoxyl/i,
  /metformine/i,
  /voltarene/i,
  /aspegic/i,
  /spasfon/i,
  /smecta/i,
  /daflon/i,
  /tahor/i,
  /lexomil/i,
  /efferalgan/i,
];

/**
 * Tunisian medical act patterns
 */
const MEDICAL_ACT_PATTERNS = [
  /consultation/i,
  /visite/i,
  /examen/i,
  /radio/i,
  /echographie/i,
  /irm/i,
  /scanner/i,
  /prise de sang/i,
  /analyse/i,
  /glycemie/i,
  /cholesterol/i,
  /nfs/i,
  /ionogramme/i,
];

/**
 * Specialty patterns
 */
const SPECIALTY_PATTERNS: Record<string, RegExp[]> = {
  pharmacie: [/pharmacie/i, /medicament/i, /ordonnance/i],
  consultation: [/consultation/i, /visite/i, /medecin/i, /docteur/i, /dr\./i],
  laboratoire: [/laboratoire/i, /labo/i, /analyse/i, /biologie/i],
  optique: [/optique/i, /lunettes/i, /verres/i, /monture/i, /opticien/i],
  dentaire: [/dentaire/i, /dentiste/i, /dent/i, /soins dentaires/i],
  hospitalisation: [/clinique/i, /hopital/i, /hospitalisation/i, /sejour/i],
};

/**
 * Parse amount from Tunisian format
 * Handles: "50,000 TND", "50.000", "50 DT", "50TND", "50 000"
 */
export function parseAmount(text: string): number | null {
  if (!text) return null;

  // Remove currency and clean up
  let cleaned = text
    .replace(/tnd|dt|dinars?/gi, '')
    .replace(/\s/g, '')
    .trim();

  // Handle comma as decimal separator
  if (cleaned.includes(',') && cleaned.indexOf(',') > cleaned.lastIndexOf('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    cleaned = cleaned.replace(/,/g, '');
  }

  const amount = parseFloat(cleaned);
  if (isNaN(amount)) return null;

  // Convert to millimes (Tunisian smallest unit)
  // If amount looks like it's already in millimes (> 100), use as is
  // Otherwise multiply by 1000
  if (amount > 100) {
    return Math.round(amount);
  }
  return Math.round(amount * 1000);
}

/**
 * Parse date from various Tunisian formats
 * Handles: "15/03/2024", "15-03-2024", "15 mars 2024", "2024-03-15"
 */
export function parseDate(text: string): string | null {
  if (!text) return null;

  const frenchMonths: Record<string, string> = {
    janvier: '01', fevrier: '02', mars: '03', avril: '04',
    mai: '05', juin: '06', juillet: '07', aout: '08',
    septembre: '09', octobre: '10', novembre: '11', decembre: '12',
  };

  // ISO format
  const isoMatch = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const ddmmMatch = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (ddmmMatch && ddmmMatch[1] && ddmmMatch[2] && ddmmMatch[3]) {
    const day = ddmmMatch[1].padStart(2, '0');
    const month = ddmmMatch[2].padStart(2, '0');
    return `${ddmmMatch[3]}-${month}-${day}`;
  }

  // DD month YYYY (French)
  for (const [name, num] of Object.entries(frenchMonths)) {
    const regex = new RegExp(`(\\d{1,2})\\s*${name}\\s*(\\d{4})`, 'i');
    const match = text.match(regex);
    if (match && match[1] && match[2]) {
      const day = match[1].padStart(2, '0');
      return `${match[2]}-${num}-${day}`;
    }
  }

  return null;
}

/**
 * Detect care type from text
 */
export function detectCareType(text: string): BulletinExtractedData['typeSoin'] | undefined {
  const lowerText = text.toLowerCase();

  for (const [type, patterns] of Object.entries(SPECIALTY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(lowerText)) {
        return type as BulletinExtractedData['typeSoin'];
      }
    }
  }

  return undefined;
}

/**
 * Parse line items from OCR text
 */
export function parseLineItems(text: string): BulletinLineItem[] {
  const items: BulletinLineItem[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    // Try to match drug or medical act patterns
    let isRelevant = false;
    for (const pattern of [...DRUG_PATTERNS, ...MEDICAL_ACT_PATTERNS]) {
      if (pattern.test(line)) {
        isRelevant = true;
        break;
      }
    }

    if (!isRelevant) continue;

    // Extract amounts from line
    const amounts = line.match(/\d+[,.\s]?\d*\s*(tnd|dt)?/gi) || [];
    const numbers = amounts.map(a => parseAmount(a)).filter((n): n is number => n !== null);

    if (numbers.length > 0) {
      const lastAmount = numbers[numbers.length - 1];
      const secondLastAmount = numbers.length > 1 ? numbers[numbers.length - 2] : null;

      items.push({
        libelle: line.replace(/\d+[,.\s]?\d*\s*(tnd|dt)?/gi, '').trim().substring(0, 100),
        quantite: 1,
        prixUnitaire: secondLastAmount ?? lastAmount ?? 0,
        montantTotal: lastAmount ?? 0,
      });
    }
  }

  return items;
}

/**
 * Validate and clean extracted data
 */
export function validateExtractedData(data: BulletinExtractedData): BulletinExtractedData {
  const warnings: string[] = [];

  // Validate date
  if (data.dateSoin) {
    const date = new Date(data.dateSoin);
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());

    if (date > now) {
      warnings.push('Date de soin dans le futur');
      data.dateSoin = undefined;
    } else if (date < oneYearAgo) {
      warnings.push('Date de soin tres ancienne (> 1 an)');
    }
  }

  // Validate amounts
  if (data.montantTotal <= 0) {
    warnings.push('Montant total invalide ou non detecte');
  } else if (data.montantTotal > 10000000) {
    // > 10,000 TND seems suspicious
    warnings.push('Montant total anormalement eleve');
  }

  // Validate line items
  const itemsTotal = data.lignes.reduce((sum, item) => sum + item.montantTotal, 0);
  if (data.lignes.length > 0 && Math.abs(itemsTotal - data.montantTotal) > 1000) {
    // > 1 TND difference
    warnings.push('Total des lignes ne correspond pas au montant total');
  }

  // Set minimum confidence based on warnings
  if (warnings.length > 2) {
    data.confidence = Math.min(data.confidence, 0.5);
  } else if (warnings.length > 0) {
    data.confidence = Math.min(data.confidence, 0.7);
  }

  return {
    ...data,
    warnings: [...data.warnings, ...warnings],
  };
}

/**
 * Calculate confidence score based on extracted data completeness
 */
export function calculateConfidence(data: Partial<BulletinExtractedData>): number {
  let score = 0;
  let total = 0;

  // Date
  total += 15;
  if (data.dateSoin) score += 15;

  // Care type
  total += 10;
  if (data.typeSoin) score += 10;

  // Amount
  total += 25;
  if (data.montantTotal && data.montantTotal > 0) score += 25;

  // Practitioner
  total += 15;
  if (data.praticien?.nom) score += 10;
  if (data.praticien?.specialite) score += 5;

  // Line items
  total += 20;
  if (data.lignes && data.lignes.length > 0) {
    score += Math.min(20, data.lignes.length * 5);
  }

  // Adherent info
  total += 15;
  if (data.adherentNom || data.adherentMatricule) score += 15;

  return score / total;
}
