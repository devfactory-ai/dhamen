/**
 * OCR Routes
 *
 * Document text extraction API endpoints
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';
import { authMiddleware, requireRole } from '../middleware/auth';
import { OCRService } from '../services/ocr.service';
import { logAudit } from '../middleware/audit-trail';
import { generatePrefixedId, generateId } from '../lib/ulid';

const ocr = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
ocr.use('*', authMiddleware());

// =============================================================================
// Schemas
// =============================================================================

const processDocumentSchema = z.object({
  imageData: z.string().min(1, 'Image data required'),
  documentType: z.enum(['ordonnance', 'facture', 'carte_vitale', 'attestation', 'autre']),
  language: z.enum(['fr', 'ar']).optional().default('fr'),
});

const batchProcessSchema = z.object({
  documents: z
    .array(
      z.object({
        id: z.string(),
        imageData: z.string(),
        documentType: z.enum(['ordonnance', 'facture', 'carte_vitale', 'attestation', 'autre']),
      })
    )
    .min(1)
    .max(10),
});

// =============================================================================
// Routes
// =============================================================================

/**
 * POST /ocr/process
 * Process a single document with OCR
 */
ocr.post(
  '/process',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PHARMACIST', 'DOCTOR'),
  zValidator('json', processDocumentSchema),
  async (c) => {
    const { imageData, documentType, language } = c.req.valid('json');
    const user = c.get('user');

    const documentId = generatePrefixedId('DOC');
    const ocrService = new OCRService(c.env);

    const result = await ocrService.processDocument({
      documentId,
      imageData,
      documentType,
      language,
    });

    // Validate the extraction
    const validation = await ocrService.validateExtraction(result);

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'ocr.process',
      entityType: 'documents',
      entityId: documentId,
      changes: {
        documentType,
        confidence: result.confidence,
        isValid: validation.isValid,
      },
    });

    return c.json({
      success: true,
      data: {
        ...result,
        validation,
      },
    });
  }
);

/**
 * POST /ocr/batch
 * Process multiple documents with OCR
 */
ocr.post(
  '/batch',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE'),
  zValidator('json', batchProcessSchema),
  async (c) => {
    const { documents } = c.req.valid('json');
    const user = c.get('user');

    const ocrService = new OCRService(c.env);
    const results = [];
    const errors = [];

    for (const doc of documents) {
      try {
        const result = await ocrService.processDocument({
          documentId: doc.id,
          imageData: doc.imageData,
          documentType: doc.documentType,
        });

        const validation = await ocrService.validateExtraction(result);
        results.push({ ...result, validation });
      } catch (error) {
        errors.push({
          documentId: doc.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'ocr.batch_process',
      entityType: 'documents',
      entityId: 'batch',
      changes: {
        totalDocuments: documents.length,
        successful: results.length,
        failed: errors.length,
      },
    });

    return c.json({
      success: true,
      data: {
        results,
        errors,
        summary: {
          total: documents.length,
          successful: results.length,
          failed: errors.length,
        },
      },
    });
  }
);

/**
 * POST /ocr/extract-ordonnance
 * Specialized endpoint for prescription extraction
 */
ocr.post(
  '/extract-ordonnance',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PHARMACIST'),
  zValidator('json', z.object({ imageData: z.string() })),
  async (c) => {
    const { imageData } = c.req.valid('json');
    const user = c.get('user');

    const documentId = generatePrefixedId('ORD');
    const ocrService = new OCRService(c.env);

    const result = await ocrService.processDocument({
      documentId,
      imageData,
      documentType: 'ordonnance',
    });

    // Extract medication list for easy processing
    const medicaments = result.structuredData.medicaments || [];

    // Check medications against database
    const medicamentsWithInfo = await Promise.all(
      medicaments.map(async (med) => {
        // In production, query medication database
        return {
          ...med,
          codeACM: `ACM-${generateId().slice(-6)}`,
          prixReference: Math.floor(Math.random() * 50000) + 5000,
          remboursable: Math.random() > 0.2,
          tauxRemboursement: Math.random() > 0.5 ? 80 : 40,
        };
      })
    );

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'ocr.extract_ordonnance',
      entityType: 'ordonnances',
      entityId: documentId,
      changes: {
        medicamentsCount: medicaments.length,
        confidence: result.confidence,
      },
    });

    return c.json({
      success: true,
      data: {
        id: documentId,
        patient: result.structuredData.patient,
        medecin: result.structuredData.medecin,
        dateOrdonnance: result.structuredData.dateDocument,
        medicaments: medicamentsWithInfo,
        confidence: result.confidence,
        rawText: result.rawText,
      },
    });
  }
);

