/**
 * Analytics Service
 *
 * Provides advanced analytics, KPIs, and business intelligence
 * Queries sante_demandes joined through adherents -> contracts for insurer filtering
 */

import type { Bindings } from '../types';

export interface DateRange {
  start: Date;
  end: Date;
}

export interface KPIMetrics {
  // Claims KPIs
  totalClaims: number;
  claimsGrowth: number; // percentage
  approvedClaims: number;
  rejectedClaims: number;
  pendingClaims: number;
  approvalRate: number;
  avgProcessingTime: number; // hours

  // Financial KPIs
  totalAmount: number;
  approvedAmount: number;
  rejectedAmount: number;
  avgClaimAmount: number;
  monthlySpend: number;
  budgetUtilization: number;

  // Adherent KPIs
  totalAdherents: number;
  activeAdherents: number;
  adherentGrowth: number;
  avgClaimsPerAdherent: number;

  // Provider KPIs
  totalProviders: number;
  activeProviders: number;
  topProviders: { id: string; name: string; claims: number; amount: number }[];

  // Fraud KPIs
  fraudAlerts: number;
  fraudRate: number;
  avgFraudScore: number;
  highRiskClaims: number;
}

export interface TrendData {
  date: string;
  claims: number;
  amount: number;
  approved: number;
  rejected: number;
}

export interface DistributionData {
  category: string;
  count: number;
  amount: number;
  percentage: number;
}

export interface PerformanceMetrics {
  period: string;
  claims: number;
  amount: number;
  avgProcessingTime: number;
  approvalRate: number;
  fraudRate: number;
}

export interface ProviderPerformance {
  providerId: string;
  providerName: string;
  providerType: string;
  claims: number;
  totalAmount: number;
  approvedAmount: number;
  rejectedAmount: number;
  approvalRate: number;
  avgClaimAmount: number;
  avgProcessingTime: number;
  fraudScore: number;
}

export interface AdherentAnalytics {
  ageDistribution: { range: string; count: number }[];
  genderDistribution: { gender: string; count: number }[];
  regionDistribution: { region: string; count: number }[];
  claimFrequency: { frequency: string; count: number }[];
  topConditions: { condition: string; count: number }[];
}

export interface FraudAnalytics {
  totalAlerts: number;
  confirmedFraud: number;
  falsePositives: number;
  underInvestigation: number;
  fraudByType: { type: string; count: number; amount: number }[];
  fraudByProvider: { providerId: string; name: string; alerts: number }[];
  fraudTrend: { date: string; alerts: number; confirmed: number }[];
  riskDistribution: { risk: string; count: number }[];
}

export class AnalyticsService {
  constructor(private env: Bindings) {}

