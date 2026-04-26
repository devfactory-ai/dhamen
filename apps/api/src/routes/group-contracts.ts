/**
 * Group Contracts Routes
 *
 * CRUD + OCR analysis for group insurance contracts (contrat d'assurance groupe).
 * Models real Tunisian group contracts with 18 guarantee categories.
 *
 * Gemini model configurable via env var GEMINI_MODEL:
 *   - "gemini-2.5-flash" (default) — fast, cheap, good for most contracts
 *   - "gemini-2.5-pro"            — slower, expensive, best accuracy
 * Set in wrangler.toml: [vars] GEMINI_MODEL = "gemini-2.5-pro"
 * Or in .dev.vars: GEMINI_MODEL=gemini-2.5-pro
 */
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import pako from "pako";
import { z } from "zod";
import { getDb } from "../lib/db";
import {
  conflict, created, notFound, paginated, success, validationError,
  error as errorResponse,
} from "../lib/response";
import { generateId } from "../lib/ulid";
import { logAudit } from "../middleware/audit-trail";
import { authMiddleware, requireRole } from "../middleware/auth";
import type { Bindings, Variables } from "../types";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------
const CARE_TYPES = [
  "consultation","consultation_visite","pharmacy","pharmacie",
  "laboratory","laboratoire","optical","optique",
  "refractive_surgery","chirurgie_refractive","medical_acts","actes_courants","actes_specialistes",
  "transport","surgery","chirurgie","orthopedics","orthopedie",
  "hospitalization","hospitalisation","maternity","accouchement",
  "ivg","interruption_grossesse","dental","dentaire",
  "orthodontics","orthodontie","circumcision","circoncision",
  "sanatorium","thermal_cure","cures_thermales","funeral","frais_funeraires",
] as const;

const PLAN_CATEGORIES = ["basic","standard","premium","vip"] as const;
const CONTRACT_STATUSES = ["draft","active","suspended","expired","cancelled"] as const;
const CONTRACT_TYPES = ["group","individual"] as const;

const groupContractCreateSchema = z.object({
  contractType: z.enum(CONTRACT_TYPES).default("group"),
  contractNumber: z.string().min(1, "Numéro de contrat requis"),
  companyId: z.string().optional(),
  adherentId: z.string().optional(),
  insurerId: z.string().min(1, "Assureur requis"),
  companyAddress: z.string().optional(),
  matriculeFiscale: z.string().optional(),
  intermediaryName: z.string().optional(),
  intermediaryCode: z.string().optional(),
  effectiveDate: z.string().min(1, "Date d'effet requise"),
  annualRenewalDate: z.string().optional(),
  endDate: z.string().optional(),
  riskIllness: z.boolean().default(true),
  riskDisability: z.boolean().default(false),
  riskDeath: z.boolean().default(false),
  annualGlobalLimit: z.number().optional(),
  carenceDays: z.number().int().default(0),
  coversSpouse: z.boolean().default(true),
  coversChildren: z.boolean().default(true),
  childrenMaxAge: z.number().int().default(20),
  childrenStudentMaxAge: z.number().int().default(28),
  coversDisabledChildren: z.boolean().default(true),
  coversRetirees: z.boolean().default(false),
  documentUrl: z.string().optional(),
  documentId: z.string().optional(),
  planCategory: z.enum(PLAN_CATEGORIES).default("standard"),
  status: z.enum(CONTRACT_STATUSES).default("draft"),
  notes: z.string().optional(),
  guarantees: z.array(z.preprocess((raw) => {
    // Accept both camelCase (API convention) and snake_case (frontend GarantiesContratPage)
    const r = raw as Record<string, unknown>;
    return {
      guaranteeNumber: r.guaranteeNumber ?? r.guarantee_number ?? r.sort_order ?? 1,
      careType: r.careType ?? r.care_type,
      label: r.label ?? '',
      reimbursementRate: r.reimbursementRate ?? r.reimbursement_rate,
      isFixedAmount: r.isFixedAmount ?? r.is_fixed_amount ?? false,
      annualLimit: r.annualLimit ?? r.annual_limit,
      perEventLimit: r.perEventLimit ?? r.per_event_limit,
      dailyLimit: r.dailyLimit ?? r.daily_limit,
      maxDays: r.maxDays ?? r.max_days,
      letterKeysJson: r.letterKeysJson ?? r.letter_keys_json ?? (r.letter_keys ? JSON.stringify(r.letter_keys) : undefined),
      subLimitsJson: r.subLimitsJson ?? r.sub_limits_json ?? (r.sub_limits ? JSON.stringify(r.sub_limits) : undefined),
      conditionsText: r.conditionsText ?? r.conditions_text ?? r.conditions,
      requiresPrescription: r.requiresPrescription ?? r.requires_prescription ?? false,
      requiresCnamComplement: r.requiresCnamComplement ?? r.requires_cnam_complement ?? false,
      renewalPeriodMonths: r.renewalPeriodMonths ?? r.renewal_period_months ?? r.renewal_period,
      ageLimit: r.ageLimit ?? r.age_limit,
      waitingPeriodDays: r.waitingPeriodDays ?? r.waiting_period_days ?? 0,
      exclusionsText: r.exclusionsText ?? r.exclusions_text,
    };
  }, z.object({
    guaranteeNumber: z.number().int().min(1).max(18),
    careType: z.enum(CARE_TYPES),
    label: z.string().min(1),
    reimbursementRate: z.number().min(0).max(1).optional(),
    isFixedAmount: z.boolean().default(false),
    annualLimit: z.number().optional(),
    perEventLimit: z.number().optional(),
    dailyLimit: z.number().optional(),
    maxDays: z.number().int().optional(),
    letterKeysJson: z.string().optional(),
    subLimitsJson: z.string().optional(),
    conditionsText: z.string().optional(),
    requiresPrescription: z.boolean().default(false),
    requiresCnamComplement: z.boolean().default(false),
    renewalPeriodMonths: z.number().int().optional(),
    ageLimit: z.number().int().optional(),
    waitingPeriodDays: z.number().int().default(0),
    exclusionsText: z.string().optional(),
  }))).optional(),
});

// For updates, use passthrough so unknown fields (like snake_case guarantees) are not stripped
const groupContractUpdateSchema = groupContractCreateSchema.partial().passthrough();

