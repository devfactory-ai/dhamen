/**
 * Document Management Service (R2)
 *
 * Manages document storage, retrieval, and lifecycle in Cloudflare R2
 */

import type { Bindings } from '../types';

export interface DocumentMetadata {
  id: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  category: DocumentCategory;
  entityType: EntityType;
  entityId: string;
  uploadedBy: string;
  uploadedAt: string;
  expiresAt?: string;
  tags?: string[];
  checksum?: string;
  isEncrypted?: boolean;
  version?: number;
  previousVersionId?: string;
}

export type DocumentCategory =
  | 'ordonnance'
  | 'facture'
  | 'carte_assurance'
  | 'justificatif'
  | 'rapport_medical'
  | 'convention'
  | 'bordereau'
  | 'autre';

export type EntityType =
  | 'claim'
  | 'adherent'
  | 'provider'
  | 'contract'
  | 'insurer'
  | 'bordereau'
  | 'user';

export interface UploadRequest {
  file: ArrayBuffer;
  fileName: string;
  mimeType: string;
  category: DocumentCategory;
  entityType: EntityType;
  entityId: string;
  uploadedBy: string;
  tags?: string[];
  expiresIn?: number; // days
  encrypt?: boolean;
}

export interface UploadResult {
  id: string;
  url: string;
  metadata: DocumentMetadata;
}

export interface DocumentListParams {
  entityType?: EntityType;
  entityId?: string;
  category?: DocumentCategory;
  uploadedBy?: string;
  limit?: number;
  cursor?: string;
}

export interface SignedUrlOptions {
  expiresIn?: number; // seconds, default 3600
  disposition?: 'inline' | 'attachment';
}

export class DocumentService {
  private readonly BUCKET_PREFIX = 'documents/';
  private readonly MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
  private readonly ALLOWED_MIME_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  constructor(private env: Bindings) {}

  /**
   * Upload a document to R2
   */
  async upload(request: UploadRequest): Promise<UploadResult> {
    // Validate file size
    if (request.file.byteLength > this.MAX_FILE_SIZE) {
      throw new Error(
        `File size exceeds maximum allowed (${this.MAX_FILE_SIZE / 1024 / 1024}MB)`
      );
    }

    // Validate MIME type
    if (!this.ALLOWED_MIME_TYPES.includes(request.mimeType)) {
      throw new Error(`File type ${request.mimeType} is not allowed`);
    }

    // Generate unique document ID
    const id = this.generateDocumentId();
    const timestamp = new Date().toISOString();

    // Calculate checksum
    const checksum = await this.calculateChecksum(request.file);

    // Generate storage key
    const extension = this.getExtension(request.fileName);
    const storageKey = this.buildStorageKey(
      request.entityType,
      request.entityId,
      request.category,
      id,
      extension
    );

    // Calculate expiration if specified
    const expiresAt = request.expiresIn
      ? new Date(Date.now() + request.expiresIn * 24 * 60 * 60 * 1000).toISOString()
      : undefined;

    // Create metadata
    const metadata: DocumentMetadata = {
      id,
      fileName: storageKey,
      originalName: request.fileName,
      mimeType: request.mimeType,
      size: request.file.byteLength,
      category: request.category,
      entityType: request.entityType,
      entityId: request.entityId,
      uploadedBy: request.uploadedBy,
      uploadedAt: timestamp,
      expiresAt,
      tags: request.tags,
      checksum,
      isEncrypted: request.encrypt || false,
      version: 1,
    };

    // Upload to R2
    await this.env.STORAGE.put(storageKey, request.file, {
      httpMetadata: {
        contentType: request.mimeType,
      },
      customMetadata: {
        id,
        originalName: request.fileName,
        category: request.category,
        entityType: request.entityType,
        entityId: request.entityId,
        uploadedBy: request.uploadedBy,
        uploadedAt: timestamp,
        checksum,
        ...(expiresAt && { expiresAt }),
        ...(request.tags && { tags: JSON.stringify(request.tags) }),
      },
    });

    // Store metadata in D1 for queryability
    await this.saveMetadata(metadata);

    // Generate URL
    const url = await this.getSignedUrl(id);

    return {
      id,
      url,
      metadata,
    };
  }

