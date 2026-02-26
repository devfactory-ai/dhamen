/**
 * OCR Agent Types
 *
 * Types for bulletin de soins data extraction
 */

/**
 * Extracted line item from bulletin
 */
export interface BulletinLineItem {
  code?: string;
  libelle: string;
  quantite: number;
  prixUnitaire: number;
  montantTotal: number;
}

/**
 * Extracted practitioner info
 */
export interface BulletinPraticien {
  nom?: string;
  specialite?: string;
  adresse?: string;
  telephone?: string;
}

/**
 * Full extracted bulletin data
 */
export interface BulletinExtractedData {
  // Basic info
  dateSoin?: string;
  typeSoin?: 'pharmacie' | 'consultation' | 'hospitalisation' | 'optique' | 'dentaire' | 'laboratoire';

  // Amounts
  montantTotal: number;
  montantTTC?: number;

  // Practitioner
  praticien?: BulletinPraticien;

  // Line items
  lignes: BulletinLineItem[];

  // Adherent info (if visible)
  adherentNom?: string;
  adherentMatricule?: string;

  // Prescription
  numeroPrescription?: string;
  datePrescription?: string;
  medecinPrescripteur?: string;

  // Metadata
  confidence: number;
  warnings: string[];
  rawText?: string;
}

/**
 * OCR request parameters
 */
export interface OCRRequest {
  documentId: string;
  imageUrl: string;
  typeSoin?: string;
}

/**
 * OCR result with status
 */
export interface OCRResult {
  success: boolean;
  data?: BulletinExtractedData;
  error?: string;
  processingTimeMs: number;
}
