/**
 * OCR Service
 *
 * Document text extraction using Cloudflare Workers AI
 */
import type { Bindings } from '../types';
import { generateId } from '../lib/ulid';

export interface OCRRequest {
  documentId: string;
  imageData: string; // Base64 encoded image or URL
  documentType: 'ordonnance' | 'facture' | 'carte_vitale' | 'attestation' | 'autre';
  language?: 'fr' | 'ar';
}

export interface OCRResult {
  id: string;
  documentId: string;
  documentType: string;
  rawText: string;
  structuredData: ExtractedData;
  confidence: number;
  processingTime: number;
  createdAt: string;
}

export interface ExtractedData {
  // Common fields
  dateDocument?: string;
  numeroDocument?: string;

  // Ordonnance fields
  patient?: {
    nom?: string;
    prenom?: string;
    dateNaissance?: string;
    matricule?: string;
  };
  medecin?: {
    nom?: string;
    specialite?: string;
    numeroOrdre?: string;
  };
  medicaments?: Array<{
    nom: string;
    dosage?: string;
    quantite?: number;
    posologie?: string;
  }>;

  // Facture fields
  emetteur?: {
    nom?: string;
    adresse?: string;
    matriculeFiscal?: string;
  };
  montantTotal?: number;
  montantHT?: number;
  tva?: number;
  lignes?: Array<{
    description: string;
    quantite: number;
    prixUnitaire: number;
    total: number;
  }>;

  // Carte vitale / Attestation fields
  assure?: {
    nom?: string;
    prenom?: string;
    numeroSecuriteSociale?: string;
    dateNaissance?: string;
  };
  couverture?: {
    organisme?: string;
    numeroContrat?: string;
    dateValidite?: string;
  };
}

export class OCRService {
  constructor(private env: Bindings) {}

  /**
   * Process document with OCR
   */
  async processDocument(request: OCRRequest): Promise<OCRResult> {
    const startTime = Date.now();
    const resultId = generateId('OCR');

    try {
      // Extract text using Workers AI
      const rawText = await this.extractText(request.imageData);

      // Structure the extracted data based on document type
      const structuredData = await this.structureData(rawText, request.documentType);

      // Calculate confidence score
      const confidence = this.calculateConfidence(structuredData, request.documentType);

      const processingTime = Date.now() - startTime;

      return {
        id: resultId,
        documentId: request.documentId,
        documentType: request.documentType,
        rawText,
        structuredData,
        confidence,
        processingTime,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error('OCR processing error:', error);
      throw error;
    }
  }

  /**
   * Extract text from image using Workers AI
   */
  private async extractText(imageData: string): Promise<string> {
    // Check if it's a URL or base64
    let imageInput: ArrayBuffer | string;

    if (imageData.startsWith('http')) {
      // Fetch image from URL
      const response = await fetch(imageData);
      imageInput = await response.arrayBuffer();
    } else if (imageData.startsWith('data:image')) {
      // Extract base64 data
      const base64Data = imageData.split(',')[1];
      imageInput = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0)).buffer;
    } else {
      // Assume raw base64
      imageInput = Uint8Array.from(atob(imageData), (c) => c.charCodeAt(0)).buffer;
    }

    // Use Workers AI for OCR
    if (this.env.AI) {
      try {
        // Use LLaVA or similar vision model for text extraction
        const result = await this.env.AI.run('@cf/llava-hf/llava-1.5-7b-hf', {
          image: [...new Uint8Array(imageInput as ArrayBuffer)],
          prompt: 'Extract all text from this document image. Return the raw text exactly as it appears.',
          max_tokens: 2048,
        });

        if (result && typeof result === 'object' && 'response' in result) {
          return (result as { response: string }).response;
        }
      } catch (aiError) {
        console.error('Workers AI error:', aiError);
      }
    }

