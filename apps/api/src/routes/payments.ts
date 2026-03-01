/**
 * Payments Routes
 *
 * Manage payment orders and bank/mobile money transfers
 */
import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { requireAuth, requireRole } from '../middleware/auth';
import { PaymentGatewayService } from '../services/payment-gateway.service';

const payments = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require authentication
payments.use('*', requireAuth);

/**
 * GET /payments/providers
 * Get available payment providers
 */
payments.get('/providers', (c) => {
  const paymentService = new PaymentGatewayService(c.env);
  const providers = paymentService.getAvailableProviders();

  return c.json({
    success: true,
    data: providers,
  });
});

/**
 * POST /payments/orders
 * Create a payment order
 */
payments.post(
  '/orders',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const body = await c.req.json<{
      type: 'provider_payment' | 'refund';
      amount: number;
      providerId: string;
      beneficiary: {
        name: string;
        type: 'provider' | 'adherent';
        entityId: string;
        bankCode?: string;
        rib?: string;
        iban?: string;
        phoneNumber?: string;
        mobileMoneyProvider?: string;
      };
      reference: string;
      description: string;
      bordereauId?: string;
      insurerId?: string;
    }>();

    if (!body.amount || !body.beneficiary || !body.reference) {
      return c.json(
        {
          success: false,
          error: { code: 'INVALID_REQUEST', message: 'amount, beneficiary et reference requis' },
        },
        400
      );
    }

    const user = c.get('user');
    const effectiveInsurerId = body.insurerId || user.insurerId;

    const paymentService = new PaymentGatewayService(c.env);

    const result = await paymentService.createPaymentOrder({
      ...body,
      insurerId: effectiveInsurerId,
    });

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error,
        },
        400
      );
    }

    return c.json({
      success: true,
      data: result,
    }, 201);
  }
);

/**
 * GET /payments/orders
 * List payment orders
 */
payments.get(
  '/orders',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const insurerId = c.req.query('insurerId');
    const status = c.req.query('status') as 'pending' | 'processing' | 'completed' | 'failed' | undefined;
    const bordereauId = c.req.query('bordereauId');
    const limit = parseInt(c.req.query('limit') || '20', 10);
    const offset = parseInt(c.req.query('offset') || '0', 10);

    const user = c.get('user');
    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    const paymentService = new PaymentGatewayService(c.env);

    const result = await paymentService.listOrders({
      insurerId: effectiveInsurerId,
      status,
      bordereauId,
      limit,
      offset,
    });

    return c.json({
      success: true,
      data: result.orders,
      meta: {
        total: result.total,
        limit,
        offset,
      },
    });
  }
);

/**
 * GET /payments/orders/:id
 * Get payment order details
 */
payments.get(
  '/orders/:id',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const id = c.req.param('id');

    const paymentService = new PaymentGatewayService(c.env);
    const order = await paymentService.getOrder(id);

    if (!order) {
      return c.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: 'Ordre de paiement non trouvé' },
        },
        404
      );
    }

    return c.json({
      success: true,
      data: order,
    });
  }
);

/**
 * POST /payments/orders/:id/process
 * Process a payment order
 */
payments.post(
  '/orders/:id/process',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const id = c.req.param('id');

    const paymentService = new PaymentGatewayService(c.env);
    const result = await paymentService.processPayment(id);

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error,
        },
        400
      );
    }

    return c.json({
      success: true,
      data: result,
    });
  }
);

/**
 * POST /payments/orders/:id/cancel
 * Cancel a payment order
 */
payments.post(
  '/orders/:id/cancel',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json<{ reason: string }>().catch(() => ({ reason: 'Cancelled by user' }));

    const paymentService = new PaymentGatewayService(c.env);
    const cancelled = await paymentService.cancelOrder(id, body.reason);

    if (!cancelled) {
      return c.json(
        {
          success: false,
          error: { code: 'CANNOT_CANCEL', message: 'Ordre ne peut pas être annulé' },
        },
        400
      );
    }

    return c.json({
      success: true,
      data: { cancelled: true },
    });
  }
);

/**
 * POST /payments/bordereau/:id/pay
 * Create and process payment for a bordereau
 */