const groupContractFiltersSchema = z.object({
  companyId: z.string().optional(),
  insurerId: z.string().optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  planCategory: z.enum(PLAN_CATEGORIES).optional(),
  contractType: z.enum([...CONTRACT_TYPES, "all"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(20),
});

// ---------------------------------------------------------------------------
// Gemini config — override via env GEMINI_MODEL
// ---------------------------------------------------------------------------
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const groupContracts = new Hono<{ Bindings: Bindings; Variables: Variables }>();
groupContracts.use("*", authMiddleware());

// ---------------------------------------------------------------------------
// GET / — List
// ---------------------------------------------------------------------------
groupContracts.get("/", requireRole("ADMIN","INSURER_ADMIN","INSURER_AGENT","HR"), zValidator("query", groupContractFiltersSchema), async (c) => {
  const { companyId, insurerId, status, planCategory, contractType, page, limit } = c.req.valid("query");
  const user = c.get("user");
  const db = getDb(c);
  if (user.role === "HR" && !user.companyId) return c.json({ success: false, error: { code: "NO_COMPANY", message: "Votre compte n'est associé à aucune entreprise" }}, 403);
  let effectiveInsurerId = insurerId;
  if (user?.insurerId && (user.role === "INSURER_ADMIN" || user.role === "INSURER_AGENT")) effectiveInsurerId = user.insurerId;
  const conditions: string[] = ["gc.deleted_at IS NULL"];
  const params: unknown[] = [];
  if (effectiveInsurerId) { conditions.push("gc.insurer_id = ?"); params.push(effectiveInsurerId); }
  if (user.role === "HR") { conditions.push("gc.company_id = ?"); params.push(user.companyId); }
  else if (companyId) { conditions.push("gc.company_id = ?"); params.push(companyId); }
  if (status) { conditions.push("gc.status = ?"); params.push(status); }
  if (planCategory) { conditions.push("gc.plan_category = ?"); params.push(planCategory); }
  if (contractType && contractType !== "all") { conditions.push("gc.contract_type = ?"); params.push(contractType); }
  conditions.push("gc.company_id != '__INDIVIDUAL__' OR gc.contract_type = 'individual'");
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const countResult = await db.prepare(`SELECT COUNT(*) as total FROM group_contracts gc ${whereClause}`).bind(...params).first<{ total: number }>();
  const total = countResult?.total ?? 0;
  const offset = (page - 1) * limit;
  const rows = await db.prepare(`SELECT gc.*, CASE WHEN gc.contract_type = 'individual' THEN (a.first_name || ' ' || a.last_name) ELSE co.name END as company_name, ins.name as insurer_name FROM group_contracts gc LEFT JOIN companies co ON gc.company_id = co.id LEFT JOIN adherents a ON gc.adherent_id = a.id LEFT JOIN insurers ins ON gc.insurer_id = ins.id ${whereClause} ORDER BY gc.created_at DESC LIMIT ? OFFSET ?`).bind(...params, limit, offset).all();
  return paginated(c, rows.results ?? [], { page, limit, total });
});

// ---------------------------------------------------------------------------
// GET /:id — Detail
// ---------------------------------------------------------------------------
groupContracts.get("/:id", requireRole("ADMIN","INSURER_ADMIN","INSURER_AGENT","HR"), async (c) => {
  const id = c.req.param("id"); const user = c.get("user"); const db = getDb(c);
  const contract = await db.prepare(`SELECT gc.*, CASE WHEN gc.contract_type = 'individual' THEN (a.first_name || ' ' || a.last_name) ELSE co.name END as company_name, a.first_name as adherent_first_name, a.last_name as adherent_last_name, a.matricule as adherent_matricule, ins.name as insurer_name FROM group_contracts gc LEFT JOIN companies co ON gc.company_id = co.id LEFT JOIN adherents a ON gc.adherent_id = a.id LEFT JOIN insurers ins ON gc.insurer_id = ins.id WHERE gc.id = ? AND gc.deleted_at IS NULL`).bind(id).first();
  if (!contract) return notFound(c, "Contrat non trouvé");
  if (user?.insurerId && (user.role === "INSURER_ADMIN" || user.role === "INSURER_AGENT") && contract.insurer_id !== user.insurerId) return notFound(c, "Contrat groupe non trouvé");
  if (user.role === "HR" && contract.company_id !== user.companyId) return notFound(c, "Contrat non trouvé");
  const guarantees = await db.prepare(`SELECT * FROM contract_guarantees WHERE group_contract_id = ? AND is_active = 1 ORDER BY guarantee_number ASC`).bind(id).all();

  // Build covered_risks array from boolean columns
  const coveredRisks: string[] = [];
  if (contract.risk_illness) coveredRisks.push('Maladie');
  if (contract.risk_disability) coveredRisks.push('Invalidité');
  if (contract.risk_death) coveredRisks.push('Décès');

  // Map guarantees: keep raw DB fields + add detail-page aliases
  const mappedGuarantees = (guarantees.results ?? []).map((g: Record<string, unknown>) => ({
    ...g,
    // Aliases for detail page
    rate: g.reimbursement_rate,
    annual_ceiling: g.annual_limit,
    per_act_ceiling: g.per_event_limit,
    per_day_ceiling: g.daily_limit,
    max_days: g.max_days,
    letter_keys: g.letter_keys_json ? (typeof g.letter_keys_json === 'string' ? JSON.parse(g.letter_keys_json) : g.letter_keys_json) : null,
    sub_limits: g.sub_limits_json ? (typeof g.sub_limits_json === 'string' ? JSON.parse(g.sub_limits_json) : g.sub_limits_json) : null,
    conditions: g.conditions_text,
    renewal_period: g.renewal_period_months,
    sort_order: g.guarantee_number ?? 0,
  }));

  return success(c, {
    ...contract,
    // Aliases for detail page
    expiry_date: contract.annual_renewal_date || contract.end_date || null,
    global_ceiling: contract.annual_global_limit,
    intermediary: contract.intermediary_name,
    category: contract.plan_category,
    covered_risks: JSON.stringify(coveredRisks),
    guarantees: mappedGuarantees,
  });
});

// ---------------------------------------------------------------------------
// POST / — Create
// ---------------------------------------------------------------------------
groupContracts.post("/", requireRole("ADMIN","INSURER_ADMIN","INSURER_AGENT"), zValidator("json", groupContractCreateSchema), async (c) => {
  const data = c.req.valid("json"); const user = c.get("user"); const db = getDb(c);
  let effectiveInsurerId = data.insurerId;
  if (user?.insurerId && user.role === "INSURER_ADMIN") effectiveInsurerId = user.insurerId;
  const isIndividual = data.contractType === "individual";
  if (!isIndividual && !data.companyId) return validationError(c, [{ path: "companyId", message: "Entreprise requise pour un contrat groupe" }]);
  if (isIndividual && !data.adherentId) return validationError(c, [{ path: "adherentId", message: "Adhérent requis pour un contrat individuel" }]);
  const existing = await db.prepare("SELECT id FROM group_contracts WHERE contract_number = ? AND deleted_at IS NULL").bind(data.contractNumber).first();
  if (existing) return errorResponse(c, "DUPLICATE_CONTRACT", "Un contrat avec ce numéro existe déjà", 409);
  const contractId = generateId(); const now = new Date().toISOString();
  const effectiveCompanyId = isIndividual ? "__INDIVIDUAL__" : data.companyId;
  await db.prepare(`INSERT INTO group_contracts (id, contract_number, company_id, insurer_id, contract_type, adherent_id, company_address, matricule_fiscale, intermediary_name, intermediary_code, effective_date, annual_renewal_date, end_date, risk_illness, risk_disability, risk_death, annual_global_limit, carence_days, covers_spouse, covers_children, children_max_age, children_student_max_age, covers_disabled_children, covers_retirees, document_url, document_id, plan_category, status, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(contractId, data.contractNumber, effectiveCompanyId, effectiveInsurerId, data.contractType, data.adherentId ?? null, data.companyAddress ?? null, data.matriculeFiscale ?? null, data.intermediaryName ?? null, data.intermediaryCode ?? null, data.effectiveDate, data.annualRenewalDate ?? null, data.endDate ?? null, data.riskIllness ? 1 : 0, data.riskDisability ? 1 : 0, data.riskDeath ? 1 : 0, data.annualGlobalLimit ?? null, data.carenceDays, data.coversSpouse ? 1 : 0, data.coversChildren ? 1 : 0, data.childrenMaxAge, data.childrenStudentMaxAge, data.coversDisabledChildren ? 1 : 0, data.coversRetirees ? 1 : 0, data.documentUrl ?? null, data.documentId ?? null, data.planCategory, data.status, data.notes ?? null, now, now).run();
  if (data.guarantees && data.guarantees.length > 0) {
    for (const g of data.guarantees) {
      const gid = generateId();
      await db.prepare(`INSERT INTO contract_guarantees (id, group_contract_id, guarantee_number, care_type, label, reimbursement_rate, is_fixed_amount, annual_limit, per_event_limit, daily_limit, max_days, letter_keys_json, sub_limits_json, conditions_text, requires_prescription, requires_cnam_complement, renewal_period_months, age_limit, waiting_period_days, exclusions_text, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(gid, contractId, g.guaranteeNumber, g.careType, g.label, g.reimbursementRate ?? null, g.isFixedAmount ? 1 : 0, g.annualLimit ?? null, g.perEventLimit ?? null, g.dailyLimit ?? null, g.maxDays ?? null, g.letterKeysJson ?? null, g.subLimitsJson ?? null, g.conditionsText ?? null, g.requiresPrescription ? 1 : 0, g.requiresCnamComplement ? 1 : 0, g.renewalPeriodMonths ?? null, g.ageLimit ?? null, g.waitingPeriodDays, g.exclusionsText ?? null, now, now).run();
    }
  }
  let individualContractId: string | null = null;
  if (isIndividual && data.adherentId) {
    individualContractId = generateId();
    const coverageMap: Record<string, unknown> = {};
    if (data.guarantees) { for (const g of data.guarantees) { coverageMap[g.careType] = { enabled: true, reimbursementRate: g.reimbursementRate ? Number(g.reimbursementRate) * 100 : null, annualLimit: g.annualLimit ?? null, perEventLimit: g.perEventLimit ?? null }; } }
    const endDate = data.endDate ?? data.annualRenewalDate ?? new Date(new Date(data.effectiveDate).getTime() + 365*24*60*60*1000).toISOString().split("T")[0];
    await db.prepare(`INSERT INTO contracts (id, contract_number, adherent_id, insurer_id, plan_type, status, coverage_json, start_date, end_date, group_contract_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`).bind(individualContractId, `${data.contractNumber}-IND`, data.adherentId, effectiveInsurerId, data.planCategory ?? "individual", JSON.stringify(coverageMap), data.effectiveDate, endDate, contractId, now, now).run();
  }
  await logAudit(getDb(c), { userId: user?.sub, action: "group_contract.create", entityType: "group_contract", entityId: contractId, changes: { contractNumber: data.contractNumber, companyId: data.companyId, insurerId: effectiveInsurerId, guaranteesCount: data.guarantees?.length ?? 0, contractType: data.contractType, individualContractCreated: !!individualContractId }, ipAddress: c.req.header("CF-Connecting-IP"), userAgent: c.req.header("User-Agent") });
  const result = await db.prepare("SELECT * FROM group_contracts WHERE id = ?").bind(contractId).first();
  const guarantees = await db.prepare("SELECT * FROM contract_guarantees WHERE group_contract_id = ? ORDER BY guarantee_number").bind(contractId).all();
  return created(c, { ...result, guarantees: guarantees.results ?? [], individualContractId });
});

// ---------------------------------------------------------------------------
// PUT /:id — Update
// ---------------------------------------------------------------------------
groupContracts.put("/:id", requireRole("ADMIN","INSURER_ADMIN","INSURER_AGENT"), async (c) => {
  const id = c.req.param("id"); const data = await c.req.json<Record<string, unknown>>(); const user = c.get("user"); const db = getDb(c);
  const existing = await db.prepare("SELECT * FROM group_contracts WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!existing) return notFound(c, "Contrat groupe non trouvé");
  if (user?.insurerId && user.role === "INSURER_ADMIN" && existing.insurer_id !== user.insurerId) return notFound(c, "Contrat groupe non trouvé");
  const sets: string[] = []; const values: unknown[] = [];
  const fieldMap: Record<string,string> = { companyId:"company_id", insurerId:"insurer_id", contractNumber:"contract_number", contractType:"contract_type", intermediaryName:"intermediary_name", intermediaryCode:"intermediary_code", companyAddress:"company_address", matriculeFiscale:"matricule_fiscale", effectiveDate:"effective_date", annualRenewalDate:"annual_renewal_date", endDate:"end_date", annualGlobalLimit:"annual_global_limit", carenceDays:"carence_days", childrenMaxAge:"children_max_age", childrenStudentMaxAge:"children_student_max_age", documentUrl:"document_url", documentId:"document_id", planCategory:"plan_category", status:"status", notes:"notes" };
  const boolFieldMap: Record<string,string> = { riskIllness:"risk_illness", riskDisability:"risk_disability", riskDeath:"risk_death", coversSpouse:"covers_spouse", coversChildren:"covers_children", coversDisabledChildren:"covers_disabled_children", coversRetirees:"covers_retirees" };
  for (const [jsKey, dbCol] of Object.entries(fieldMap)) { if ((data as Record<string,unknown>)[jsKey] !== undefined) { sets.push(`${dbCol} = ?`); values.push((data as Record<string,unknown>)[jsKey]); } }
  for (const [jsKey, dbCol] of Object.entries(boolFieldMap)) { if ((data as Record<string,unknown>)[jsKey] !== undefined) { sets.push(`${dbCol} = ?`); values.push((data as Record<string,unknown>)[jsKey] ? 1 : 0); } }
  if (data.contractNumber && data.contractNumber !== existing.contract_number) {
    const dup = await db.prepare("SELECT id FROM group_contracts WHERE contract_number = ? AND id != ? AND deleted_at IS NULL LIMIT 1").bind(data.contractNumber, id).first();
    if (dup) return conflict(c, `Le numéro de contrat "${data.contractNumber}" existe déjà`);
  }
  const guaranteesRaw = Array.isArray(data.guarantees) ? data.guarantees as Record<string, unknown>[] : null;

  if (sets.length === 0 && !guaranteesRaw) return success(c, existing);
  if (sets.length > 0) { sets.push("updated_at = ?"); values.push(new Date().toISOString()); values.push(id); await db.prepare(`UPDATE group_contracts SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run(); }
  if (guaranteesRaw) {
    await db.prepare("UPDATE contract_guarantees SET is_active = 0 WHERE group_contract_id = ?").bind(id).run();
    const now = new Date().toISOString();
    for (const g of guaranteesRaw) {
      const gid = generateId();
      // Support both camelCase and snake_case field names
      const careType = (g.careType ?? g.care_type) as string;
      const label = (g.label ?? '') as string;
      const guaranteeNumber = Number(g.guaranteeNumber ?? g.guarantee_number ?? g.sort_order ?? 1);
      const reimbursementRate = g.reimbursementRate ?? g.reimbursement_rate;
      const isFixedAmount = g.isFixedAmount ?? g.is_fixed_amount ?? false;
      const annualLimit = g.annualLimit ?? g.annual_limit;
      const perEventLimit = g.perEventLimit ?? g.per_event_limit;
      const dailyLimit = g.dailyLimit ?? g.daily_limit;
      const maxDays = g.maxDays ?? g.max_days;
      const letterKeysJson = g.letterKeysJson ?? g.letter_keys_json ?? (g.letter_keys ? JSON.stringify(g.letter_keys) : null);
      const subLimitsJson = g.subLimitsJson ?? g.sub_limits_json ?? (g.sub_limits ? JSON.stringify(g.sub_limits) : null);
      const conditionsText = g.conditionsText ?? g.conditions_text ?? g.conditions ?? null;
      const requiresPrescription = g.requiresPrescription ?? g.requires_prescription ?? false;
      const requiresCnamComplement = g.requiresCnamComplement ?? g.requires_cnam_complement ?? false;
      const renewalPeriodMonths = g.renewalPeriodMonths ?? g.renewal_period_months ?? g.renewal_period ?? null;
      const ageLimit = g.ageLimit ?? g.age_limit ?? null;
      const waitingPeriodDays = Number(g.waitingPeriodDays ?? g.waiting_period_days ?? 0);
      const exclusionsText = g.exclusionsText ?? g.exclusions_text ?? null;
      if (!careType) continue; // skip invalid entries
      await db.prepare(`INSERT INTO contract_guarantees (id, group_contract_id, guarantee_number, care_type, label, reimbursement_rate, is_fixed_amount, annual_limit, per_event_limit, daily_limit, max_days, letter_keys_json, sub_limits_json, conditions_text, requires_prescription, requires_cnam_complement, renewal_period_months, age_limit, waiting_period_days, exclusions_text, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(gid, id, guaranteeNumber, careType, label, reimbursementRate ?? null, isFixedAmount ? 1 : 0, annualLimit ?? null, perEventLimit ?? null, dailyLimit ?? null, maxDays ?? null, letterKeysJson ?? null, subLimitsJson ?? null, conditionsText ?? null, requiresPrescription ? 1 : 0, requiresCnamComplement ? 1 : 0, renewalPeriodMonths ?? null, ageLimit ?? null, waitingPeriodDays, exclusionsText ?? null, now, now).run();
    }
  }
  // Auto-apply when status → active
  let applyResult: { created: number; skipped: number } | null = null;
  if ((data as Record<string,unknown>).status === "active" && existing.status !== "active") {
    const uc = await db.prepare("SELECT * FROM group_contracts WHERE id = ? AND deleted_at IS NULL").bind(id).first<Record<string,unknown>>();
    if (uc) {
      let adherentList: { id: string; first_name: string; last_name: string }[];
      if (uc.contract_type === "individual" && uc.adherent_id) {
        const a = await db.prepare("SELECT id, first_name, last_name FROM adherents WHERE id = ? AND is_active = 1 AND deleted_at IS NULL").bind(uc.adherent_id).first<{ id: string; first_name: string; last_name: string }>();
        adherentList = a ? [a] : [];
      } else {
        const as2 = await db.prepare("SELECT id, first_name, last_name FROM adherents WHERE company_id = ? AND is_active = 1 AND deleted_at IS NULL AND parent_adherent_id IS NULL").bind(uc.company_id).all<{ id: string; first_name: string; last_name: string }>();
        adherentList = as2.results ?? [];
      }
      if (adherentList.length > 0) {
        const gR = await db.prepare("SELECT * FROM contract_guarantees WHERE group_contract_id = ? AND is_active = 1").bind(id).all();
        const coverage: Record<string,unknown> = {};
        for (const g of gR.results ?? []) { const gt = g as Record<string,unknown>; coverage[gt.care_type as string] = { enabled: true, reimbursementRate: gt.reimbursement_rate ? Number(gt.reimbursement_rate)*100 : null, annualLimit: gt.annual_limit, perEventLimit: gt.per_event_limit }; }
        const now = new Date().toISOString(); let cr = 0; let sk = 0;
        for (const adh of adherentList) {
          const ec = await db.prepare(`SELECT id FROM contracts WHERE adherent_id = ? AND insurer_id = ? AND status = 'active' AND group_contract_id = ?`).bind(adh.id, uc.insurer_id, id).first();
          if (ec) { sk++; continue; }
          const cid = generateId(); const cn = `${uc.contract_number}-${cid.slice(-6).toUpperCase()}`;
          const ed = uc.end_date ?? uc.annual_renewal_date ?? new Date(new Date(uc.effective_date as string).getTime()+365*24*60*60*1000).toISOString().split("T")[0];
          await db.prepare(`INSERT INTO contracts (id, contract_number, adherent_id, insurer_id, plan_type, status, coverage_json, start_date, end_date, group_contract_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`).bind(cid, cn, adh.id, uc.insurer_id, uc.contract_type === "individual" ? "individual" : "corporate", JSON.stringify(coverage), uc.effective_date, ed, id, now, now).run();
          cr++;
        }
        applyResult = { created: cr, skipped: sk };
      }
    }
  }
  await logAudit(getDb(c), { userId: user?.sub, action: "group_contract.update", entityType: "group_contract", entityId: id, changes: data as Record<string,unknown>, ipAddress: c.req.header("CF-Connecting-IP"), userAgent: c.req.header("User-Agent") });
  const updated = await db.prepare("SELECT * FROM group_contracts WHERE id = ?").bind(id).first();
  const guarantees = await db.prepare("SELECT * FROM contract_guarantees WHERE group_contract_id = ? AND is_active = 1 ORDER BY guarantee_number").bind(id).all();
  return success(c, { ...updated, guarantees: guarantees.results ?? [], ...(applyResult ? { adherentsApplied: applyResult } : {}) });
});

// ---------------------------------------------------------------------------
// GET /:id/guarantees
// ---------------------------------------------------------------------------
groupContracts.get("/:id/guarantees", requireRole("ADMIN","INSURER_ADMIN","INSURER_AGENT"), async (c) => {
  const id = c.req.param("id"); const user = c.get("user"); const db = getDb(c);
  const contract = await db.prepare("SELECT id, insurer_id FROM group_contracts WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!contract) return notFound(c, "Contrat groupe non trouvé");
  if (user?.insurerId && (user.role === "INSURER_ADMIN" || user.role === "INSURER_AGENT") && contract.insurer_id !== user.insurerId) return notFound(c, "Contrat groupe non trouvé");
  const guarantees = await db.prepare("SELECT * FROM contract_guarantees WHERE group_contract_id = ? AND is_active = 1 ORDER BY guarantee_number ASC").bind(id).all();
  return success(c, guarantees.results ?? []);
});

// ===========================================================================
// PDF Analysis — Multi-pass Gemini + regex fallback + validation + JSON repair
// ===========================================================================

const PROMPT_PASS_HEADER = `Tu es un OCR spécialisé en contrats d'assurance tunisiens.
Extrais UNIQUEMENT les informations d'identification de ce contrat. Retourne du JSON pur.
{
  "contractNumber": "numéro après N° (ex: '2026 701 000 08')",
  "companyName": "raison sociale après SOUSCRIPTEUR",
  "companyAddress": "adresse complète après ADRESSE",
  "matriculeFiscale": "après MATRICULE FISCALE (ex: '0002788H')",
  "insurerName": "nom assureur (BH ASSURANCE, GAT, STAR, COMAR, AMI, CARTE, MAGHREBIA, ASTREE, LLOYD...)",
  "intermediaryName": "après Intermédiaire (ex: 'Bureaux Direct')",
  "intermediaryCode": "après Code (ex: '111')",
  "effectiveDate": "date d'effet format YYYY-MM-DD",
  "annualRenewalDate": "échéance annuelle format YYYY-MM-DD (année suivante)",
  "riskIllness": true,
  "riskDisability": "true si Incapacité/Invalidité mentionné dans Article 2",
  "riskDeath": "true si Décès mentionné dans Article 2"
}
Règle date: "1er JANVIER 2026" → "2026-01-01". Échéance: année suivante.
Si info absente → null. JSON uniquement.`;

const PROMPT_PASS_BENEFICIARIES = `Tu es un OCR spécialisé en contrats d'assurance tunisiens.
Extrais UNIQUEMENT les informations sur les bénéficiaires/prestataires. Cherche dans l'Article 6.
{
  "coversSpouse": "true si 'conjoints' mentionné",
  "coversChildren": "true si 'enfants à charge' mentionné",
  "childrenMaxAge": "nombre (souvent 20)",
  "childrenStudentMaxAge": "nombre (souvent 25 ou 28)",
  "coversDisabledChildren": "true si 'handicapés sans limite d'âge'",
  "coversRetirees": "true si 'personnel retraité'"
}
Si info absente → null. JSON uniquement.`;

const PROMPT_PASS_GUARANTEES = `Tu es un expert en assurance santé tunisienne. Extrais le TABLEAU DES PRESTATIONS COMPLET.

IMPORTANT: Ce contrat contient EXACTEMENT 18 rubriques numérotées de 1 à 18. Tu DOIS extraire les 18.
Les voici: 1/SOINS MEDICAUX, 2/FRAIS PHARMACEUTIQUES, 3/ANALYSES ET TRAVAUX DE LABORATOIRE,
4/OPTIQUE, 5/CHIRURGIE REFRACTIVE, 6/ACTES MEDICAUX COURANTS, 7/TRANSPORT DU MALADE,
8/FRAIS CHIRURGICAUX, 9/ORTHOPEDIE PROTHESES, 10/HOSPITALISATION, 11/ACCOUCHEMENT,
12/INTERRUPTION INVOLONTAIRE DE GROSSESSE, 13/SOINS ET PROTHESES DENTAIRES,
14/SOINS ORTHODONTIQUES, 15/CIRCONCISION, 16/SANATORIUM/PREVENTORIUM,
17/CURES THERMALES, 18/FRAIS FUNERAIRE

RÈGLE CRITIQUE — Montants tunisiens: "45,000 DT"=45 dinars, "1000,000 DT"=1000 dinars, "0,320 DT"=0.32 dinars.
Si 3 chiffres après virgule → millimes, divise par 1000.

Retourne ce JSON avec un tableau "guarantees" de 18 éléments:
{
  "annualGlobalLimit": "MAXIMUM DES PRESTATIONS en dinars (cherche en bas: 6000,000 DINARS)",
  "guarantees": [{
    "guaranteeNumber": "1-18", "careType": "voir mapping", "label": "libellé exact du tableau",
    "reimbursementRate": "entre 0 et 1 (0.80=80%, 0.90=90%, 1.0=100%) ou null si lettres-clés uniquement",
    "isFixedAmount": "true UNIQUEMENT si forfait fixe (ex: circoncision, funéraire)",
    "annualLimit": "plafond annuel en dinars ou null",
    "perEventLimit": "plafond par acte en dinars ou null",
    "dailyLimit": "plafond journalier en dinars ou null",
    "maxDays": "nombre max de jours ou null",
    "letterKeys": {"clé":"valeur en dinars"},
    "subLimits": {"description":"valeur en dinars"},
    "conditionsText": "conditions/remarques ou null",
    "requiresPrescription": "true si 'prescription médicale' ou 'ordonnance'",
    "requiresCnamComplement": "true si 'complément CNAM' ou 'après prise en charge CNAM'",
    "renewalPeriodMonths": "période renouvellement en mois ou null",
    "ageLimit": "limite d'âge ou null",
    "exclusionsText": "exclusions ou null"
  }]
}

MAPPING careType obligatoire: 1=consultation, 2=pharmacy, 3=laboratory, 4=optical, 5=refractive_surgery,
6=medical_acts, 7=transport, 8=surgery, 9=orthopedics, 10=hospitalization,
11=maternity, 12=ivg, 13=dental, 14=orthodontics, 15=circumcision,
16=sanatorium, 17=thermal_cure, 18=funeral

ATTENTION pour rubrique 1: reimbursementRate=null car c'est par lettres-clés, isFixedAmount=true
ATTENTION pour rubrique 2: il y a 3 sous-catégories (ordinaires 90% max 1000DT, chroniques 90% max 1500DT, stérilité 80% max 1000DT)
ATTENTION pour rubrique 8: chirurgie=80% + salle opération 100% max 300DT/acte + anesthésie 100% max 300DT/acte
ATTENTION pour rubrique 10: hôpital max 45DT/jour, clinique max 120DT/jour
ATTENTION pour rubrique 11: hôpital 100% max 200DT/acte, clinique complément CNAM max 500DT

Tu DOIS retourner exactement 18 garanties. JSON uniquement, aucun texte.`;

// ---- Validation ----
function validateAndFixAmount(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value); if (isNaN(num)) return null;
  if (num > 50000) { console.warn(`[Validation] ${fieldName}: ${num} → ${num/1000}`); return num / 1000; }
  return num;
}
function validateRate(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value); if (isNaN(num)) return null;
  if (num > 1 && num <= 100) return num / 100;
  if (num >= 0 && num <= 1) return num;
  return null;
}
const VALID_CARE_TYPES = new Set(["consultation","consultation_visite","pharmacy","pharmacie","laboratory","laboratoire","optical","optique","refractive_surgery","chirurgie_refractive","medical_acts","actes_courants","actes_specialistes","transport","surgery","chirurgie","orthopedics","orthopedie","hospitalization","hospitalisation","maternity","accouchement","ivg","interruption_grossesse","dental","dentaire","orthodontics","orthodontie","circumcision","circoncision","sanatorium","thermal_cure","cures_thermales","funeral","frais_funeraires"]);
const GUARANTEE_NUM_TO_CARE_TYPE: Record<number,string> = {1:"consultation",2:"pharmacy",3:"laboratory",4:"optical",5:"refractive_surgery",6:"medical_acts",7:"transport",8:"surgery",9:"orthopedics",10:"hospitalization",11:"maternity",12:"ivg",13:"dental",14:"orthodontics",15:"circumcision",16:"sanatorium",17:"thermal_cure",18:"funeral"};

function validateGuarantee(g: Record<string,unknown>): Record<string,unknown> {
  const num = Number(g.guaranteeNumber);
  let careType = g.careType as string;
  if (!careType || !VALID_CARE_TYPES.has(careType)) { const fb = GUARANTEE_NUM_TO_CARE_TYPE[num]; if (fb) careType = fb; }
  const annualLimit = validateAndFixAmount(g.annualLimit, `g${num}.annualLimit`);
  const perEventLimit = validateAndFixAmount(g.perEventLimit, `g${num}.perEventLimit`);
  const dailyLimit = validateAndFixAmount(g.dailyLimit, `g${num}.dailyLimit`);
  const reimbursementRate = validateRate(g.reimbursementRate);
  const lk = g.letterKeys as Record<string,unknown>|undefined; const fixedLK: Record<string,number> = {};
  if (lk && typeof lk === "object") { for (const [k,v] of Object.entries(lk)) { if (v!=null) { const f = validateAndFixAmount(v, `g${num}.lk.${k}`); if (f!=null) fixedLK[k]=f; } } }
  const sl = g.subLimits as Record<string,unknown>|undefined; const fixedSL: Record<string,number> = {};
  if (sl && typeof sl === "object") { for (const [k,v] of Object.entries(sl)) { if (v!=null) { const f = validateAndFixAmount(v, `g${num}.sl.${k}`); if (f!=null) fixedSL[k]=f; } } }
  return {
    guaranteeNumber: num, careType, label: g.label ?? `Garantie ${num}`,
    reimbursementRate, isFixedAmount: g.isFixedAmount ?? false,
    annualLimit, perEventLimit, dailyLimit,
    maxDays: g.maxDays != null ? Number(g.maxDays) : null,
    letterKeys: Object.keys(fixedLK).length > 0 ? fixedLK : null,
    subLimits: Object.keys(fixedSL).length > 0 ? fixedSL : null,
    letterKeysJson: Object.keys(fixedLK).length > 0 ? JSON.stringify(fixedLK) : null,
    subLimitsJson: Object.keys(fixedSL).length > 0 ? JSON.stringify(fixedSL) : null,
    conditionsText: g.conditionsText ?? null, requiresPrescription: g.requiresPrescription ?? false,
    requiresCnamComplement: g.requiresCnamComplement ?? false,
    renewalPeriodMonths: g.renewalPeriodMonths != null ? Number(g.renewalPeriodMonths) : null,
    ageLimit: g.ageLimit != null ? Number(g.ageLimit) : null,
    waitingPeriodDays: 0, exclusionsText: g.exclusionsText ?? null,
  };
}

// ---- PDF text extraction (regex fallback) ----
function inflateBuffer(c: Uint8Array): Uint8Array { try { return pako.inflate(c); } catch { return pako.inflateRaw(c); } }
function extractTextFromContent(content: string): string[] { const p: string[] = []; const r = /\(([^)]*)\)/g; let m; while ((m = r.exec(content)) !== null) { const t = (m[1]??"").replace(/\\n/g,"\n").replace(/\\r/g,"\r").replace(/\\t/g,"\t").replace(/\\\(/g,"(").replace(/\\\)/g,")").replace(/\\\\/g,"\\"); if (t.trim().length>0) p.push(t); } return p; }
function findBytes(h: Uint8Array, n: Uint8Array, s=0): number { for (let i=s;i<=h.length-n.length;i++) { let f=true; for (let j=0;j<n.length;j++) { if (h[i+j]!==n[j]) { f=false; break; } } if (f) return i; } return -1; }

async function extractRawTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer); const tp: string[] = [];
  const sm = new TextEncoder().encode("stream"); const em = new TextEncoder().encode("endstream"); const fm = new TextEncoder().encode("FlateDecode");
  let sp = 0;
  while (sp < bytes.length) {
    const ss = findBytes(bytes,sm,sp); if (ss===-1) break;
    let ds = ss+sm.length; if (ds<bytes.length&&bytes[ds]===0x0d) ds++; if (ds<bytes.length&&bytes[ds]===0x0a) ds++;
    const ep = findBytes(bytes,em,ds); if (ep===-1) break;
    const lb = Math.max(0,ss-300); const isC = findBytes(bytes.slice(lb,ss),fm)!==-1;
    let de = ep; while (de>ds&&(bytes[de-1]===0x0a||bytes[de-1]===0x0d)) de--;
    const sd = bytes.slice(ds,de);
    if (isC&&sd.length>0) { try { const d = inflateBuffer(sd); tp.push(...extractTextFromContent(new TextDecoder("latin1").decode(d))); } catch{} }
    else if (sd.length>0) tp.push(...extractTextFromContent(new TextDecoder("latin1").decode(sd)));
    sp = ep+em.length;
  }
  return tp.join(" ");
}

