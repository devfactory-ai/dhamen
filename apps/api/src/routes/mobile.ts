/**
 * Mobile App Backend Routes
 *
 * Optimized APIs for mobile adherent application
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { success, error } from '../lib/response';
import { verifyPassword, hashPassword } from '../lib/password';
import { signJWT, signRefreshToken } from '../lib/jwt';
import type { Bindings, Variables } from '../types';
import { getDb } from '../lib/db';

const mobile = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Helper function to generate tokens
async function generateTokens(
  user: { id: string; email: string; role: string; insurerId?: string },
  env: Bindings
): Promise<{ accessToken: string; refreshToken: string }> {
  const jwtExpiresIn = Number.parseInt(env.JWT_EXPIRES_IN || '900', 10);
  const refreshExpiresIn = Number.parseInt(env.REFRESH_EXPIRES_IN || '86400', 10);

  const accessToken = await signJWT(
    {
      id: user.id,
      sub: user.id,
      email: user.email,
      role: user.role as 'ADHERENT',
      insurerId: user.insurerId,
    },
    env.JWT_SECRET,
    jwtExpiresIn
  );

  const refreshToken = await signRefreshToken(user.id, env.JWT_SECRET, refreshExpiresIn);

  // Store refresh token in KV
  await env.CACHE.put(`refresh:${user.id}`, refreshToken, {
    expirationTtl: refreshExpiresIn,
  });

  return { accessToken, refreshToken };
}

// ============== AUTH (No middleware required) ==============

const mobileLoginSchema = z.object({
  identifier: z.string().min(1), // Email, phone, or adherent number
  password: z.string().min(1),
  deviceInfo: z.object({
    deviceId: z.string(),
    platform: z.enum(['ios', 'android']),
    osVersion: z.string(),
    appVersion: z.string(),
    pushToken: z.string().optional(),
  }),
});

/**
 * POST /auth/login
 * Mobile login with device registration
 */
mobile.post('/auth/login', zValidator('json', mobileLoginSchema), async (c) => {
  const { identifier, password, deviceInfo } = c.req.valid('json');

  // Find adherent by email, phone, or adherent number
  const adherent = await getDb(c).prepare(`
    SELECT
      a.id,
      a.adherent_number,
      a.full_name,
      a.email,
      a.phone,
      a.password_hash,
      a.is_active,
      a.pin_hash,
      a.biometric_enabled,
      c.id as contract_id,
      c.insurer_id,
      i.name as insurer_name
    FROM adherents a
    LEFT JOIN contracts c ON a.id = c.adherent_id AND c.status = 'active'
    LEFT JOIN insurers i ON c.insurer_id = i.id
    WHERE (a.email = ? OR a.phone = ? OR a.adherent_number = ?)
      AND a.deleted_at IS NULL
    LIMIT 1
  `).bind(identifier, identifier, identifier).first<{
    id: string;
    adherent_number: string;
    full_name: string;
    email: string;
    phone: string;
    password_hash: string;
    is_active: number;
    pin_hash: string | null;
    biometric_enabled: number;
    contract_id: string;
    insurer_id: string;
    insurer_name: string;
  }>();

  if (!adherent) {
    return error(c, 'INVALID_CREDENTIALS', 'Identifiants invalides', 401);
  }

  if (!adherent.is_active) {
    return error(c, 'ACCOUNT_INACTIVE', 'Compte désactivé', 401);
  }

  // Verify password
  const isValid = await verifyPassword(password, adherent.password_hash);
  if (!isValid) {
    return error(c, 'INVALID_CREDENTIALS', 'Identifiants invalides', 401);
  }

  // Register/update device
  await registerDevice(c.env, adherent.id, deviceInfo);

  // Generate tokens
  const tokens = await generateTokens(
    {
      id: adherent.id,
      email: adherent.email,
      role: 'ADHERENT',
      insurerId: adherent.insurer_id,
    },
    c.env
  );

  return success(c, {
    user: {
      id: adherent.id,
      adherentNumber: adherent.adherent_number,
      fullName: adherent.full_name,
      email: adherent.email,
      phone: adherent.phone,
      insurerId: adherent.insurer_id,
      insurerName: adherent.insurer_name,
      contractId: adherent.contract_id,
      hasPinSetup: !!adherent.pin_hash,
      biometricEnabled: adherent.biometric_enabled === 1,
    },
    tokens,
  });
});