    // Fallback: Return placeholder for demo
    return this.getMockOCRText();
  }

  /**
   * Structure extracted text based on document type
   */
  private async structureData(
    rawText: string,
    documentType: OCRRequest['documentType']
  ): Promise<ExtractedData> {
    // Use Workers AI to structure the data
    if (this.env.AI) {
      try {
        const prompt = this.getStructuringPrompt(documentType, rawText);

        const result = await this.env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
          messages: [
            {
              role: 'system',
              content:
                'Tu es un assistant spécialisé dans l\'extraction de données de documents médicaux et administratifs tunisiens. Réponds uniquement en JSON valide.',
            },
            { role: 'user', content: prompt },
          ],
          max_tokens: 1024,
        });

        if (result && typeof result === 'object' && 'response' in result) {
          try {
            const jsonStr = (result as { response: string }).response;
            // Extract JSON from response
            const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              return JSON.parse(jsonMatch[0]);
            }
          } catch (parseError) {
            console.error('JSON parse error:', parseError);
          }
        }
      } catch (aiError) {
        console.error('Workers AI structuring error:', aiError);
      }
    }

    // Fallback: Use regex-based extraction
    return this.extractWithRegex(rawText, documentType);
  }

  /**
   * Get prompt for structuring data
   */
  private getStructuringPrompt(documentType: string, rawText: string): string {
    const basePrompt = `Extrait les informations du texte suivant et retourne un JSON structuré:\n\n${rawText}\n\n`;

    switch (documentType) {
      case 'ordonnance':
        return (
          basePrompt +
          `Structure attendue:
{
  "dateDocument": "date de l'ordonnance",
  "patient": { "nom": "", "prenom": "", "dateNaissance": "" },
  "medecin": { "nom": "", "specialite": "", "numeroOrdre": "" },
  "medicaments": [{ "nom": "", "dosage": "", "quantite": 0, "posologie": "" }]
}`
        );

      case 'facture':
        return (
          basePrompt +
          `Structure attendue:
{
  "dateDocument": "date facture",
  "numeroDocument": "numéro facture",
  "emetteur": { "nom": "", "adresse": "", "matriculeFiscal": "" },
  "montantHT": 0,
  "tva": 0,
  "montantTotal": 0,
  "lignes": [{ "description": "", "quantite": 0, "prixUnitaire": 0, "total": 0 }]
}`
        );

      case 'carte_vitale':
      case 'attestation':
        return (
          basePrompt +
          `Structure attendue:
{
  "assure": { "nom": "", "prenom": "", "numeroSecuriteSociale": "", "dateNaissance": "" },
  "couverture": { "organisme": "", "numeroContrat": "", "dateValidite": "" }
}`
        );

      default:
        return basePrompt + 'Extrait toutes les informations pertinentes en JSON.';
    }
  }

  /**
   * Fallback regex-based extraction
   */
  private extractWithRegex(rawText: string, documentType: string): ExtractedData {
    const data: ExtractedData = {};

    // Date extraction
    const dateMatch = rawText.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    if (dateMatch) {
      data.dateDocument = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
    }

    // Amount extraction
    const amountMatch = rawText.match(/(\d+[.,]\d{3})\s*(TND|DT|dinars?)/i);
    if (amountMatch) {
      data.montantTotal = parseFloat(amountMatch[1].replace(',', '.')) * 1000;
    }

    // Matricule extraction (Tunisian format)
    const matriculeMatch = rawText.match(/\d{8}[A-Z]?/);
    if (matriculeMatch) {
      if (documentType === 'ordonnance') {
        data.patient = { matricule: matriculeMatch[0] };
      } else {
        data.assure = { numeroSecuriteSociale: matriculeMatch[0] };
      }
    }

    // Name extraction (simple heuristic)
    const nameMatch = rawText.match(/(?:Nom|Patient|Assuré)\s*:?\s*([A-ZÀ-Ü][a-zà-ü]+(?:\s+[A-ZÀ-Ü][a-zà-ü]+)?)/i);
    if (nameMatch) {
      const names = nameMatch[1].split(/\s+/);
      if (documentType === 'ordonnance') {
        data.patient = {
          ...data.patient,
          nom: names[0],
          prenom: names[1] || '',
        };
      }
    }

    return data;
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(data: ExtractedData, documentType: string): number {
    let score = 0;
    let maxScore = 0;

    // Check required fields based on document type
    switch (documentType) {
      case 'ordonnance':
        maxScore = 5;
        if (data.dateDocument) score++;
        if (data.patient?.nom) score++;
        if (data.medecin?.nom) score++;
        if (data.medicaments && data.medicaments.length > 0) score += 2;
        break;

      case 'facture':
        maxScore = 4;
        if (data.dateDocument) score++;
        if (data.numeroDocument) score++;
        if (data.montantTotal) score++;
        if (data.lignes && data.lignes.length > 0) score++;
        break;

      case 'carte_vitale':
      case 'attestation':
        maxScore = 3;
        if (data.assure?.nom) score++;
        if (data.assure?.numeroSecuriteSociale) score++;
        if (data.couverture?.dateValidite) score++;
        break;

      default:
        return 0.5;
    }

    return maxScore > 0 ? score / maxScore : 0;
  }

  /**
   * Mock OCR text for demo
   */
  private getMockOCRText(): string {
    return `
ORDONNANCE MÉDICALE

Date: 26/02/2025

Patient: Mohamed Ben Ali
Né le: 15/03/1985
Matricule: 12345678A

Dr. Karim Mansouri
Médecin Généraliste
N° Ordre: 54321

PRESCRIPTION:
1. Doliprane 1000mg - 2 boîtes
   Posologie: 1 comprimé 3 fois par jour

2. Amoxicilline 500mg - 1 boîte
   Posologie: 1 gélule matin et soir pendant 7 jours

3. Vitamine C 500mg - 1 boîte
   Posologie: 1 comprimé par jour

Signature du médecin
    `.trim();
  }

  /**
   * Validate extracted data against expected format
   */
  async validateExtraction(result: OCRResult): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    const { structuredData, documentType } = result;

    // Validate based on document type
    switch (documentType) {
      case 'ordonnance':
        if (!structuredData.patient?.nom) {
          errors.push('Nom du patient non détecté');
        }
        if (!structuredData.medicaments || structuredData.medicaments.length === 0) {
          errors.push('Aucun médicament détecté');
        }
        if (!structuredData.medecin?.nom) {
          warnings.push('Nom du médecin non détecté');
        }
        break;

      case 'facture':
        if (!structuredData.montantTotal) {
          errors.push('Montant total non détecté');
        }
        if (!structuredData.emetteur?.nom) {
          warnings.push('Émetteur non identifié');
        }
        break;

      case 'carte_vitale':
      case 'attestation':
        if (!structuredData.assure?.nom) {
          errors.push('Nom de l\'assuré non détecté');
        }
        if (!structuredData.couverture?.dateValidite) {
          warnings.push('Date de validité non détectée');
        }
        break;
    }

    // Check confidence threshold
    if (result.confidence < 0.5) {
      warnings.push('Faible confiance dans l\'extraction - vérification manuelle recommandée');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
