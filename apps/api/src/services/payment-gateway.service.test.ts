/**
 * Payment Gateway Service Tests
 *
 * Tests for payment orders, bank transfers, mobile money, and webhooks
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PaymentGatewayService,
  type PaymentOrder,
  type PaymentStatus,
  type BeneficiaryInfo,
  type PaymentRequest,
} from './payment-gateway.service';

// Mock D1 Database
function createMockDB() {
  const mockRun = vi.fn().mockResolvedValue({ success: true });
  const mockFirst = vi.fn().mockResolvedValue(null);
  const mockAll = vi.fn().mockResolvedValue({ results: [] });

  const mockBind = vi.fn(() => ({
    run: mockRun,
    first: mockFirst,
    all: mockAll,
    bind: mockBind,
  }));

  return {
    prepare: vi.fn(() => ({
      bind: mockBind,
      run: mockRun,
      first: mockFirst,
      all: mockAll,
    })),
    _mocks: { run: mockRun, first: mockFirst, all: mockAll, bind: mockBind },
  };
}

function createMockEnv() {
  return {
    DB: createMockDB(),
  } as any;
}

describe('PaymentGatewayService', () => {
  let service: PaymentGatewayService;
  let mockEnv: ReturnType<typeof createMockEnv>;

  beforeEach(() => {
    mockEnv = createMockEnv();
    service = new PaymentGatewayService(mockEnv);
  });

  describe('createPaymentOrder', () => {
    it('should create a bank transfer payment order', async () => {
      const request: PaymentRequest = {
        type: 'provider_payment',
        amount: 150000, // 150 TND in millimes
        providerId: 'bank_transfer',
        beneficiary: {
          name: 'Pharmacie Centrale',
          type: 'provider',
          entityId: 'prov_001',
          rib: '12345678901234567890',
          bankCode: '07',
        },
        reference: 'BRD-001',
        description: 'Paiement bordereau #001',
        bordereauId: 'brd_001',
        insurerId: 'ins_001',
      };

      const result = await service.createPaymentOrder(request);

      expect(result.success).toBe(true);
      expect(result.orderId).toMatch(/^pay_/);
      expect(result.status).toBe('pending');
      expect(mockEnv.DB.prepare).toHaveBeenCalled();
    });

    it('should create a mobile money payment order', async () => {
      const request: PaymentRequest = {
        type: 'refund',
        amount: 50000,
        providerId: 'mobile_money',
        beneficiary: {
          name: 'Mohamed Ben Ali',
          type: 'adherent',
          entityId: 'adh_001',
          phoneNumber: '+21698123456',
          mobileMoneyProvider: 'flouci',
        },
        reference: 'REF-001',
        description: 'Remboursement adhérent',
      };

      const result = await service.createPaymentOrder(request);

      expect(result.success).toBe(true);
      expect(result.orderId).toMatch(/^pay_/);
      expect(result.status).toBe('pending');
    });

    it('should store payment order in database', async () => {
      const request: PaymentRequest = {
        type: 'provider_payment',
        amount: 100000,
        providerId: 'bank_transfer',
        beneficiary: {
          name: 'Test Provider',
          type: 'provider',
          entityId: 'prov_002',
          rib: '98765432109876543210',
        },
        reference: 'TEST-001',
        description: 'Test payment',
      };

      await service.createPaymentOrder(request);

      expect(mockEnv.DB.prepare).toHaveBeenCalled();
      const prepareCall = mockEnv.DB.prepare.mock.calls[0][0];
      expect(prepareCall).toContain('INSERT INTO payment_orders');
    });
  });

  describe('processPayment', () => {
    it('should return error for non-existent order', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce(null);

      const result = await service.processPayment('non_existent');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ORDER_NOT_FOUND');
    });

    it('should not process non-pending orders', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'pay_001',
        status: 'completed',
        amount: 100000,
        currency: 'TND',
        provider_type: 'bank_transfer',
        beneficiary: JSON.stringify({ name: 'Test', type: 'provider', entityId: 'p1' }),
        reference: 'REF-001',
        description: 'Test',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        initiated_at: '2024-01-01T00:00:00Z',
      });

      const result = await service.processPayment('pay_001');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_STATUS');
    });

    it('should process pending bank transfer', async () => {
      // First call for getOrder
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'pay_001',
        type: 'provider_payment',
        status: 'pending',
        amount: 100000,
        currency: 'TND',
        provider_id: 'bank_transfer',
        provider_type: 'bank_transfer',
        beneficiary: JSON.stringify({
          name: 'Pharmacie Test',
          type: 'provider',
          entityId: 'prov_001',
          rib: '12345678901234567890',
        }),
        reference: 'BRD-001',
        description: 'Test payment',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        initiated_at: '2024-01-01T00:00:00Z',
      });

      const result = await service.processPayment('pay_001');

      expect(result.success).toBe(true);
      expect(result.status).toBe('completed');
      expect(result.externalId).toMatch(/^BT/);
    });

    it('should process pending mobile money payment', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'pay_002',
        type: 'refund',
        status: 'pending',
        amount: 50000,
        currency: 'TND',
        provider_id: 'mobile_money',
        provider_type: 'mobile_money',
        beneficiary: JSON.stringify({
          name: 'Mohamed',
          type: 'adherent',
          entityId: 'adh_001',
          phoneNumber: '98123456',
          mobileMoneyProvider: 'flouci',
        }),
        reference: 'REF-001',
        description: 'Remboursement',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        initiated_at: '2024-01-01T00:00:00Z',
      });

      const result = await service.processPayment('pay_002');

      expect(result.success).toBe(true);
      expect(result.externalId).toMatch(/^MM/);
    });

    it('should fail for invalid RIB', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'pay_003',
        type: 'provider_payment',
        status: 'pending',
        amount: 100000,
        currency: 'TND',
        provider_id: 'bank_transfer',
        provider_type: 'bank_transfer',
        beneficiary: JSON.stringify({
          name: 'Test',
          type: 'provider',
          entityId: 'prov_001',
          rib: '12345', // Invalid RIB (too short)
        }),
        reference: 'BRD-001',
        description: 'Test',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        initiated_at: '2024-01-01T00:00:00Z',
      });

      const result = await service.processPayment('pay_003');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_RIB');
    });

    it('should fail for missing RIB/IBAN', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'pay_004',
        type: 'provider_payment',
        status: 'pending',
        amount: 100000,
        currency: 'TND',
        provider_id: 'bank_transfer',
        provider_type: 'bank_transfer',
        beneficiary: JSON.stringify({
          name: 'Test',
          type: 'provider',
          entityId: 'prov_001',
          // No RIB or IBAN
        }),
        reference: 'BRD-001',
        description: 'Test',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        initiated_at: '2024-01-01T00:00:00Z',
      });

      const result = await service.processPayment('pay_004');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_BANK_INFO');
    });

    it('should fail for invalid phone number', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'pay_005',
        type: 'refund',
        status: 'pending',
        amount: 50000,
        currency: 'TND',
        provider_id: 'mobile_money',
        provider_type: 'mobile_money',
        beneficiary: JSON.stringify({
          name: 'Test',
          type: 'adherent',
          entityId: 'adh_001',
          phoneNumber: '12345', // Invalid phone
          mobileMoneyProvider: 'flouci',
        }),
        reference: 'REF-001',
        description: 'Test',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        initiated_at: '2024-01-01T00:00:00Z',
      });

      const result = await service.processPayment('pay_005');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_PHONE');
    });

    it('should fail for missing phone number', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'pay_006',
        type: 'refund',
        status: 'pending',
        amount: 50000,
        currency: 'TND',
        provider_id: 'mobile_money',
        provider_type: 'mobile_money',
        beneficiary: JSON.stringify({
          name: 'Test',
          type: 'adherent',
          entityId: 'adh_001',
          mobileMoneyProvider: 'flouci',
          // No phone
        }),
        reference: 'REF-001',
        description: 'Test',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        initiated_at: '2024-01-01T00:00:00Z',
      });

      const result = await service.processPayment('pay_006');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_PHONE');
    });
  });

  describe('getOrder', () => {
    it('should return null for non-existent order', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce(null);

      const order = await service.getOrder('non_existent');

      expect(order).toBeNull();
    });

    it('should return mapped order when found', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'pay_001',
        type: 'provider_payment',
        status: 'completed',
        amount: 150000,
        currency: 'TND',
        provider_id: 'bank_transfer',
        provider_type: 'bank_transfer',
        beneficiary: JSON.stringify({
          name: 'Pharmacie Test',
          type: 'provider',
          entityId: 'prov_001',
          rib: '12345678901234567890',
        }),
        reference: 'BRD-001',
        description: 'Paiement bordereau',
        bordereau_id: 'brd_001',
        insurer_id: 'ins_001',
        external_id: 'BT123456',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T01:00:00Z',
        initiated_at: '2024-01-01T00:00:00Z',
        completed_at: '2024-01-01T00:30:00Z',
      });

      const order = await service.getOrder('pay_001');

      expect(order).not.toBeNull();
      expect(order?.id).toBe('pay_001');
      expect(order?.amount).toBe(150000);
      expect(order?.beneficiary.name).toBe('Pharmacie Test');
      expect(order?.externalId).toBe('BT123456');
    });
  });

  describe('listOrders', () => {
    it('should list orders with pagination', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ count: 2 });
      mockEnv.DB._mocks.all.mockResolvedValueOnce({
        results: [
          {
            id: 'pay_001',
            type: 'provider_payment',
            status: 'completed',
            amount: 100000,
            currency: 'TND',
            provider_id: 'bank_transfer',
            provider_type: 'bank_transfer',
            beneficiary: '{"name":"Test","type":"provider","entityId":"p1"}',
            reference: 'REF-001',
            description: 'Test 1',
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
            initiated_at: '2024-01-01T00:00:00Z',
          },
          {
            id: 'pay_002',
            type: 'refund',
            status: 'pending',
            amount: 50000,
            currency: 'TND',
            provider_id: 'mobile_money',
            provider_type: 'mobile_money',
            beneficiary: '{"name":"Test 2","type":"adherent","entityId":"a1"}',
            reference: 'REF-002',
            description: 'Test 2',
            created_at: '2024-01-02T00:00:00Z',
            updated_at: '2024-01-02T00:00:00Z',
            initiated_at: '2024-01-02T00:00:00Z',
          },
        ],
      });

      const result = await service.listOrders({ limit: 20, offset: 0 });

      expect(result.total).toBe(2);
      expect(result.orders).toHaveLength(2);
    });

    it('should filter orders by status', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ count: 1 });
      mockEnv.DB._mocks.all.mockResolvedValueOnce({ results: [] });

      await service.listOrders({ status: 'pending' });

      const prepareCall = mockEnv.DB.prepare.mock.calls.find((call: string[]) =>
        call[0]?.includes('SELECT COUNT')
      );
      expect(prepareCall![0]).toContain('status = ?');
    });

    it('should filter orders by insurer', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ count: 0 });
      mockEnv.DB._mocks.all.mockResolvedValueOnce({ results: [] });

      await service.listOrders({ insurerId: 'ins_001' });

      const prepareCall = mockEnv.DB.prepare.mock.calls.find((call: string[]) =>
        call[0]?.includes('SELECT COUNT')
      );
      expect(prepareCall![0]).toContain('insurer_id = ?');
    });

    it('should filter orders by bordereau', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ count: 0 });
      mockEnv.DB._mocks.all.mockResolvedValueOnce({ results: [] });

      await service.listOrders({ bordereauId: 'brd_001' });

      const prepareCall = mockEnv.DB.prepare.mock.calls.find((call: string[]) =>
        call[0]?.includes('SELECT COUNT')
      );
      expect(prepareCall![0]).toContain('bordereau_id = ?');
    });
  });

  describe('cancelOrder', () => {
    it('should cancel pending order', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'pay_001',
        status: 'pending',
        amount: 100000,
        currency: 'TND',
        provider_type: 'bank_transfer',
        beneficiary: '{"name":"Test","type":"provider","entityId":"p1"}',
        reference: 'REF-001',
        description: 'Test',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        initiated_at: '2024-01-01T00:00:00Z',
      });

      const result = await service.cancelOrder('pay_001', 'User requested');

      expect(result).toBe(true);
    });

    it('should cancel processing order', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'pay_001',
        status: 'processing',
        amount: 100000,
        currency: 'TND',
        provider_type: 'bank_transfer',
        beneficiary: '{"name":"Test","type":"provider","entityId":"p1"}',
        reference: 'REF-001',
        description: 'Test',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        initiated_at: '2024-01-01T00:00:00Z',
      });

      const result = await service.cancelOrder('pay_001', 'Error occurred');

      expect(result).toBe(true);
    });

    it('should not cancel completed order', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'pay_001',
        status: 'completed',
        amount: 100000,
        currency: 'TND',
        provider_type: 'bank_transfer',
        beneficiary: '{"name":"Test","type":"provider","entityId":"p1"}',
        reference: 'REF-001',
        description: 'Test',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        initiated_at: '2024-01-01T00:00:00Z',
      });

      const result = await service.cancelOrder('pay_001', 'Too late');

      expect(result).toBe(false);
    });

    it('should return false for non-existent order', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce(null);

      const result = await service.cancelOrder('non_existent', 'Reason');

      expect(result).toBe(false);
    });
  });

  describe('handleWebhook', () => {
    it('should return error for missing external ID', async () => {
      const result = await service.handleWebhook('bank', {});

      expect(result.success).toBe(false);
      expect(result.message).toBe('Missing external ID');
    });

    it('should return error for unknown order', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce(null);

      const result = await service.handleWebhook('bank', { external_id: 'unknown' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Order not found');
    });

    it('should update order status from webhook - success', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ id: 'pay_001' });

      const result = await service.handleWebhook('bank', {
        external_id: 'BT123456',
        status: 'success',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Order updated to completed');
    });

    it('should update order status from webhook - paid', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ id: 'pay_001' });

      const result = await service.handleWebhook('flouci', {
        reference: 'MM123456',
        status: 'PAID',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Order updated to completed');
    });

    it('should update order status from webhook - failed', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ id: 'pay_001' });

      const result = await service.handleWebhook('bank', {
        external_id: 'BT123456',
        status: 'rejected',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Order updated to failed');
    });

    it('should update order status from webhook - refunded', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ id: 'pay_001' });

      const result = await service.handleWebhook('bank', {
        external_id: 'BT123456',
        status: 'refunded',
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Order updated to refunded');
    });
  });

  describe('getStats', () => {
    it('should return payment statistics', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ total: 100, total_amount: 5000000 });
      mockEnv.DB._mocks.all
        .mockResolvedValueOnce({
          results: [
            { status: 'completed', count: 80, amount: 4000000 },
            { status: 'pending', count: 15, amount: 750000 },
            { status: 'failed', count: 5, amount: 250000 },
          ],
        })
        .mockResolvedValueOnce({
          results: [
            { type: 'bank_transfer', count: 70, amount: 4500000 },
            { type: 'mobile_money', count: 30, amount: 500000 },
          ],
        })
        .mockResolvedValueOnce({ results: [] }); // recent transactions

      const stats = await service.getStats();

      expect(stats.totalOrders).toBe(100);
      expect(stats.totalAmount).toBe(5000000);
      expect(stats.byStatus).toHaveLength(3);
      expect(stats.byType).toHaveLength(2);
    });

    it('should filter stats by insurer', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({ total: 50, total_amount: 2500000 });
      mockEnv.DB._mocks.all
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] })
        .mockResolvedValueOnce({ results: [] });

      await service.getStats('ins_001');

      const prepareCall = mockEnv.DB.prepare.mock.calls[0][0];
      expect(prepareCall).toContain("insurer_id = 'ins_001'");
    });
  });

  describe('getAvailableProviders', () => {
    it('should return list of Tunisian banks', () => {
      const providers = service.getAvailableProviders();

      expect(providers.bankTransfer.length).toBeGreaterThan(0);
      expect(providers.bankTransfer.some((b) => b.name.includes('Amen Bank'))).toBe(true);
      expect(providers.bankTransfer.some((b) => b.name.includes('BIAT'))).toBe(true);
    });

    it('should return list of mobile money providers', () => {
      const providers = service.getAvailableProviders();

      expect(providers.mobileMoney.length).toBeGreaterThan(0);
      expect(providers.mobileMoney.some((p) => p.name === 'Flouci')).toBe(true);
      expect(providers.mobileMoney.some((p) => p.name === 'D17')).toBe(true);
    });
  });

  describe('createBordereauPayment', () => {
    it('should return error for non-existent bordereau', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce(null);

      const result = await service.createBordereauPayment('brd_999', 'ins_001');

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('BORDEREAU_NOT_FOUND');
    });

    it('should create payment order for bordereau', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'brd_001',
        provider_id: 'prov_001',
        provider_name: 'Pharmacie Centrale',
        montant_total: 250000,
        rib: '12345678901234567890',
        bank_code: '07',
      });

      const result = await service.createBordereauPayment('brd_001', 'ins_001');

      expect(result.success).toBe(true);
      expect(result.orderId).toMatch(/^pay_/);
    });
  });

  describe('Payment Status Transitions', () => {
    const statuses: PaymentStatus[] = ['pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'];

    for (const status of statuses) {
      it(`should handle status: ${status}`, async () => {
        mockEnv.DB._mocks.first.mockResolvedValueOnce({
          id: 'pay_001',
          type: 'provider_payment',
          status,
          amount: 100000,
          currency: 'TND',
          provider_id: 'bank_transfer',
          provider_type: 'bank_transfer',
          beneficiary: '{"name":"Test","type":"provider","entityId":"p1"}',
          reference: 'REF-001',
          description: 'Test',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          initiated_at: '2024-01-01T00:00:00Z',
        });

        const order = await service.getOrder('pay_001');

        expect(order?.status).toBe(status);
      });
    }
  });

  describe('Tunisian Phone Validation', () => {
    it('should accept valid Tunisian mobile numbers', async () => {
      const validPhones = ['98123456', '29876543', '55123456', '+21698123456', '216 55 123 456'];

      for (const phone of validPhones) {
        mockEnv.DB._mocks.first.mockResolvedValueOnce({
          id: 'pay_test',
          type: 'refund',
          status: 'pending',
          amount: 50000,
          currency: 'TND',
          provider_id: 'mobile_money',
          provider_type: 'mobile_money',
          beneficiary: JSON.stringify({
            name: 'Test',
            type: 'adherent',
            entityId: 'adh_001',
            phoneNumber: phone,
            mobileMoneyProvider: 'flouci',
          }),
          reference: 'REF-001',
          description: 'Test',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          initiated_at: '2024-01-01T00:00:00Z',
        });

        const result = await service.processPayment('pay_test');
        // Valid phones should succeed (not fail with INVALID_PHONE)
        expect(result.error?.code).not.toBe('INVALID_PHONE');
      }
    });
  });

  describe('Tunisian RIB Validation', () => {
    it('should accept valid 20-digit RIB', async () => {
      mockEnv.DB._mocks.first.mockResolvedValueOnce({
        id: 'pay_test',
        type: 'provider_payment',
        status: 'pending',
        amount: 100000,
        currency: 'TND',
        provider_id: 'bank_transfer',
        provider_type: 'bank_transfer',
        beneficiary: JSON.stringify({
          name: 'Test',
          type: 'provider',
          entityId: 'prov_001',
          rib: '12345678901234567890', // Valid 20-digit RIB
        }),
        reference: 'REF-001',
        description: 'Test',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        initiated_at: '2024-01-01T00:00:00Z',
      });

      const result = await service.processPayment('pay_test');

      expect(result.success).toBe(true);
    });

    it('should reject invalid RIB formats', async () => {
      const invalidRibs = ['123', '12345678901234567890123456', 'ABCD1234567890123456'];

      for (const rib of invalidRibs) {
        mockEnv.DB._mocks.first.mockResolvedValueOnce({
          id: 'pay_test',
          type: 'provider_payment',
          status: 'pending',
          amount: 100000,
          currency: 'TND',
          provider_id: 'bank_transfer',
          provider_type: 'bank_transfer',
          beneficiary: JSON.stringify({
            name: 'Test',
            type: 'provider',
            entityId: 'prov_001',
            rib,
          }),
          reference: 'REF-001',
          description: 'Test',
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
          initiated_at: '2024-01-01T00:00:00Z',
        });

        const result = await service.processPayment('pay_test');
        expect(result.error?.code).toBe('INVALID_RIB');
      }
    });
  });
});