function spaced(w: string): string { return w.split("").join("\\s*"); }
function normalizePdfText(t: string): string { return t.replace(/fr-FR/g," ").replace(/\s+/g," ").trim(); }
function cleanExtractedValue(v: string): string {
  return v.replace(/fr-FR/g, " ").replace(/\s+/g, " ").trim();
}
function extractHeaderFromText(text: string): Record<string,unknown> {
  const r: Record<string,unknown> = {}; const n = normalizePdfText(text);
  const months: Record<string,string> = {JANVIER:"01",FEVRIER:"02",MARS:"03",AVRIL:"04",MAI:"05",JUIN:"06",JUILLET:"07",AOUT:"08",SEPTEMBRE:"09",OCTOBRE:"10",NOVEMBRE:"11",DECEMBRE:"12"};
  const monthPattern = Object.keys(months).map(m=>spaced(m)).join("|");
  let m; if ((m=n.match(new RegExp(`N[°o]\\s*([0-9][0-9\\s]+[0-9])`,"i")))) r.contractNumber=(m[1]??"").replace(/\s/g,"");
  if ((m=n.match(new RegExp(`${spaced("SOUSCRIPTEUR")}\\s*:?\\s*(.+?)(?=${spaced("ADRESSE")}|${spaced("MATRICULE")}|$)`,"is")))) r.companyName=cleanExtractedValue(m[1]??"").replace(/^:\s*/,"");
  if ((m=n.match(new RegExp(`${spaced("ADRESSE")}\\s*:?\\s*(.+?)(?=${spaced("MATRICULE")}|${spaced("EFFET")}|$)`,"is")))) r.companyAddress=cleanExtractedValue(m[1]??"").replace(/^:\s*/,"");
  if ((m=n.match(new RegExp(`${spaced("MATRICULE")}\\s*${spaced("FISCAL")}[E\\s]*:?\\s*([A-Z0-9][A-Z0-9\\s]*[A-Z0-9])(?=\\s*${spaced("EFFET")}|\\s*$)`,"i")))) r.matriculeFiscale=(m[1]??"").replace(/\s/g,"");
  if ((m=n.match(new RegExp(`${spaced("Interm")}[ée\\s]*${spaced("diaire")}\\s*:?\\s*(.+?)(?=${spaced("Code")}|$)`,"i")))) r.intermediaryName=cleanExtractedValue(m[1]??"").replace(/^:\s*/,"");
  if ((m=n.match(new RegExp(`${spaced("Code")}\\s*:?\\s*([0-9][0-9\\s]{0,20})(?=\\s*\\d\\s*\\.\\s*\\d|\\s*${spaced("RISQ")}|\\s*$)`,"i")))) r.intermediaryCode=(m[1]??"").replace(/\s/g,"");
  if ((m=n.match(new RegExp(`${spaced("EFFET")}\\s*(?:${spaced("DU")}\\s*${spaced("CONTRAT")})?\\s*:?\\s*(?:${spaced("LE")}\\s*)?(\\d[\\d\\s]*)\\s*(?:er|[èe]me)?\\s*(${monthPattern})\\s*(\\d[\\d\\s]*)`,"i")))) { const d=(m[1]??"1").replace(/\s/g,"").padStart(2,"0"); const mo=months[(m[2]??"").replace(/\s/g,"").toUpperCase()]??"01"; const y=(m[3]??"2026").replace(/\s/g,""); r.effectiveDate=`${y}-${mo}-${d}`; }
  if ((m=n.match(new RegExp(`${spaced("ECHEANCE")}\\s*${spaced("ANNUELLE")}\\s*:?\\s*(?:${spaced("LE")}\\s*)?(\\d[\\d\\s]*)\\s*(?:er|[èe]me)?\\s*(${monthPattern})`,"i")))) { const d=(m[1]??"1").replace(/\s/g,"").padStart(2,"0"); const mo=months[(m[2]??"").replace(/\s/g,"").toUpperCase()]??"01"; const ey=typeof r.effectiveDate==="string"?r.effectiveDate.substring(0,4):"2026"; r.annualRenewalDate=`${String(Number(ey)+1)}-${mo}-${d}`; }
  const ip=[`${spaced("BH")}\\s*${spaced("ASSURANCE")}`,`${spaced("GAT")}`,`${spaced("STAR")}`,`${spaced("COMAR")}`,`${spaced("AMI")}`,`${spaced("CARTE")}`,`${spaced("LLOYD")}`,`${spaced("MAGHREBIA")}`,`${spaced("ASTREE")}`];
  if ((m=n.match(new RegExp(`(${ip.join("|")})`,"i")))) r.insurerName=cleanExtractedValue(m[0]);
  r.riskIllness=new RegExp(spaced("maladie"),"i").test(n);
  r.riskDisability=new RegExp(`${spaced("incapacit")}|${spaced("invalidit")}`,"i").test(n);
  r.riskDeath=new RegExp(`${spaced("d")}[ée\\s]*${spaced("c")}[èe\\s]*s`,"i").test(n);
  r.coversSpouse=new RegExp(spaced("conjoint"),"i").test(n);
  r.coversChildren=new RegExp(spaced("enfant"),"i").test(n);
  r.coversRetirees=new RegExp(spaced("retrait"),"i").test(n);
  r.coversDisabledChildren=new RegExp(spaced("handicap"),"i").test(n);
  if ((m=n.match(new RegExp(`${spaced("enfant")}s?\\s*[âa\\s]*g[ée\\s]*s?\\s*${spaced("de")}\\s*${spaced("moins")}\\s*${spaced("de")}\\s*(\\d+)\\s*${spaced("ans")}`,"i")))) r.childrenMaxAge=Number(m[1]);
  if ((m=n.match(new RegExp(`20\\s*[àa]\\s*(\\d+)\\s*${spaced("ans")}|(?:(\\d+)\\s*${spaced("ans")}\\s*(?:\\(inclus\\))?\\s*${spaced("scolaris")})`,"i")))) r.childrenStudentMaxAge=Number(m[1]??m[2]);
  if ((m=n.match(new RegExp(`${spaced("MAXIMUM")}\\s*(?:${spaced("DES")}\\s*${spaced("PRESTATIONS")})?\\s*:?\\s*(\\d[\\d\\s.,]*)\\s*(?:${spaced("DINARS")}|${spaced("DT")})`,"i")))) r.annualGlobalLimit=Number((m[1]??"").replace(/[\s.,]/g,""));
  return r;
}

