/**
 * Tarification Routes
 *
 * API endpoints for claim pricing calculations
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Bindings, Variables } from '../types';
import { calculateTarification, calculateBatchTarification, getCachedBaremes } from '../agents/tarification';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Request schemas
const tarificationRequestSchema = z.object({
  insurerId: z.string().min(1),
  providerId: z.string().min(1),
  adherentId: z.string().min(1),
  careType: z.enum(['pharmacy', 'consultation', 'lab', 'hospitalization', 'dental', 'optical']),
  actCode: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPrice: z.number().min(0), // in millimes
  serviceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prescriptionId: z.string().optional(),
});

const batchTarificationSchema = z.object({
  requests: z.array(tarificationRequestSchema).min(1).max(100),
});

const baremesQuerySchema = z.object({
  insurerId: z.string().min(1),
  careType: z.enum(['pharmacy', 'consultation', 'lab', 'hospitalization', 'dental', 'optical']),
});

/**
 * POST /api/v1/tarification/calculate
 * Calculate pricing for a single item
 */
app.post(
  '/calculate',
  zValidator('json', tarificationRequestSchema),
  async (c) => {
    const request = c.req.valid('json');

    const result = await calculateTarification(c, request);

    return c.json({
      success: true,
      data: result,
    });
  }
);

/**
 * POST /api/v1/tarification/batch
 * Calculate pricing for multiple items (e.g., prescription)
 */
app.post(
  '/batch',
  zValidator('json', batchTarificationSchema),
  async (c) => {
    const { requests } = c.req.valid('json');

    const result = await calculateBatchTarification(c, requests);

    return c.json({
      success: true,
      data: result,
    });
  }
);

/**
 * GET /api/v1/tarification/baremes
 * Get barèmes for a care type (for display/reference)
 */
app.get(
  '/baremes',
  zValidator('query', baremesQuerySchema),
  async (c) => {
    const { insurerId, careType } = c.req.valid('query');

    const baremes = await getCachedBaremes(c, insurerId, careType);

    return c.json({
      success: true,
      data: {
        baremes,
        count: baremes.length,
      },
    });
  }
);

export default app;