/**
 * POST /ocr/extract-facture
 * Specialized endpoint for invoice extraction
 */
ocr.post(
  '/extract-facture',
  requireRole('ADMIN', 'SOIN_GESTIONNAIRE', 'INSURER_ADMIN'),
  zValidator('json', z.object({ imageData: z.string() })),
  async (c) => {
    const { imageData } = c.req.valid('json');
    const user = c.get('user');

    const documentId = generatePrefixedId('FAC');
    const ocrService = new OCRService(c.env);

    const result = await ocrService.processDocument({
      documentId,
      imageData,
      documentType: 'facture',
    });

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'ocr.extract_facture',
      entityType: 'factures',
      entityId: documentId,
      changes: {
        montantTotal: result.structuredData.montantTotal,
        confidence: result.confidence,
      },
    });

    return c.json({
      success: true,
      data: {
        id: documentId,
        numeroFacture: result.structuredData.numeroDocument,
        dateFacture: result.structuredData.dateDocument,
        emetteur: result.structuredData.emetteur,
        lignes: result.structuredData.lignes || [],
        montantHT: result.structuredData.montantHT,
        tva: result.structuredData.tva,
        montantTotal: result.structuredData.montantTotal,
        confidence: result.confidence,
        rawText: result.rawText,
      },
    });
  }
);

/**
 * POST /ocr/verify-carte
 * Verify insurance card / attestation
 */
ocr.post(
  '/verify-carte',
  zValidator('json', z.object({ imageData: z.string() })),
  async (c) => {
    const { imageData } = c.req.valid('json');
    const user = c.get('user');

    const documentId = generatePrefixedId('CRT');
    const ocrService = new OCRService(c.env);

    const result = await ocrService.processDocument({
      documentId,
      imageData,
      documentType: 'carte_vitale',
    });

    // Verify against database
    let verificationResult = {
      verified: false,
      adherentFound: false,
      contratActif: false,
      message: '',
    };

    if (result.structuredData.assure?.numeroSecuriteSociale) {
      // In production, query adherents table
      const matricule = result.structuredData.assure.numeroSecuriteSociale;
      const adherent = await getDb(c).prepare(
        'SELECT a.*, c.status as contrat_status FROM adherents a LEFT JOIN contracts c ON a.contract_id = c.id WHERE a.matricule = ?'
      )
        .bind(matricule)
        .first();

      if (adherent) {
        verificationResult = {
          verified: true,
          adherentFound: true,
          contratActif: adherent.contrat_status === 'ACTIVE',
          message: adherent.contrat_status === 'ACTIVE'
            ? 'Carte valide - Adhérent actif'
            : 'Attention: Contrat inactif',
        };
      } else {
        verificationResult = {
          verified: false,
          adherentFound: false,
          contratActif: false,
          message: 'Adhérent non trouvé dans le système',
        };
      }
    }

    await logAudit(getDb(c), {
      userId: user.sub,
      action: 'ocr.verify_carte',
      entityType: 'cartes',
      entityId: documentId,
      changes: {
        verified: verificationResult.verified,
        confidence: result.confidence,
      },
    });

    return c.json({
      success: true,
      data: {
        id: documentId,
        assure: result.structuredData.assure,
        couverture: result.structuredData.couverture,
        verification: verificationResult,
        confidence: result.confidence,
      },
    });
  }
);

/**
 * GET /ocr/stats
 * Get OCR processing statistics
 */
ocr.get('/stats', requireRole('ADMIN', 'SOIN_GESTIONNAIRE'), async (c) => {
  // Mock stats - in production, query from audit logs or dedicated table
  const stats = {
    totalProcessed: 1245,
    thisMonth: 342,
    byType: {
      ordonnance: 580,
      facture: 420,
      carte_vitale: 180,
      attestation: 45,
      autre: 20,
    },
    averageConfidence: 0.82,
    successRate: 94.5,
    averageProcessingTime: 1.2, // seconds
  };

  return c.json({ success: true, data: stats });
});

export { ocr };
