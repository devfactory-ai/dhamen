/**
 * Advanced Contract Management Service
 *
 * Handles contract templates, renewals, versioning, and lifecycle management
 */

import type { Bindings } from '../types';

export interface ContractTemplate {
  id: string;
  name: string;
  description: string;
  insurerId: string;
  type: 'individual' | 'group' | 'corporate';
  category: 'basic' | 'standard' | 'premium' | 'vip';
  coverageRules: CoverageRule[];
  exclusions: string[];
  waitingPeriods: WaitingPeriod[];
  limits: CoverageLimits;
  pricing: PricingConfig;
  documents: TemplateDocument[];
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CoverageRule {
  careType: string;
  coveragePercent: number;
  maxAmount?: number;
  copay?: number;
  deductible?: number;
  requiresApproval: boolean;
  networkOnly: boolean;
}

export interface WaitingPeriod {
  careType: string;
  days: number;
  waivable: boolean;
}

export interface CoverageLimits {
  annual: number;
  perEvent: number;
  perCareType: Record<string, number>;
  lifetime?: number;
}

export interface PricingConfig {
  basePremium: number;
  currency: string;
  frequency: 'monthly' | 'quarterly' | 'annually';
  ageFactors: Array<{ minAge: number; maxAge: number; factor: number }>;
  familyDiscount: number;
  groupDiscount: number;
}

export interface TemplateDocument {
  type: 'terms' | 'coverage' | 'exclusions' | 'claim_form';
  name: string;
  url: string;
}

export interface ContractVersion {
  id: string;
  contractId: string;
  version: number;
  changes: ContractChange[];
  effectiveDate: string;
  createdBy: string;
  createdAt: string;
  data: string; // JSON snapshot
}

export interface ContractChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason?: string;
}

export interface RenewalConfig {
  id: string;
  contractId: string;
  autoRenew: boolean;
  renewalPeriodDays: number;
  notificationDays: number[];
  priceAdjustment: 'fixed' | 'indexed' | 'manual';
  indexRate?: number;
  maxIncreasePercent?: number;
  requiresApproval: boolean;
  lastNotificationSent?: string;
  nextRenewalDate: string;
}

export interface RenewalNotification {
  id: string;
  contractId: string;
  type: 'upcoming' | 'reminder' | 'final' | 'expired';
  sentAt: string;
  channel: 'email' | 'sms' | 'push';
  recipientId: string;
}

export class ContractManagementService {
  constructor(private env: Bindings) {}

  // ============== TEMPLATES ==============

  /**
   * Create a new contract template
   */
  async createTemplate(template: Omit<ContractTemplate, 'id' | 'version' | 'createdAt' | 'updatedAt'>): Promise<ContractTemplate> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const newTemplate: ContractTemplate = {
      ...template,
      id,
      version: 1,
      createdAt: now,
      updatedAt: now,
    };

    await this.env.DB.prepare(`
      INSERT INTO contract_templates (
        id, name, description, insurer_id, type, category,
        coverage_rules, exclusions, waiting_periods, limits,
        pricing, documents, is_active, version, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      template.name,
      template.description,
      template.insurerId,
      template.type,
      template.category,
      JSON.stringify(template.coverageRules),
      JSON.stringify(template.exclusions),
      JSON.stringify(template.waitingPeriods),
      JSON.stringify(template.limits),
      JSON.stringify(template.pricing),
      JSON.stringify(template.documents),
      template.isActive ? 1 : 0,
      1,
      now,
      now
    ).run();

    return newTemplate;
  }

  /**
   * Get template by ID
   */
  async getTemplate(id: string): Promise<ContractTemplate | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM contract_templates WHERE id = ?
    `).bind(id).first<Record<string, unknown>>();

    if (!result) return null;

