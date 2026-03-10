/**
 * REQ-011 TASK-003: OCR error codes — Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { ERROR_CODES, ERROR_MESSAGES, OCR_HTTP_STATUS } from './errors';

const OCR_CODES = [
  'OCR_IMAGE_UNREADABLE',
  'OCR_INVALID_DOCUMENT_TYPE',
  'OCR_ALREADY_PROCESSING',
  'OCR_MAX_ATTEMPTS_REACHED',
  'OCR_AI_UNAVAILABLE',
  'OCR_EXTRACTION_FAILED',
] as const;

describe('OCR error codes', () => {
  it('exports all 6 OCR error codes in ERROR_CODES', () => {
    for (const code of OCR_CODES) {
      expect(ERROR_CODES).toHaveProperty(code);
      expect(ERROR_CODES[code]).toBe(code);
    }
  });

  it('has a French error message for each OCR code', () => {
    for (const code of OCR_CODES) {
      const message = ERROR_MESSAGES[ERROR_CODES[code]];
      expect(message).toBeDefined();
      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(10);
    }
  });

  it('has an HTTP status mapping for each OCR code', () => {
    for (const code of OCR_CODES) {
      const status = OCR_HTTP_STATUS[ERROR_CODES[code]];
      expect(status).toBeDefined();
      expect(typeof status).toBe('number');
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });

  it('maps OCR_IMAGE_UNREADABLE to 422', () => {
    expect(OCR_HTTP_STATUS[ERROR_CODES.OCR_IMAGE_UNREADABLE]).toBe(422);
  });

  it('maps OCR_INVALID_DOCUMENT_TYPE to 422', () => {
    expect(OCR_HTTP_STATUS[ERROR_CODES.OCR_INVALID_DOCUMENT_TYPE]).toBe(422);
  });

  it('maps OCR_ALREADY_PROCESSING to 409', () => {
    expect(OCR_HTTP_STATUS[ERROR_CODES.OCR_ALREADY_PROCESSING]).toBe(409);
  });

  it('maps OCR_MAX_ATTEMPTS_REACHED to 429', () => {
    expect(OCR_HTTP_STATUS[ERROR_CODES.OCR_MAX_ATTEMPTS_REACHED]).toBe(429);
  });

  it('maps OCR_AI_UNAVAILABLE to 503', () => {
    expect(OCR_HTTP_STATUS[ERROR_CODES.OCR_AI_UNAVAILABLE]).toBe(503);
  });

  it('maps OCR_EXTRACTION_FAILED to 500', () => {
    expect(OCR_HTTP_STATUS[ERROR_CODES.OCR_EXTRACTION_FAILED]).toBe(500);
  });

  it('error messages suggest appropriate user actions', () => {
    // Retake photo
    expect(ERROR_MESSAGES[ERROR_CODES.OCR_IMAGE_UNREADABLE]).toContain('photo');

    // Manual input
    expect(ERROR_MESSAGES[ERROR_CODES.OCR_MAX_ATTEMPTS_REACHED]).toContain('manuellement');

    // Manual input or retry
    expect(ERROR_MESSAGES[ERROR_CODES.OCR_AI_UNAVAILABLE]).toContain('réessayer');
    expect(ERROR_MESSAGES[ERROR_CODES.OCR_EXTRACTION_FAILED]).toContain('réessayer');
  });
});