/**
 * POST /auth/pin-login
 * Quick login with PIN
 */
mobile.post(
  '/auth/pin-login',
  zValidator('json', z.object({
    adherentId: z.string().uuid(),
    pin: z.string().length(6),
    deviceId: z.string(),
  })),
  async (c) => {
    const { adherentId, pin, deviceId } = c.req.valid('json');

    // Verify device is registered
    const device = await getDb(c).prepare(`
      SELECT id FROM adherent_devices
      WHERE adherent_id = ? AND device_id = ? AND is_active = 1
    `).bind(adherentId, deviceId).first();

    if (!device) {
      return error(c, 'DEVICE_NOT_REGISTERED', 'Appareil non reconnu', 401);
    }

    // Get adherent
    const adherent = await getDb(c).prepare(`
      SELECT id, email, pin_hash, is_active, insurer_id
      FROM adherents
      WHERE id = ? AND deleted_at IS NULL
    `).bind(adherentId).first<{
      id: string;
      email: string;
      pin_hash: string;
      is_active: number;
      insurer_id: string;
    }>();

    if (!adherent || !adherent.is_active) {
      return error(c, 'ACCOUNT_INACTIVE', 'Compte désactivé', 401);
    }

    if (!adherent.pin_hash) {
      return error(c, 'PIN_NOT_SET', 'PIN non configuré', 400);
    }

    // Verify PIN
    const isValid = await verifyPassword(pin, adherent.pin_hash);
    if (!isValid) {
      return error(c, 'INVALID_PIN', 'PIN incorrect', 401);
    }

    // Generate tokens
    const tokens = await generateTokens(
      {
        id: adherent.id,
        email: adherent.email,
        role: 'ADHERENT',
        insurerId: adherent.insurer_id,
      },
      c.env
    );

    return success(c, { tokens });
  }
);

/**
 * Verify biometric token signature using device's public key
 * The token format is: base64(JSON{challenge, timestamp, deviceId}) + "." + base64(signature)
 */
async function verifyBiometricToken(
  token: string,
  publicKeyPem: string,
  deviceId: string
): Promise<{ valid: boolean; reason?: string }> {
  try {
    const [payloadB64, signatureB64] = token.split('.');
    if (!payloadB64 || !signatureB64) {
      return { valid: false, reason: 'Invalid token format' };
    }

    // Decode payload
    const payloadStr = atob(payloadB64);
    const payload = JSON.parse(payloadStr) as {
      challenge: string;
      timestamp: number;
      deviceId: string;
    };

    // Verify device ID matches
    if (payload.deviceId !== deviceId) {
      return { valid: false, reason: 'Device ID mismatch' };
    }

    // Check timestamp (token valid for 5 minutes)
    const tokenAge = Date.now() - payload.timestamp;
    if (tokenAge > 5 * 60 * 1000) {
      return { valid: false, reason: 'Token expired' };
    }

    // Import public key and verify signature
    // Convert PEM to ArrayBuffer
    const pemContents = publicKeyPem
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .replace(/\s/g, '');
    const binaryDer = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));

    const publicKey = await crypto.subtle.importKey(
      'spki',
      binaryDer.buffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    // Verify signature
    const signatureBytes = Uint8Array.from(atob(signatureB64), (c) => c.charCodeAt(0));
    const dataBytes = new TextEncoder().encode(payloadB64);

    const isValid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signatureBytes,
      dataBytes
    );

    return { valid: isValid, reason: isValid ? undefined : 'Invalid signature' };
  } catch (err) {
    return { valid: false, reason: `Verification error: ${(err as Error).message}` };
  }
}

