/**
 * Document Management Routes
 *
 * Handles document upload, download, and management via R2
 */
import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import {
  DocumentService,
  type DocumentCategory,
  type EntityType,
} from '../services/document.service';

const documents = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All document routes require authentication
documents.use('*', requireAuth);

/**
 * POST /documents/upload
 * Upload a new document
 */
documents.post('/upload', async (c) => {
  const user = c.get('user');

  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const category = formData.get('category') as DocumentCategory;
    const entityType = formData.get('entityType') as EntityType;
    const entityId = formData.get('entityId') as string;
    const tags = formData.get('tags') as string | null;
    const expiresIn = formData.get('expiresIn') as string | null;

    if (!file) {
      return c.json(
        {
          success: false,
          error: { code: 'FILE_REQUIRED', message: 'Fichier requis' },
        },
        400
      );
    }

    if (!category || !entityType || !entityId) {
      return c.json(
        {
          success: false,
          error: {
            code: 'MISSING_PARAMS',
            message: 'category, entityType et entityId sont requis',
          },
        },
        400
      );
    }

    const documentService = new DocumentService(c.env);

    const result = await documentService.upload({
      file: await file.arrayBuffer(),
      fileName: file.name,
      mimeType: file.type,
      category,
      entityType,
      entityId,
      uploadedBy: user.id,
      tags: tags ? JSON.parse(tags) : undefined,
      expiresIn: expiresIn ? parseInt(expiresIn, 10) : undefined,
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return c.json(
      {
        success: false,
        error: {
          code: 'UPLOAD_FAILED',
          message: error instanceof Error ? error.message : 'Upload failed',
        },
      },
      500
    );
  }
});

/**
 * GET /documents/:id
 * Get document metadata
 */
documents.get('/:id', async (c) => {
  const id = c.req.param('id');
  const documentService = new DocumentService(c.env);

  const metadata = await documentService.getMetadata(id);

  if (!metadata) {
    return c.json(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Document non trouvé' },
      },
      404
    );
  }

  return c.json({
    success: true,
    data: metadata,
  });
});

/**
 * GET /documents/:id/download
 * Download document file
 */
documents.get('/:id/download', async (c) => {
  const id = c.req.param('id');
  const documentService = new DocumentService(c.env);

  const doc = await documentService.getById(id);

  if (!doc) {
    return c.json(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Document non trouvé' },
      },
      404
    );
  }

  // Check if document is expired
  if (doc.metadata.expiresAt && new Date(doc.metadata.expiresAt) < new Date()) {
    return c.json(
      {
        success: false,
        error: { code: 'DOCUMENT_EXPIRED', message: 'Document expiré' },
      },
      410
    );
  }

  const disposition = c.req.query('disposition') || 'inline';

  return new Response(doc.data, {
    headers: {
      'Content-Type': doc.metadata.mimeType,
      'Content-Disposition': `${disposition}; filename="${doc.metadata.originalName}"`,
      'Content-Length': doc.metadata.size.toString(),
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

/**
 * GET /documents/:id/url
 * Get signed URL for document
 */
documents.get('/:id/url', async (c) => {
  const id = c.req.param('id');
  const expiresIn = parseInt(c.req.query('expiresIn') || '3600', 10);

  const documentService = new DocumentService(c.env);

  try {
    const url = await documentService.getSignedUrl(id, { expiresIn });

    return c.json({
      success: true,
      data: { url, expiresIn },
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: 'URL_GENERATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to generate URL',
        },
      },
      400
    );
  }
});

/**
 * GET /documents
 * List documents with filters
 */
documents.get('/', async (c) => {
  const entityType = c.req.query('entityType') as EntityType | undefined;
  const entityId = c.req.query('entityId');
  const category = c.req.query('category') as DocumentCategory | undefined;
  const uploadedBy = c.req.query('uploadedBy');
  const limit = parseInt(c.req.query('limit') || '20', 10);
  const cursor = c.req.query('cursor');

  const documentService = new DocumentService(c.env);

  const result = await documentService.list({
    entityType,
    entityId,
    category,
    uploadedBy,
    limit,
    cursor,
  });

  return c.json({
    success: true,
    data: result.documents,
    meta: {
      hasMore: result.hasMore,
      cursor: result.cursor,
    },
  });
});

/**
 * GET /documents/entity/:entityType/:entityId
 * Get all documents for a specific entity
 */
documents.get('/entity/:entityType/:entityId', async (c) => {
  const entityType = c.req.param('entityType') as EntityType;
  const entityId = c.req.param('entityId');

  const documentService = new DocumentService(c.env);
  const documents = await documentService.getEntityDocuments(entityType, entityId);

  return c.json({
    success: true,
    data: documents,
  });
});

/**
 * PUT /documents/:id
 * Update document (upload new version)
 */
documents.put('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    const category = formData.get('category') as DocumentCategory;
    const tags = formData.get('tags') as string | null;

    if (!file) {
      return c.json(
        {
          success: false,
          error: { code: 'FILE_REQUIRED', message: 'Fichier requis' },
        },
        400
      );
    }

    const documentService = new DocumentService(c.env);

    const result = await documentService.update(id, {
      file: await file.arrayBuffer(),
      fileName: file.name,
      mimeType: file.type,
      category,
      uploadedBy: user.id,
      tags: tags ? JSON.parse(tags) : undefined,
    });

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message: error instanceof Error ? error.message : 'Update failed',
        },
      },
      500
    );
  }
});

