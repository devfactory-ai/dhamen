import { apiClient } from '@/lib/api-client';

interface UploadResult {
  id: string;
  r2_key: string;
  file_hash: string;
}

/**
 * Upload a single file via legacy upload-scan endpoint.
 */
export async function uploadFilePresigned(bulletinId: string, file: File): Promise<UploadResult> {
  const formData = new FormData();
  formData.append('scan', file);
  const res = await apiClient.upload<{ id: string; r2_key: string }>(
    `/bulletins-soins/agent/${bulletinId}/upload-scan`,
    formData
  );
  if (!res.success) {
    const msg = 'error' in res ? res.error?.message : 'Erreur upload';
    throw new Error(msg || 'Erreur upload');
  }
  return { id: res.data.id, r2_key: res.data.r2_key, file_hash: '' };
}

/**
 * Upload multiple files sequentially (avoids Worker CPU overload).
 * Returns count of failed uploads.
 */
export async function uploadFilesSequential(bulletinId: string, files: File[]): Promise<number> {
  let failedCount = 0;
  for (const file of files) {
    try {
      await uploadFilePresigned(bulletinId, file);
    } catch {
      failedCount++;
    }
  }
  return failedCount;
}
