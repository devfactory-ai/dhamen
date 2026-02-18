import { describe, it, expect } from 'vitest';
import {
  loginRequestSchema,
  mfaVerifyRequestSchema,
  refreshRequestSchema,
  userCreateSchema,
  userUpdateSchema,
  roleSchema,
} from './user';

describe('User Schemas', () => {
  describe('loginRequestSchema', () => {
    it('should validate correct login data', () => {
      const result = loginRequestSchema.safeParse({
        email: 'user@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const result = loginRequestSchema.safeParse({
        email: 'invalid-email',
        password: 'password123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toContain('email');
      }
    });

    it('should reject short password', () => {
      const result = loginRequestSchema.safeParse({
        email: 'user@example.com',
        password: 'short',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.path).toContain('password');
        expect(result.error.issues[0]?.message).toContain('8 caractères');
      }
    });

    it('should reject missing fields', () => {
      const result = loginRequestSchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe('mfaVerifyRequestSchema', () => {
    it('should validate correct MFA data', () => {
      const result = mfaVerifyRequestSchema.safeParse({
        mfaToken: 'some-token',
        otpCode: '123456',
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid OTP code length', () => {
      const result = mfaVerifyRequestSchema.safeParse({
        mfaToken: 'some-token',
        otpCode: '12345', // 5 digits
      });

      expect(result.success).toBe(false);
    });

    it('should reject empty MFA token', () => {
      const result = mfaVerifyRequestSchema.safeParse({
        mfaToken: '',
        otpCode: '123456',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('refreshRequestSchema', () => {
    it('should validate correct refresh token', () => {
      const result = refreshRequestSchema.safeParse({
        refreshToken: 'some-refresh-token',
      });

      expect(result.success).toBe(true);
    });

    it('should reject empty refresh token', () => {
      const result = refreshRequestSchema.safeParse({
        refreshToken: '',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('userCreateSchema', () => {
    it('should validate correct user creation data', () => {
      const result = userCreateSchema.safeParse({
        email: 'newuser@example.com',
        password: 'securePassword123',
        role: 'PHARMACIST',
        firstName: 'Mohamed',
        lastName: 'Ben Ali',
      });

      expect(result.success).toBe(true);
    });

    it('should validate with optional fields', () => {
      const result = userCreateSchema.safeParse({
        email: 'newuser@example.com',
        password: 'securePassword123',
        role: 'DOCTOR',
        firstName: 'Fatma',
        lastName: 'Trabelsi',
        phone: '+216 98 765 432',
        providerId: 'provider-123',
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid role', () => {
      const result = userCreateSchema.safeParse({
        email: 'newuser@example.com',
        password: 'securePassword123',
        role: 'INVALID_ROLE',
        firstName: 'Test',
        lastName: 'User',
      });

      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = userCreateSchema.safeParse({
        email: 'newuser@example.com',
        password: 'securePassword123',
        role: 'ADMIN',
        // missing firstName and lastName
      });

      expect(result.success).toBe(false);
    });
  });

  describe('userUpdateSchema', () => {
    it('should validate partial update data', () => {
      const result = userUpdateSchema.safeParse({
        firstName: 'Updated',
      });

      expect(result.success).toBe(true);
    });

    it('should validate empty update (all fields optional)', () => {
      const result = userUpdateSchema.safeParse({});

      expect(result.success).toBe(true);
    });

    it('should validate multiple fields update', () => {
      const result = userUpdateSchema.safeParse({
        email: 'updated@example.com',
        isActive: false,
        mfaEnabled: true,
      });

      expect(result.success).toBe(true);
    });

    it('should reject invalid email format', () => {
      const result = userUpdateSchema.safeParse({
        email: 'not-an-email',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('roleSchema', () => {
    it('should validate all valid roles', () => {
      const validRoles = [
        'ADMIN',
        'INSURER_ADMIN',
        'INSURER_AGENT',
        'PHARMACIST',
        'DOCTOR',
        'LAB_MANAGER',
        'CLINIC_ADMIN',
      ];

      validRoles.forEach((role) => {
        const result = roleSchema.safeParse(role);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid roles', () => {
      const invalidRoles = ['SUPERUSER', 'GUEST', 'admin', 'Manager'];

      invalidRoles.forEach((role) => {
        const result = roleSchema.safeParse(role);
        expect(result.success).toBe(false);
      });
    });
  });
});
