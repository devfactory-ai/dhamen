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
import { authMiddleware } from '../middleware/auth';
import { getDb } from '../lib/db';
import { success, error as errorResponse } from '../lib/response';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Auth middleware
app.use('*', authMiddleware());

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
 * GET /api/v1/eligibility/check
 * Lookup adherent eligibility by national ID
 */
app.get('/check', async (c) => {
  const nationalId = c.req.query('nationalId');
  if (!nationalId) {
    return errorResponse(c, 'VALIDATION_ERROR', 'nationalId est requis', 400);
  }

  const db = getDb(c);

  // Find adherent by national_id_hash or encrypted value
  const adherent = await db.prepare(`
    SELECT a.id, a.first_name, a.last_name, a.date_of_birth, a.gender,
           a.national_id_encrypted, a.matricule, a.city,
           c.id as contract_id, c.contract_number, c.plan_type,
           c.start_date, c.end_date, c.status as contract_status,
           c.annual_limit, c.coverage_json,
           i.name as insurer_name
    FROM adherents a
    LEFT JOIN contracts c ON c.adherent_id = a.id AND c.status = 'active'
    LEFT JOIN insurers i ON c.insurer_id = i.id
    WHERE a.national_id_encrypted LIKE ? OR a.matricule = ?
    LIMIT 1
  `).bind(`%${nationalId}%`, nationalId).first<{
    id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string;
    gender: string | null;
    national_id_encrypted: string;
    matricule: string | null;
    city: string | null;
    contract_id: string | null;
    contract_number: string | null;
    plan_type: string | null;
    start_date: string | null;
    end_date: string | null;
    contract_status: string | null;
    annual_limit: number | null;
    coverage_json: string | null;
    insurer_name: string | null;
  }>();

  if (!adherent) {
    return errorResponse(c, 'ADHERENT_NOT_FOUND', 'Adhérent non trouvé', 404);
  }

  const isEligible = !!adherent.contract_id && adherent.contract_status === 'active';
  const coverage = adherent.coverage_json ? JSON.parse(adherent.coverage_json) : {};

  return success(c, {
    adhérent: {
      id: adherent.id,
      memberNumber: adherent.matricule || adherent.national_id_encrypted,
      firstName: adherent.first_name,
      lastName: adherent.last_name,
      dateOfBirth: adherent.date_of_birth,
      gender: adherent.gender,
      city: adherent.city,
    },
    contract: adherent.contract_id ? {
      id: adherent.contract_id,
      number: adherent.contract_number,
      planType: adherent.plan_type,
      startDate: adherent.start_date,
      endDate: adherent.end_date,
      status: adherent.contract_status,
      annualLimit: adherent.annual_limit,
      insurerName: adherent.insurer_name,
    } : null,
    eligible: isEligible,
    coverage,
    message: isEligible
      ? 'Adhérent éligible - contrat actif'
      : 'Adhérent non éligible - pas de contrat actif',
  });
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
