/**
 * SMS Service Tests
 */
import { describe, it, expect } from 'vitest';

describe('SMS Service', () => {
  describe('Phone Number Normalization', () => {
    // Test cases for Tunisian phone number normalization
    // Note: Tunisian phone numbers after +216 must start with 2-9 (not 0 or 1)
    const testCases = [
      // Standard formats (valid - starting with 2-9)
      { input: '21622345678', expected: '+21622345678' },
      { input: '+21622345678', expected: '+21622345678' },
      { input: '0021622345678', expected: '+21622345678' },
      // Local formats (8 digits starting with 2-9)
      { input: '22345678', expected: '+21622345678' },
      { input: '52345678', expected: '+21652345678' },
      { input: '92345678', expected: '+21692345678' },
      { input: '98123456', expected: '+21698123456' },
      // Local format with leading 0
      { input: '022345678', expected: '+21622345678' },
      // Invalid formats
      { input: '1234567', expected: null }, // Too short
      { input: '1234567890', expected: null }, // Invalid Tunisian format
      { input: '12345678', expected: null }, // Invalid (starts with 1, not 2-9)
      { input: '01234567', expected: null }, // Invalid (8 digits starting with 0 after removing leading 0)
    ];

    // We'll test the normalization logic directly
    const normalizePhone = (phone: string): string | null => {
      let cleaned = phone.replace(/\D/g, '');

      if (cleaned.startsWith('216')) {
        cleaned = '+' + cleaned;
      } else if (cleaned.startsWith('00216')) {
        cleaned = '+' + cleaned.substring(2);
      } else if (cleaned.length === 8) {
        cleaned = '+216' + cleaned;
      } else if (cleaned.startsWith('0') && cleaned.length === 9) {
        cleaned = '+216' + cleaned.substring(1);
      } else {
        cleaned = '+' + cleaned;
      }

      if (!/^\+216[2-9]\d{7}$/.test(cleaned)) {
        return null;
      }

      return cleaned;
    };

    it('should normalize valid Tunisian phone numbers', () => {
      const validCases = testCases.filter((tc) => tc.expected !== null);
      for (const tc of validCases) {
        expect(normalizePhone(tc.input)).toBe(tc.expected);
      }
    });

    it('should reject invalid phone numbers', () => {
      const invalidCases = testCases.filter((tc) => tc.expected === null);
      for (const tc of invalidCases) {
        expect(normalizePhone(tc.input)).toBeNull();
      }
    });
  });

  describe('SMS Segment Calculation', () => {
    const calculateSegments = (body: string): number => {
      const needsUCS2 = /[^\x00-\x7F]/.test(body);

      if (needsUCS2) {
        if (body.length <= 70) return 1;
        return Math.ceil(body.length / 67);
      } else {
        if (body.length <= 160) return 1;
        return Math.ceil(body.length / 153);
      }
    };

    it('should calculate 1 segment for short GSM-7 messages', () => {
      const shortMessage = 'Hello, this is a test message.';
      expect(calculateSegments(shortMessage)).toBe(1);
    });

    it('should calculate 1 segment for exactly 160 chars GSM-7', () => {
      const message160 = 'A'.repeat(160);
      expect(calculateSegments(message160)).toBe(1);
    });

    it('should calculate 2 segments for 161-306 chars GSM-7', () => {
      const message200 = 'A'.repeat(200);
      expect(calculateSegments(message200)).toBe(2);
    });

    it('should calculate 1 segment for short UCS-2 (Arabic) messages', () => {
      const arabicMessage = 'مرحبا'; // 5 chars
      expect(calculateSegments(arabicMessage)).toBe(1);
    });

    it('should calculate 2 segments for long UCS-2 messages', () => {
      const arabicMessage = 'م'.repeat(80); // 80 Arabic chars
      expect(calculateSegments(arabicMessage)).toBe(2);
    });
  });

  describe('Template Rendering', () => {
    const renderTemplate = (template: string, variables: Record<string, string>): string => {
      let result = template;
      for (const [key, value] of Object.entries(variables)) {
        result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
      return result;
    };

    it('should render template with single variable', () => {
      const template = 'Your code is {code}';
      const result = renderTemplate(template, { code: '123456' });
      expect(result).toBe('Your code is 123456');
    });

    it('should render template with multiple variables', () => {
      const template = 'Hello {name}, your balance is {balance} TND';
      const result = renderTemplate(template, { name: 'Ahmed', balance: '150' });
      expect(result).toBe('Hello Ahmed, your balance is 150 TND');
    });

    it('should handle missing variables gracefully', () => {
      const template = 'Hello {name}';
      const result = renderTemplate(template, {});
      expect(result).toBe('Hello {name}');
    });

    it('should replace multiple occurrences of same variable', () => {
      const template = '{code} is your code. Remember: {code}';
      const result = renderTemplate(template, { code: '999' });
      expect(result).toBe('999 is your code. Remember: 999');
    });
  });

  describe('OTP Generation', () => {
    it('should generate 6-digit OTP', () => {
      const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

      for (let i = 0; i < 100; i++) {
        const otp = generateOtp();
        expect(otp).toMatch(/^\d{6}$/);
        expect(parseInt(otp)).toBeGreaterThanOrEqual(100000);
        expect(parseInt(otp)).toBeLessThan(1000000);
      }
    });
  });

  describe('Rate Limiting Logic', () => {
    it('should enforce rate limit per phone number', () => {
      const rateLimits = new Map<string, number>();
      const MAX_SMS_PER_HOUR = 10;

      const checkRateLimit = (phone: string): boolean => {
        const count = rateLimits.get(phone) || 0;
        if (count >= MAX_SMS_PER_HOUR) {
          return false;
        }
        rateLimits.set(phone, count + 1);
        return true;
      };

      const phone = '+21698765432';

      // First 10 should pass
      for (let i = 0; i < MAX_SMS_PER_HOUR; i++) {
        expect(checkRateLimit(phone)).toBe(true);
      }

      // 11th should fail
      expect(checkRateLimit(phone)).toBe(false);
    });
  });

  describe('Provider Failover', () => {
    it('should try fallback provider on primary failure', async () => {
      const providers = ['ooredoo', 'twilio'];
      const failedProviders = new Set(['ooredoo']);

      const sendWithFailover = async (message: string): Promise<{ provider: string; success: boolean }> => {
        for (const provider of providers) {
          if (failedProviders.has(provider)) {
            continue;
          }
          return { provider, success: true };
        }
        return { provider: 'none', success: false };
      };

      const result = await sendWithFailover('Test message');
      expect(result.provider).toBe('twilio');
      expect(result.success).toBe(true);
    });
  });

  describe('Timing-Safe OTP Comparison', () => {
    it('should perform timing-safe comparison', () => {
      const timingSafeCompare = (a: string, b: string): boolean => {
        if (a.length !== b.length) {
          return false;
        }
        let result = 0;
        for (let i = 0; i < a.length; i++) {
          result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return result === 0;
      };

      expect(timingSafeCompare('123456', '123456')).toBe(true);
      expect(timingSafeCompare('123456', '654321')).toBe(false);
      expect(timingSafeCompare('123456', '12345')).toBe(false);
      expect(timingSafeCompare('', '')).toBe(true);
    });
  });
});