/**
 * DELETE /documents/:id
 * Soft delete a document
 */
documents.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const documentService = new DocumentService(c.env);
  const success = await documentService.delete(id, user.id);

  if (!success) {
    return c.json(
      {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Document non trouvé' },
      },
      404
    );
  }

  return c.json({
    success: true,
    data: { deleted: true },
  });
});

/**
 * POST /documents/:id/copy
 * Copy document to another entity
 */
documents.post('/:id/copy', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const body = await c.req.json<{
    targetEntityType: EntityType;
    targetEntityId: string;
  }>();

  if (!body.targetEntityType || !body.targetEntityId) {
    return c.json(
      {
        success: false,
        error: {
          code: 'MISSING_PARAMS',
          message: 'targetEntityType et targetEntityId sont requis',
        },
      },
      400
    );
  }

  const documentService = new DocumentService(c.env);

  try {
    const result = await documentService.copyTo(
      id,
      body.targetEntityType,
      body.targetEntityId,
      user.id
    );

    return c.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return c.json(
      {
        success: false,
        error: {
          code: 'COPY_FAILED',
          message: error instanceof Error ? error.message : 'Copy failed',
        },
      },
      500
    );
  }
});

/**
 * POST /documents/:id/move
 * Move document to another entity
 */
documents.post('/:id/move', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const body = await c.req.json<{
    targetEntityType: EntityType;
    targetEntityId: string;
  }>();

  if (!body.targetEntityType || !body.targetEntityId) {
    return c.json(
      {
        success: false,
        error: {
          code: 'MISSING_PARAMS',
          message: 'targetEntityType et targetEntityId sont requis',
        },
      },
      400
    );
  }

  const documentService = new DocumentService(c.env);

  const success = await documentService.moveTo(
    id,
    body.targetEntityType,
    body.targetEntityId,
    user.id
  );

  return c.json({
    success: true,
    data: { moved: success },
  });
});

/**
 * GET /documents/:id/versions
 * Get all versions of a document
 */
documents.get('/:id/versions', async (c) => {
  const id = c.req.param('id');

  const documentService = new DocumentService(c.env);
  const versions = await documentService.getVersions(id);

  return c.json({
    success: true,
    data: versions,
  });
});

/**
 * GET /documents/stats
 * Get document storage statistics
 */
documents.get(
  '/stats',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const insurerId = c.req.query('insurerId');
    const user = c.get('user');

    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    const documentService = new DocumentService(c.env);
    const stats = await documentService.getStats(effectiveInsurerId);

    return c.json({
      success: true,
      data: stats,
    });
  }
);

/**
 * POST /documents/cleanup
 * Clean up expired documents (admin only)
 */
documents.post(
  '/cleanup',
  requireRole('ADMIN'),
  async (c) => {
    const documentService = new DocumentService(c.env);
    const result = await documentService.cleanupExpired();

    return c.json({
      success: true,
      data: result,
    });
  }
);

/**
 * DELETE /documents/:id/permanent
 * Permanently delete a document (admin only)
 */
documents.delete(
  '/:id/permanent',
  requireRole('ADMIN'),
  async (c) => {
    const id = c.req.param('id');

    const documentService = new DocumentService(c.env);
    const success = await documentService.permanentDelete(id);

    if (!success) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Document non trouvé' },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: { deleted: true, permanent: true },
    });
  }
);

export default documents;