// ---- Gemini API caller with JSON repair ----
type GeminiResult = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

function repairJson(jsonStr: string): Record<string, unknown> | null {
  // Strategy 1: Fix common issues and try parse
  for (const attempt of [
    // Attempt 1: Remove trailing comma + close brackets
    () => {
      let s = jsonStr;
      s = s.replace(/,\s*$/, "");
      s = s.replace(/,\s*"[^"]*"?\s*:?\s*"?[^"{}[\]]*$/, "");
      const ob = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
      const oc = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
      for (let i = 0; i < ob; i++) s += "]";
      for (let i = 0; i < oc; i++) s += "}";
      return s;
    },
    // Attempt 2: Truncate at last complete object in guarantees array
    () => {
      const lastGoodClose = jsonStr.lastIndexOf("},");
      if (lastGoodClose === -1) return null;
      let s = jsonStr.substring(0, lastGoodClose + 1);
      // Close any open arrays and objects
      const ob = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
      const oc = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
      for (let i = 0; i < ob; i++) s += "]";
      for (let i = 0; i < oc; i++) s += "}";
      return s;
    },
    // Attempt 3: Find the guarantees array and truncate at last complete element
    () => {
      const guarIdx = jsonStr.indexOf('"guarantees"');
      if (guarIdx === -1) return null;
      const arrStart = jsonStr.indexOf("[", guarIdx);
      if (arrStart === -1) return null;
      // Find all complete guarantee objects (matching { ... })
      let depth = 0;
      let lastCompleteEnd = -1;
      for (let i = arrStart + 1; i < jsonStr.length; i++) {
        const ch = jsonStr[i];
        if (ch === '"') {
          // Skip string content
          i++;
          while (i < jsonStr.length && jsonStr[i] !== '"') {
            if (jsonStr[i] === "\\") i++;
            i++;
          }
        } else if (ch === "{") {
          depth++;
        } else if (ch === "}") {
          depth--;
          if (depth === 0) lastCompleteEnd = i;
        }
      }
      if (lastCompleteEnd === -1) return null;
      let s = jsonStr.substring(0, lastCompleteEnd + 1);
      const ob = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
      const oc = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
      for (let i = 0; i < ob; i++) s += "]";
      for (let i = 0; i < oc; i++) s += "}";
      return s;
    },
  ]) {
    try {
      const fixed = attempt();
      if (fixed) {
        const parsed = JSON.parse(fixed);
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return null;
}
async function callGeminiPass(
  apiKey: string,
  base64Data: string,
  mimeType: string,
  prompt: string,
  passName: string,
  model: string,
  maxOutputTokens = 8192,
): Promise<{ data: Record<string, unknown> | null; error?: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Data } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: { temperature: 0.05, maxOutputTokens },
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const et = await res.text();
      console.error(`[${passName}] Gemini ${res.status}:`, et.slice(0, 300));
      return {
        data: null,
        error: `${passName}: Gemini API erreur ${res.status}`,
      };
    }
    const result = (await res.json()) as GeminiResult;
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return { data: null, error: `${passName}: réponse Gemini vide` };
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch)
      return { data: null, error: `${passName}: pas de JSON dans la réponse` };
    const jsonStr = jsonMatch[0];
    try {
      return { data: JSON.parse(jsonStr) };
    } catch (parseErr) {
      console.warn(`[${passName}] JSON parse failed, attempting repair...`);
      const repaired = repairJson(jsonStr);
      if (repaired) {
        console.log(`[${passName}] JSON repair succeeded`);
        return { data: repaired };
      }
      return { data: null, error: `${passName}: ${String(parseErr)}` };
    }
  } catch (err) {
    console.error(`[${passName}] Error:`, err);
    return { data: null, error: `${passName}: ${String(err)}` };
  }
}