/**
 * POST /auth/biometric-login
 * Login with biometric authentication
 */
mobile.post(
  '/auth/biometric-login',
  zValidator('json', z.object({
    adherentId: z.string().uuid(),
    deviceId: z.string(),
    biometricToken: z.string(), // Token signed by device secure enclave
  })),
  async (c) => {
    const { adherentId, deviceId, biometricToken } = c.req.valid('json');

    // Verify device and biometric token
    const device = await getDb(c).prepare(`
      SELECT id, biometric_public_key FROM adherent_devices
      WHERE adherent_id = ? AND device_id = ? AND is_active = 1
    `).bind(adherentId, deviceId).first<{
      id: string;
      biometric_public_key: string;
    }>();

    if (!device || !device.biometric_public_key) {
      return error(c, 'BIOMETRIC_NOT_ENABLED', 'Biométrie non activée', 401);
    }

    // Verify biometric token with stored public key
    const verification = await verifyBiometricToken(
      biometricToken,
      device.biometric_public_key,
      deviceId
    );

    if (!verification.valid) {
      // Log failed attempt for security monitoring
      console.warn(`Biometric verification failed for device ${deviceId}: ${verification.reason}`);
      return error(c, 'BIOMETRIC_INVALID', 'Vérification biométrique échouée', 401);
    }

    // Get adherent
    const adherent = await getDb(c).prepare(`
      SELECT id, email, is_active, insurer_id, biometric_enabled
      FROM adherents
      WHERE id = ? AND deleted_at IS NULL
    `).bind(adherentId).first<{
      id: string;
      email: string;
      is_active: number;
      insurer_id: string;
      biometric_enabled: number;
    }>();

    if (!adherent || !adherent.is_active || !adherent.biometric_enabled) {
      return error(c, 'BIOMETRIC_NOT_ENABLED', 'Biométrie non activée', 401);
    }

    // Update last login timestamp on device
    await getDb(c).prepare(`
      UPDATE adherent_devices
      SET last_login_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).bind(device.id).run();

    // Generate tokens
    const tokens = await generateTokens(
      {
        id: adherent.id,
        email: adherent.email,
        role: 'ADHERENT',
        insurerId: adherent.insurer_id,
      },
      c.env
    );

    return success(c, { tokens });
  }
);

/**
 * POST /auth/setup-pin
 * Set up PIN for quick access
 */
mobile.post(
  '/auth/setup-pin',
  authMiddleware(),
  zValidator('json', z.object({
    pin: z.string().length(6).regex(/^\d+$/),
  })),
  async (c) => {
    const user = c.get('user');
    const { pin } = c.req.valid('json');

    const pinHash = await hashPassword(pin);

    await getDb(c).prepare(`
      UPDATE adherents SET pin_hash = ?, updated_at = datetime('now')
      WHERE id = ?
    `).bind(pinHash, user.id).run();

    return success(c, { message: 'PIN configuré' });
  }
);

/**
 * POST /auth/enable-biometric
 * Enable biometric authentication
 */
mobile.post(
  '/auth/enable-biometric',
  authMiddleware(),
  zValidator('json', z.object({
    deviceId: z.string(),
    publicKey: z.string(), // Public key from device secure enclave
  })),
  async (c) => {
    const user = c.get('user');
    const { deviceId, publicKey } = c.req.valid('json');

    // Update device with biometric key
    await getDb(c).prepare(`
      UPDATE adherent_devices
      SET biometric_public_key = ?, updated_at = datetime('now')
      WHERE adherent_id = ? AND device_id = ?
    `).bind(publicKey, user.id, deviceId).run();

    // Enable biometric on adherent
    await getDb(c).prepare(`
      UPDATE adherents SET biometric_enabled = 1, updated_at = datetime('now')
      WHERE id = ?
    `).bind(user.id).run();

    return success(c, { message: 'Biométrie activée' });
  }
);

// ============== PROTECTED ROUTES ==============
mobile.use('/*', authMiddleware());

/**
 * GET /profile
 * Get adherent profile with contract details
 */
mobile.get('/profile', async (c) => {
  const user = c.get('user');

  const profile = await getDb(c).prepare(`
    SELECT
      a.id,
      a.adherent_number,
      a.full_name,
      a.email,
      a.phone,
      a.birth_date,
      a.gender,
      a.address,
      a.cin,
      a.profile_photo_url,
      c.id as contract_id,
      c.contract_number,
      c.start_date,
      c.end_date,
      c.status as contract_status,
      c.coverage_config,
      i.id as insurer_id,
      i.name as insurer_name,
      i.logo_url as insurer_logo
    FROM adherents a
    LEFT JOIN contracts c ON a.id = c.adherent_id AND c.status = 'active'
    LEFT JOIN insurers i ON c.insurer_id = i.id
    WHERE a.id = ?
  `).bind(user.id).first<Record<string, unknown>>();

  if (!profile) {
    return error(c, 'NOT_FOUND', 'Profil non trouvé', 404);
  }

  // Get beneficiaries
  const beneficiaries = await getDb(c).prepare(`
    SELECT id, full_name, relationship, birth_date
    FROM beneficiaries
    WHERE adherent_id = ? AND deleted_at IS NULL
  `).bind(user.id).all<{
    id: string;
    full_name: string;
    relationship: string;
    birth_date: string;
  }>();

  return success(c, {
    ...profile,
    coverageConfig: profile.coverage_config ? JSON.parse(profile.coverage_config as string) : null,
    beneficiaries: beneficiaries.results || [],
  });
});

/**
 * PUT /profile
 * Update adherent profile
 */
mobile.put(
  '/profile',
  zValidator('json', z.object({
    fullName: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    profilePhotoUrl: z.string().url().optional(),
  })),
  async (c) => {
    const user = c.get('user');
    const updates = c.req.valid('json');

    const fields: string[] = [];
    const values: (string | null)[] = [];

    if (updates.fullName) {
      fields.push('full_name = ?');
      values.push(updates.fullName);
    }
    if (updates.phone) {
      fields.push('phone = ?');
      values.push(updates.phone);
    }
    if (updates.address) {
      fields.push('address = ?');
      values.push(updates.address);
    }
    if (updates.profilePhotoUrl) {
      fields.push('profile_photo_url = ?');
      values.push(updates.profilePhotoUrl);
    }

    if (fields.length === 0) {
      return error(c, 'NO_UPDATES', 'Aucune modification', 400);
    }

    fields.push('updated_at = datetime(\'now\')');
    values.push(user.id);

    await getDb(c).prepare(`
      UPDATE adherents SET ${fields.join(', ')} WHERE id = ?
    `).bind(...values).run();

    return success(c, { message: 'Profil mis à jour' });
  }
);

/**
 * GET /card
 * Get digital insurance card
 */
mobile.get('/card', async (c) => {
  const user = c.get('user');

  const card = await getDb(c).prepare(`
    SELECT
      a.adherent_number,
      a.full_name,
      a.birth_date,
      a.profile_photo_url,
      c.contract_number,
      c.start_date,
      c.end_date,
      c.coverage_config,
      i.name as insurer_name,
      i.logo_url as insurer_logo,
      i.contact_phone as insurer_phone
    FROM adherents a
    JOIN contracts c ON a.id = c.adherent_id AND c.status = 'active'
    JOIN insurers i ON c.insurer_id = i.id
    WHERE a.id = ?
  `).bind(user.id).first<Record<string, unknown>>();

  if (!card) {
    return error(c, 'NO_ACTIVE_CONTRACT', 'Aucun contrat actif', 404);
  }

  // Generate QR code data
  const qrData = {
    type: 'dhamen_card',
    adherentNumber: card.adherent_number,
    contractNumber: card.contract_number,
    validUntil: card.end_date,
    timestamp: Date.now(),
  };

  return success(c, {
    card: {
      ...card,
      coverageConfig: card.coverage_config ? JSON.parse(card.coverage_config as string) : null,
    },
    qrCode: Buffer.from(JSON.stringify(qrData)).toString('base64'),
  });
});

/**
 * GET /eligibility
 * Quick eligibility check
 */
mobile.get('/eligibility', async (c) => {
  const user = c.get('user');
  const careType = c.req.query('careType') || 'consultation';

  // Get active contract
  const contract = await getDb(c).prepare(`
    SELECT
      c.id,
      c.coverage_config,
      c.start_date,
      c.end_date,
      c.status
    FROM contracts c
    WHERE c.adherent_id = ? AND c.status = 'active'
    LIMIT 1
  `).bind(user.id).first<{
    id: string;
    coverage_config: string;
    start_date: string;
    end_date: string;
    status: string;
  }>();

  if (!contract) {
    return success(c, {
      eligible: false,
      reason: 'NO_ACTIVE_CONTRACT',
      message: 'Aucun contrat actif',
    });
  }

  // Check dates
  const now = new Date();
  const startDate = new Date(contract.start_date);
  const endDate = new Date(contract.end_date);

  if (now < startDate) {
    return success(c, {
      eligible: false,
      reason: 'CONTRACT_NOT_STARTED',
      message: 'Contrat non encore effectif',
      effectiveDate: contract.start_date,
    });
  }

  if (now > endDate) {
    return success(c, {
      eligible: false,
      reason: 'CONTRACT_EXPIRED',
      message: 'Contrat expiré',
      expiredDate: contract.end_date,
    });
  }

  // Check coverage for care type
  const coverage = contract.coverage_config
    ? JSON.parse(contract.coverage_config)
    : [];
  const careTypeCoverage = coverage.find(
    (c: { careType: string }) => c.careType === careType
  );

  if (!careTypeCoverage) {
    return success(c, {
      eligible: false,
      reason: 'CARE_TYPE_NOT_COVERED',
      message: `${careType} non couvert par votre contrat`,
    });
  }

  // Get remaining annual limit
  const usedAmount = await getDb(c).prepare(`
    SELECT COALESCE(SUM(approved_amount), 0) as total
    FROM claims
    WHERE adherent_id = ?
      AND status = 'approved'
      AND created_at >= date('now', 'start of year')
  `).bind(user.id).first<{ total: number }>();

  const annualLimit = careTypeCoverage.maxAmount || 999999999;
  const remaining = Math.max(0, annualLimit - (usedAmount?.total || 0));

  return success(c, {
    eligible: true,
    coverage: {
      careType,
      coveragePercent: careTypeCoverage.coveragePercent,
      maxAmount: careTypeCoverage.maxAmount,
      copay: careTypeCoverage.copay,
      remainingLimit: remaining,
      requiresApproval: careTypeCoverage.requiresApproval,
    },
    contract: {
      id: contract.id,
      validUntil: contract.end_date,
    },
  });
});

/**
 * GET /claims
 * Get adherent's claims history
 */
mobile.get('/claims', async (c) => {
  const user = c.get('user');
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const status = c.req.query('status');
  const offset = (page - 1) * limit;

  const statusFilter = status ? `AND c.status = '${status}'` : '';

  const [countResult, claims] = await Promise.all([
    getDb(c).prepare(`
      SELECT COUNT(*) as count FROM claims c
      WHERE c.adherent_id = ? ${statusFilter}
    `).bind(user.id).first<{ count: number }>(),

    getDb(c).prepare(`
      SELECT
        c.id,
        c.reference,
        c.care_type,
        c.amount,
        c.approved_amount,
        c.status,
        c.created_at,
        c.processed_at,
        p.name as provider_name,
        p.type as provider_type
      FROM claims c
      LEFT JOIN providers p ON c.provider_id = p.id
      WHERE c.adherent_id = ? ${statusFilter}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(user.id, limit, offset).all<{
      id: string;
      reference: string;
      care_type: string;
      amount: number;
      approved_amount: number;
      status: string;
      created_at: string;
      processed_at: string;
      provider_name: string;
      provider_type: string;
    }>(),
  ]);

  return success(c, {
    claims: claims.results || [],
    meta: {
      page,
      limit,
      total: countResult?.count || 0,
    },
  });
});