    return this.mapTemplate(result);
  }

  /**
   * List templates
   */
  async listTemplates(options: {
    insurerId?: string;
    type?: string;
    category?: string;
    isActive?: boolean;
    page?: number;
    limit?: number;
  }): Promise<{ templates: ContractTemplate[]; total: number }> {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.insurerId) {
      conditions.push('insurer_id = ?');
      params.push(options.insurerId);
    }
    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }
    if (options.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }
    if (options.isActive !== undefined) {
      conditions.push('is_active = ?');
      params.push(options.isActive ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    const [countResult, templatesResult] = await Promise.all([
      this.env.DB.prepare(`SELECT COUNT(*) as count FROM contract_templates ${whereClause}`)
        .bind(...params)
        .first<{ count: number }>(),
      this.env.DB.prepare(`
        SELECT * FROM contract_templates
        ${whereClause}
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
      `).bind(...params, limit, offset).all<Record<string, unknown>>(),
    ]);

    return {
      templates: (templatesResult.results || []).map((t) => this.mapTemplate(t)),
      total: countResult?.count || 0,
    };
  }

  /**
   * Update template (creates new version)
   */
  async updateTemplate(
    id: string,
    updates: Partial<ContractTemplate>,
    userId: string,
    reason?: string
  ): Promise<ContractTemplate> {
    const current = await this.getTemplate(id);
    if (!current) {
      throw new Error('Template not found');
    }

    // Track changes
    const changes: ContractChange[] = [];
    for (const [key, newValue] of Object.entries(updates)) {
      const oldValue = (current as unknown as Record<string, unknown>)[key];
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.push({
          field: key,
          oldValue,
          newValue,
          reason,
        });
      }
    }

    // Create version snapshot
    await this.createVersion(id, current.version, changes, userId, current);

    // Update template
    const newVersion = current.version + 1;
    const now = new Date().toISOString();

    const updated: ContractTemplate = {
      ...current,
      ...updates,
      version: newVersion,
      updatedAt: now,
    };

    await this.env.DB.prepare(`
      UPDATE contract_templates SET
        name = ?, description = ?, type = ?, category = ?,
        coverage_rules = ?, exclusions = ?, waiting_periods = ?,
        limits = ?, pricing = ?, documents = ?, is_active = ?,
        version = ?, updated_at = ?
      WHERE id = ?
    `).bind(
      updated.name,
      updated.description,
      updated.type,
      updated.category,
      JSON.stringify(updated.coverageRules),
      JSON.stringify(updated.exclusions),
      JSON.stringify(updated.waitingPeriods),
      JSON.stringify(updated.limits),
      JSON.stringify(updated.pricing),
      JSON.stringify(updated.documents),
      updated.isActive ? 1 : 0,
      newVersion,
      now,
      id
    ).run();

    return updated;
  }

  /**
   * Clone template
   */
  async cloneTemplate(id: string, newName: string, insurerId: string): Promise<ContractTemplate> {
    const original = await this.getTemplate(id);
    if (!original) {
      throw new Error('Template not found');
    }

    return this.createTemplate({
      ...original,
      name: newName,
      insurerId,
      isActive: false,
    });
  }

  // ============== VERSIONING ==============

  /**
   * Create version snapshot
   */
  private async createVersion(
    contractId: string,
    version: number,
    changes: ContractChange[],
    userId: string,
    data: ContractTemplate
  ): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.env.DB.prepare(`
      INSERT INTO contract_versions (
        id, contract_id, version, changes, effective_date,
        created_by, created_at, data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      contractId,
      version,
      JSON.stringify(changes),
      now,
      userId,
      now,
      JSON.stringify(data)
    ).run();
  }

  /**
   * Get version history
   */
  async getVersionHistory(contractId: string): Promise<ContractVersion[]> {
    const result = await this.env.DB.prepare(`
      SELECT cv.*, u.full_name as created_by_name
      FROM contract_versions cv
      LEFT JOIN users u ON cv.created_by = u.id
      WHERE cv.contract_id = ?
      ORDER BY cv.version DESC
    `).bind(contractId).all<Record<string, unknown>>();

    return (result.results || []).map((v) => ({
      id: v.id as string,
      contractId: v.contract_id as string,
      version: v.version as number,
      changes: JSON.parse(v.changes as string),
      effectiveDate: v.effective_date as string,
      createdBy: v.created_by as string,
      createdAt: v.created_at as string,
      data: v.data as string,
    }));
  }

  /**
   * Restore to specific version
   */
  async restoreVersion(contractId: string, version: number, userId: string): Promise<ContractTemplate> {
    const versionData = await this.env.DB.prepare(`
      SELECT data FROM contract_versions
      WHERE contract_id = ? AND version = ?
    `).bind(contractId, version).first<{ data: string }>();

    if (!versionData) {
      throw new Error('Version not found');
    }

    const templateData = JSON.parse(versionData.data) as ContractTemplate;

    return this.updateTemplate(
      contractId,
      templateData,
      userId,
      `Restored to version ${version}`
    );
  }

  // ============== RENEWALS ==============

  /**
   * Configure renewal settings for a contract
   */
  async configureRenewal(config: Omit<RenewalConfig, 'id'>): Promise<RenewalConfig> {
    const id = crypto.randomUUID();

    await this.env.DB.prepare(`
      INSERT INTO contract_renewals (
        id, contract_id, auto_renew, renewal_period_days,
        notification_days, price_adjustment, index_rate,
        max_increase_percent, requires_approval, next_renewal_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(contract_id) DO UPDATE SET
        auto_renew = excluded.auto_renew,
        renewal_period_days = excluded.renewal_period_days,
        notification_days = excluded.notification_days,
        price_adjustment = excluded.price_adjustment,
        index_rate = excluded.index_rate,
        max_increase_percent = excluded.max_increase_percent,
        requires_approval = excluded.requires_approval,
        next_renewal_date = excluded.next_renewal_date
    `).bind(
      id,
      config.contractId,
      config.autoRenew ? 1 : 0,
      config.renewalPeriodDays,
      JSON.stringify(config.notificationDays),
      config.priceAdjustment,
      config.indexRate || null,
      config.maxIncreasePercent || null,
      config.requiresApproval ? 1 : 0,
      config.nextRenewalDate
    ).run();

    return { id, ...config };
  }

  /**
   * Get contracts due for renewal
   */
  async getContractsDueForRenewal(options: {
    insurerId?: string;
    daysAhead?: number;
  }): Promise<Array<{
    contractId: string;
    contractNumber: string;
    adherentName: string;
    expiryDate: string;
    daysUntilExpiry: number;
    autoRenew: boolean;
    renewalConfig: RenewalConfig | null;
  }>> {
    const daysAhead = options.daysAhead || 30;
    const insurerFilter = options.insurerId ? `AND c.insurer_id = '${options.insurerId}'` : '';

    const result = await this.env.DB.prepare(`
      SELECT
        c.id,
        c.contract_number,
        a.full_name as adherent_name,
        c.end_date,
        CAST(julianday(c.end_date) - julianday('now') AS INTEGER) as days_until_expiry,
        cr.auto_renew,
        cr.id as renewal_config_id,
        cr.renewal_period_days,
        cr.notification_days,
        cr.price_adjustment,
        cr.index_rate,
        cr.max_increase_percent,
        cr.requires_approval,
        cr.next_renewal_date
      FROM contracts c
      JOIN adherents a ON c.adherent_id = a.id
      LEFT JOIN contract_renewals cr ON c.id = cr.contract_id
      WHERE c.status = 'active'
        AND c.end_date <= date('now', '+' || ? || ' days')
        ${insurerFilter}
      ORDER BY c.end_date ASC
    `).bind(daysAhead).all<{
      id: string;
      contract_number: string;
      adherent_name: string;
      end_date: string;
      days_until_expiry: number;
      auto_renew: number | null;
      renewal_config_id: string | null;
      renewal_period_days: number | null;
      notification_days: string | null;
      price_adjustment: string | null;
      index_rate: number | null;
      max_increase_percent: number | null;
      requires_approval: number | null;
      next_renewal_date: string | null;
    }>();

    return (result.results || []).map((r) => ({
      contractId: r.id,
      contractNumber: r.contract_number,
      adherentName: r.adherent_name,
      expiryDate: r.end_date,
      daysUntilExpiry: r.days_until_expiry,
      autoRenew: r.auto_renew === 1,
      renewalConfig: r.renewal_config_id
        ? {
            id: r.renewal_config_id,
            contractId: r.id,
            autoRenew: r.auto_renew === 1,
            renewalPeriodDays: r.renewal_period_days || 365,
            notificationDays: r.notification_days ? JSON.parse(r.notification_days) : [30, 15, 7],
            priceAdjustment: (r.price_adjustment as 'fixed' | 'indexed' | 'manual') || 'fixed',
            indexRate: r.index_rate || undefined,
            maxIncreasePercent: r.max_increase_percent || undefined,
            requiresApproval: r.requires_approval === 1,
            nextRenewalDate: r.next_renewal_date || r.end_date,
          }
        : null,
    }));
  }

  /**
   * Process automatic renewals
   */
  async processAutoRenewals(): Promise<{
    renewed: number;
    failed: number;
    notifications: number;
  }> {
    let renewed = 0;
    let failed = 0;
    let notifications = 0;

    // Get contracts with auto-renew enabled expiring in next 7 days
    const dueContracts = await this.getContractsDueForRenewal({ daysAhead: 7 });
    const autoRenewContracts = dueContracts.filter((c) => c.autoRenew && !c.renewalConfig?.requiresApproval);

    for (const contract of autoRenewContracts) {
      try {
        await this.renewContract(contract.contractId);
        renewed++;
      } catch (error) {
        failed++;
        // Log error
        console.error(`Failed to renew contract ${contract.contractId}:`, error);
      }
    }

    // Send renewal notifications
    const notificationContracts = await this.getContractsNeedingNotification();
    for (const contract of notificationContracts) {
      await this.sendRenewalNotification(contract.contractId, contract.notificationType);
      notifications++;
    }

    return { renewed, failed, notifications };
  }

  /**
   * Renew a contract
   */
  async renewContract(contractId: string, options?: {
    newEndDate?: string;
    priceAdjustment?: number;
  }): Promise<{ success: boolean; newContractId?: string; error?: string }> {
    // Get current contract
    const contract = await this.env.DB.prepare(`
      SELECT * FROM contracts WHERE id = ?
    `).bind(contractId).first<Record<string, unknown>>();

    if (!contract) {
      return { success: false, error: 'Contract not found' };
    }

    // Get renewal config
    const renewalConfig = await this.env.DB.prepare(`
      SELECT * FROM contract_renewals WHERE contract_id = ?
    `).bind(contractId).first<Record<string, unknown>>();

    // Calculate new dates
    const currentEndDate = new Date(contract.end_date as string);
    const renewalDays = (renewalConfig?.renewal_period_days as number) || 365;
    const newStartDate = new Date(currentEndDate);
    newStartDate.setDate(newStartDate.getDate() + 1);
    const newEndDate = options?.newEndDate
      ? new Date(options.newEndDate)
      : new Date(newStartDate);
    if (!options?.newEndDate) {
      newEndDate.setDate(newEndDate.getDate() + renewalDays);
    }

    // Calculate new premium
    let newPremium = contract.premium as number;
    if (renewalConfig?.price_adjustment === 'indexed' && renewalConfig.index_rate) {
      const adjustment = 1 + (renewalConfig.index_rate as number) / 100;
      newPremium = Math.round(newPremium * adjustment);
    } else if (options?.priceAdjustment) {
      newPremium = Math.round(newPremium * (1 + options.priceAdjustment / 100));
    }

    // Check max increase
    if (renewalConfig?.max_increase_percent) {
      const maxIncrease = 1 + (renewalConfig.max_increase_percent as number) / 100;
      const maxPremium = Math.round((contract.premium as number) * maxIncrease);
      newPremium = Math.min(newPremium, maxPremium);
    }

    // Create new contract
    const newContractId = crypto.randomUUID();
    const now = new Date().toISOString();

    await this.env.DB.prepare(`
      INSERT INTO contracts (
        id, contract_number, adherent_id, insurer_id, template_id,
        start_date, end_date, status, premium, coverage_config,
        beneficiaries, parent_contract_id, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?
      )
    `).bind(
      newContractId,
      `${contract.contract_number}-R`,
      contract.adherent_id,
      contract.insurer_id,
      contract.template_id,
      newStartDate.toISOString().split('T')[0],
      newEndDate.toISOString().split('T')[0],
      newPremium,
      contract.coverage_config,
      contract.beneficiaries,
      contractId,
      now,
      now
    ).run();

    // Update old contract status
    await this.env.DB.prepare(`
      UPDATE contracts SET status = 'renewed', updated_at = ? WHERE id = ?
    `).bind(now, contractId).run();

    // Update renewal config for new contract
    if (renewalConfig) {
      const nextRenewalDate = new Date(newEndDate);
      await this.configureRenewal({
        contractId: newContractId,
        autoRenew: renewalConfig.auto_renew === 1,
        renewalPeriodDays: renewalConfig.renewal_period_days as number,
        notificationDays: JSON.parse(renewalConfig.notification_days as string),
        priceAdjustment: renewalConfig.price_adjustment as 'fixed' | 'indexed' | 'manual',
        indexRate: renewalConfig.index_rate as number,
        maxIncreasePercent: renewalConfig.max_increase_percent as number,
        requiresApproval: renewalConfig.requires_approval === 1,
        nextRenewalDate: nextRenewalDate.toISOString().split('T')[0] ?? '',
      });
    }

    return { success: true, newContractId };
  }

  /**
   * Get contracts needing notification
   */
  private async getContractsNeedingNotification(): Promise<Array<{
    contractId: string;
    notificationType: 'upcoming' | 'reminder' | 'final';
  }>> {
    // Get contracts with notification days configured
    const result = await this.env.DB.prepare(`
      SELECT
        c.id,
        c.end_date,
        cr.notification_days,
        cr.last_notification_sent
      FROM contracts c
      JOIN contract_renewals cr ON c.id = cr.contract_id
      WHERE c.status = 'active'
        AND c.end_date > date('now')
        AND c.end_date <= date('now', '+60 days')
    `).all<{
      id: string;
      end_date: string;
      notification_days: string;
      last_notification_sent: string | null;
    }>();

    const notifications: Array<{ contractId: string; notificationType: 'upcoming' | 'reminder' | 'final' }> = [];

    for (const contract of result.results || []) {
      const daysUntilExpiry = Math.floor(
        (new Date(contract.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      const notificationDays: number[] = JSON.parse(contract.notification_days);

      for (const days of notificationDays) {
        if (daysUntilExpiry <= days && daysUntilExpiry > days - 1) {
          const type = days >= 30 ? 'upcoming' : days >= 14 ? 'reminder' : 'final';
          notifications.push({ contractId: contract.id, notificationType: type });
        }
      }
    }

    return notifications;
  }

  /**
   * Send renewal notification
   */
  private async sendRenewalNotification(
    contractId: string,
    type: 'upcoming' | 'reminder' | 'final'
  ): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    // Record notification
    await this.env.DB.prepare(`
      INSERT INTO renewal_notifications (
        id, contract_id, type, sent_at, channel, recipient_id
      ) VALUES (?, ?, ?, ?, 'email', (
        SELECT adherent_id FROM contracts WHERE id = ?
      ))
    `).bind(id, contractId, type, now, contractId).run();

    // Update last notification sent
    await this.env.DB.prepare(`
      UPDATE contract_renewals
      SET last_notification_sent = ?
      WHERE contract_id = ?
    `).bind(now, contractId).run();

    // TODO: Actually send email/SMS via notification service
  }

  // ============== CONTRACT FROM TEMPLATE ==============

  /**
   * Create contract from template
   */
  async createContractFromTemplate(options: {
    templateId: string;
    adherentId: string;
    startDate: string;
    endDate?: string;
    beneficiaries?: Array<{ name: string; relationship: string; birthDate: string }>;
    customCoverage?: Partial<CoverageRule>[];
  }): Promise<{ contractId: string; contractNumber: string }> {
    const template = await this.getTemplate(options.templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    const contractId = crypto.randomUUID();
    const contractNumber = await this.generateContractNumber(template.insurerId);
    const now = new Date().toISOString();

    // Calculate end date if not provided
    const startDate = new Date(options.startDate);
    const endDate = options.endDate
      ? new Date(options.endDate)
      : new Date(startDate.getFullYear() + 1, startDate.getMonth(), startDate.getDate());

    // Merge custom coverage with template
    const coverageConfig = options.customCoverage
      ? this.mergeCoverage(template.coverageRules, options.customCoverage)
      : template.coverageRules;

    await this.env.DB.prepare(`
      INSERT INTO contracts (
        id, contract_number, adherent_id, insurer_id, template_id,
        start_date, end_date, status, premium, coverage_config,
        beneficiaries, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
    `).bind(
      contractId,
      contractNumber,
      options.adherentId,
      template.insurerId,
      template.id,
      options.startDate,
      endDate.toISOString().split('T')[0],
      template.pricing.basePremium,
      JSON.stringify(coverageConfig),
      JSON.stringify(options.beneficiaries || []),
      now,
      now
    ).run();

    return { contractId, contractNumber };
  }

  /**
   * Generate unique contract number
   */
  private async generateContractNumber(insurerId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = insurerId.slice(0, 3).toUpperCase();

    const result = await this.env.DB.prepare(`
      SELECT COUNT(*) as count FROM contracts
      WHERE insurer_id = ? AND contract_number LIKE ?
    `).bind(insurerId, `${prefix}-${year}-%`).first<{ count: number }>();

    const sequence = ((result?.count || 0) + 1).toString().padStart(6, '0');
    return `${prefix}-${year}-${sequence}`;
  }

  /**
   * Merge custom coverage with template
   */
  private mergeCoverage(
    templateRules: CoverageRule[],
    customRules: Partial<CoverageRule>[]
  ): CoverageRule[] {
    return templateRules.map((rule) => {
      const custom = customRules.find((c) => c.careType === rule.careType);
      return custom ? { ...rule, ...custom } : rule;
    });
  }

  // ============== HELPERS ==============

  private mapTemplate(row: Record<string, unknown>): ContractTemplate {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      insurerId: row.insurer_id as string,
      type: row.type as 'individual' | 'group' | 'corporate',
      category: row.category as 'basic' | 'standard' | 'premium' | 'vip',
      coverageRules: JSON.parse(row.coverage_rules as string),
      exclusions: JSON.parse(row.exclusions as string),
      waitingPeriods: JSON.parse(row.waiting_periods as string),
      limits: JSON.parse(row.limits as string),
      pricing: JSON.parse(row.pricing as string),
      documents: JSON.parse(row.documents as string),
      isActive: row.is_active === 1,
      version: row.version as number,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}