// ---- Multi-pass orchestrator ----
async function analyseContractMultiPass(
  apiKey: string,
  fileBuffer: ArrayBuffer,
  mimeType: string,
  _fileName: string,
  model: string,
): Promise<{
  data: Record<string, unknown> | null;
  error?: string;
  errors: string[];
}> {
  const u8 = new Uint8Array(fileBuffer);
  let bin = "";
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  const b64 = btoa(bin);
  const errors: string[] = [];
  let regexHeader: Record<string, unknown> = {};
  try {
    regexHeader = extractHeaderFromText(
      await extractRawTextFromPdf(fileBuffer),
    );
  } catch {
    errors.push("Regex: extraction échouée");
  }
  const [hr, br, gr] = await Promise.all([
    callGeminiPass(
      apiKey,
      b64,
      mimeType,
      PROMPT_PASS_HEADER,
      "header",
      model,
      2048,
    ),
    callGeminiPass(
      apiKey,
      b64,
      mimeType,
      PROMPT_PASS_BENEFICIARIES,
      "beneficiaries",
      model,
      2048,
    ),
    callGeminiPass(
      apiKey,
      b64,
      mimeType,
      PROMPT_PASS_GUARANTEES,
      "guarantees",
      model,
      65536,
    ),
  ]);
  if (hr.error) errors.push(hr.error);
  if (br.error) errors.push(br.error);
  if (gr.error) errors.push(gr.error);
  const gh = hr.data ?? {};
  const gb = br.data ?? {};
  const gg = gr.data ?? {};
  const pick = (...s: unknown[]): unknown => {
    for (const v of s) {
      if (v !== null && v !== undefined && v !== "" && v !== false) return v;
    }
    return null;
  };
  const merged: Record<string, unknown> = {
    contractNumber: pick(regexHeader.contractNumber, gh.contractNumber),
    companyName: pick(gh.companyName, regexHeader.companyName),
    companyAddress: pick(gh.companyAddress, regexHeader.companyAddress),
    matriculeFiscale: pick(regexHeader.matriculeFiscale, gh.matriculeFiscale),
    insurerName: pick(gh.insurerName, regexHeader.insurerName),
    intermediaryName: pick(gh.intermediaryName, regexHeader.intermediaryName),
    intermediaryCode: pick(gh.intermediaryCode, regexHeader.intermediaryCode),
    effectiveDate: pick(regexHeader.effectiveDate, gh.effectiveDate),
    annualRenewalDate: pick(
      regexHeader.annualRenewalDate,
      gh.annualRenewalDate,
    ),
    riskIllness: gh.riskIllness ?? regexHeader.riskIllness ?? true,
    riskDisability: gh.riskDisability ?? regexHeader.riskDisability ?? false,
    riskDeath: gh.riskDeath ?? regexHeader.riskDeath ?? false,
    coversSpouse: gb.coversSpouse ?? regexHeader.coversSpouse ?? true,
    coversChildren: gb.coversChildren ?? regexHeader.coversChildren ?? true,
    childrenMaxAge: gb.childrenMaxAge ?? regexHeader.childrenMaxAge ?? 20,
    childrenStudentMaxAge:
      gb.childrenStudentMaxAge ?? regexHeader.childrenStudentMaxAge ?? 28,
    coversDisabledChildren:
      gb.coversDisabledChildren ?? regexHeader.coversDisabledChildren ?? true,
    coversRetirees: gb.coversRetirees ?? regexHeader.coversRetirees ?? false,
    annualGlobalLimit: validateAndFixAmount(
      gg.annualGlobalLimit ?? regexHeader.annualGlobalLimit,
      "annualGlobalLimit",
    ),
    planCategory: "standard",
    guarantees: [],
  };
  const rawG = (gg.guarantees as Record<string, unknown>[]) || [];
  const validG = rawG.map((g) => validateGuarantee(g));

  // -------------------------------------------------------------------
  // Post-fix: fill missing rates/limits from known Tunisian patterns
  // -------------------------------------------------------------------
  for (const g of validG) {
    const num = Number(g.guaranteeNumber);

    // Fix missing reimbursement rates
    if (g.reimbursementRate == null) {
      const KNOWN_RATES: Record<number, number> = {
        2: 0.9, // Pharmacie: 90% maladies ordinaires/chroniques
        3: 1.0, // Laboratoire: lettres-clés mais taux implicite 100%
        7: 1.0, // Transport: 100%
        9: 1.0, // Orthopédie: 100%
        10: 1.0, // Hospitalisation: 100%
        11: 1.0, // Accouchement: 100% (hôpital)
        12: 1.0, // IVG: 100%
        16: 1.0, // Sanatorium: 100% après CNAM
        17: 1.0, // Cures thermales: 100% après CNAM
      };
      if (KNOWN_RATES[num] !== undefined) {
        g.reimbursementRate = KNOWN_RATES[num];
      }
    }

    // Fix missing limits from contract patterns
    if (num === 2 && g.annualLimit == null) {
      // Pharmacie: maladies ordinaires 1000 DT, chroniques 1500 DT
      g.annualLimit = 1000;
      if (
        !g.subLimits ||
        (typeof g.subLimits === "object" &&
          Object.keys(g.subLimits as object).length === 0)
      ) {
        g.subLimits = {
          maladies_ordinaires: 1000,
          maladies_chroniques: 1500,
          sterilite: 1000,
        };
        g.subLimitsJson = JSON.stringify(g.subLimits);
      }
    }

    if (num === 8) {
      // Chirurgie: KC=10 DT, salle 300 DT/acte, anesthésie 300 DT/acte
      if (g.perEventLimit == null) g.perEventLimit = 300;
      if (
        !g.subLimits ||
        (typeof g.subLimits === "object" &&
          Object.keys(g.subLimits as object).length === 0)
      ) {
        g.subLimits = {
          salle_operation: 300,
          anesthesie: 300,
          medicaments_chirurgie: 300,
        };
        g.subLimitsJson = JSON.stringify(g.subLimits);
      }
    }

    if (num === 10) {
      // Hospitalisation: hôpital 45 DT/jour, clinique 120 DT/jour
      if (g.dailyLimit == null) g.dailyLimit = 120;
      if (
        !g.subLimits ||
        (typeof g.subLimits === "object" &&
          Object.keys(g.subLimits as object).length === 0)
      ) {
        g.subLimits = { hopital_jour: 45, clinique_jour: 120 };
        g.subLimitsJson = JSON.stringify(g.subLimits);
      }
    }

    if (num === 11) {
      // Accouchement: hôpital 200 DT/acte, clinique CNAM plafond 500 DT
      if (g.perEventLimit == null) g.perEventLimit = 200;
      if (
        !g.subLimits ||
        (typeof g.subLimits === "object" &&
          Object.keys(g.subLimits as object).length === 0)
      ) {
        g.subLimits = { hopital: 200, clinique_plafond_cnam: 500 };
        g.subLimitsJson = JSON.stringify(g.subLimits);
      }
    }
  }

  const nums = new Set(validG.map((g) => Number(g.guaranteeNumber)));
  const miss: number[] = [];
  for (let i = 1; i <= 18; i++) {
    if (!nums.has(i)) miss.push(i);
  }
  if (miss.length > 0 && miss.length <= 5)
    errors.push(`Garanties manquantes: ${miss.join(", ")}`);
  const gMap = new Map<number, Record<string, unknown>>();
  for (const g of validG) gMap.set(Number(g.guaranteeNumber), g);
  merged.guarantees = Array.from(gMap.values()).sort(
    (a, b) => Number(a.guaranteeNumber) - Number(b.guaranteeNumber),
  );
  if (!merged.contractNumber && !merged.companyName && validG.length === 0)
    return {
      data: null,
      errors,
      error: errors.join("; ") || "Aucune donnée extraite",
    };
  return {
    data: merged,
    errors,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

function mergeExtractedPages(pages: Array<Record<string,unknown>>): Record<string,unknown> {
  const merged: Record<string,unknown> = { contractNumber:null,companyName:null,companyAddress:null,matriculeFiscale:null,insurerName:null,intermediaryName:null,intermediaryCode:null,effectiveDate:null,annualRenewalDate:null,riskIllness:true,riskDisability:false,riskDeath:false,coversSpouse:true,coversChildren:true,childrenMaxAge:20,childrenStudentMaxAge:28,coversDisabledChildren:true,coversRetirees:false,annualGlobalLimit:null,planCategory:"standard",guarantees:[] as Record<string,unknown>[] };
  for (const p of pages) { for (const [k,v] of Object.entries(p)) { if (k==="guarantees") continue; if (v!=null&&v!=="") merged[k]=v; } const pg=p.guarantees as Record<string,unknown>[]|undefined; if (Array.isArray(pg)) (merged.guarantees as Record<string,unknown>[]).push(...pg); }
  const gMap = new Map<number,Record<string,unknown>>(); for (const g of merged.guarantees as Record<string,unknown>[]) { const n=Number(g.guaranteeNumber); if (n>0) { const e=gMap.get(n); if (e) { for (const [k,v] of Object.entries(g)) { if (v!=null) e[k]=v; } } else gMap.set(n,{...g}); } }
  merged.guarantees = Array.from(gMap.values()).sort((a,b)=>Number(a.guaranteeNumber)-Number(b.guaranteeNumber));
  return merged;
}

// ---------------------------------------------------------------------------
// POST /analyse-pdf
// ---------------------------------------------------------------------------
groupContracts.post("/debug-pdf-extract", requireRole("ADMIN","INSURER_ADMIN","INSURER_AGENT"), async (c) => {
  try { const body=await c.req.parseBody({all:true}); const ff=body["files"]; const file=ff instanceof File?ff:Array.isArray(ff)?ff[0]:null; if (!file||!(file instanceof File)) return c.json({error:"No file"},400); const buf=await file.arrayBuffer(); const raw=await extractRawTextFromPdf(buf); return c.json({rawTextLength:raw.length,rawTextSample:raw.substring(0,500),headerData:extractHeaderFromText(raw)}); } catch (e) { return c.json({error:String(e)},500); }
});

groupContracts.post("/analyse-pdf", requireRole("ADMIN","INSURER_ADMIN","INSURER_AGENT"), async (c) => {
  const user = c.get("user");
  try {
    const geminiApiKey = c.env.GEMINI_API_KEY;
    if (!geminiApiKey) return errorResponse(c,"CONFIG_ERROR","Clé API Gemini non configurée",500);
    const geminiModel = (c.env as Record<string,string>).GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    const body = await c.req.parseBody({all:true});
    const uploadedFilesList: File[] = [];
    const ff = body["files"]; if (Array.isArray(ff)) { for (const f of ff) { if (f instanceof File) uploadedFilesList.push(f); } } else if (ff instanceof File) uploadedFilesList.push(ff);
    const sf = body["file"]; if (sf instanceof File) uploadedFilesList.push(sf);
    if (uploadedFilesList.length===0) return errorResponse(c,"VALIDATION_ERROR","Fichier requis",400);
    for (const f of uploadedFilesList) { const isPdf=f.type.includes("pdf")||f.name.toLowerCase().endsWith(".pdf"); const isImg=f.type.startsWith("image/")||f.name.match(/\.(jpg|jpeg|png|webp|gif)$/i); if (!isPdf&&!isImg) return errorResponse(c,"VALIDATION_ERROR",`Format non supporté: ${f.name}`,400); }
    const storage=c.env.STORAGE; const documentId=generateId(); const r2Files: Array<{name:string;r2Key:string;size:number}>=[];
    for (const f of uploadedFilesList) { const r2Key=`contracts/${documentId}/${f.name.replace(/\s+/g,"_")}`; await storage.put(r2Key,await f.arrayBuffer(),{httpMetadata:{contentType:f.type||"application/octet-stream"}}); r2Files.push({name:f.name,r2Key,size:f.size}); }
    const pageResults: Array<Record<string,unknown>>=[]; const allErrors: string[]=[];
    for (const f of uploadedFilesList) { const buf=await f.arrayBuffer(); const mt=f.type||(f.name.toLowerCase().endsWith(".pdf")?"application/pdf":"image/jpeg"); const result=await analyseContractMultiPass(geminiApiKey,buf,mt,f.name,geminiModel); if (result.data) pageResults.push(result.data); if (result.errors.length>0) allErrors.push(...result.errors); }
    let extractedData: Record<string,unknown>|null=null;
    if (pageResults.length===1) extractedData=pageResults[0]!; else if (pageResults.length>1) extractedData=mergeExtractedPages(pageResults);
    let confidence: "high"|"medium"|"low"="low";
    if (extractedData) { const g=extractedData.guarantees as Record<string,unknown>[]; const hc=!!extractedData.contractNumber; const hn=!!extractedData.companyName; if (hc&&hn&&g.length>=15) confidence="high"; else if ((hc||hn)&&g.length>=10) confidence="medium"; }
    await logAudit(getDb(c),{userId:user?.sub,action:"group_contract.analyse_pdf",entityType:"group_contract",entityId:documentId,changes:{filesCount:uploadedFilesList.length,fileNames:uploadedFilesList.map(f=>f.name),totalSize:uploadedFilesList.reduce((s,f)=>s+f.size,0),engine:geminiModel,architecture:"3-pass",guaranteesExtracted:extractedData?(extractedData.guarantees as unknown[]).length:0,confidence,errors:allErrors.length>0?allErrors:undefined},ipAddress:c.req.header("CF-Connecting-IP"),userAgent:c.req.header("User-Agent")});
    return success(c,{documentId,uploadedFiles:r2Files,extractedData,totalFiles:uploadedFilesList.length,confidence,engine:geminiModel,errors:allErrors.length>0?allErrors:undefined,message:extractedData?`Extraction réussie: ${(extractedData.guarantees as unknown[]).length} garanties extraites. Veuillez vérifier.`:"L'extraction n'a pas pu aboutir. Saisie manuelle requise."});
  } catch (err) { console.error("Contract analysis error:",err); return errorResponse(c,"OCR_ERROR","Erreur lors de l'analyse du contrat",500); }
});

// ---------------------------------------------------------------------------
// POST /:id/apply-to-adherents
// ---------------------------------------------------------------------------
groupContracts.post("/:id/apply-to-adherents", requireRole("ADMIN","INSURER_ADMIN","INSURER_AGENT"), async (c) => {
  const id=c.req.param("id"); const user=c.get("user"); const db=getDb(c);
  const gc = await db.prepare("SELECT * FROM group_contracts WHERE id = ? AND deleted_at IS NULL").bind(id).first<Record<string,unknown>>();
  if (!gc) return notFound(c,"Contrat groupe non trouvé");
  if (user?.insurerId&&["INSURER_ADMIN","INSURER_AGENT"].includes(user.role)&&gc.insurer_id!==user.insurerId) return notFound(c,"Contrat groupe non trouvé");
  if (gc.status!=="active") return errorResponse(c,"CONTRACT_NOT_ACTIVE","Le contrat groupe doit être actif",400);
  let adherentList: {id:string;first_name:string;last_name:string;plafond_global:number|null}[];
  if (gc.contract_type==="individual"&&gc.adherent_id) { const a=await db.prepare("SELECT id, first_name, last_name, plafond_global FROM adherents WHERE id = ? AND is_active = 1 AND deleted_at IS NULL").bind(gc.adherent_id).first<{id:string;first_name:string;last_name:string;plafond_global:number|null}>(); adherentList=a?[a]:[]; }
  else { const as2=await db.prepare("SELECT id, first_name, last_name, plafond_global FROM adherents WHERE company_id = ? AND is_active = 1 AND deleted_at IS NULL").bind(gc.company_id).all<{id:string;first_name:string;last_name:string;plafond_global:number|null}>(); adherentList=as2.results??[]; }
  if (adherentList.length===0) return errorResponse(c,"NO_ADHERENTS","Aucun adhérent actif trouvé",400);
  const guar=await db.prepare("SELECT * FROM contract_guarantees WHERE group_contract_id = ? AND is_active = 1").bind(id).all();
  const coverage: Record<string,unknown>={}; for (const g of guar.results??[]) { const gt=g as Record<string,unknown>; coverage[gt.care_type as string]={enabled:true,reimbursementRate:gt.reimbursement_rate?Number(gt.reimbursement_rate)*100:null,annualLimit:gt.annual_limit,perEventLimit:gt.per_event_limit}; }
  let createdCount=0; let updatedCount=0; const now=new Date().toISOString(); const gcn=gc.contract_number as string;
  const endDate=gc.end_date??gc.annual_renewal_date??new Date(new Date(gc.effective_date as string).getTime()+365*24*60*60*1000).toISOString().split("T")[0];
  for (const adh of adherentList) {
    const ec=await db.prepare(`SELECT id, contract_number FROM contracts WHERE adherent_id = ? AND insurer_id = ? AND status = 'active' AND group_contract_id = ?`).bind(adh.id,gc.insurer_id,id).first<{id:string;contract_number:string}>();
    if (ec) { await db.prepare(`UPDATE contracts SET contract_number=?,coverage_json=?,start_date=?,end_date=?,updated_at=? WHERE id=?`).bind(gcn,JSON.stringify(coverage),gc.effective_date,endDate,now,ec.id).run(); updatedCount++; continue; }
    const cid=generateId(); await db.prepare(`INSERT INTO contracts (id,contract_number,adherent_id,insurer_id,plan_type,status,coverage_json,start_date,end_date,group_contract_id,created_at,updated_at) VALUES (?,?,?,?,?,'active',?,?,?,?,?,?)`).bind(cid,gcn,adh.id,gc.insurer_id,gc.contract_type==="individual"?"individual":"corporate",JSON.stringify(coverage),gc.effective_date,endDate,id,now,now).run(); createdCount++;
  }
  let plafondsCreated=0; const cy=new Date().getFullYear(); const years=[cy,cy+1];

  // Build family plafonds from contract_guarantees (primary source)
  // Maps care_type → famille_acte_id and uses annual_limit for plafond
  const CARE_TYPE_TO_FAMILLE: Record<string, string> = {
    consultation_visite:'fa-001',consultation:'fa-001',
    actes_courants:'fa-009',medical_acts:'fa-009',
    pharmacie:'fa-003',pharmacy:'fa-003',
    laboratoire:'fa-004',laboratory:'fa-004',
    orthopedie:'fa-005',orthopedics:'fa-005',
    optique:'fa-006',optical:'fa-006',
    hospitalisation:'fa-007',hospitalization:'fa-007',
    chirurgie:'fa-010',surgery:'fa-010',
    dentaire:'fa-011',dental:'fa-011',
    accouchement:'fa-012',maternity:'fa-012',
    cures_thermales:'fa-013',thermal_cure:'fa-013',
    orthodontie:'fa-014',orthodontics:'fa-014',
    circoncision:'fa-015',circumcision:'fa-015',
    transport:'fa-016',
    frais_funeraires:'fa-019',funeral:'fa-019',
    chirurgie_refractive:'fa-009',refractive_surgery:'fa-009',
    sanatorium:'fa-007',
  };

  const guarantees = await db.prepare(
    `SELECT care_type, annual_limit, sub_limits_json FROM contract_guarantees
     WHERE group_contract_id = ? AND is_active = 1 AND annual_limit IS NOT NULL`
  ).bind(id).all<{care_type:string; annual_limit:number; sub_limits_json:string|null}>();

  // Build plafond entries: one per famille_acte_id, with sub_limits creating separate ordinaire/chronique entries
  const famillePlafonds: Array<{famille_id:string; montant_plafond:number; type_maladie:string}> = [];
  for (const g of guarantees.results ?? []) {
    const familleId = CARE_TYPE_TO_FAMILLE[g.care_type];
    if (!familleId) continue;

    // annual_limit in contract_guarantees is stored in millimes (from barème TP extraction)
    const limitInMillimes = g.annual_limit;

    // Check for sub_limits (e.g., pharmacie: {"ordinaire":1000,"chronique":1500})
    let subLimits: Record<string, number> | null = null;
    if (g.sub_limits_json) { try { subLimits = JSON.parse(g.sub_limits_json); } catch {} }

    // Detect sub_limits keys (may be "ordinaire"/"chronique" or "maladies_ordinaires"/"maladies_chroniques")
    const ordKey = subLimits ? (subLimits.ordinaire != null ? 'ordinaire' : subLimits.maladies_ordinaires != null ? 'maladies_ordinaires' : null) : null;
    const chrKey = subLimits ? (subLimits.chronique != null ? 'chronique' : subLimits.maladies_chroniques != null ? 'maladies_chroniques' : null) : null;

    if (subLimits && (ordKey || chrKey)) {
      // Create separate plafonds per type_maladie from sub_limits
      if (ordKey && subLimits[ordKey] != null) {
        const val = subLimits[ordKey] as number;
        famillePlafonds.push({ famille_id: familleId, montant_plafond: val, type_maladie: 'ordinaire' });
      }
      if (chrKey && subLimits[chrKey] != null) {
        const val = subLimits[chrKey] as number;
        famillePlafonds.push({ famille_id: familleId, montant_plafond: val, type_maladie: 'chronique' });
      }
    } else {
      // Single plafond for both types
      famillePlafonds.push({ famille_id: familleId, montant_plafond: limitInMillimes, type_maladie: 'ordinaire' });
      famillePlafonds.push({ famille_id: familleId, montant_plafond: limitInMillimes, type_maladie: 'chronique' });
    }
  }

  // Also check contrat_baremes as legacy fallback (may have data in older contracts)
  const baremes=await db.prepare(`SELECT DISTINCT cb.famille_id, cb.plafond_famille_annuel FROM contrat_baremes cb JOIN contrat_periodes cp ON cb.periode_id = cp.id WHERE cp.contract_id = ? AND cb.plafond_famille_annuel IS NOT NULL AND cb.famille_id IS NOT NULL`).bind(id).all<{famille_id:string;plafond_famille_annuel:number}>();
  for (const b of baremes.results ?? []) {
    // Only add if not already covered by contract_guarantees
    const alreadyCovered = famillePlafonds.some(fp => fp.famille_id === b.famille_id);
    if (!alreadyCovered) {
      famillePlafonds.push({ famille_id: b.famille_id, montant_plafond: b.plafond_famille_annuel, type_maladie: 'ordinaire' });
      famillePlafonds.push({ famille_id: b.famille_id, montant_plafond: b.plafond_famille_annuel, type_maladie: 'chronique' });
    }
  }

  const globalLimitRaw=gc.annual_global_limit as number|null;
  // annual_global_limit stored in millimes (from barème TP extraction or form * 1000)
  const globalLimitMillimes = globalLimitRaw && globalLimitRaw > 0 ? globalLimitRaw : null;

  // Step 1: Force update ALL adherents' plafond_global from contract (overwrite any personalized value)
  if (globalLimitMillimes && globalLimitMillimes > 0) {
    const adhIds = adherentList.map(a => a.id);
    // D1 max bind = 100, batch if needed
    for (let i = 0; i < adhIds.length; i += 80) {
      const batch = adhIds.slice(i, i + 80);
      const ph = batch.map(() => '?').join(',');
      try { await db.prepare(`UPDATE adherents SET plafond_global = ?, updated_at = ? WHERE id IN (${ph})`).bind(globalLimitMillimes, now, ...batch).run(); } catch{}
    }
  }

  // Step 2: Delete ALL existing plafonds for this contract → clean slate, then re-insert
  // This ensures contract barème overwrites any previous/personalized values
  for (const y of years) {
    try { await db.prepare(`DELETE FROM plafonds_beneficiaire WHERE contract_id = ? AND annee = ?`).bind(id, y).run(); } catch{}
  }

  // Step 3: Insert fresh plafonds for every adherent × year × famille from contract guarantees
  for (const adh of adherentList) {
    for (const y of years) {
      for (const fp of famillePlafonds) {
        try { await db.prepare(`INSERT INTO plafonds_beneficiaire (id,adherent_id,contract_id,annee,famille_acte_id,type_maladie,montant_plafond,montant_consomme,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,datetime('now'),datetime('now'))`).bind(generateId(),adh.id,id,y,fp.famille_id,fp.type_maladie,fp.montant_plafond).run(); plafondsCreated++; } catch{} }
      if (globalLimitMillimes && globalLimitMillimes > 0) {
        try { await db.prepare(`INSERT INTO plafonds_beneficiaire (id,adherent_id,contract_id,annee,famille_acte_id,type_maladie,montant_plafond,montant_consomme,created_at,updated_at) VALUES (?,?,?,?,NULL,'ordinaire',?,0,datetime('now'),datetime('now'))`).bind(generateId(),adh.id,id,y,globalLimitMillimes).run(); plafondsCreated++; } catch{} }
    }
  }
  await logAudit(getDb(c),{userId:user?.sub,action:"group_contract.apply_to_adherents",entityType:"group_contract",entityId:id,changes:{companyId:gc.company_id,totalAdherents:adherentList.length,contractsCreated:createdCount,contractsUpdated:updatedCount,plafondsCreated},ipAddress:c.req.header("CF-Connecting-IP"),userAgent:c.req.header("User-Agent")});
  const parts: string[]=[]; if (createdCount>0) parts.push(`${createdCount} contrats créés`); if (updatedCount>0) parts.push(`${updatedCount} contrats mis à jour`); if (plafondsCreated>0) parts.push(`${plafondsCreated} plafonds initialisés`);
  return success(c,{groupContractId:id,totalAdherents:adherentList.length,contractsCreated:createdCount,contractsUpdated:updatedCount,plafondsCreated,message:parts.join(", ")+"."});
});

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------
groupContracts.delete("/:id", requireRole("ADMIN","INSURER_ADMIN"), async (c) => {
  const id=c.req.param("id"); const user=c.get("user"); const db=getDb(c);
  const existing=await db.prepare("SELECT id, contract_number, insurer_id, status FROM group_contracts WHERE id = ? AND deleted_at IS NULL").bind(id).first<{id:string;contract_number:string;insurer_id:string;status:string}>();
  if (!existing) return notFound(c,"Contrat groupe non trouvé");
  if (user?.insurerId&&user.role==="INSURER_ADMIN"&&existing.insurer_id!==user.insurerId) return notFound(c,"Contrat groupe non trouvé");
  await db.prepare("UPDATE group_contracts SET deleted_at=datetime('now'),status='cancelled',updated_at=datetime('now') WHERE id=?").bind(id).run();
  await db.prepare("UPDATE contracts SET status='cancelled',updated_at=datetime('now') WHERE group_contract_id=?").bind(id).run();
  await db.prepare("UPDATE contract_guarantees SET is_active=0,updated_at=datetime('now') WHERE group_contract_id=?").bind(id).run();
  await logAudit(getDb(c),{userId:user?.sub,action:"group_contract.delete",entityType:"group_contract",entityId:id,changes:{contractNumber:existing.contract_number,previousStatus:existing.status},ipAddress:c.req.header("CF-Connecting-IP"),userAgent:c.req.header("User-Agent")});
  return success(c,{message:"Contrat supprimé avec succès"});
});

export { groupContracts };