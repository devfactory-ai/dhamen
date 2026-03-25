import { z } from 'zod';
import { ROLES } from '../types/user';

export const roleSchema = z.enum(ROLES);

/**
 * Password complexity requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caracteres')
  .regex(/[A-Z]/, 'Le mot de passe doit contenir au moins une majuscule')
  .regex(/[a-z]/, 'Le mot de passe doit contenir au moins une minuscule')
  .regex(/[0-9]/, 'Le mot de passe doit contenir au moins un chiffre')
  .regex(/[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/`~]/, 'Le mot de passe doit contenir au moins un caractere special');

/**
 * Login schema - less strict for login attempts (don't reveal password requirements)
 */
export const loginRequestSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
  turnstileToken: z.string().optional(),
  persistSession: z.boolean().optional(),
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
  password: passwordSchema,
  role: roleSchema,
  providerId: z.string().optional(),
  insurerId: z.string().optional(),
  firstName: z.string().min(1, 'Prenom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  phone: z.string().optional(),
});

export const userUpdateSchema = z.object({
  email: z.string().email('Email invalide').optional(),
  password: passwordSchema.optional(),
  role: roleSchema.optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  phone: z.string().optional(),
  isActive: z.boolean().optional(),
  mfaEnabled: z.boolean().optional(),
});

/**
 * Password change schema with current password verification
 */
export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword: passwordSchema,
  confirmPassword: z.string().min(1, 'Confirmation requise'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Les mots de passe ne correspondent pas',
  path: ['confirmPassword'],
});

export const mfaEmailSendSchema = z.object({
  mfaToken: z.string().min(1, 'Token MFA requis'),
});

export const mfaEmailVerifySchema = z.object({
  mfaToken: z.string().min(1, 'Token MFA requis'),
  otpCode: z.string().length(6, 'Code doit contenir 6 chiffres'),
  method: z.enum(['email', 'totp']).default('email'),
});

export const passwordResetRequestSchema = z.object({
  email: z.string().email('Email invalide'),
  turnstileToken: z.string().optional(),
});

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'Token requis'),
  newPassword: passwordSchema,
});

export const magicLinkSendSchema = z.object({
  email: z.string().email('Email invalide'),
  turnstileToken: z.string().optional(),
});

export const magicLinkVerifySchema = z.object({
  token: z.string().min(1, 'Token requis'),
});

export type LoginRequestInput = z.infer<typeof loginRequestSchema>;
export type MFAVerifyRequestInput = z.infer<typeof mfaVerifyRequestSchema>;
export type RefreshRequestInput = z.infer<typeof refreshRequestSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
