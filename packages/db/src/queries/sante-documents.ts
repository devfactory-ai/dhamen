/**
 * SoinFlow Documents queries
 */
import type { SanteDocument, SanteTypeDocument } from '@dhamen/shared';

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes: number } }>;
};

interface SanteDocumentRow {
  id: string;
  demande_id: string;
  type_document: SanteTypeDocument;
  r2_key: string;
  r2_bucket: string;
  nom_fichier: string;
  mime_type: string;
  taille_octets: number;
  ocr_status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  ocr_result_json: string | null;
  ocr_attempts: number;
  uploaded_by: string | null;
  created_at: string;
}

function rowToDocument(row: SanteDocumentRow): SanteDocument {
  return {
    id: row.id,
    demandeId: row.demande_id,
    typeDocument: row.type_document,
    r2Key: row.r2_key,
    r2Bucket: row.r2_bucket,
    nomFichier: row.nom_fichier,
    mimeType: row.mime_type,
    tailleOctets: row.taille_octets,
    ocrStatus: row.ocr_status,
    ocrResultJson: row.ocr_result_json,
    ocrAttempts: row.ocr_attempts ?? 0,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

export async function findDocumentById(
  db: D1Database,
  id: string
): Promise<SanteDocument | null> {
  const row = await db
    .prepare('SELECT * FROM sante_documents WHERE id = ?')
    .bind(id)
    .first<SanteDocumentRow>();

  return row ? rowToDocument(row) : null;
}

export async function listDocumentsByDemande(
  db: D1Database,
  demandeId: string
): Promise<SanteDocument[]> {
  const { results } = await db
    .prepare('SELECT * FROM sante_documents WHERE demande_id = ? ORDER BY created_at DESC')
    .bind(demandeId)
    .all<SanteDocumentRow>();

  return results.map(rowToDocument);
}

export async function createDocument(
  db: D1Database,
  id: string,
  data: {
    demandeId: string;
    typeDocument: SanteTypeDocument;
    r2Key: string;
    r2Bucket?: string;
    nomFichier: string;
    mimeType: string;
    tailleOctets: number;
    uploadedBy?: string;
  }
): Promise<SanteDocument> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO sante_documents (
        id, demande_id, type_document, r2_key, r2_bucket,
        nom_fichier, mime_type, taille_octets, uploaded_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      data.demandeId,
      data.typeDocument,
      data.r2Key,
      data.r2Bucket ?? 'dhamen-files',
      data.nomFichier,
      data.mimeType,
      data.tailleOctets,
      data.uploadedBy ?? null,
      now
    )
    .run();

  const document = await findDocumentById(db, id);
  if (!document) {
    throw new Error('Failed to create document');
  }
  return document;
}

export async function updateDocumentOcrStatus(
  db: D1Database,
  id: string,
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped',
  resultJson?: string
): Promise<void> {
  if (resultJson) {
    await db
      .prepare('UPDATE sante_documents SET ocr_status = ?, ocr_result_json = ? WHERE id = ?')
      .bind(status, resultJson, id)
      .run();
  } else {
    await db
      .prepare('UPDATE sante_documents SET ocr_status = ? WHERE id = ?')
      .bind(status, id)
      .run();
  }
}

export async function deleteDocument(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM sante_documents WHERE id = ?')
    .bind(id)
    .run();

  return result.meta.changes > 0;
}

export async function incrementOcrAttempts(db: D1Database, id: string): Promise<void> {
  await db
    .prepare(
      'UPDATE sante_documents SET ocr_attempts = ocr_attempts + 1, updated_at = ? WHERE id = ?'
    )
    .bind(new Date().toISOString(), id)
    .run();
}

export async function resetStaleOcrProcessing(db: D1Database): Promise<number> {
  const threshold = new Date(Date.now() - 60_000).toISOString();
  const result = await db
    .prepare(
      'UPDATE sante_documents SET ocr_status = ? WHERE ocr_status = ? AND updated_at < ?'
    )
    .bind('pending', 'processing', threshold)
    .run();
  return result.meta.changes ?? 0;
}

export async function countDocumentsByDemande(db: D1Database, demandeId: string): Promise<number> {
  const result = await db
    .prepare('SELECT COUNT(*) as count FROM sante_documents WHERE demande_id = ?')
    .bind(demandeId)
    .first<{ count: number }>();

  return result?.count ?? 0;
}
