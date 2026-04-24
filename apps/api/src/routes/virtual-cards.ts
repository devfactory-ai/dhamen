/**
 * Virtual Cards Routes
 *
 * API endpoints for digital adherent card management
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import { VirtualCardService } from '../services/virtual-card.service';
import {
  generateCardSchema,
  verifyCardSchema,
  suspendCardSchema,
  reactivateCardSchema,
  revokeCardSchema,
  renewCardSchema,
  listCardsQuerySchema,
} from '@dhamen/shared/schemas/virtual-card';
import { success, error, paginated, created, notFound, conflict, badRequest } from '../lib/response';
import { logAudit } from '../middleware/audit-trail';
import type { Bindings, Variables } from '../types';

const virtualCards = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
virtualCards.use('*', authMiddleware());

/**
 * POST /generate
 * Generate a new virtual card for an adherent
 */
virtualCards.post('/generate', async (c) => {
  try {
    const body = await c.req.json();
    const input = generateCardSchema.parse(body);
    const user = c.get('user');

    const service = new VirtualCardService(c.env);
    const card = await service.generateCard(
      input.adherentId,
      input.validityMonths,
      input.deviceFingerprint,
      user.id
    );

    logAudit(c.env.DB, {
      userId: user.id,
      action: 'virtual_card.generate',
      entityType: 'virtual_card',
      entityId: card.id,
      changes: { adherentId: input.adherentId, validityMonths: input.validityMonths },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return created(c, { card });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'ADHERENT_NOT_FOUND') {
        return notFound(c, 'Adhérent non trouvé ou contrat inactif');
      }
      if (err.message === 'ACTIVE_CARD_EXISTS') {
        return conflict(c, 'Une carte active existe déjà pour cet adhérent');
      }
    }
    throw err;
  }
});

/**
 * POST /verify
 * Verify a card via QR code or card number
 * This endpoint is public for providers to verify cards
 */