/**
 * GET /claims/:id
 * Get claim details
 */
mobile.get('/claims/:id', async (c) => {
  const user = c.get('user');
  const claimId = c.req.param('id');

  const claim = await getDb(c).prepare(`
    SELECT
      c.*,
      p.name as provider_name,
      p.type as provider_type,
      p.address as provider_address,
      p.phone as provider_phone
    FROM claims c
    LEFT JOIN providers p ON c.provider_id = p.id
    WHERE c.id = ? AND c.adherent_id = ?
  `).bind(claimId, user.id).first<Record<string, unknown>>();

  if (!claim) {
    return error(c, 'NOT_FOUND', 'Sinistre non trouvé', 404);
  }

  // Get claim documents
  const documents = await getDb(c).prepare(`
    SELECT id, type, filename, url, created_at
    FROM claim_documents
    WHERE claim_id = ?
  `).bind(claimId).all<{
    id: string;
    type: string;
    filename: string;
    url: string;
    created_at: string;
  }>();

  return success(c, {
    ...claim,
    documents: documents.results || [],
  });
});

/**
 * GET /providers/nearby
 * Find nearby providers
 */
mobile.get('/providers/nearby', async (c) => {
  const user = c.get('user');
  const lat = parseFloat(c.req.query('lat') || '0');
  const lng = parseFloat(c.req.query('lng') || '0');
  const radius = parseFloat(c.req.query('radius') || '5'); // km
  const type = c.req.query('type');

  // Get user's insurer for network filtering
  const contract = await getDb(c).prepare(`
    SELECT insurer_id FROM contracts
    WHERE adherent_id = ? AND status = 'active'
    LIMIT 1
  `).bind(user.id).first<{ insurer_id: string }>();

  const typeFilter = type ? `AND p.type = '${type}'` : '';
  const insurerFilter = contract?.insurer_id
    ? `AND (pc.insurer_id = '${contract.insurer_id}' OR pc.insurer_id IS NULL)`
    : '';

  // Simple distance calculation (Haversine approximation)
  // For Tunisia, 1 degree lat ≈ 111 km, 1 degree lng ≈ 90 km
  const latRange = radius / 111;
  const lngRange = radius / 90;

  const providers = await getDb(c).prepare(`
    SELECT
      p.id,
      p.name,
      p.type,
      p.address,
      p.phone,
      p.latitude,
      p.longitude,
      p.opening_hours,
      pc.is_network as in_network,
      (
        (p.latitude - ?) * (p.latitude - ?) * 111 * 111 +
        (p.longitude - ?) * (p.longitude - ?) * 90 * 90
      ) as distance_sq
    FROM providers p
    LEFT JOIN provider_conventions pc ON p.id = pc.provider_id
    WHERE p.is_active = 1
      AND p.latitude BETWEEN ? AND ?
      AND p.longitude BETWEEN ? AND ?
      ${typeFilter}
      ${insurerFilter}
    ORDER BY distance_sq
    LIMIT 20
  `).bind(
    lat, lat, lng, lng,
    lat - latRange, lat + latRange,
    lng - lngRange, lng + lngRange
  ).all<{
    id: string;
    name: string;
    type: string;
    address: string;
    phone: string;
    latitude: number;
    longitude: number;
    opening_hours: string;
    in_network: number;
    distance_sq: number;
  }>();

  return success(c, {
    providers: (providers.results || []).map((p) => ({
      ...p,
      distance: Math.sqrt(p.distance_sq),
      inNetwork: p.in_network === 1,
      openingHours: p.opening_hours ? JSON.parse(p.opening_hours) : null,
    })),
  });
});

