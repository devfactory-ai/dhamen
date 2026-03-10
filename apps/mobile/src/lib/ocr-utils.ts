/**
 * OCR utilities for multi-page result merging
 */

export interface OCRExtractedData {
  dateSoin?: string;
  typeSoin?: string;
  montantTotal: number;
  praticien?: {
    nom?: string;
    specialite?: string;
  };
  lignes: Array<{
    libelle: string;
    montantTotal: number;
  }>;
  confidence: number;
  fieldConfidences?: Record<string, number>;
  warnings: string[];
}

/**
 * Merge multiple OCR page results into a single result.
 * First page provides patient/practitioner info.
 * Line items are concatenated, amounts summed, confidence is minimum.
 */
export function mergeOcrResults(results: OCRExtractedData[]): OCRExtractedData {
  if (results.length === 0) {
    return { montantTotal: 0, lignes: [], confidence: 0, warnings: [] };
  }
  if (results.length === 1) return results[0];

  const merged: OCRExtractedData = {
    dateSoin: results.find(r => r.dateSoin)?.dateSoin,
    typeSoin: results.find(r => r.typeSoin)?.typeSoin,
    montantTotal: results.reduce((sum, r) => sum + r.montantTotal, 0),
    praticien: results.find(r => r.praticien?.nom)?.praticien,
    lignes: results.flatMap(r => r.lignes),
    confidence: Math.min(...results.map(r => r.confidence)),
    warnings: results.flatMap(r => r.warnings),
  };

  // Merge field confidences: take minimum per field
  const allConfidences = results.filter(r => r.fieldConfidences).map(r => r.fieldConfidences!);
  if (allConfidences.length > 0) {
    const mergedConfidences: Record<string, number> = {};
    for (const fc of allConfidences) {
      for (const [key, val] of Object.entries(fc)) {
        mergedConfidences[key] = mergedConfidences[key] !== undefined
          ? Math.min(mergedConfidences[key], val)
          : val;
      }
    }
    merged.fieldConfidences = mergedConfidences;
  }

  return merged;
}