  /**
   * Get document by ID
   */
  async getById(id: string): Promise<{
    data: ArrayBuffer;
    metadata: DocumentMetadata;
  } | null> {
    const metadata = await this.getMetadata(id);
    if (!metadata) return null;

    const object = await this.env.STORAGE.get(metadata.fileName);
    if (!object) return null;

    const data = await object.arrayBuffer();

    return { data, metadata };
  }

  /**
   * Get document metadata only
   */
  async getMetadata(id: string): Promise<DocumentMetadata | null> {
    const result = await this.env.DB.prepare(
      `SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL`
    )
      .bind(id)
      .first<{
        id: string;
        file_name: string;
        original_name: string;
        mime_type: string;
        size: number;
        category: DocumentCategory;
        entity_type: EntityType;
        entity_id: string;
        uploaded_by: string;
        uploaded_at: string;
        expires_at: string | null;
        tags: string | null;
        checksum: string | null;
        is_encrypted: number;
        version: number;
        previous_version_id: string | null;
      }>();

    if (!result) return null;

    return {
      id: result.id,
      fileName: result.file_name,
      originalName: result.original_name,
      mimeType: result.mime_type,
      size: result.size,
      category: result.category,
      entityType: result.entity_type,
      entityId: result.entity_id,
      uploadedBy: result.uploaded_by,
      uploadedAt: result.uploaded_at,
      expiresAt: result.expires_at || undefined,
      tags: result.tags ? JSON.parse(result.tags) : undefined,
      checksum: result.checksum || undefined,
      isEncrypted: result.is_encrypted === 1,
      version: result.version,
      previousVersionId: result.previous_version_id || undefined,
    };
  }

  /**
   * List documents with filters
   */
  async list(params: DocumentListParams): Promise<{
    documents: DocumentMetadata[];
    cursor?: string;
    hasMore: boolean;
  }> {
    const conditions: string[] = ['deleted_at IS NULL'];
    const bindings: unknown[] = [];

    if (params.entityType) {
      conditions.push('entity_type = ?');
      bindings.push(params.entityType);
    }

    if (params.entityId) {
      conditions.push('entity_id = ?');
      bindings.push(params.entityId);
    }

    if (params.category) {
      conditions.push('category = ?');
      bindings.push(params.category);
    }

    if (params.uploadedBy) {
      conditions.push('uploaded_by = ?');
      bindings.push(params.uploadedBy);
    }

    if (params.cursor) {
      conditions.push('id < ?');
      bindings.push(params.cursor);
    }

    const limit = params.limit || 20;
    bindings.push(limit + 1); // Fetch one extra to check for more

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const { results } = await this.env.DB.prepare(
      `SELECT * FROM documents ${whereClause} ORDER BY uploaded_at DESC, id DESC LIMIT ?`
    )
      .bind(...bindings)
      .all<{
        id: string;
        file_name: string;
        original_name: string;
        mime_type: string;
        size: number;
        category: DocumentCategory;
        entity_type: EntityType;
        entity_id: string;
        uploaded_by: string;
        uploaded_at: string;
        expires_at: string | null;
        tags: string | null;
        checksum: string | null;
        is_encrypted: number;
        version: number;
        previous_version_id: string | null;
      }>();

    const hasMore = (results?.length || 0) > limit;
    const documents = (results || []).slice(0, limit).map((r) => ({
      id: r.id,
      fileName: r.file_name,
      originalName: r.original_name,
      mimeType: r.mime_type,
      size: r.size,
      category: r.category,
      entityType: r.entity_type,
      entityId: r.entity_id,
      uploadedBy: r.uploaded_by,
      uploadedAt: r.uploaded_at,
      expiresAt: r.expires_at || undefined,
      tags: r.tags ? JSON.parse(r.tags) : undefined,
      checksum: r.checksum || undefined,
      isEncrypted: r.is_encrypted === 1,
      version: r.version,
      previousVersionId: r.previous_version_id || undefined,
    }));

    const lastDoc = documents[documents.length - 1];
    return {
      documents,
      cursor: hasMore && lastDoc ? lastDoc.id : undefined,
      hasMore,
    };
  }

