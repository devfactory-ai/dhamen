/**
 * User types and authentication related types
 */

export const ROLES = [
  'ADMIN',
  'INSURER_ADMIN',
  'INSURER_AGENT',
  'PHARMACIST',
  'DOCTOR',
  'LAB_MANAGER',
  'CLINIC_ADMIN',
  'ADHERENT',
  // HR role - Company HR staff who manage employees/adherents
  'HR',
  // SoinFlow roles
  'SOIN_GESTIONNAIRE',
  'SOIN_AGENT',
  'PRATICIEN',
  'SOIN_RESPONSABLE',
  'SOIN_DIRECTEUR',
  // Compliance
  'COMPLIANCE_OFFICER',
] as const;

export type Role = (typeof ROLES)[number];

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  providerId: string | null;
  insurerId: string | null;
  companyId: string | null; // For HR users - linked company
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  mfaEnabled: boolean;
  mfaSecret: string | null;
  lastLoginAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserPublic {
  id: string;
  email: string;
  role: Role;
  providerId: string | null;
  insurerId: string | null;
  companyId: string | null;
  companyName: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
  avatarUrl: string | null;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface JWTPayload {
  /** User ID (same as sub for compatibility) */
  id: string;
  sub: string;
  /** User email */
  email: string;
  /** User first name */
  firstName?: string;
  /** User last name */
  lastName?: string;
  role: Role;
  providerId?: string;
  insurerId?: string;
  /** Company ID for HR users */
  companyId?: string;
  /** Purpose for limited-scope tokens (e.g., 'mfa_setup', 'mfa_verify') */
  purpose?: 'mfa_setup' | 'mfa_verify' | 'password_reset' | 'magic_link';
  iat: number;
  exp: number;
  iss: 'dhamen';
}

export interface RefreshTokenPayload {
  sub: string;
  type: 'refresh';
  iat: number;
  exp: number;
  iss: 'dhamen';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  requiresMfa: boolean;
  mfaToken?: string;
  tokens?: AuthTokens;
  user?: UserPublic;
}

export interface MFAVerifyRequest {
  mfaToken: string;
  otpCode: string;
}

export interface RefreshRequest {
  refreshToken: string;
}
