/**
 * OCR Agent
 *
 * Extracts structured data from health document images using Workers AI.
 * Supports Tunisian bulletin de soins, ordonnances, and factures.
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../types';
import type { BulletinExtractedData, OCRRequest, OCRResult } from './ocr.types';
import {
  parseAmount,
  parseDate,
  detectCareType,
  parseLineItems,
  validateExtractedData,
  calculateConfidence,
} from './ocr.rules';

// Workers AI model for vision
const VISION_MODEL = '@cf/meta/llama-3.2-11b-vision-instruct';

// Prompt template for extraction
const EXTRACTION_PROMPT = `Vous etes un assistant specialise dans l'analyse de documents medicaux tunisiens.
Analysez cette image d'un bulletin de soins ou d'une facture medicale tunisienne.

Extrayez les informations suivantes au format JSON:
{
  "dateSoin": "date du soin au format YYYY-MM-DD",
  "typeSoin": "pharmacie|consultation|hospitalisation|optique|dentaire|laboratoire",
  "montantTotal": "montant total en millimes (multiplier par 1000 si en dinars)",
  "praticien": {
    "nom": "nom du praticien ou etablissement",
    "specialite": "specialite medicale",
    "adresse": "adresse",
    "telephone": "numero de telephone"
  },
  "lignes": [
    {
      "code": "code medicament ou acte si present",
      "libelle": "nom du medicament ou description de l'acte",
      "quantite": 1,
      "prixUnitaire": "prix en millimes",
      "montantTotal": "montant en millimes"
    }
  ],
  "adherentNom": "nom de l'adherent si visible",
  "adherentMatricule": "numero de matricule si visible",
  "numeroPrescription": "numero d'ordonnance si present",
  "medecinPrescripteur": "nom du medecin prescripteur si present"
}

IMPORTANT:
- Les montants en Tunisie sont souvent en TND (dinars tunisiens). 1 TND = 1000 millimes.
- Si un montant est affiche comme "50,000" ou "50.000", c'est probablement 50 TND = 50000 millimes.
- Retournez uniquement le JSON, sans texte supplementaire.
- Si une information n'est pas visible, omettez-la du JSON.`;

/**
 * Extract data from document image using Workers AI
 */
export async function extractBulletinData(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  imageData: ArrayBuffer | string
): Promise<BulletinExtractedData> {
  const startTime = Date.now();

  // Check if AI binding exists
  if (!c.env.AI) {
    console.warn('Workers AI not available, using fallback extraction');
    return createFallbackResult();
  }

  try {
    // Prepare image for AI - convert to number array for API compatibility
    let imageArray: number[];
    if (typeof imageData === 'string') {
      // URL or base64 - encode as bytes
      const encoder = new TextEncoder();
      imageArray = Array.from(encoder.encode(imageData));
    } else {
      // ArrayBuffer - convert to number array
      imageArray = Array.from(new Uint8Array(imageData));
    }

    // Call Workers AI vision model
    const response = await c.env.AI.run(VISION_MODEL, {
      prompt: EXTRACTION_PROMPT,
      image: imageArray,
    });

    // Parse AI response
    const extractedData = parseAIResponse(response);

    // Calculate confidence
    extractedData.confidence = calculateConfidence(extractedData);

    // Validate and clean data
    const validatedData = validateExtractedData(extractedData);

    console.log(`OCR completed in ${Date.now() - startTime}ms, confidence: ${validatedData.confidence}`);

    return validatedData;
  } catch (error) {
    console.error('OCR extraction error:', error);
    return createErrorResult(error instanceof Error ? error.message : 'Unknown error');
  }
}

/**
 * Parse AI response to BulletinExtractedData
 */
