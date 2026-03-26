import {
  createProvider,
  findProviderById,
  findProviderByLicense,
  listProviders,
  softDeleteProvider,
  updateProvider,
} from '@dhamen/db';
import {
  paginationSchema,
  providerCreateSchema,
  providerFiltersSchema,
  providerUpdateSchema,
  PROVIDER_TYPES,
} from '@dhamen/shared';
import { zValidator } from '@hono/zod-validator';
import { Hono } from 'hono';
import { z } from 'zod';
import { conflict, created, noContent, notFound, paginated, success, validationError } from '../lib/response';
import { generateId } from '../lib/ulid';
import { logAudit } from '../middleware/audit-trail';
import { authMiddleware, requireRole } from '../middleware/auth';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

// Validation hook
const validationHook = (result: { success: boolean; data?: unknown; error?: z.ZodError }, c: any): Response | undefined => {
  if (!result.success && result.error) {
    const errors = result.error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));
    return validationError(c, errors);
  }
  return undefined;
};

// Import schema
const providerCsvRowSchema = z.object({
  type: z.enum(PROVIDER_TYPES),
  name: z.string().min(1, 'Nom requis'),
  licenseNo: z.string().min(1, 'N° licence requis'),
  speciality: z.string().optional(),
  address: z.string().min(1, 'Adresse requise'),
  city: z.string().min(1, 'Ville requise'),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
});

const providerImportSchema = z.object({
  providers: z.array(providerCsvRowSchema).min(1, 'Au moins un prestataire requis').max(500, 'Maximum 500 prestataires'),
  skipDuplicates: z.boolean().optional().default(true),
});

const providers = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware to all routes
providers.use('*', authMiddleware());

// Map frontend type names to backend type names
const typeMapping: Record<string, 'pharmacist' | 'doctor' | 'lab' | 'clinic'> = {
  PHARMACY: 'pharmacist',
  CLINIC: 'clinic',
  LABORATORY: 'lab',
  HOSPITAL: 'clinic',
  pharmacist: 'pharmacist',
  doctor: 'doctor',
  lab: 'lab',
  clinic: 'clinic',
};

/**
 * GET /api/v1/providers/public
 * List providers - accessible to all authenticated users including adherents
 * Used by adherent portal to find healthcare providers
 */
providers.get('/public', async (c) => {
  const query = c.req.query();
  const search = query.search || undefined;
  const rawType = query.type;
  const type = rawType && rawType !== 'all' ? typeMapping[rawType] : undefined;
  const city = query.city || undefined;
  const limit = Math.min(Number.parseInt(query.limit || '50', 10), 100);

  const { data, total } = await listProviders(getDb(c), {
    type,
    city: city && city !== 'all' ? city : undefined,
    search,
    isActive: true, // Only show active providers
    limit,
  });

  return paginated(c, data, {
    page: 1,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
});

/**
 * GET /api/v1/providers
 * List providers with filters and pagination
 */
providers.get(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('query', providerFiltersSchema.merge(paginationSchema)),
  async (c) => {
    const { type, city, isActive, search, page, limit } = c.req.valid('query');

    const { data, total } = await listProviders(getDb(c), {
      type,
      city,
      isActive,
      search,
      page,
      limit,
    });

    return paginated(c, data, {
      page: page ?? 1,
      limit: limit ?? 20,
      total,
      totalPages: Math.ceil(total / (limit ?? 20)),
    });
  }
);

/**
 * GET /api/v1/providers/:id
 * Get a provider by ID
 */
providers.get('/:id', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'), async (c) => {
  const id = c.req.param('id');
  const provider = await findProviderById(getDb(c), id);

  if (!provider) {
    return notFound(c, 'Prestataire non trouvé');
  }

  return success(c, provider);
});

/**
 * POST /api/v1/providers
 * Create a new provider
 */
providers.post(
  '/',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', providerCreateSchema),
  async (c) => {
    const data = c.req.valid('json');
    const user = c.get('user');

    // Check if license number already exists
    const existing = await findProviderByLicense(getDb(c), data.licenseNo);
    if (existing) {
      return conflict(c, 'Un prestataire avec ce numéro de licence existe déjà');
    }

    const id = generateId();
    const provider = await createProvider(getDb(c), id, data);

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'provider.create',
      entityType: 'provider',
      entityId: id,
      changes: data,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return created(c, provider);
  }
);

/**
 * PUT /api/v1/providers/:id
 * Update a provider
 */
providers.put(
  '/:id',
  requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'),
  zValidator('json', providerUpdateSchema),
  async (c) => {
    const id = c.req.param('id');
    const data = c.req.valid('json');
    const user = c.get('user');

    const provider = await updateProvider(getDb(c), id, data);

    if (!provider) {
      return notFound(c, 'Prestataire non trouvé');
    }

    // Audit log
    await logAudit(getDb(c), {
      userId: user?.sub,
      action: 'provider.update',
      entityType: 'provider',
      entityId: id,
      changes: data,
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, provider);
  }
);

/**
 * DELETE /api/v1/providers/:id
 * Soft delete a provider
 */
providers.delete('/:id', requireRole('ADMIN'), async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const deleted = await softDeleteProvider(getDb(c), id);

  if (!deleted) {
    return notFound(c, 'Prestataire non trouvé');
  }

  // Audit log
  await logAudit(getDb(c), {
    userId: user?.sub,
    action: 'provider.delete',
    entityType: 'provider',
    entityId: id,
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return noContent(c);
});

/**
 * POST /api/v1/providers/import
 * Bulk import providers from CSV data
 */
providers.post('/import', requireRole('ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT'), zValidator('json', providerImportSchema, validationHook), async (c) => {
  const { providers: providersData, skipDuplicates } = c.req.valid('json');
  const user = c.get('user');

  const results = {
    success: 0,
    skipped: 0,
    errors: [] as { row: number; name: string; error: string }[],
  };

  for (let i = 0; i < providersData.length; i++) {
    const providerData = providersData[i];
    if (!providerData) continue;

    try {
      // Check if license number exists
      const existing = await findProviderByLicense(getDb(c), providerData.licenseNo);

      if (existing) {
        if (skipDuplicates) {
          results.skipped++;
          continue;
        }
        results.errors.push({
          row: i + 1,
          name: providerData.name,
          error: 'N° licence deja utilise',
        });
        continue;
      }

      // Create provider
      const id = generateId();
      await createProvider(getDb(c), id, {
        type: providerData.type,
        name: providerData.name,
        licenseNo: providerData.licenseNo,
        speciality: providerData.speciality,
        address: providerData.address,
        city: providerData.city,
        phone: providerData.phone,
        email: providerData.email,
      });

      results.success++;
    } catch (err) {
      results.errors.push({
        row: i + 1,
        name: providerData.name,
        error: err instanceof Error ? err.message : 'Erreur inconnue',
      });
    }
  }

  // Audit log
  await logAudit(getDb(c), {
    userId: user?.sub,
    action: 'providers.imported',
    entityType: 'provider',
    entityId: 'bulk',
    changes: {
      total: providersData.length,
      success: results.success,
      skipped: results.skipped,
      errors: results.errors.length,
    },
    ipAddress: c.req.header('CF-Connecting-IP'),
    userAgent: c.req.header('User-Agent'),
  });

  return success(c, results);
});

export { providers };