  /**
   * Get comprehensive KPI metrics
   */
  async getKPIs(
    insurerId?: string,
    dateRange?: DateRange
  ): Promise<KPIMetrics> {
    const now = new Date();
    const startDate = dateRange?.start || new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = dateRange?.end || now;

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const insurerFilter = insurerId
      ? `AND c.insurer_id = '${insurerId}'`
      : '';

    // Claims metrics — join through adherents to contracts
    const claimsStats = await this.env.DB.prepare(`
      SELECT
        COUNT(*) as total_claims,
        SUM(CASE WHEN sd.statut = 'approuvee' OR sd.statut = 'payee' OR sd.statut = 'en_paiement' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN sd.statut = 'rejetee' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN sd.statut IN ('soumise', 'en_examen', 'info_requise') THEN 1 ELSE 0 END) as pending,
        COALESCE(SUM(sd.montant_demande), 0) as total_amount,
        COALESCE(SUM(sd.montant_rembourse), 0) as approved_amount,
        COALESCE(SUM(CASE WHEN sd.statut = 'rejetee' THEN sd.montant_demande ELSE 0 END), 0) as rejected_amount,
        COALESCE(AVG(sd.montant_demande), 0) as avg_amount,
        COALESCE(AVG(
          CASE WHEN sd.date_traitement IS NOT NULL
          THEN (julianday(sd.date_traitement) - julianday(sd.created_at)) * 24
          ELSE NULL END
        ), 0) as avg_processing_hours
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      WHERE sd.created_at >= ? AND sd.created_at <= ? ${insurerFilter}
    `).bind(startStr, endStr).first<{
      total_claims: number;
      approved: number;
      rejected: number;
      pending: number;
      total_amount: number;
      approved_amount: number;
      rejected_amount: number;
      avg_amount: number;
      avg_processing_hours: number;
    }>();

    // Previous period for growth calculation
    const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const prevStartDate = new Date(startDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const prevStartStr = prevStartDate.toISOString().split('T')[0];

    const prevClaimsStats = await this.env.DB.prepare(`
      SELECT COUNT(*) as total_claims
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      WHERE sd.created_at >= ? AND sd.created_at < ? ${insurerFilter}
    `).bind(prevStartStr, startStr).first<{ total_claims: number }>();

    // Adherent metrics
    const adherentStats = await this.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN a.deleted_at IS NULL THEN 1 ELSE 0 END) as active
      FROM adherents a
      JOIN contracts c ON c.adherent_id = a.id
      WHERE a.deleted_at IS NULL ${insurerFilter}
    `).bind().first<{ total: number; active: number }>();

    const prevAdherentStats = await this.env.DB.prepare(`
      SELECT COUNT(*) as total
      FROM adherents a
      JOIN contracts c ON c.adherent_id = a.id
      WHERE a.deleted_at IS NULL AND a.created_at < ? ${insurerFilter}
    `).bind(startStr).first<{ total: number }>();

    // Provider metrics
    const providerStats = await this.env.DB.prepare(`
      SELECT COUNT(*) as total
      FROM providers
      WHERE deleted_at IS NULL
    `).bind().first<{ total: number }>();

    const activeProviders = await this.env.DB.prepare(`
      SELECT COUNT(DISTINCT sd.praticien_id) as active
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      WHERE sd.created_at >= ? ${insurerFilter}
    `).bind(startStr).first<{ active: number }>();

    // Top providers (praticiens)
    const { results: topProviders } = await this.env.DB.prepare(`
      SELECT
        sp.id,
        (sp.nom || ' ' || COALESCE(sp.prenom, '')) as name,
        COUNT(*) as claims,
        COALESCE(SUM(sd.montant_demande), 0) as amount
      FROM sante_demandes sd
      JOIN sante_praticiens sp ON sd.praticien_id = sp.id
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      WHERE sd.created_at >= ? AND sd.created_at <= ? ${insurerFilter}
      GROUP BY sp.id, sp.nom, sp.prenom
      ORDER BY claims DESC
      LIMIT 5
    `).bind(startStr, endStr).all<{
      id: string;
      name: string;
      claims: number;
      amount: number;
    }>();

    // Fraud metrics
    const fraudStats = await this.env.DB.prepare(`
      SELECT
        COUNT(*) as total_alerts,
        AVG(sd.score_fraude) as avg_score,
        SUM(CASE WHEN sd.score_fraude >= 70 THEN 1 ELSE 0 END) as high_risk
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      WHERE sd.score_fraude IS NOT NULL
        AND sd.created_at >= ? AND sd.created_at <= ? ${insurerFilter}
    `).bind(startStr, endStr).first<{
      total_alerts: number;
      avg_score: number;
      high_risk: number;
    }>();

    // Budget utilization — use annual_limit from contracts
    const budgetStats = await this.env.DB.prepare(`
      SELECT
        COALESCE(SUM(c.annual_limit), 0) / 12 as monthly_budget,
        COALESCE(SUM(sd.montant_rembourse), 0) as monthly_spend
      FROM contracts c
      LEFT JOIN adherents a ON c.adherent_id = a.id
      LEFT JOIN sante_demandes sd ON sd.adherent_id = a.id
        AND strftime('%Y-%m', sd.created_at) = strftime('%Y-%m', 'now')
        AND sd.statut IN ('approuvee', 'payee', 'en_paiement')
      WHERE c.status = 'active' ${insurerFilter}
    `).bind().first<{ monthly_budget: number; monthly_spend: number }>();

    const totalClaims = claimsStats?.total_claims || 0;
    const prevTotalClaims = prevClaimsStats?.total_claims || 0;
    const claimsGrowth = prevTotalClaims > 0
      ? ((totalClaims - prevTotalClaims) / prevTotalClaims) * 100
      : 0;

    const totalAdherents = adherentStats?.total || 0;
    const prevTotalAdherents = prevAdherentStats?.total || 0;
    const adherentGrowth = prevTotalAdherents > 0
      ? ((totalAdherents - prevTotalAdherents) / prevTotalAdherents) * 100
      : 0;

    const approvedClaims = claimsStats?.approved || 0;
    const rejectedClaims = claimsStats?.rejected || 0;

    return {
      totalClaims,
      claimsGrowth,
      approvedClaims,
      rejectedClaims,
      pendingClaims: claimsStats?.pending || 0,
      approvalRate: totalClaims > 0 ? (approvedClaims / totalClaims) * 100 : 0,
      avgProcessingTime: claimsStats?.avg_processing_hours || 0,

      totalAmount: claimsStats?.total_amount || 0,
      approvedAmount: claimsStats?.approved_amount || 0,
      rejectedAmount: claimsStats?.rejected_amount || 0,
      avgClaimAmount: claimsStats?.avg_amount || 0,
      monthlySpend: budgetStats?.monthly_spend || 0,
      budgetUtilization: budgetStats?.monthly_budget
        ? ((budgetStats.monthly_spend || 0) / budgetStats.monthly_budget) * 100
        : 0,

      totalAdherents,
      activeAdherents: adherentStats?.active || 0,
      adherentGrowth,
      avgClaimsPerAdherent: totalAdherents > 0 ? totalClaims / totalAdherents : 0,

      totalProviders: providerStats?.total || 0,
      activeProviders: activeProviders?.active || 0,
      topProviders: topProviders || [],

      fraudAlerts: fraudStats?.total_alerts || 0,
      fraudRate: totalClaims > 0
        ? ((fraudStats?.high_risk || 0) / totalClaims) * 100
        : 0,
      avgFraudScore: fraudStats?.avg_score || 0,
      highRiskClaims: fraudStats?.high_risk || 0,
    };
  }

  /**
   * Get claims trend over time
   */
  async getClaimsTrend(
    insurerId?: string,
    dateRange?: DateRange,
    granularity: 'day' | 'week' | 'month' = 'day'
  ): Promise<TrendData[]> {
    const now = new Date();
    const startDate = dateRange?.start || new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const endDate = dateRange?.end || now;

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const insurerFilter = insurerId
      ? `AND c.insurer_id = '${insurerId}'`
      : '';

    let dateFormat: string;
    switch (granularity) {
      case 'week':
        dateFormat = "strftime('%Y-W%W', sd.created_at)";
        break;
      case 'month':
        dateFormat = "strftime('%Y-%m', sd.created_at)";
        break;
      default:
        dateFormat = "date(sd.created_at)";
    }

    const { results } = await this.env.DB.prepare(`
      SELECT
        ${dateFormat} as date,
        COUNT(*) as claims,
        COALESCE(SUM(sd.montant_demande), 0) as amount,
        SUM(CASE WHEN sd.statut IN ('approuvee', 'payee', 'en_paiement') THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN sd.statut = 'rejetee' THEN 1 ELSE 0 END) as rejected
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      WHERE sd.created_at >= ? AND sd.created_at <= ? ${insurerFilter}
      GROUP BY ${dateFormat}
      ORDER BY date ASC
    `).bind(startStr, endStr).all<TrendData>();

    return results || [];
  }

  /**
   * Get claims distribution by category
   */
  async getClaimsDistribution(
    insurerId?: string,
    dateRange?: DateRange,
    groupBy: 'care_type' | 'status' | 'provider_type' = 'care_type'
  ): Promise<DistributionData[]> {
    const now = new Date();
    const startDate = dateRange?.start || new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = dateRange?.end || now;

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const insurerFilter = insurerId
      ? `AND c.insurer_id = '${insurerId}'`
      : '';

    let groupColumn: string;
    let joinClause = '';

    switch (groupBy) {
      case 'status':
        groupColumn = 'sd.statut';
        break;
      case 'provider_type':
        groupColumn = 'sp.type_praticien';
        joinClause = 'JOIN sante_praticiens sp ON sd.praticien_id = sp.id';
        break;
      default:
        groupColumn = 'sd.type_soin';
    }

    const { results } = await this.env.DB.prepare(`
      SELECT
        ${groupColumn} as category,
        COUNT(*) as count,
        COALESCE(SUM(sd.montant_demande), 0) as amount
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      ${joinClause}
      WHERE sd.created_at >= ? AND sd.created_at <= ? ${insurerFilter}
      GROUP BY ${groupColumn}
      ORDER BY count DESC
    `).bind(startStr, endStr).all<{
      category: string;
      count: number;
      amount: number;
    }>();

    const total = results?.reduce((sum, r) => sum + r.count, 0) || 1;

    return (results || []).map(r => ({
      ...r,
      percentage: (r.count / total) * 100,
    }));
  }

  /**
   * Get monthly performance metrics
   */
  async getMonthlyPerformance(
    insurerId?: string,
    months: number = 12
  ): Promise<PerformanceMetrics[]> {
    const insurerFilter = insurerId
      ? `AND c.insurer_id = '${insurerId}'`
      : '';

    const { results } = await this.env.DB.prepare(`
      SELECT
        strftime('%Y-%m', sd.created_at) as period,
        COUNT(*) as claims,
        COALESCE(SUM(sd.montant_demande), 0) as amount,
        COALESCE(AVG(
          CASE WHEN sd.date_traitement IS NOT NULL
          THEN (julianday(sd.date_traitement) - julianday(sd.created_at)) * 24
          ELSE NULL END
        ), 0) as avg_processing_time,
        CAST(SUM(CASE WHEN sd.statut IN ('approuvee', 'payee', 'en_paiement') THEN 1 ELSE 0 END) AS REAL) /
          CAST(COUNT(*) AS REAL) * 100 as approval_rate,
        CAST(SUM(CASE WHEN sd.score_fraude >= 70 THEN 1 ELSE 0 END) AS REAL) /
          CAST(COUNT(*) AS REAL) * 100 as fraud_rate
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      WHERE sd.created_at >= date('now', '-' || ? || ' months') ${insurerFilter}
      GROUP BY strftime('%Y-%m', sd.created_at)
      ORDER BY period DESC
      LIMIT ?
    `).bind(months, months).all<{
      period: string;
      claims: number;
      amount: number;
      avg_processing_time: number;
      approval_rate: number;
      fraud_rate: number;
    }>();

    return (results || []).map(r => ({
      period: r.period,
      claims: r.claims,
      amount: r.amount,
      avgProcessingTime: r.avg_processing_time,
      approvalRate: r.approval_rate,
      fraudRate: r.fraud_rate,
    }));
  }

  /**
   * Get provider performance analytics
   */
  async getProviderPerformance(
    insurerId?: string,
    dateRange?: DateRange,
    limit: number = 20
  ): Promise<ProviderPerformance[]> {
    const now = new Date();
    const startDate = dateRange?.start || new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = dateRange?.end || now;

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const insurerFilter = insurerId
      ? `AND c.insurer_id = '${insurerId}'`
      : '';

    const { results } = await this.env.DB.prepare(`
      SELECT
        sp.id as provider_id,
        (sp.nom || ' ' || COALESCE(sp.prenom, '')) as provider_name,
        sp.type_praticien as provider_type,
        COUNT(*) as claims,
        COALESCE(SUM(sd.montant_demande), 0) as total_amount,
        COALESCE(SUM(sd.montant_rembourse), 0) as approved_amount,
        COALESCE(SUM(CASE WHEN sd.statut = 'rejetee' THEN sd.montant_demande ELSE 0 END), 0) as rejected_amount,
        CAST(SUM(CASE WHEN sd.statut IN ('approuvee', 'payee', 'en_paiement') THEN 1 ELSE 0 END) AS REAL) /
          CAST(COUNT(*) AS REAL) * 100 as approval_rate,
        COALESCE(AVG(sd.montant_demande), 0) as avg_claim_amount,
        COALESCE(AVG(
          CASE WHEN sd.date_traitement IS NOT NULL
          THEN (julianday(sd.date_traitement) - julianday(sd.created_at)) * 24
          ELSE NULL END
        ), 0) as avg_processing_time,
        COALESCE(AVG(sd.score_fraude), 0) as fraud_score
      FROM sante_demandes sd
      JOIN sante_praticiens sp ON sd.praticien_id = sp.id
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      WHERE sd.created_at >= ? AND sd.created_at <= ? ${insurerFilter}
      GROUP BY sp.id, sp.nom, sp.prenom, sp.type_praticien
      ORDER BY claims DESC
      LIMIT ?
    `).bind(startStr, endStr, limit).all<{
      provider_id: string;
      provider_name: string;
      provider_type: string;
      claims: number;
      total_amount: number;
      approved_amount: number;
      rejected_amount: number;
      approval_rate: number;
      avg_claim_amount: number;
      avg_processing_time: number;
      fraud_score: number;
    }>();

    return (results || []).map(r => ({
      providerId: r.provider_id,
      providerName: r.provider_name,
      providerType: r.provider_type,
      claims: r.claims,
      totalAmount: r.total_amount,
      approvedAmount: r.approved_amount,
      rejectedAmount: r.rejected_amount,
      approvalRate: r.approval_rate,
      avgClaimAmount: r.avg_claim_amount,
      avgProcessingTime: r.avg_processing_time,
      fraudScore: r.fraud_score,
    }));
  }

  /**
   * Get adherent demographics analytics
   */
  async getAdherentAnalytics(insurerId?: string): Promise<AdherentAnalytics> {
    const insurerFilter = insurerId
      ? `AND c.insurer_id = '${insurerId}'`
      : '';

    // Age distribution
    const { results: ageResults } = await this.env.DB.prepare(`
      SELECT
        CASE
          WHEN (strftime('%Y', 'now') - strftime('%Y', date_of_birth)) < 18 THEN '0-17'
          WHEN (strftime('%Y', 'now') - strftime('%Y', date_of_birth)) < 30 THEN '18-29'
          WHEN (strftime('%Y', 'now') - strftime('%Y', date_of_birth)) < 45 THEN '30-44'
          WHEN (strftime('%Y', 'now') - strftime('%Y', date_of_birth)) < 60 THEN '45-59'
          ELSE '60+'
        END as range,
        COUNT(*) as count
      FROM adherents a
      JOIN contracts c ON c.adherent_id = a.id
      WHERE a.deleted_at IS NULL AND a.date_of_birth IS NOT NULL ${insurerFilter}
      GROUP BY range
      ORDER BY range
    `).bind().all<{ range: string; count: number }>();

    // Gender distribution
    const { results: genderResults } = await this.env.DB.prepare(`
      SELECT
        gender as gender,
        COUNT(*) as count
      FROM adherents a
      JOIN contracts c ON c.adherent_id = a.id
      WHERE a.deleted_at IS NULL AND a.gender IS NOT NULL ${insurerFilter}
      GROUP BY gender
    `).bind().all<{ gender: string; count: number }>();

    // Region distribution (based on governorate/ville)
    const { results: regionResults } = await this.env.DB.prepare(`
      SELECT
        COALESCE(a.city, 'Non spécifié') as region,
        COUNT(*) as count
      FROM adherents a
      JOIN contracts c ON c.adherent_id = a.id
      WHERE a.deleted_at IS NULL ${insurerFilter}
      GROUP BY a.city
      ORDER BY count DESC
      LIMIT 10
    `).bind().all<{ region: string; count: number }>();

    // Claim frequency distribution
    const { results: frequencyResults } = await this.env.DB.prepare(`
      SELECT
        CASE
          WHEN claim_count = 0 THEN 'Aucune'
          WHEN claim_count <= 2 THEN '1-2'
          WHEN claim_count <= 5 THEN '3-5'
          WHEN claim_count <= 10 THEN '6-10'
          ELSE '10+'
        END as frequency,
        COUNT(*) as count
      FROM (
        SELECT a.id, COUNT(sd.id) as claim_count
        FROM adherents a
        JOIN contracts c ON c.adherent_id = a.id
        LEFT JOIN sante_demandes sd ON sd.adherent_id = a.id
          AND sd.created_at >= date('now', '-12 months')
        WHERE a.deleted_at IS NULL ${insurerFilter}
        GROUP BY a.id
      )
      GROUP BY frequency
      ORDER BY
        CASE frequency
          WHEN 'Aucune' THEN 1
          WHEN '1-2' THEN 2
          WHEN '3-5' THEN 3
          WHEN '6-10' THEN 4
          ELSE 5
        END
    `).bind().all<{ frequency: string; count: number }>();

    // Top conditions
    const { results: conditionResults } = await this.env.DB.prepare(`
      SELECT
        COALESCE(sd.type_soin, 'Autre') as condition,
        COUNT(*) as count
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      WHERE sd.created_at >= date('now', '-12 months') ${insurerFilter}
      GROUP BY sd.type_soin
      ORDER BY count DESC
      LIMIT 10
    `).bind().all<{ condition: string; count: number }>();

    return {
      ageDistribution: ageResults || [],
      genderDistribution: genderResults || [],
      regionDistribution: regionResults || [],
      claimFrequency: frequencyResults || [],
      topConditions: conditionResults || [],
    };
  }

  /**
   * Get fraud analytics
   */
  async getFraudAnalytics(
    insurerId?: string,
    dateRange?: DateRange
  ): Promise<FraudAnalytics> {
    const now = new Date();
    const startDate = dateRange?.start || new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = dateRange?.end || now;

    const startStr = startDate.toISOString().split('T')[0];
    const endStr = endDate.toISOString().split('T')[0];

    const insurerFilter = insurerId
      ? `AND c.insurer_id = '${insurerId}'`
      : '';

    // Overall fraud stats
    const fraudStats = await this.env.DB.prepare(`
      SELECT
        COUNT(*) as total_alerts,
        SUM(CASE WHEN sd.statut = 'rejetee' AND sd.score_fraude >= 70 THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN sd.statut = 'approuvee' AND sd.score_fraude >= 50 THEN 1 ELSE 0 END) as false_positives,
        SUM(CASE WHEN sd.statut IN ('en_examen', 'soumise') AND sd.score_fraude >= 50 THEN 1 ELSE 0 END) as investigating
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      WHERE sd.score_fraude >= 50
        AND sd.created_at >= ? AND sd.created_at <= ? ${insurerFilter}
    `).bind(startStr, endStr).first<{
      total_alerts: number;
      confirmed: number;
      false_positives: number;
      investigating: number;
    }>();

    // Fraud by type
    const { results: fraudByType } = await this.env.DB.prepare(`
      SELECT
        sd.type_soin as type,
        COUNT(*) as count,
        COALESCE(SUM(sd.montant_demande), 0) as amount
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      WHERE sd.score_fraude >= 70
        AND sd.created_at >= ? AND sd.created_at <= ? ${insurerFilter}
      GROUP BY sd.type_soin
      ORDER BY count DESC
    `).bind(startStr, endStr).all<{
      type: string;
      count: number;
      amount: number;
    }>();

    // Fraud by provider (praticien)
    const { results: fraudByProvider } = await this.env.DB.prepare(`
      SELECT
        sp.id as provider_id,
        (sp.nom || ' ' || COALESCE(sp.prenom, '')) as name,
        COUNT(*) as alerts
      FROM sante_demandes sd
      JOIN sante_praticiens sp ON sd.praticien_id = sp.id
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      WHERE sd.score_fraude >= 70
        AND sd.created_at >= ? AND sd.created_at <= ? ${insurerFilter}
      GROUP BY sp.id, sp.nom, sp.prenom
      ORDER BY alerts DESC
      LIMIT 10
    `).bind(startStr, endStr).all<{
      provider_id: string;
      name: string;
      alerts: number;
    }>();

    // Fraud trend
    const { results: fraudTrend } = await this.env.DB.prepare(`
      SELECT
        date(sd.created_at) as date,
        COUNT(*) as alerts,
        SUM(CASE WHEN sd.statut = 'rejetee' THEN 1 ELSE 0 END) as confirmed
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      WHERE sd.score_fraude >= 50
        AND sd.created_at >= ? AND sd.created_at <= ? ${insurerFilter}
      GROUP BY date(sd.created_at)
      ORDER BY date ASC
    `).bind(startStr, endStr).all<{
      date: string;
      alerts: number;
      confirmed: number;
    }>();

    // Risk distribution
    const { results: riskDistribution } = await this.env.DB.prepare(`
      SELECT
        CASE
          WHEN sd.score_fraude < 30 THEN 'Faible'
          WHEN sd.score_fraude < 50 THEN 'Moyen'
          WHEN sd.score_fraude < 70 THEN 'Élevé'
          ELSE 'Très élevé'
        END as risk,
        COUNT(*) as count
      FROM sante_demandes sd
      JOIN adherents a ON sd.adherent_id = a.id
      JOIN contracts c ON c.adherent_id = a.id
      WHERE sd.score_fraude IS NOT NULL
        AND sd.created_at >= ? AND sd.created_at <= ? ${insurerFilter}
      GROUP BY risk
      ORDER BY
        CASE risk
          WHEN 'Faible' THEN 1
          WHEN 'Moyen' THEN 2
          WHEN 'Élevé' THEN 3
          ELSE 4
        END
    `).bind(startStr, endStr).all<{ risk: string; count: number }>();

    return {
      totalAlerts: fraudStats?.total_alerts || 0,
      confirmedFraud: fraudStats?.confirmed || 0,
      falsePositives: fraudStats?.false_positives || 0,
      underInvestigation: fraudStats?.investigating || 0,
      fraudByType: fraudByType || [],
      fraudByProvider: (fraudByProvider || []).map(p => ({
        providerId: p.provider_id,
        name: p.name,
        alerts: p.alerts,
      })),
      fraudTrend: fraudTrend || [],
      riskDistribution: riskDistribution || [],
    };
  }

  /**
   * Get comparative analytics between periods
   */
  async getComparativeAnalytics(
    currentPeriod: DateRange,
    previousPeriod: DateRange,
    insurerId?: string
  ): Promise<{
    current: KPIMetrics;
    previous: KPIMetrics;
    changes: Record<string, number>;
  }> {
    const current = await this.getKPIs(insurerId, currentPeriod);
    const previous = await this.getKPIs(insurerId, previousPeriod);

    const calculateChange = (curr: number, prev: number): number => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / prev) * 100;
    };

    return {
      current,
      previous,
      changes: {
        totalClaims: calculateChange(current.totalClaims, previous.totalClaims),
        totalAmount: calculateChange(current.totalAmount, previous.totalAmount),
        approvalRate: calculateChange(current.approvalRate, previous.approvalRate),
        avgProcessingTime: calculateChange(current.avgProcessingTime, previous.avgProcessingTime),
        activeAdherents: calculateChange(current.activeAdherents, previous.activeAdherents),
        fraudRate: calculateChange(current.fraudRate, previous.fraudRate),
      },
    };
  }

  /**
   * Export analytics data
   */
  async exportAnalytics(
    type: 'kpis' | 'trends' | 'providers' | 'adherents' | 'fraud',
    insurerId?: string,
    dateRange?: DateRange,
    format: 'json' | 'csv' = 'json'
  ): Promise<{ data: string; contentType: string; filename: string }> {
    let data: unknown;
    let filename: string;

    switch (type) {
      case 'kpis':
        data = await this.getKPIs(insurerId, dateRange);
        filename = 'kpis';
        break;
      case 'trends':
        data = await this.getClaimsTrend(insurerId, dateRange);
        filename = 'trends';
        break;
      case 'providers':
        data = await this.getProviderPerformance(insurerId, dateRange);
        filename = 'provider-performance';
        break;
      case 'adherents':
        data = await this.getAdherentAnalytics(insurerId);
        filename = 'adherent-analytics';
        break;
      case 'fraud':
        data = await this.getFraudAnalytics(insurerId, dateRange);
        filename = 'fraud-analytics';
        break;
    }

    const dateStr = new Date().toISOString().split('T')[0];
    filename = `${filename}-${dateStr}`;

    if (format === 'csv') {
      return {
        data: this.convertToCSV(data),
        contentType: 'text/csv',
        filename: `${filename}.csv`,
      };
    }

    return {
      data: JSON.stringify(data, null, 2),
      contentType: 'application/json',
      filename: `${filename}.json`,
    };
  }

  private convertToCSV(data: unknown): string {
    if (Array.isArray(data)) {
      if (data.length === 0) return '';
      const headers = Object.keys(data[0]);
      const rows = data.map(item =>
        headers.map(h => JSON.stringify((item as Record<string, unknown>)[h] ?? '')).join(',')
      );
      return [headers.join(','), ...rows].join('\n');
    }

    // For objects, flatten to key-value pairs
    const entries = Object.entries(data as Record<string, unknown>);
    return entries.map(([key, value]) => `${key},${JSON.stringify(value)}`).join('\n');
  }
}