payments.post(
  '/bordereau/:id/pay',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const bordereauId = c.req.param('id');
    const user = c.get('user');

    const insurerId = user.insurerId || c.req.query('insurerId');

    if (!insurerId) {
      return c.json(
        {
          success: false,
          error: { code: 'INSURER_REQUIRED', message: 'insurerId requis' },
        },
        400
      );
    }

    const paymentService = new PaymentGatewayService(c.env);

    // Create payment order
    const createResult = await paymentService.createBordereauPayment(
      bordereauId,
      insurerId
    );

    if (!createResult.success) {
      return c.json(
        {
          success: false,
          error: createResult.error,
        },
        400
      );
    }

    // Process payment
    const processResult = await paymentService.processPayment(createResult.orderId);

    return c.json({
      success: processResult.success,
      data: processResult,
    });
  }
);

/**
 * GET /payments/stats
 * Get payment statistics
 */
payments.get(
  '/stats',
  requireRole('ADMIN', 'INSURER_ADMIN'),
  async (c) => {
    const insurerId = c.req.query('insurerId');
    const user = c.get('user');

    const effectiveInsurerId =
      user.role === 'ADMIN' ? insurerId : user.insurerId;

    const paymentService = new PaymentGatewayService(c.env);
    const stats = await paymentService.getStats(effectiveInsurerId);

    return c.json({
      success: true,
      data: stats,
    });
  }
);

/**
 * POST /payments/webhook/:provider
 * Handle webhook from payment provider
 */
payments.post('/webhook/:provider', async (c) => {
  const provider = c.req.param('provider');
  const payload = await c.req.json();

  // Verify webhook signature
  const signature = c.req.header('X-Webhook-Signature');
  // In production, verify signature against stored secret

  const paymentService = new PaymentGatewayService(c.env);
  const result = await paymentService.handleWebhook(provider, payload);

  if (!result.success) {
    return c.json({ error: result.message }, 400);
  }

  return c.json({ success: true });
});

/**
 * POST /payments/validate-rib
 * Validate Tunisian RIB
 */
payments.post('/validate-rib', async (c) => {
  const body = await c.req.json<{ rib: string }>();

  if (!body.rib) {
    return c.json(
      {
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'rib requis' },
      },
      400
    );
  }

  const cleaned = body.rib.replace(/\s/g, '');
  const isValid = /^\d{20}$/.test(cleaned);

  let bankCode = '';
  let bankName = '';

  if (isValid) {
    bankCode = cleaned.substring(0, 2);
    const banks: Record<string, string> = {
      '01': 'Banque Centrale de Tunisie',
      '02': 'STB',
      '03': 'BNA',
      '04': 'BH',
      '05': 'Banque de Tunisie',
      '07': 'Amen Bank',
      '08': 'BIAT',
      '10': 'ATB',
      '11': 'Attijari Bank',
      '12': 'UIB',
      '14': 'BT',
      '20': 'La Poste',
      '21': 'UBCI',
      '25': 'Zitouna Bank',
      '26': 'QNB Tunisia',
      '28': 'Wifak Bank',
    };
    bankName = banks[bankCode] || 'Banque inconnue';
  }

  return c.json({
    success: true,
    data: {
      valid: isValid,
      bankCode: isValid ? bankCode : undefined,
      bankName: isValid ? bankName : undefined,
      formatted: isValid
        ? `${cleaned.slice(0, 2)} ${cleaned.slice(2, 5)} ${cleaned.slice(5, 18)} ${cleaned.slice(18)}`
        : undefined,
    },
  });
});

/**
 * POST /payments/validate-phone
 * Validate Tunisian phone number for mobile money
 */
payments.post('/validate-phone', async (c) => {
  const body = await c.req.json<{ phone: string }>();

  if (!body.phone) {
    return c.json(
      {
        success: false,
        error: { code: 'INVALID_REQUEST', message: 'phone requis' },
      },
      400
    );
  }

  const cleaned = body.phone.replace(/[\s\-]/g, '');
  const isValid = /^(\+?216)?[259]\d{7}$/.test(cleaned);

  let operator = '';
  if (isValid) {
    const prefix = cleaned.slice(-8, -7);
    switch (prefix) {
      case '2':
        operator = 'Tunisie Telecom';
        break;
      case '5':
        operator = 'Ooredoo';
        break;
      case '9':
        operator = 'Orange';
        break;
    }
  }

  return c.json({
    success: true,
    data: {
      valid: isValid,
      operator: isValid ? operator : undefined,
      formatted: isValid ? `+216 ${cleaned.slice(-8)}` : undefined,
    },
  });
});

export default payments;