  /**
   * Get signed URL for document download
   */
  async getSignedUrl(
    id: string,
    options: SignedUrlOptions = {}
  ): Promise<string> {
    const metadata = await this.getMetadata(id);
    if (!metadata) {
      throw new Error('Document not found');
    }

    // Check if document is expired
    if (metadata.expiresAt && new Date(metadata.expiresAt) < new Date()) {
      throw new Error('Document has expired');
    }

    // For R2, we create a signed URL or return a presigned URL
    // In production, you would use R2's presigned URL feature
    // For now, we return a route that serves the file
    const baseUrl = this.env.API_BASE_URL || '';
    return `${baseUrl}/api/v1/documents/${id}/download`;
  }

  /**
   * Update document (creates new version)
   */
  async update(
    id: string,
    request: Omit<UploadRequest, 'entityType' | 'entityId'>
  ): Promise<UploadResult> {
    const existingDoc = await this.getMetadata(id);
    if (!existingDoc) {
      throw new Error('Document not found');
    }

    // Upload new version
    const result = await this.upload({
      ...request,
      entityType: existingDoc.entityType,
      entityId: existingDoc.entityId,
    });

    // Update version info
    await this.env.DB.prepare(
      `UPDATE documents
       SET version = ?, previous_version_id = ?, updated_at = datetime('now')
       WHERE id = ?`
    )
      .bind((existingDoc.version ?? 0) + 1, id, result.id)
      .run();

    return result;
  }

  /**
   * Delete document (soft delete)
   */
  async delete(id: string, deletedBy: string): Promise<boolean> {
    const metadata = await this.getMetadata(id);
    if (!metadata) return false;

    // Soft delete in D1
    await this.env.DB.prepare(
      `UPDATE documents SET deleted_at = datetime('now'), deleted_by = ? WHERE id = ?`
    )
      .bind(deletedBy, id)
      .run();

    // Optionally, you can also delete from R2 or keep for compliance
    // await this.env.STORAGE.delete(metadata.fileName);

    return true;
  }

  /**
   * Permanently delete document (use with caution)
   */
  async permanentDelete(id: string): Promise<boolean> {
    const metadata = await this.getMetadata(id);
    if (!metadata) return false;

    // Delete from R2
    await this.env.STORAGE.delete(metadata.fileName);

    // Delete from D1
    await this.env.DB.prepare(`DELETE FROM documents WHERE id = ?`)
      .bind(id)
      .run();

    return true;
  }

  /**
   * Get documents for an entity
   */
  async getEntityDocuments(
    entityType: EntityType,
    entityId: string
  ): Promise<DocumentMetadata[]> {
    const { documents } = await this.list({ entityType, entityId, limit: 100 });
    return documents;
  }

  /**
   * Copy document to another entity
   */
  async copyTo(
    id: string,
    targetEntityType: EntityType,
    targetEntityId: string,
    copiedBy: string
  ): Promise<UploadResult> {
    const doc = await this.getById(id);
    if (!doc) {
      throw new Error('Document not found');
    }

    return this.upload({
      file: doc.data,
      fileName: doc.metadata.originalName,
      mimeType: doc.metadata.mimeType,
      category: doc.metadata.category,
      entityType: targetEntityType,
      entityId: targetEntityId,
      uploadedBy: copiedBy,
      tags: doc.metadata.tags,
    });
  }

  /**
   * Move document to another entity
   */
  async moveTo(
    id: string,
    targetEntityType: EntityType,
    targetEntityId: string,
    movedBy: string
  ): Promise<boolean> {
    await this.env.DB.prepare(
      `UPDATE documents
       SET entity_type = ?, entity_id = ?, updated_at = datetime('now'), updated_by = ?
       WHERE id = ?`
    )
      .bind(targetEntityType, targetEntityId, movedBy, id)
      .run();

    return true;
  }

  /**
   * Get document versions
   */
  async getVersions(id: string): Promise<DocumentMetadata[]> {
    const versions: DocumentMetadata[] = [];
    let currentId: string | undefined = id;

    while (currentId) {
      const doc = await this.getMetadata(currentId);
      if (!doc) break;
      versions.push(doc);
      currentId = doc.previousVersionId;
    }

    return versions;
  }