function parseAIResponse(response: unknown): BulletinExtractedData {
  const warnings: string[] = [];

  // Handle different response formats from AI
  let jsonText: string;

  if (typeof response === 'string') {
    jsonText = response;
  } else if (response && typeof response === 'object' && 'response' in response) {
    jsonText = String((response as { response: unknown }).response);
  } else if (response && typeof response === 'object' && 'text' in response) {
    jsonText = String((response as { text: unknown }).text);
  } else {
    jsonText = JSON.stringify(response);
  }

  // Extract JSON from response (AI might include extra text)
  const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    warnings.push('Impossible de parser la reponse AI');
    return createFallbackResult(warnings);
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);

    // Convert and validate data
    const data: BulletinExtractedData = {
      dateSoin: parseDate(parsed.dateSoin) || undefined,
      typeSoin: detectCareType(parsed.typeSoin || '') || undefined,
      montantTotal: typeof parsed.montantTotal === 'number'
        ? parsed.montantTotal
        : parseAmount(String(parsed.montantTotal)) || 0,
      praticien: parsed.praticien ? {
        nom: parsed.praticien.nom || undefined,
        specialite: parsed.praticien.specialite || undefined,
        adresse: parsed.praticien.adresse || undefined,
        telephone: parsed.praticien.telephone || undefined,
      } : undefined,
      lignes: Array.isArray(parsed.lignes)
        ? parsed.lignes.map((ligne: Record<string, unknown>) => ({
            code: ligne.code as string | undefined,
            libelle: String(ligne.libelle || 'Article'),
            quantite: Number(ligne.quantite) || 1,
            prixUnitaire: parseAmount(String(ligne.prixUnitaire)) || 0,
            montantTotal: parseAmount(String(ligne.montantTotal)) || 0,
          }))
        : [],
      adherentNom: parsed.adherentNom || undefined,
      adherentMatricule: parsed.adherentMatricule || undefined,
      numeroPrescription: parsed.numeroPrescription || undefined,
      medecinPrescripteur: parsed.medecinPrescripteur || undefined,
      confidence: 0,
      warnings,
    };

    return data;
  } catch (parseError) {
    warnings.push('Erreur de parsing JSON');
    return createFallbackResult(warnings);
  }
}

/**
 * Create fallback result when AI is unavailable
 */
function createFallbackResult(warnings: string[] = []): BulletinExtractedData {
  return {
    montantTotal: 0,
    lignes: [],
    confidence: 0,
    warnings: [...warnings, 'Extraction automatique non disponible'],
  };
}

/**
 * Create error result
 */
function createErrorResult(errorMessage: string): BulletinExtractedData {
  return {
    montantTotal: 0,
    lignes: [],
    confidence: 0,
    warnings: [`Erreur d'extraction: ${errorMessage}`],
  };
}

/**
 * Process OCR request
 */
export async function processOCRRequest(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  request: OCRRequest
): Promise<OCRResult> {
  const startTime = Date.now();

  try {
    // Fetch image from R2 or URL
    let imageData: ArrayBuffer;

    if (request.imageUrl.startsWith('r2://')) {
      // Fetch from R2
      const key = request.imageUrl.replace('r2://', '');
      const object = await c.env.STORAGE.get(key);
      if (!object) {
        return {
          success: false,
          error: 'Document not found in storage',
          processingTimeMs: Date.now() - startTime,
        };
      }
      imageData = await object.arrayBuffer();
    } else {
      // Fetch from URL
      const response = await fetch(request.imageUrl);
      if (!response.ok) {
        return {
          success: false,
          error: 'Failed to fetch image',
          processingTimeMs: Date.now() - startTime,
        };
      }
      imageData = await response.arrayBuffer();
    }

    // Extract data
    const extractedData = await extractBulletinData(c, imageData);

    // If type hint provided, use it
    if (request.typeSoin && !extractedData.typeSoin) {
      extractedData.typeSoin = request.typeSoin as BulletinExtractedData['typeSoin'];
    }

    return {
      success: true,
      data: extractedData,
      processingTimeMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'OCR processing failed',
      processingTimeMs: Date.now() - startTime,
    };
  }
}

/**
 * Extract text from image using simple OCR
 * Fallback when vision model unavailable
 */
export async function extractTextOnly(
  c: Context<{ Bindings: Bindings; Variables: Variables }>,
  imageData: ArrayBuffer
): Promise<string> {
  // If AI available, use text recognition
  if (c.env.AI) {
    try {
      const response = await c.env.AI.run('@cf/microsoft/resnet-50', {
        image: Array.from(new Uint8Array(imageData)),
      });
      return JSON.stringify(response);
    } catch {
      return '';
    }
  }
  return '';
}
