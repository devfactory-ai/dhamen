/**
 * Payment Gateway Service
 *
 * Integrates with bank transfers and mobile money providers for Tunisia
 */

import type { Bindings } from '../types';

export interface PaymentProvider {
  id: string;
  name: string;
  type: 'bank_transfer' | 'mobile_money' | 'card';
  code: string;
  isActive: boolean;
  config: Record<string, unknown>;
}

export interface PaymentOrder {
  id: string;
  type: 'provider_payment' | 'refund';
  status: PaymentStatus;
  amount: number;
  currency: string;
  providerId: string;
  providerType: PaymentProvider['type'];
  beneficiary: BeneficiaryInfo;
  reference: string;
  description: string;
  bordereauId?: string;
  insurerId?: string;
  metadata?: Record<string, unknown>;
  externalId?: string;
  externalStatus?: string;
  errorCode?: string;
  errorMessage?: string;
  initiatedAt: string;
  processedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'refunded';

export interface BeneficiaryInfo {
  name: string;
  type: 'provider' | 'adherent';
  entityId: string;
  // Bank transfer
  bankCode?: string;
  bankName?: string;
  accountNumber?: string;
  rib?: string; // Relevé d'Identité Bancaire
  iban?: string;
  // Mobile money
  phoneNumber?: string;
  mobileMoneyProvider?: string;
}

export interface PaymentRequest {
  type: PaymentOrder['type'];
  amount: number;
  beneficiary: BeneficiaryInfo;
  providerId: string;
  reference: string;
  description: string;
  bordereauId?: string;
  insurerId?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentResult {
  success: boolean;
  orderId: string;
  externalId?: string;
  status: PaymentStatus;
  message?: string;
  error?: {
    code: string;
    message: string;
  };
}

export interface BankConfig {
  apiUrl: string;
  merchantId: string;
  apiKey: string;
  secretKey: string;
}

export interface MobileMoneyConfig {
  apiUrl: string;
  partnerId: string;
  apiKey: string;
  callbackUrl: string;
}

// Tunisian banks codes
const TUNISIAN_BANKS: Record<string, string> = {
  '01': 'Banque Centrale de Tunisie',
  '02': 'STB - Société Tunisienne de Banque',
  '03': 'BNA - Banque Nationale Agricole',
  '04': 'BH - Banque de l\'Habitat',
  '05': 'Banque de Tunisie',
  '07': 'Amen Bank',
  '08': 'BIAT - Banque Internationale Arabe de Tunisie',
  '10': 'ATB - Arab Tunisian Bank',
  '11': 'Attijari Bank',
  '12': 'UIB - Union Internationale de Banques',
  '14': 'BT - Banque de Tunisie',
  '20': 'La Poste Tunisienne',
  '21': 'UBCI - Union Bancaire pour le Commerce et l\'Industrie',
  '25': 'Zitouna Bank',
  '26': 'QNB Tunisia',
  '28': 'Wifak Bank',
};

// Mobile Money providers in Tunisia
const MOBILE_MONEY_PROVIDERS = {
  mdinar: { name: 'M-Dinar', code: 'MDINAR' },
  d17: { name: 'D17', code: 'D17' },
  sobflous: { name: 'Sobflous', code: 'SOBFLOUS' },
  flouci: { name: 'Flouci', code: 'FLOUCI' },
};

export class PaymentGatewayService {
  constructor(private env: Bindings) {}

