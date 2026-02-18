import { z } from 'zod';
import { ROLES } from '../types/user';

export const roleSchema = z.enum(ROLES);

export const loginRequestSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
});

export const mfaVerifyRequestSchema = z.object({
  mfaToken: z.string().min(1, 'Token MFA requis'),
  otpCode: z.string().length(6, 'Code OTP doit contenir 6 chiffres'),
});

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requis'),
});

export const userCreateSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  role: roleSchema,
  providerId: z.string().optional(),
  insurerId: z.string().optional(),
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  phone: z.string().optional(),
});

export const userUpdateSchema = z.object({
  email: z.string().email('Email invalide').optional(),
  password: z.string().min(8).optional(),
  role: roleSchema.optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  mfaEnabled: z.boolean().optional(),
});

export type LoginRequestInput = z.infer<typeof loginRequestSchema>;
export type MFAVerifyRequestInput = z.infer<typeof mfaVerifyRequestSchema>;
export type RefreshRequestInput = z.infer<typeof refreshRequestSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
