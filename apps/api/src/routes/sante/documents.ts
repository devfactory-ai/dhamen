/**
 * SoinFlow Documents routes - R2 upload/download sécurisé
 */
import {
  createDocument,
  findDocumentById,
  listDocumentsByDemande,
  updateDocumentOcrStatus,
  deleteDocument,
  findSanteDemandeById,
} from '@dhamen/db';
import { SANTE_TYPES_DOCUMENT } from '@dhamen/shared';
import { Hono } from 'hono';
import { created, notFound, success, forbidden, badRequest } from '../../lib/response';
import { generateId } from '../../lib/ulid';
import { logAudit } from '../../middleware/audit-trail';
import { authMiddleware, requireRole } from '../../middleware/auth';
import type { Bindings, Variables } from '../../types';

const documents = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
documents.use('*', authMiddleware());

// Max file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

/**
 * GET /api/v1/sante/documents/demande/:demandeId
 * List documents for a demande
 */
documents.get(
  '/demande/:demandeId',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'ADHERENT', 'ADMIN'),
  async (c) => {
    const demandeId = c.req.param('demandeId');
    const user = c.get('user');

    // Verify access to the demande
    const demande = await findSanteDemandeById(c.env.DB, demandeId);
    if (!demande) {
      return notFound(c, 'Demande non trouvée');
    }

    // Check access rights
    if (user.role === 'ADHERENT' && demande.adherentId !== user.sub) {
      return forbidden(c, 'Accès non autorisé');
    }
    if (user.role === 'PRATICIEN' && demande.praticienId !== user.providerId) {
      return forbidden(c, 'Accès non autorisé');
    }

    const docs = await listDocumentsByDemande(c.env.DB, demandeId);
    return success(c, docs);
  }
);

/**
 * GET /api/v1/sante/documents/:id
 * Get document metadata
 */
documents.get(
  '/:id',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'ADHERENT', 'ADMIN'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const doc = await findDocumentById(c.env.DB, id);
    if (!doc) {
      return notFound(c, 'Document non trouvé');
    }

    // Verify access through demande
    const demande = await findSanteDemandeById(c.env.DB, doc.demandeId);
    if (!demande) {
      return notFound(c, 'Demande associée non trouvée');
    }

    if (user.role === 'ADHERENT' && demande.adherentId !== user.sub) {
      return forbidden(c, 'Accès non autorisé');
    }
    if (user.role === 'PRATICIEN' && demande.praticienId !== user.providerId) {
      return forbidden(c, 'Accès non autorisé');
    }

    return success(c, doc);
  }
);

/**
 * GET /api/v1/sante/documents/:id/download
 * Download document from R2 (returns signed URL or direct stream)
 */
documents.get(
  '/:id/download',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'ADHERENT', 'ADMIN'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const doc = await findDocumentById(c.env.DB, id);
    if (!doc) {
      return notFound(c, 'Document non trouvé');
    }

    // Verify access through demande
    const demande = await findSanteDemandeById(c.env.DB, doc.demandeId);
    if (!demande) {
      return notFound(c, 'Demande associée non trouvée');
    }

    if (user.role === 'ADHERENT' && demande.adherentId !== user.sub) {
      return forbidden(c, 'Accès non autorisé');
    }
    if (user.role === 'PRATICIEN' && demande.praticienId !== user.providerId) {
      return forbidden(c, 'Accès non autorisé');
    }

    // Get file from R2
    const object = await c.env.STORAGE.get(doc.r2Key);
    if (!object) {
      return notFound(c, 'Fichier non trouvé dans le stockage');
    }

    // Log download
    await logAudit(c.env.DB, {
      userId: user.sub,
      action: 'sante_documents.download',
      entityType: 'sante_documents',
      entityId: id,
      changes: { filename: doc.nomFichier },
    });

    // Return file stream
    const headers = new Headers();
    headers.set('Content-Type', doc.mimeType);
    headers.set('Content-Disposition', `attachment; filename="${doc.nomFichier}"`);
    headers.set('Content-Length', String(doc.tailleOctets));
    headers.set('Cache-Control', 'private, max-age=3600');

    return new Response(object.body, { headers });
  }
);

/**
 * POST /api/v1/sante/documents/upload
 * Upload a document to R2
 */