  /**
   * Create a payment order
   */
  async createPaymentOrder(request: PaymentRequest): Promise<PaymentResult> {
    const orderId = this.generateOrderId();
    const now = new Date().toISOString();

    // Determine provider type
    const providerType = this.determineProviderType(request.beneficiary);

    const order: PaymentOrder = {
      id: orderId,
      type: request.type,
      status: 'pending',
      amount: request.amount,
      currency: 'TND',
      providerId: request.providerId,
      providerType,
      beneficiary: request.beneficiary,
      reference: request.reference,
      description: request.description,
      bordereauId: request.bordereauId,
      insurerId: request.insurerId,
      metadata: request.metadata,
      initiatedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    // Save order
    await this.env.DB.prepare(
      `INSERT INTO payment_orders (
        id, type, status, amount, currency, provider_id, provider_type,
        beneficiary, reference, description, bordereau_id, insurer_id,
        metadata, initiated_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        orderId,
        order.type,
        order.status,
        order.amount,
        order.currency,
        order.providerId,
        order.providerType,
        JSON.stringify(order.beneficiary),
        order.reference,
        order.description,
        order.bordereauId || null,
        order.insurerId || null,
        order.metadata ? JSON.stringify(order.metadata) : null,
        order.initiatedAt,
        order.createdAt,
        order.updatedAt
      )
      .run();

    return {
      success: true,
      orderId,
      status: 'pending',
      message: 'Payment order created',
    };
  }

  /**
   * Process a payment order
   */
  async processPayment(orderId: string): Promise<PaymentResult> {
    const order = await this.getOrder(orderId);
    if (!order) {
      return {
        success: false,
        orderId,
        status: 'failed',
        error: { code: 'ORDER_NOT_FOUND', message: 'Payment order not found' },
      };
    }

    if (order.status !== 'pending') {
      return {
        success: false,
        orderId,
        status: order.status,
        error: { code: 'INVALID_STATUS', message: `Cannot process order with status: ${order.status}` },
      };
    }

    await this.updateOrderStatus(orderId, 'processing');

    try {
      let result: PaymentResult;

      switch (order.providerType) {
        case 'bank_transfer':
          result = await this.processBankTransfer(order);
          break;
        case 'mobile_money':
          result = await this.processMobileMoneyPayment(order);
          break;
        default:
          throw new Error(`Unsupported provider type: ${order.providerType}`);
      }

      // Update order with result
      if (result.success) {
        await this.updateOrderStatus(orderId, 'completed', {
          externalId: result.externalId,
          processedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        });
      } else {
        await this.updateOrderStatus(orderId, 'failed', {
          externalId: result.externalId,
          errorCode: result.error?.code,
          errorMessage: result.error?.message,
          processedAt: new Date().toISOString(),
        });
      }

      return result;
    } catch (error) {
      await this.updateOrderStatus(orderId, 'failed', {
        errorCode: 'PROCESSING_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        processedAt: new Date().toISOString(),
      });

      return {
        success: false,
        orderId,
        status: 'failed',
        error: {
          code: 'PROCESSING_ERROR',
          message: error instanceof Error ? error.message : 'Processing failed',
        },
      };
    }
  }

  /**
   * Process bank transfer
   */
  private async processBankTransfer(order: PaymentOrder): Promise<PaymentResult> {
    const beneficiary = order.beneficiary;

    // Validate RIB
    if (!beneficiary.rib && !beneficiary.iban) {
      return {
        success: false,
        orderId: order.id,
        status: 'failed',
        error: { code: 'MISSING_BANK_INFO', message: 'RIB or IBAN required' },
      };
    }

    // In production, this would call the actual bank API
    // For now, we simulate the bank transfer process

    // Validate RIB format (Tunisian RIB: 20 digits)
    if (beneficiary.rib && !this.validateTunisianRIB(beneficiary.rib)) {
      return {
        success: false,
        orderId: order.id,
        status: 'failed',
        error: { code: 'INVALID_RIB', message: 'Invalid RIB format' },
      };
    }

    // Generate external reference
    const externalId = `BT${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Simulate bank API call
    // In production: const response = await this.callBankAPI(order);

    // Log the transfer
    await this.logPaymentActivity(order.id, 'bank_transfer_initiated', {
      externalId,
      bankCode: beneficiary.bankCode,
      amount: order.amount,
    });

    return {
      success: true,
      orderId: order.id,
      externalId,
      status: 'completed',
      message: 'Bank transfer initiated successfully',
    };
  }

  /**
   * Process mobile money payment
   */
  private async processMobileMoneyPayment(order: PaymentOrder): Promise<PaymentResult> {
    const beneficiary = order.beneficiary;

    if (!beneficiary.phoneNumber) {
      return {
        success: false,
        orderId: order.id,
        status: 'failed',
        error: { code: 'MISSING_PHONE', message: 'Phone number required for mobile money' },
      };
    }

    // Validate Tunisian phone number
    if (!this.validateTunisianPhone(beneficiary.phoneNumber)) {
      return {
        success: false,
        orderId: order.id,
        status: 'failed',
        error: { code: 'INVALID_PHONE', message: 'Invalid Tunisian phone number' },
      };
    }

    const provider = beneficiary.mobileMoneyProvider || 'flouci';

    // Generate external reference
    const externalId = `MM${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // Simulate mobile money API call
    // In production: const response = await this.callMobileMoneyAPI(provider, order);

    // Log the transfer
    await this.logPaymentActivity(order.id, 'mobile_money_initiated', {
      externalId,
      provider,
      phoneNumber: beneficiary.phoneNumber,
      amount: order.amount,
    });

    return {
      success: true,
      orderId: order.id,
      externalId,
      status: 'completed',
      message: `Mobile money transfer via ${provider} initiated`,
    };
  }

  /**
   * Get payment order by ID
   */
  async getOrder(id: string): Promise<PaymentOrder | null> {
    const result = await this.env.DB.prepare(
      'SELECT * FROM payment_orders WHERE id = ?'
    )
      .bind(id)
      .first();

    return result ? this.mapOrder(result) : null;
  }

  /**
   * List payment orders
   */
  async listOrders(params: {
    insurerId?: string;
    status?: PaymentStatus;
    bordereauId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ orders: PaymentOrder[]; total: number }> {
    const conditions: string[] = [];
    const bindings: unknown[] = [];

    if (params.insurerId) {
      conditions.push('insurer_id = ?');
      bindings.push(params.insurerId);
    }

    if (params.status) {
      conditions.push('status = ?');
      bindings.push(params.status);
    }

    if (params.bordereauId) {
      conditions.push('bordereau_id = ?');
      bindings.push(params.bordereauId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await this.env.DB.prepare(
      `SELECT COUNT(*) as count FROM payment_orders ${whereClause}`
    )
      .bind(...bindings)
      .first<{ count: number }>();

    const { results } = await this.env.DB.prepare(
      `SELECT * FROM payment_orders ${whereClause}
       ORDER BY created_at DESC LIMIT ? OFFSET ?`
    )
      .bind(...bindings, params.limit || 20, params.offset || 0)
      .all();

    return {
      orders: (results || []).map(this.mapOrder),
      total: countResult?.count || 0,
    };
  }

  /**
   * Cancel a payment order
   */
  async cancelOrder(orderId: string, reason: string): Promise<boolean> {
    const order = await this.getOrder(orderId);
    if (!order || !['pending', 'processing'].includes(order.status)) {
      return false;
    }

    await this.updateOrderStatus(orderId, 'cancelled', {
      errorMessage: reason,
    });

    await this.logPaymentActivity(orderId, 'cancelled', { reason });

    return true;
  }

  /**
   * Process webhook callback from payment provider
   */
  async handleWebhook(
    provider: string,
    payload: Record<string, unknown>
  ): Promise<{ success: boolean; message: string }> {
    // Extract order ID from webhook payload
    const externalId = payload.external_id as string || payload.reference as string;

    if (!externalId) {
      return { success: false, message: 'Missing external ID' };
    }

    // Find order by external ID
    const order = await this.env.DB.prepare(
      'SELECT * FROM payment_orders WHERE external_id = ?'
    )
      .bind(externalId)
      .first();

    if (!order) {
      return { success: false, message: 'Order not found' };
    }

    const orderId = order.id as string;
    const status = payload.status as string;

    // Map provider status to internal status
    let newStatus: PaymentStatus;
    switch (status?.toLowerCase()) {
      case 'success':
      case 'completed':
      case 'paid':
        newStatus = 'completed';
        break;
      case 'failed':
      case 'rejected':
      case 'declined':
        newStatus = 'failed';
        break;
      case 'refunded':
        newStatus = 'refunded';
        break;
      default:
        newStatus = 'processing';
    }

    await this.updateOrderStatus(orderId, newStatus, {
      externalStatus: status,
      completedAt: newStatus === 'completed' ? new Date().toISOString() : undefined,
    });

    await this.logPaymentActivity(orderId, 'webhook_received', {
      provider,
      payload,
    });

    return { success: true, message: `Order updated to ${newStatus}` };
  }

  /**
   * Get payment statistics
   */
  async getStats(insurerId?: string): Promise<{
    totalOrders: number;
    totalAmount: number;
    byStatus: { status: string; count: number; amount: number }[];
    byType: { type: string; count: number; amount: number }[];
    recentTransactions: PaymentOrder[];
  }> {
    const filter = insurerId ? `WHERE insurer_id = '${insurerId}'` : '';

    const totals = await this.env.DB.prepare(
      `SELECT COUNT(*) as total, COALESCE(SUM(amount), 0) as total_amount
       FROM payment_orders ${filter}`
    ).first<{ total: number; total_amount: number }>();

    const { results: byStatus } = await this.env.DB.prepare(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
       FROM payment_orders ${filter}
       GROUP BY status`
    ).all<{ status: string; count: number; amount: number }>();

    const { results: byType } = await this.env.DB.prepare(
      `SELECT provider_type as type, COUNT(*) as count, COALESCE(SUM(amount), 0) as amount
       FROM payment_orders ${filter}
       GROUP BY provider_type`
    ).all<{ type: string; count: number; amount: number }>();

    const { results: recent } = await this.env.DB.prepare(
      `SELECT * FROM payment_orders ${filter}
       ORDER BY created_at DESC LIMIT 10`
    ).all();

    return {
      totalOrders: totals?.total || 0,
      totalAmount: totals?.total_amount || 0,
      byStatus: byStatus || [],
      byType: byType || [],
      recentTransactions: (recent || []).map(this.mapOrder),
    };
  }

  /**
   * Get available payment providers
   */
  getAvailableProviders(): {
    bankTransfer: { code: string; name: string }[];
    mobileMoney: { code: string; name: string }[];
  } {
    return {
      bankTransfer: Object.entries(TUNISIAN_BANKS).map(([code, name]) => ({
        code,
        name,
      })),
      mobileMoney: Object.entries(MOBILE_MONEY_PROVIDERS).map(([code, provider]) => ({
        code,
        name: provider.name,
      })),
    };
  }

  /**
   * Create bulk payment for a bordereau
   */
  async createBordereauPayment(
    bordereauId: string,
    insurerId: string
  ): Promise<PaymentResult> {
    // Get bordereau details
    const bordereau = await this.env.DB.prepare(
      `SELECT b.*, p.name as provider_name, p.rib, p.iban, p.bank_code
       FROM bordereaux b
       JOIN providers p ON b.provider_id = p.id
       WHERE b.id = ? AND b.insurer_id = ?`
    )
      .bind(bordereauId, insurerId)
      .first<{
        id: string;
        provider_id: string;
        provider_name: string;
        montant_total: number;
        rib: string | null;
        iban: string | null;
        bank_code: string | null;
      }>();

    if (!bordereau) {
      return {
        success: false,
        orderId: '',
        status: 'failed',
        error: { code: 'BORDEREAU_NOT_FOUND', message: 'Bordereau not found' },
      };
    }

    // Create payment order
    return this.createPaymentOrder({
      type: 'provider_payment',
      amount: bordereau.montant_total,
      providerId: 'bank_transfer',
      beneficiary: {
        name: bordereau.provider_name,
        type: 'provider',
        entityId: bordereau.provider_id,
        rib: bordereau.rib || undefined,
        iban: bordereau.iban || undefined,
        bankCode: bordereau.bank_code || undefined,
      },
      reference: `BRD-${bordereauId}`,
      description: `Paiement bordereau ${bordereauId}`,
      bordereauId,
      insurerId,
    });
  }

  // Private helper methods

  private generateOrderId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `pay_${timestamp}${random}`;
  }

  private determineProviderType(
    beneficiary: BeneficiaryInfo
  ): PaymentProvider['type'] {
    if (beneficiary.phoneNumber && beneficiary.mobileMoneyProvider) {
      return 'mobile_money';
    }
    return 'bank_transfer';
  }

  private validateTunisianRIB(rib: string): boolean {
    // Tunisian RIB: 20 digits
    const cleaned = rib.replace(/\s/g, '');
    return /^\d{20}$/.test(cleaned);
  }

  private validateTunisianPhone(phone: string): boolean {
    // Tunisian mobile: +216 followed by 2x, 5x, or 9x
    const cleaned = phone.replace(/[\s\-]/g, '');
    return /^(\+?216)?[259]\d{7}$/.test(cleaned);
  }

  private async updateOrderStatus(
    orderId: string,
    status: PaymentStatus,
    updates: Partial<PaymentOrder> = {}
  ): Promise<void> {
    const setClause = ['status = ?', 'updated_at = datetime("now")'];
    const bindings: unknown[] = [status];

    if (updates.externalId) {
      setClause.push('external_id = ?');
      bindings.push(updates.externalId);
    }

    if (updates.externalStatus) {
      setClause.push('external_status = ?');
      bindings.push(updates.externalStatus);
    }

    if (updates.errorCode) {
      setClause.push('error_code = ?');
      bindings.push(updates.errorCode);
    }

    if (updates.errorMessage) {
      setClause.push('error_message = ?');
      bindings.push(updates.errorMessage);
    }

    if (updates.processedAt) {
      setClause.push('processed_at = ?');
      bindings.push(updates.processedAt);
    }

    if (updates.completedAt) {
      setClause.push('completed_at = ?');
      bindings.push(updates.completedAt);
    }

    bindings.push(orderId);

    await this.env.DB.prepare(
      `UPDATE payment_orders SET ${setClause.join(', ')} WHERE id = ?`
    )
      .bind(...bindings)
      .run();
  }

  private async logPaymentActivity(
    orderId: string,
    action: string,
    details: Record<string, unknown>
  ): Promise<void> {
    await this.env.DB.prepare(
      `INSERT INTO payment_activity_logs (
        id, order_id, action, details, created_at
      ) VALUES (?, ?, ?, ?, datetime('now'))`
    )
      .bind(
        `pal_${Date.now().toString(36)}${Math.random().toString(36).substr(2, 6)}`,
        orderId,
        action,
        JSON.stringify(details)
      )
      .run();
  }

  private mapOrder(row: Record<string, unknown>): PaymentOrder {
    return {
      id: row.id as string,
      type: row.type as PaymentOrder['type'],
      status: row.status as PaymentStatus,
      amount: row.amount as number,
      currency: row.currency as string,
      providerId: row.provider_id as string,
      providerType: row.provider_type as PaymentProvider['type'],
      beneficiary: JSON.parse(row.beneficiary as string),
      reference: row.reference as string,
      description: row.description as string,
      bordereauId: (row.bordereau_id as string) || undefined,
      insurerId: (row.insurer_id as string) || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
      externalId: (row.external_id as string) || undefined,
      externalStatus: (row.external_status as string) || undefined,
      errorCode: (row.error_code as string) || undefined,
      errorMessage: (row.error_message as string) || undefined,
      initiatedAt: row.initiated_at as string,
      processedAt: (row.processed_at as string) || undefined,
      completedAt: (row.completed_at as string) || undefined,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
