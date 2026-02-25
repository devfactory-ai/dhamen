/**
 * Eligibility Routes
 *
 * API endpoints for eligibility verification
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Bindings, Variables } from '../types';
import { checkEligibility, checkEligibilityBatch } from '../agents/eligibility';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Request schemas
const eligibilityCheckSchema = z.object({
  adherentId: z.string().min(1),
  providerId: z.string().min(1),
  insurerId: z.string().min(1),
  careType: z.enum(['pharmacy', 'consultation', 'lab', 'hospitalization', 'dental', 'optical']),
  amount: z.number().min(0),
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  actCodes: z.array(z.string()).optional(),
});

const batchCheckSchema = z.object({
  requests: z.array(eligibilityCheckSchema).min(1).max(50),
});

/**
 * POST /api/v1/eligibility/check
 * Check eligibility for a single claim
 */
app.post(
  '/check',
  zValidator('json', eligibilityCheckSchema),
  async (c) => {
    const request = c.req.valid('json');

    const result = await checkEligibility(c, request);

    return c.json({
      success: true,
      data: result,
    });
  }
);

/**
 * POST /api/v1/eligibility/batch
 * Check eligibility for multiple claims
 */
app.post(
  '/batch',
  zValidator('json', batchCheckSchema),
  async (c) => {
    const { requests } = c.req.valid('json');

    const results = await checkEligibilityBatch(c, requests);

    return c.json({
      success: true,
      data: {
        results,
        total: results.length,
        eligible: results.filter((r) => r.eligible).length,
        ineligible: results.filter((r) => !r.eligible).length,
      },
    });
  }
);

export default app;