virtualCards.post('/verify', async (c) => {
  try {
    const body = await c.req.json();
    const input = verifyCardSchema.parse(body);
    const user = c.get('user');

    const ipAddress = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For');
    const userAgent = c.req.header('User-Agent');

    const service = new VirtualCardService(c.env);
    const result = await service.verifyCard(
      { qrCodeData: input.qrCodeData, cardNumber: input.cardNumber },
      input.providerId || user.providerId,
      ipAddress,
      userAgent,
      input.location
    );

    if (!result.valid) {
      return error(c, result.reason || 'VERIFICATION_FAILED', 'Vérification échouée', 400);
    }

    logAudit(c.env.DB, {
      userId: user.id,
      action: 'virtual_card.verify',
      entityType: 'virtual_card',
      entityId: result.verificationId || 'unknown',
      changes: { cardNumber: input.cardNumber, valid: result.valid },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, {
      valid: true,
      verificationId: result.verificationId,
      card: result.card,
    });
  } catch (err) {
    throw err;
  }
});

/**
 * GET /:id
 * Get card details
 */
virtualCards.get('/:id', async (c) => {
  const cardId = c.req.param('id');
  const service = new VirtualCardService(c.env);

  const card = await service.getCardWithAdherent(cardId);
  if (!card) {
    return notFound(c, 'Carte non trouvée');
  }

  return success(c, { card });
});

/**
 * GET /:id/qr
 * Generate QR code data for a card
 */
virtualCards.get('/:id/qr', async (c) => {
  try {
    const cardId = c.req.param('id');
    const service = new VirtualCardService(c.env);

    const qrData = await service.generateQRCodeData(cardId);

    return success(c, {
      qrCodeData: JSON.stringify(qrData),
      expiresIn: 300, // 5 minutes
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'CARD_NOT_FOUND') {
        return notFound(c, 'Carte non trouvée');
      }
      if (err.message === 'CARD_NOT_ACTIVE') {
        return badRequest(c, 'Carte non active');
      }
      if (err.message === 'CARD_EXPIRED') {
        return badRequest(c, 'Carte expirée');
      }
    }
    throw err;
  }
});

/**
 * POST /:id/suspend
 * Suspend a card
 */
virtualCards.post('/:id/suspend', async (c) => {
  try {
    const cardId = c.req.param('id');
    const body = await c.req.json();
    const { reason } = suspendCardSchema.parse({ cardId, ...body });
    const user = c.get('user');

    const service = new VirtualCardService(c.env);
    await service.suspendCard(cardId, reason, user.id);

    logAudit(c.env.DB, {
      userId: user.id,
      action: 'virtual_card.suspend',
      entityType: 'virtual_card',
      entityId: cardId,
      changes: { reason },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, { message: 'Carte suspendue' });
  } catch (err) {
    throw err;
  }
});

/**
 * POST /:id/reactivate
 * Reactivate a suspended card
 */
virtualCards.post('/:id/reactivate', async (c) => {
  try {
    const cardId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { reason } = reactivateCardSchema.parse({ cardId, ...body });
    const user = c.get('user');

    const service = new VirtualCardService(c.env);
    await service.reactivateCard(cardId, reason, user.id);

    logAudit(c.env.DB, {
      userId: user.id,
      action: 'virtual_card.reactivate',
      entityType: 'virtual_card',
      entityId: cardId,
      changes: { reason },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, { message: 'Carte réactivée' });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'CARD_NOT_FOUND') {
        return notFound(c, 'Carte non trouvée');
      }
      if (err.message === 'CARD_NOT_SUSPENDED') {
        return badRequest(c, 'La carte n\'est pas suspendue');
      }
      if (err.message === 'CARD_EXPIRED') {
        return badRequest(c, 'Carte expirée');
      }
    }
    throw err;
  }
});

/**
 * POST /:id/revoke
 * Revoke a card permanently
 */
virtualCards.post('/:id/revoke', async (c) => {
  try {
    const cardId = c.req.param('id');
    const body = await c.req.json();
    const { reason } = revokeCardSchema.parse({ cardId, ...body });
    const user = c.get('user');

    const service = new VirtualCardService(c.env);
    await service.revokeCard(cardId, reason, user.id);

    logAudit(c.env.DB, {
      userId: user.id,
      action: 'virtual_card.revoke',
      entityType: 'virtual_card',
      entityId: cardId,
      changes: { reason },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return success(c, { message: 'Carte révoquée' });
  } catch (err) {
    throw err;
  }
});

/**
 * POST /:id/renew
 * Renew a card (issues a new one and revokes the old)
 */
virtualCards.post('/:id/renew', async (c) => {
  try {
    const cardId = c.req.param('id');
    const body = await c.req.json().catch(() => ({}));
    const { validityMonths } = renewCardSchema.parse({ cardId, ...body });
    const user = c.get('user');

    const service = new VirtualCardService(c.env);
    const newCard = await service.renewCard(cardId, validityMonths, user.id);

    logAudit(c.env.DB, {
      userId: user.id,
      action: 'virtual_card.renew',
      entityType: 'virtual_card',
      entityId: newCard.id,
      changes: { previousCardId: cardId, validityMonths },
      ipAddress: c.req.header('CF-Connecting-IP'),
      userAgent: c.req.header('User-Agent'),
    });

    return created(c, { card: newCard });
  } catch (err) {
    if (err instanceof Error && err.message === 'CARD_NOT_FOUND') {
      return notFound(c, 'Carte non trouvée');
    }
    throw err;
  }
});

/**
 * GET /
 * List cards with filters
 */
virtualCards.get('/', async (c) => {
  const query = listCardsQuerySchema.parse(c.req.query());
  const service = new VirtualCardService(c.env);

  const { cards, total } = await service.listCards(
    { adherentId: query.adherentId, status: query.status },
    query.page,
    query.limit
  );

  return paginated(c, cards, { page: query.page, limit: query.limit, total });
});

/**
 * GET /:id/history
 * Get verification history for a card
 */
virtualCards.get('/:id/history', async (c) => {
  const cardId = c.req.param('id');
  const page = parseInt(c.req.query('page') || '1');
  const limit = parseInt(c.req.query('limit') || '20');

  const service = new VirtualCardService(c.env);
  const { verifications, total } = await service.getVerificationHistory(cardId, page, limit);

  return paginated(c, verifications, { page, limit, total });
});

/**
 * GET /adherent/:adherentId/active
 * Get active card for an adherent
 */
virtualCards.get('/adherent/:adherentId/active', async (c) => {
  const adherentId = c.req.param('adherentId');
  const service = new VirtualCardService(c.env);

  const { cards } = await service.listCards({ adherentId, status: 'active' }, 1, 1);

  const firstCard = cards[0];
  if (!firstCard) {
    return notFound(c, 'Aucune carte active pour cet adhérent');
  }

  const card = await service.getCardWithAdherent(firstCard.id);
  return success(c, { card });
});

export { virtualCards };