  /**
   * Clean up expired documents
   */
  async cleanupExpired(): Promise<{ deleted: number }> {
    const { results } = await this.env.DB.prepare(
      `SELECT id, file_name FROM documents
       WHERE expires_at IS NOT NULL AND expires_at < datetime('now') AND deleted_at IS NULL`
    ).all<{ id: string; file_name: string }>();

    if (!results || results.length === 0) {
      return { deleted: 0 };
    }

    // Delete from R2
    for (const doc of results) {
      await this.env.STORAGE.delete(doc.file_name);
    }

    // Mark as deleted in D1
    await this.env.DB.prepare(
      `UPDATE documents
       SET deleted_at = datetime('now'), deleted_by = 'system-cleanup'
       WHERE expires_at IS NOT NULL AND expires_at < datetime('now') AND deleted_at IS NULL`
    ).run();

    return { deleted: results.length };
  }

  /**
   * Get storage statistics
   */
  async getStats(insurerId?: string): Promise<{
    totalDocuments: number;
    totalSize: number;
    byCategory: { category: string; count: number; size: number }[];
    byEntityType: { entityType: string; count: number; size: number }[];
  }> {
    const insurerFilter = insurerId
      ? `AND entity_id IN (
          SELECT id FROM adherents a JOIN contracts c ON a.contract_id = c.id WHERE c.insurer_id = '${insurerId}'
          UNION SELECT id FROM contracts WHERE insurer_id = '${insurerId}'
          UNION SELECT '${insurerId}'
        )`
      : '';

    const stats = await this.env.DB.prepare(
      `SELECT COUNT(*) as total, COALESCE(SUM(size), 0) as total_size
       FROM documents WHERE deleted_at IS NULL ${insurerFilter}`
    ).first<{ total: number; total_size: number }>();

    const { results: byCategory } = await this.env.DB.prepare(
      `SELECT category, COUNT(*) as count, COALESCE(SUM(size), 0) as size
       FROM documents WHERE deleted_at IS NULL ${insurerFilter}
       GROUP BY category ORDER BY count DESC`
    ).all<{ category: string; count: number; size: number }>();

    const { results: byEntityType } = await this.env.DB.prepare(
      `SELECT entity_type as entityType, COUNT(*) as count, COALESCE(SUM(size), 0) as size
       FROM documents WHERE deleted_at IS NULL ${insurerFilter}
       GROUP BY entity_type ORDER BY count DESC`
    ).all<{ entityType: string; count: number; size: number }>();

    return {
      totalDocuments: stats?.total || 0,
      totalSize: stats?.total_size || 0,
      byCategory: byCategory || [],
      byEntityType: byEntityType || [],
    };
  }

  // Private helper methods

  private generateDocumentId(): string {
    // Generate ULID-like ID
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `doc_${timestamp}${random}`;
  }

  private buildStorageKey(
    entityType: EntityType,
    entityId: string,
    category: DocumentCategory,
    id: string,
    extension: string
  ): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    return `${this.BUCKET_PREFIX}${entityType}/${entityId}/${year}/${month}/${category}/${id}${extension}`;
  }

  private getExtension(fileName: string): string {
    const parts = fileName.split('.');
    const lastPart = parts[parts.length - 1];
    if (parts.length > 1 && lastPart) {
      return '.' + lastPart.toLowerCase();
    }
    return '';
  }

  private async calculateChecksum(data: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  private async saveMetadata(metadata: DocumentMetadata): Promise<void> {
    await this.env.DB.prepare(
      `INSERT INTO documents (
        id, file_name, original_name, mime_type, size, category,
        entity_type, entity_id, uploaded_by, uploaded_at, expires_at,
        tags, checksum, is_encrypted, version, previous_version_id,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    )
      .bind(
        metadata.id,
        metadata.fileName,
        metadata.originalName,
        metadata.mimeType,
        metadata.size,
        metadata.category,
        metadata.entityType,
        metadata.entityId,
        metadata.uploadedBy,
        metadata.uploadedAt,
        metadata.expiresAt || null,
        metadata.tags ? JSON.stringify(metadata.tags) : null,
        metadata.checksum || null,
        metadata.isEncrypted ? 1 : 0,
        metadata.version || 1,
        metadata.previousVersionId || null
      )
      .run();
  }
}
