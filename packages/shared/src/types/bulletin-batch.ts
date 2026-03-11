/**
 * Bulletin batch types for agent lot management
 */

export const BATCH_STATUSES = ['open', 'closed', 'exported'] as const;

export type BatchStatus = (typeof BATCH_STATUSES)[number];

export interface BulletinBatch {
  id: string;
  name: string;
  status: BatchStatus;
  companyId: string | null;
  createdBy: string;
  createdAt: string;
  exportedAt: string | null;
}
