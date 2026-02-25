/**
 * Fraud Detection Routes
 *
 * API endpoints for fraud detection on claims
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Bindings, Variables } from '../types';
import { detectFraud, detectFraudBatch } from '../agents/fraud';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Request schemas
const fraudCheckRequestSchema = z.object({
  claimId: z.string().min(1),
  adherentId: z.string().min(1),
  providerId: z.string().min(1),
  insurerId: z.string().min(1),
  careType: z.enum(['pharmacy', 'consultation', 'lab', 'hospitalization', 'dental', 'optical']),
  amount: z.number().min(0),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  serviceTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  actCodes: z.array(z.string()).optional(),
  drugCodes: z.array(z.string()).optional(),
});

const batchFraudCheckSchema = z.object({
  requests: z.array(fraudCheckRequestSchema).min(1).max(50),
});

/**
 * POST /api/v1/fraud/check
 * Check a single claim for fraud indicators
 */
app.post(
  '/check',
  zValidator('json', fraudCheckRequestSchema),
  async (c) => {
    const request = c.req.valid('json');

    const result = await detectFraud(c, request);

    return c.json({
      success: true,
      data: result,
    });
  }
);

/**
 * POST /api/v1/fraud/batch
 * Check multiple claims for fraud indicators
 */
app.post(
  '/batch',
  zValidator('json', batchFraudCheckSchema),
  async (c) => {
    const { requests } = c.req.valid('json');

    const results = await detectFraudBatch(c, requests);

    // Calculate summary statistics
    const byRiskLevel = {
      low: results.filter((r) => r.riskLevel === 'low').length,
      medium: results.filter((r) => r.riskLevel === 'medium').length,
      high: results.filter((r) => r.riskLevel === 'high').length,
      critical: results.filter((r) => r.riskLevel === 'critical').length,
    };

    const byAction = {
      approve: results.filter((r) => r.recommendedAction === 'approve').length,
      flag: results.filter((r) => r.recommendedAction === 'flag').length,
      review: results.filter((r) => r.recommendedAction === 'review').length,
      block: results.filter((r) => r.recommendedAction === 'block').length,
    };

    return c.json({
      success: true,
      data: {
        results,
        summary: {
          total: results.length,
          byRiskLevel,
          byAction,
          averageScore: results.reduce((sum, r) => sum + r.fraudScore, 0) / results.length,
        },
      },
    });
  }
);

export default app;
