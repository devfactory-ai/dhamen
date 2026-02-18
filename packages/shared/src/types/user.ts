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
] as const;

export type Role = (typeof ROLES)[number];

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: Role;
  providerId: string | null;
  insurerId: string | null;
  firstName: string;
  lastName: string;
  phone: string | null;
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
  firstName: string;
  lastName: string;
  phone: string | null;
  mfaEnabled: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface JWTPayload {
  sub: string;
  role: Role;
  providerId?: string;
  insurerId?: string;
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