/**
 * GET /notifications
 * Get adherent notifications
 */
mobile.get('/notifications', async (c) => {
  const user = c.get('user');
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100);
  const offset = (page - 1) * limit;

  const [countResult, unreadResult, notifications] = await Promise.all([
    getDb(c).prepare(`
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ?
    `).bind(user.id).first<{ count: number }>(),

    getDb(c).prepare(`
      SELECT COUNT(*) as unread FROM notifications
      WHERE user_id = ? AND read_at IS NULL
    `).bind(user.id).first<{ unread: number }>(),

    getDb(c).prepare(`
      SELECT
        id,
        type,
        title,
        body,
        data,
        read_at,
        created_at
      FROM notifications
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).bind(user.id, limit, offset).all<{
      id: string;
      type: string;
      title: string;
      body: string;
      data: string;
      read_at: string;
      created_at: string;
    }>(),
  ]);

  return success(c, {
    notifications: (notifications.results || []).map((n) => ({
      ...n,
      data: n.data ? JSON.parse(n.data) : null,
      read: !!n.read_at,
    })),
    meta: {
      page,
      limit,
      total: countResult?.count || 0,
      unread: unreadResult?.unread || 0,
    },
  });
});

/**
 * POST /notifications/:id/read
 * Mark notification as read
 */
mobile.post('/notifications/:id/read', async (c) => {
  const user = c.get('user');
  const notificationId = c.req.param('id');

  await getDb(c).prepare(`
    UPDATE notifications
    SET read_at = datetime('now')
    WHERE id = ? AND user_id = ?
  `).bind(notificationId, user.id).run();

  return success(c, { read: true });
});

/**
 * POST /notifications/read-all
 * Mark all notifications as read
 */
mobile.post('/notifications/read-all', async (c) => {
  const user = c.get('user');

  await getDb(c).prepare(`
    UPDATE notifications
    SET read_at = datetime('now')
    WHERE user_id = ? AND read_at IS NULL
  `).bind(user.id).run();

  return success(c, { message: 'Toutes les notifications marquées comme lues' });
});

/**
 * POST /push-token
 * Register push notification token
 */
mobile.post(
  '/push-token',
  zValidator('json', z.object({
    token: z.string(),
    platform: z.enum(['ios', 'android']),
    deviceId: z.string(),
  })),
  async (c) => {
    const user = c.get('user');
    const { token, platform, deviceId } = c.req.valid('json');

    await getDb(c).prepare(`
      UPDATE adherent_devices
      SET push_token = ?, platform = ?, updated_at = datetime('now')
      WHERE adherent_id = ? AND device_id = ?
    `).bind(token, platform, user.id, deviceId).run();

    return success(c, { registered: true });
  }
);

// ============== HELPER FUNCTIONS ==============

async function registerDevice(
  env: Bindings,
  adherentId: string,
  deviceInfo: {
    deviceId: string;
    platform: 'ios' | 'android';
    osVersion: string;
    appVersion: string;
    pushToken?: string;
  }
): Promise<void> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO adherent_devices (
      id, adherent_id, device_id, platform, os_version,
      app_version, push_token, is_active, last_login_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(adherent_id, device_id) DO UPDATE SET
      platform = excluded.platform,
      os_version = excluded.os_version,
      app_version = excluded.app_version,
      push_token = COALESCE(excluded.push_token, push_token),
      last_login_at = excluded.last_login_at,
      updated_at = excluded.updated_at
  `).bind(
    id,
    adherentId,
    deviceInfo.deviceId,
    deviceInfo.platform,
    deviceInfo.osVersion,
    deviceInfo.appVersion,
    deviceInfo.pushToken || null,
    now,
    now,
    now
  ).run();
}

export { mobile };