documents.post(
  '/upload',
  requireRole('ADHERENT', 'PRATICIEN', 'SOIN_AGENT', 'ADMIN'),
  async (c) => {
    const user = c.get('user');
    const contentType = c.req.header('content-type') || '';

    if (!contentType.includes('multipart/form-data')) {
      return badRequest(c, 'Content-Type doit être multipart/form-data');
    }

    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const demandeId = formData.get('demandeId') as string | null;
    const typeDocument = formData.get('typeDocument') as string | null;

    if (!file) {
      return badRequest(c, 'Fichier manquant');
    }
    if (!demandeId) {
      return badRequest(c, 'demandeId manquant');
    }
    if (!typeDocument || !SANTE_TYPES_DOCUMENT.includes(typeDocument as typeof SANTE_TYPES_DOCUMENT[number])) {
      return badRequest(c, 'typeDocument invalide');
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return badRequest(c, 'Fichier trop volumineux (max 10MB)');
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return badRequest(c, 'Type de fichier non autorisé');
    }

    // Verify access to the demande
    const demande = await findSanteDemandeById(c.env.DB, demandeId);
    if (!demande) {
      return notFound(c, 'Demande non trouvée');
    }

    if (user.role === 'ADHERENT' && demande.adherentId !== user.sub) {
      return forbidden(c, 'Accès non autorisé');
    }
    if (user.role === 'PRATICIEN' && demande.praticienId !== user.providerId) {
      return forbidden(c, 'Accès non autorisé');
    }

    // Generate unique R2 key
    const id = generateId();
    const extension = file.name.split('.').pop() || 'bin';
    const r2Key = `sante/documents/${demandeId}/${id}.${extension}`;

    // Upload to R2
    await c.env.STORAGE.put(r2Key, await file.arrayBuffer(), {
      httpMetadata: {
        contentType: file.type,
      },
      customMetadata: {
        demandeId,
        typeDocument,
        originalName: file.name,
        uploadedBy: user.sub,
      },
    });

    // Create document record
    const doc = await createDocument(c.env.DB, id, {
      demandeId,
      typeDocument: typeDocument as typeof SANTE_TYPES_DOCUMENT[number],
      r2Key,
      r2Bucket: 'dhamen-files',
      nomFichier: file.name,
      mimeType: file.type,
      tailleOctets: file.size,
      uploadedBy: user.sub,
    });

    await logAudit(c.env.DB, {
      userId: user.sub,
      action: 'sante_documents.upload',
      entityType: 'sante_documents',
      entityId: id,
      changes: { filename: file.name, size: file.size, type: typeDocument },
    });

    return created(c, doc);
  }
);

/**
 * POST /api/v1/sante/documents/:id/ocr
 * Trigger OCR processing for a document
 */
documents.post(
  '/:id/ocr',
  requireRole('SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'ADMIN'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const doc = await findDocumentById(c.env.DB, id);
    if (!doc) {
      return notFound(c, 'Document non trouvé');
    }

    // Check if already processed
    if (doc.ocrStatus === 'completed') {
      return success(c, { message: 'OCR déjà effectué', ocrResult: doc.ocrResultJson });
    }

    // Mark as processing
    await updateDocumentOcrStatus(c.env.DB, id, 'processing');

    // Get file from R2
    const object = await c.env.STORAGE.get(doc.r2Key);
    if (!object) {
      await updateDocumentOcrStatus(c.env.DB, id, 'failed');
      return notFound(c, 'Fichier non trouvé dans le stockage');
    }

    // TODO: Call Workers AI OCR
    // For now, mark as skipped (OCR implementation in future sprint)
    await updateDocumentOcrStatus(c.env.DB, id, 'skipped');

    await logAudit(c.env.DB, {
      userId: user.sub,
      action: 'sante_documents.ocr_trigger',
      entityType: 'sante_documents',
      entityId: id,
      changes: {},
    });

    return success(c, { message: 'OCR en attente de configuration' });
  }
);

/**
 * DELETE /api/v1/sante/documents/:id
 * Delete a document (soft delete from R2, hard delete from DB)
 */
documents.delete(
  '/:id',
  requireRole('SOIN_GESTIONNAIRE', 'ADMIN'),
  async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');

    const doc = await findDocumentById(c.env.DB, id);
    if (!doc) {
      return notFound(c, 'Document non trouvé');
    }

    // Archive in R2 instead of hard delete
    const object = await c.env.STORAGE.get(doc.r2Key);
    if (object) {
      const archiveKey = doc.r2Key.replace('sante/documents/', 'sante/archives/');
      await c.env.STORAGE.put(archiveKey, await object.arrayBuffer(), {
        httpMetadata: object.httpMetadata,
        customMetadata: {
          ...object.customMetadata,
          archivedAt: new Date().toISOString(),
          archivedBy: user.sub,
        },
      });
      await c.env.STORAGE.delete(doc.r2Key);
    }

    // Delete from database
    await deleteDocument(c.env.DB, id);

    await logAudit(c.env.DB, {
      userId: user.sub,
      action: 'sante_documents.delete',
      entityType: 'sante_documents',
      entityId: id,
      changes: { filename: doc.nomFichier },
    });

    return success(c, { message: 'Document supprimé' });
  }
);

export { documents };
