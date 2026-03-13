/**
 * Types for bulletin validation and scan upload
 */

export interface ValidateBulletinResponse {
  id: string;
  status: string;
  reimbursed_amount: number;
  validated_at: string;
  validated_by: string;
}

export interface ScanUploadResponse {
  scan_url: string;
  scan_filename: string;
}
