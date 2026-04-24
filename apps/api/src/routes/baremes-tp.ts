/**
 * Barèmes TP (Tableau de Prestations) Routes
 *
 * CRUD for reusable TP templates + apply-to-contract functionality.
 * A TP defines the 18 guarantee categories with rates, ceilings, and letter keys.
 * It can be applied to one or more group contracts (template-copy approach).
 * Includes PDF upload + Gemini AI extraction for automatic TP creation.
 */
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../lib/db";
import {
  success,
  created,
  notFound,
  paginated,
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
  "refractive_surgery","chirurgie_refractive","medical_acts","actes_courants",
  "transport","surgery","chirurgie","orthopedics","orthopedie",
  "hospitalization","hospitalisation","maternity","accouchement",
  "ivg","interruption_grossesse","dental","dentaire",
  "orthodontics","orthodontie","circumcision","circoncision",
  "sanatorium","thermal_cure","cures_thermales","funeral","frais_funeraires",
] as const;

const guaranteeSchema = z.object({
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
});

const createSchema = z.object({
  name: z.string().min(1, "Nom requis"),
  year: z.number().int().min(2020).max(2100),
  description: z.string().optional(),
  insurerId: z.string().optional(),
  status: z.enum(["draft", "active", "archived"]).default("draft"),
  guarantees: z.array(guaranteeSchema).optional(),
});

const updateSchema = createSchema.partial();

const filtersSchema = z.object({
  insurerId: z.string().optional(),
  year: z.coerce.number().int().optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const baremesTP = new Hono<{ Bindings: Bindings; Variables: Variables }>();
baremesTP.use("*", authMiddleware());

// ---------------------------------------------------------------------------
// GET / — List barèmes TP
// ---------------------------------------------------------------------------
baremesTP.get("/", requireRole("ADMIN", "INSURER_ADMIN"), async (c) => {
  const db = getDb(c);
  const query = filtersSchema.parse(c.req.query());
  const { insurerId, year, status, page, limit } = query;

  const conditions: string[] = ["bt.deleted_at IS NULL"];
  const params: unknown[] = [];

  if (insurerId) { conditions.push("bt.insurer_id = ?"); params.push(insurerId); }
  if (year) { conditions.push("bt.year = ?"); params.push(year); }
  if (status) { conditions.push("bt.status = ?"); params.push(status); }

  const where = conditions.join(" AND ");
  const offset = (page - 1) * limit;

  const [countResult, dataResult] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as total FROM baremes_tp bt WHERE ${where}`).bind(...params).first<{ total: number }>(),
    db.prepare(
      `SELECT bt.*, i.name as insurer_name,
              (SELECT COUNT(*) FROM bareme_tp_guarantees g WHERE g.bareme_tp_id = bt.id AND g.is_active = 1) as guarantee_count
       FROM baremes_tp bt
       LEFT JOIN insurers i ON bt.insurer_id = i.id
       WHERE ${where}
       ORDER BY bt.year DESC, bt.created_at DESC
       LIMIT ? OFFSET ?`
    ).bind(...params, limit, offset).all(),
  ]);

  return paginated(c, dataResult.results ?? [], { page, limit, total: countResult?.total ?? 0 });
});

// ---------------------------------------------------------------------------
// GET /:id — Get a single TP with guarantees
// ---------------------------------------------------------------------------
baremesTP.get("/:id", requireRole("ADMIN", "INSURER_ADMIN"), async (c) => {
  const db = getDb(c);
  const id = c.req.param("id");

  const tp = await db.prepare(
    `SELECT bt.*, i.name as insurer_name
     FROM baremes_tp bt
     LEFT JOIN insurers i ON bt.insurer_id = i.id
     WHERE bt.id = ? AND bt.deleted_at IS NULL`
  ).bind(id).first();

  if (!tp) return notFound(c, "Barème TP non trouvé");

  const guarantees = await db.prepare(
    `SELECT * FROM bareme_tp_guarantees
     WHERE bareme_tp_id = ? AND is_active = 1
     ORDER BY guarantee_number`
  ).bind(id).all();

  return success(c, { ...tp, guarantees: guarantees.results ?? [] });
});

// ---------------------------------------------------------------------------
// POST / — Create a new TP
// ---------------------------------------------------------------------------
baremesTP.post("/", requireRole("ADMIN", "INSURER_ADMIN"), async (c) => {
  const db = getDb(c);
  const user = c.get("user");
  const data = createSchema.parse(await c.req.json());
  const now = new Date().toISOString();
  const id = generateId();

  await db.prepare(
    `INSERT INTO baremes_tp (id, name, year, description, insurer_id, status, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, data.name, data.year, data.description ?? null, data.insurerId ?? null, data.status, user?.sub ?? null, now, now).run();

  // Insert guarantees if provided
  if (data.guarantees && data.guarantees.length > 0) {
    for (const g of data.guarantees) {
      const gid = generateId();
      await db.prepare(
        `INSERT INTO bareme_tp_guarantees (id, bareme_tp_id, guarantee_number, care_type, label,
         reimbursement_rate, is_fixed_amount, annual_limit, per_event_limit, daily_limit, max_days,
         letter_keys_json, sub_limits_json, conditions_text, requires_prescription, requires_cnam_complement,
         renewal_period_months, age_limit, waiting_period_days, exclusions_text, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).bind(
        gid, id, g.guaranteeNumber, g.careType, g.label,
        g.reimbursementRate ?? null, g.isFixedAmount ? 1 : 0,
        g.annualLimit ?? null, g.perEventLimit ?? null, g.dailyLimit ?? null, g.maxDays ?? null,
        g.letterKeysJson ?? null, g.subLimitsJson ?? null, g.conditionsText ?? null,
        g.requiresPrescription ? 1 : 0, g.requiresCnamComplement ? 1 : 0,
        g.renewalPeriodMonths ?? null, g.ageLimit ?? null, g.waitingPeriodDays, g.exclusionsText ?? null,
        now, now
      ).run();
    }
  }

  await logAudit(db, {
    userId: user?.sub, action: "bareme_tp.create", entityType: "bareme_tp", entityId: id,
    changes: { name: data.name, year: data.year, guaranteeCount: data.guarantees?.length ?? 0 },
    ipAddress: c.req.header("CF-Connecting-IP"), userAgent: c.req.header("User-Agent"),
  });

  return created(c, { id, name: data.name, year: data.year });
});

// ---------------------------------------------------------------------------
// PUT /:id — Update a TP
// ---------------------------------------------------------------------------
baremesTP.put("/:id", requireRole("ADMIN", "INSURER_ADMIN"), async (c) => {
  const db = getDb(c);
  const user = c.get("user");
  const id = c.req.param("id");
  const data = updateSchema.parse(await c.req.json());
  const now = new Date().toISOString();

  const existing = await db.prepare("SELECT id FROM baremes_tp WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!existing) return notFound(c, "Barème TP non trouvé");

  // Update metadata
  const updates: string[] = ["updated_at = ?"];
  const params: unknown[] = [now];
  if (data.name !== undefined) { updates.push("name = ?"); params.push(data.name); }
  if (data.year !== undefined) { updates.push("year = ?"); params.push(data.year); }
  if (data.description !== undefined) { updates.push("description = ?"); params.push(data.description); }
  if (data.insurerId !== undefined) { updates.push("insurer_id = ?"); params.push(data.insurerId); }
  if (data.status !== undefined) { updates.push("status = ?"); params.push(data.status); }

  params.push(id);
  await db.prepare(`UPDATE baremes_tp SET ${updates.join(", ")} WHERE id = ?`).bind(...params).run();

  // Replace guarantees if provided
  if (data.guarantees && data.guarantees.length > 0) {
    await db.prepare("UPDATE bareme_tp_guarantees SET is_active = 0, updated_at = ? WHERE bareme_tp_id = ?").bind(now, id).run();
    for (const g of data.guarantees) {
      const gid = generateId();
      await db.prepare(
        `INSERT INTO bareme_tp_guarantees (id, bareme_tp_id, guarantee_number, care_type, label,
         reimbursement_rate, is_fixed_amount, annual_limit, per_event_limit, daily_limit, max_days,
         letter_keys_json, sub_limits_json, conditions_text, requires_prescription, requires_cnam_complement,
         renewal_period_months, age_limit, waiting_period_days, exclusions_text, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).bind(
        gid, id, g.guaranteeNumber, g.careType, g.label,
        g.reimbursementRate ?? null, g.isFixedAmount ? 1 : 0,
        g.annualLimit ?? null, g.perEventLimit ?? null, g.dailyLimit ?? null, g.maxDays ?? null,
        g.letterKeysJson ?? null, g.subLimitsJson ?? null, g.conditionsText ?? null,
        g.requiresPrescription ? 1 : 0, g.requiresCnamComplement ? 1 : 0,
        g.renewalPeriodMonths ?? null, g.ageLimit ?? null, g.waitingPeriodDays, g.exclusionsText ?? null,
        now, now
      ).run();
    }
  }

  await logAudit(db, {
    userId: user?.sub, action: "bareme_tp.update", entityType: "bareme_tp", entityId: id,
    changes: data, ipAddress: c.req.header("CF-Connecting-IP"), userAgent: c.req.header("User-Agent"),
  });

  return success(c, { id, updated: true });
});

// ---------------------------------------------------------------------------
// DELETE /:id — Soft-delete a TP
// ---------------------------------------------------------------------------
baremesTP.delete("/:id", requireRole("ADMIN"), async (c) => {
  const db = getDb(c);
  const user = c.get("user");
  const id = c.req.param("id");
  const now = new Date().toISOString();

  const existing = await db.prepare("SELECT id, name FROM baremes_tp WHERE id = ? AND deleted_at IS NULL").bind(id).first();
  if (!existing) return notFound(c, "Barème TP non trouvé");

  await db.prepare("UPDATE baremes_tp SET deleted_at = ?, updated_at = ? WHERE id = ?").bind(now, now, id).run();

  await logAudit(db, {
    userId: user?.sub, action: "bareme_tp.delete", entityType: "bareme_tp", entityId: id,
    changes: { name: (existing as Record<string, unknown>).name },
    ipAddress: c.req.header("CF-Connecting-IP"), userAgent: c.req.header("User-Agent"),
  });

  return success(c, { id, deleted: true });
});

// ---------------------------------------------------------------------------
// POST /:id/apply-to-contract — Copy TP guarantees into a group contract
// ---------------------------------------------------------------------------
const applySchema = z.object({
  groupContractId: z.string().min(1, "ID contrat groupe requis"),
  annualGlobalLimit: z.number().optional(),
});

baremesTP.post("/:id/apply-to-contract", requireRole("ADMIN", "INSURER_ADMIN"), async (c) => {
  const db = getDb(c);
  const user = c.get("user");
  const tpId = c.req.param("id");
  const { groupContractId, annualGlobalLimit } = applySchema.parse(await c.req.json());
  const now = new Date().toISOString();

  // Verify TP exists
  const tp = await db.prepare(
    "SELECT id, name, year FROM baremes_tp WHERE id = ? AND deleted_at IS NULL"
  ).bind(tpId).first<{ id: string; name: string; year: number }>();
  if (!tp) return notFound(c, "Barème TP non trouvé");

  // Verify contract exists
  const gc = await db.prepare(
    "SELECT id, contract_number FROM group_contracts WHERE id = ? AND deleted_at IS NULL"
  ).bind(groupContractId).first<{ id: string; contract_number: string }>();
  if (!gc) return notFound(c, "Contrat groupe non trouvé");

  // Fetch TP guarantees
  const tpGuarantees = await db.prepare(
    `SELECT * FROM bareme_tp_guarantees WHERE bareme_tp_id = ? AND is_active = 1 ORDER BY guarantee_number`
  ).bind(tpId).all();

  const guarantees = tpGuarantees.results ?? [];
  if (guarantees.length === 0) {
    return errorResponse(c, "NO_GUARANTEES", "Ce barème TP ne contient aucune garantie", 400);
  }

  // Update annual_global_limit if provided (already in millimes from frontend)
  if (annualGlobalLimit != null && annualGlobalLimit > 0) {
    await db.prepare(
      "UPDATE group_contracts SET annual_global_limit = ?, updated_at = ? WHERE id = ?"
    ).bind(annualGlobalLimit, now, groupContractId).run();
  }

  // Soft-delete existing contract guarantees
  await db.prepare(
    "UPDATE contract_guarantees SET is_active = 0, updated_at = ? WHERE group_contract_id = ? AND is_active = 1"
  ).bind(now, groupContractId).run();

  // Copy TP guarantees into contract_guarantees
  let copiedCount = 0;
  for (const g of guarantees) {
    const row = g as Record<string, unknown>;
    const gid = generateId();
    await db.prepare(
      `INSERT INTO contract_guarantees (id, group_contract_id, bareme_tp_id, guarantee_number, care_type, label,
       reimbursement_rate, is_fixed_amount, annual_limit, per_event_limit, daily_limit, max_days,
       letter_keys_json, sub_limits_json, conditions_text, requires_prescription, requires_cnam_complement,
       renewal_period_months, age_limit, waiting_period_days, exclusions_text, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).bind(
      gid, groupContractId, tpId,
      row.guarantee_number, row.care_type, row.label,
      row.reimbursement_rate ?? null, row.is_fixed_amount ?? 0,
      row.annual_limit ?? null, row.per_event_limit ?? null, row.daily_limit ?? null, row.max_days ?? null,
      row.letter_keys_json ?? null, row.sub_limits_json ?? null, row.conditions_text ?? null,
      row.requires_prescription ?? 0, row.requires_cnam_complement ?? 0,
      row.renewal_period_months ?? null, row.age_limit ?? null,
      row.waiting_period_days ?? 0, row.exclusions_text ?? null,
      now, now
    ).run();
    copiedCount++;
  }

  await logAudit(db, {
    userId: user?.sub, action: "bareme_tp.apply_to_contract", entityType: "bareme_tp", entityId: tpId,
    changes: { groupContractId, contractNumber: gc.contract_number, guaranteesCopied: copiedCount, tpName: tp.name },
    ipAddress: c.req.header("CF-Connecting-IP"), userAgent: c.req.header("User-Agent"),
  });

  return success(c, {
    tpId, tpName: tp.name,
    groupContractId, contractNumber: gc.contract_number,
    guaranteesCopied: copiedCount,
    message: `${copiedCount} garanties du barème "${tp.name}" appliquées au contrat ${gc.contract_number}.`,
  });
});

// ---------------------------------------------------------------------------
// POST /upload-pdf — Upload TP PDF, extract guarantees via Gemini, create barème
// ---------------------------------------------------------------------------

const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro";

const PROMPT_TP_GUARANTEES = `Tu es un expert en assurance santé tunisienne. Extrais le TABLEAU DES PRESTATIONS (TP) COMPLET de ce document.

IMPORTANT: Un TP contient EXACTEMENT 18 rubriques numérotées de 1 à 18. Tu DOIS extraire les 18.
Les voici: 1/SOINS MEDICAUX, 2/FRAIS PHARMACEUTIQUES, 3/ANALYSES ET TRAVAUX DE LABORATOIRE,
4/OPTIQUE, 5/CHIRURGIE REFRACTIVE, 6/ACTES MEDICAUX COURANTS, 7/TRANSPORT DU MALADE,
8/FRAIS CHIRURGICAUX, 9/ORTHOPEDIE PROTHESES, 10/HOSPITALISATION, 11/ACCOUCHEMENT,
12/INTERRUPTION INVOLONTAIRE DE GROSSESSE, 13/SOINS ET PROTHESES DENTAIRES,
14/SOINS ORTHODONTIQUES, 15/CIRCONCISION, 16/SANATORIUM/PREVENTORIUM,
17/CURES THERMALES, 18/FRAIS FUNERAIRE

RÈGLE CRITIQUE — Montants tunisiens: "45,000 DT"=45 dinars, "1000,000 DT"=1000 dinars, "0,320 DT"=0.32 dinars.
Si 3 chiffres après virgule → millimes, divise par 1000.

Retourne ce JSON:
{
  "tpName": "Nom du barème (ex: Barème BH Assurance 2026)",
  "insurerName": "Nom de l'assureur si visible",
  "year": 2026,
  "annualGlobalLimit": "MAXIMUM DES PRESTATIONS en dinars",
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

MAPPING careType obligatoire: 1=consultation, 2=pharmacie, 3=laboratoire, 4=optique, 5=chirurgie_refractive,
6=actes_courants, 7=transport, 8=chirurgie, 9=orthopedie, 10=hospitalisation,
11=accouchement, 12=interruption_grossesse, 13=dentaire, 14=orthodontie, 15=circoncision,
16=sanatorium, 17=cures_thermales, 18=frais_funeraires

ATTENTION pour rubrique 1: extrais le taux (ex: 85%→0.85) ET les lettres-clés (C1,C2,C3,V1,V2,V3 avec leur valeur en dinars si présente). isFixedAmount=false
ATTENTION pour rubrique 2: il y a des sous-catégories (ordinaires, chroniques, stérilité) → subLimits
ATTENTION pour rubrique 4: sous-limites optique (monture, verres, doubles foyers, lentilles) → subLimits
ATTENTION pour rubrique 8: chirurgie + salle opération + anesthésie + médicaments → subLimits
ATTENTION pour rubrique 10: hôpital vs clinique → subLimits avec "hopital" et "clinique"
ATTENTION pour rubrique 11: hôpital vs clinique → subLimits

Tu DOIS retourner exactement 18 garanties. JSON uniquement, aucun texte.`;

const GUARANTEE_NUM_TO_CARE_TYPE_FR: Record<number, string> = {
  1:"consultation",2:"pharmacie",3:"laboratoire",4:"optique",5:"chirurgie_refractive",
  6:"actes_courants",7:"transport",8:"chirurgie",9:"orthopedie",10:"hospitalisation",
  11:"accouchement",12:"interruption_grossesse",13:"dentaire",14:"orthodontie",15:"circoncision",
  16:"sanatorium",17:"cures_thermales",18:"frais_funeraires",
};

/**
 * Convert amount from dinars (Gemini output) → millimes (DB storage).
 * The frontend formatAmount() divides by 1000, so DB must store millimes.
 * "1 200,000 DT" = 1200 dinars = 1 200 000 millimes.
 */
function tpDinarsToMillimes(value: unknown): number | null {
  if (value == null) return null;
  const num = Number(value);
  if (isNaN(num) || num === 0) return null;
  // Gemini might already return millimes (very large number)
  if (num > 100000) return Math.round(num);
  // Convert dinars → millimes
  return Math.round(num * 1000);
}

/**
 * Convert letter-key value to millimes (consistent with form convention).
 * Form stores C1=45000 (millimes), B=320 (millimes), Kc=10000 (millimes).
 * Gemini returns in dinars: B=0.270, PC=1.200, Kc=10.
 */
function tpLetterKeyToMillimes(value: unknown): number | null {
  if (value == null) return null;
  const num = Number(value);
  if (isNaN(num) || num === 0) return null;
  // Gemini might already return millimes (large number)
  if (num > 100000) return Math.round(num);
  // Typical letter key values in dinars: 0.270 (B), 1.200 (PC), 10 (Kc), 45 (C2)
  // Values under 100 DT → convert to millimes
  if (num <= 100) return Math.round(num * 1000);
  // Values 100-100000: could be millimes already (e.g. 45000)
  return Math.round(num);
}

function tpValidateRate(value: unknown): number | null {
  if (value == null) return null;
  const num = Number(value); if (isNaN(num)) return null;
  if (num > 1 && num <= 100) return num / 100;
  if (num >= 0 && num <= 1) return num;
  return null;
}

function tpValidateGuarantee(g: Record<string, unknown>): Record<string, unknown> {
  const num = Number(g.guaranteeNumber);
  let careType = g.careType as string;
  const VALID = new Set(CARE_TYPES);
  if (!careType || !VALID.has(careType as typeof CARE_TYPES[number])) {
    careType = GUARANTEE_NUM_TO_CARE_TYPE_FR[num] ?? careType;
  }
  // Letter keys → keep in dinars (displayed raw in badges: B=0.270, Kc=10)
  const lk = g.letterKeys as Record<string, unknown> | undefined;
  const fixedLK: Record<string, number> = {};
  if (lk && typeof lk === "object") {
    for (const [k, v] of Object.entries(lk)) { const f = tpLetterKeyToMillimes(v); if (f != null) fixedLK[k] = f; }
  }
  // Sub-limits → store in millimes (consistent with amount fields)
  const sl = g.subLimits as Record<string, unknown> | undefined;
  const fixedSL: Record<string, number> = {};
  if (sl && typeof sl === "object") {
    for (const [k, v] of Object.entries(sl)) { const f = tpDinarsToMillimes(v); if (f != null) fixedSL[k] = f; }
  }
  return {
    guaranteeNumber: num, careType, label: g.label ?? `Garantie ${num}`,
    reimbursementRate: tpValidateRate(g.reimbursementRate),
    isFixedAmount: g.isFixedAmount ?? false,
    annualLimit: tpDinarsToMillimes(g.annualLimit),
    perEventLimit: tpDinarsToMillimes(g.perEventLimit),
    dailyLimit: tpDinarsToMillimes(g.dailyLimit),
    maxDays: g.maxDays != null ? Number(g.maxDays) : null,
    letterKeysJson: Object.keys(fixedLK).length > 0 ? JSON.stringify(fixedLK) : null,
    subLimitsJson: Object.keys(fixedSL).length > 0 ? JSON.stringify(fixedSL) : null,
    conditionsText: g.conditionsText ?? null,
    requiresPrescription: g.requiresPrescription ?? false,
    requiresCnamComplement: g.requiresCnamComplement ?? false,
    renewalPeriodMonths: g.renewalPeriodMonths != null ? Number(g.renewalPeriodMonths) : null,
    ageLimit: g.ageLimit != null ? Number(g.ageLimit) : null,
    waitingPeriodDays: 0, exclusionsText: g.exclusionsText ?? null,
  };
}

/** Post-fix: fill missing defaults. All amounts in MILLIMES (×1000). */
function tpPostFixGuarantees(guarantees: Record<string, unknown>[]): void {
  for (const g of guarantees) {
    const num = Number(g.guaranteeNumber);
    if (g.reimbursementRate == null) {
      const KNOWN_RATES: Record<number, number> = { 1:0.85, 2:0.9, 3:1.0, 6:1.0, 7:1.0, 8:0.9, 9:1.0, 10:1.0, 11:1.0, 12:1.0, 13:1.0, 14:1.0, 15:1.0, 16:1.0, 17:1.0, 18:1.0 };
      if (KNOWN_RATES[num] !== undefined) g.reimbursementRate = KNOWN_RATES[num];
    }
    // Pharmacie: defaults in millimes
    if (num === 2 && g.annualLimit == null) {
      g.annualLimit = 1200000; // 1200 DT
      if (!g.subLimitsJson) g.subLimitsJson = JSON.stringify({ maladies_ordinaires: 1200000, maladies_chroniques: 1500000, sterilite: 1000000 });
    }
    // Chirurgie: sub-limits in millimes
    if (num === 8 && !g.subLimitsJson) {
      g.subLimitsJson = JSON.stringify({ salle_operation: 400000, anesthesie: 300000, medicaments_usage_unique: 200000 });
    }
    // Hospitalisation: sub-limits and daily limit in millimes
    if (num === 10 && !g.subLimitsJson) {
      g.subLimitsJson = JSON.stringify({ hopital: 10000, clinique: 90000 });
      if (g.dailyLimit == null) g.dailyLimit = 90000; // 90 DT/jour clinique
    }
    // Accouchement: sub-limits in millimes
    if (num === 11 && !g.subLimitsJson) {
      g.subLimitsJson = JSON.stringify({ simple: 700000, gemellaire: 800000 });
    }
  }
}

type GeminiResult = { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };

function tpRepairJson(jsonStr: string): Record<string, unknown> | null {
  for (const attempt of [
    () => {
      let s = jsonStr.replace(/,\s*$/, "").replace(/,\s*"[^"]*"?\s*:?\s*"?[^"{}[\]]*$/, "");
      const ob = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
      const oc = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
      for (let i = 0; i < ob; i++) s += "]";
      for (let i = 0; i < oc; i++) s += "}";
      return s;
    },
    () => {
      const lastGoodClose = jsonStr.lastIndexOf("},");
      if (lastGoodClose === -1) return null;
      let s = jsonStr.substring(0, lastGoodClose + 1);
      const ob = (s.match(/\[/g) || []).length - (s.match(/\]/g) || []).length;
      const oc = (s.match(/\{/g) || []).length - (s.match(/\}/g) || []).length;
      for (let i = 0; i < ob; i++) s += "]";
      for (let i = 0; i < oc; i++) s += "}";
      return s;
    },
  ]) {
    try { const fixed = attempt(); if (fixed) return JSON.parse(fixed) as Record<string, unknown>; } catch { continue; }
  }
  return null;
}

// ---------------------------------------------------------------------------
// DOCX text extraction (ZIP → word/document.xml → strip tags)
// .docx is a ZIP archive; we find word/document.xml and extract text content
// ---------------------------------------------------------------------------
async function inflateRawAsync(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  writer.write(data as unknown as BufferSource);
  writer.close();

  const chunks: Uint8Array[] = [];
  let totalLen = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLen += value.length;
  }
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function extractTextFromDocxAsync(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);

  // Minimal ZIP parser: find local file headers (PK\x03\x04)
  const entries: Array<{ name: string; compressedData: Uint8Array; method: number }> = [];
  let pos = 0;
  while (pos < bytes.length - 4) {
    if (bytes[pos] === 0x50 && bytes[pos + 1] === 0x4b && bytes[pos + 2] === 0x03 && bytes[pos + 3] === 0x04) {
      const method = bytes[pos + 8]! | (bytes[pos + 9]! << 8);
      const compSize = bytes[pos + 18]! | (bytes[pos + 19]! << 8) | (bytes[pos + 20]! << 16) | (bytes[pos + 21]! << 24);
      const nameLen = bytes[pos + 26]! | (bytes[pos + 27]! << 8);
      const extraLen = bytes[pos + 28]! | (bytes[pos + 29]! << 8);
      const nameStart = pos + 30;
      const name = new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLen));
      const dataStart = nameStart + nameLen + extraLen;
      const compressedData = bytes.slice(dataStart, dataStart + compSize);
      entries.push({ name, compressedData, method });
      pos = dataStart + compSize;
    } else {
      pos++;
    }
  }

  const docEntry = entries.find(e => e.name === "word/document.xml");
  if (!docEntry) return "";

  let xmlText: string;
  if (docEntry.method === 0) {
    xmlText = new TextDecoder("utf-8").decode(docEntry.compressedData);
  } else {
    const inflated = await inflateRawAsync(docEntry.compressedData);
    xmlText = new TextDecoder("utf-8").decode(inflated);
  }

  let text = xmlText.replace(/<w:p[\s>]/g, "\n<w:p ");
  text = text.replace(/<w:tab\/>/g, "\t");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

baremesTP.post("/upload-pdf", requireRole("ADMIN", "INSURER_ADMIN"), async (c) => {
  const user = c.get("user");
  const db = getDb(c);

  // Validate Gemini API key
  const geminiApiKey = c.env.GEMINI_API_KEY;
  if (!geminiApiKey) return errorResponse(c, "CONFIG_ERROR", "Clé API Gemini non configurée", 500);
  const geminiModel = (c.env as unknown as Record<string, string>).GEMINI_MODEL || DEFAULT_GEMINI_MODEL;

  // Parse uploaded file
  const body = await c.req.parseBody({ all: true });
  const ff = body["file"];
  const file = ff instanceof File ? ff : null;
  if (!file) return errorResponse(c, "VALIDATION_ERROR", "Fichier PDF requis (champ 'file')", 400);

  const isPdf = file.type.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
  const isImg = file.type.startsWith("image/") || !!file.name.match(/\.(jpg|jpeg|png|webp)$/i);
  const isDoc = file.type.includes("msword") || file.type.includes("wordprocessingml") || !!file.name.match(/\.(doc|docx)$/i);
  if (!isPdf && !isImg && !isDoc) return errorResponse(c, "VALIDATION_ERROR", "Format non supporté. PDF, Word ou image requis.", 400);

  // Optional metadata from form fields
  const tpName = (body["name"] as string) || null;
  const tpYear = body["year"] ? Number(body["year"]) : new Date().getFullYear();
  const insurerId = (body["insurerId"] as string) || null;

  try {
    // Upload to R2
    const documentId = generateId();
    const r2Key = `baremes-tp/${documentId}/${file.name.replace(/\s+/g, "_")}`;
    const storage = c.env.STORAGE;
    const fileBuffer = await file.arrayBuffer();
    await storage.put(r2Key, fileBuffer, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    // Build Gemini request parts based on file type
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
    let contentParts: Array<Record<string, unknown>>;

    if (isDoc) {
      // .docx: extract text first, then send as text to Gemini (Gemini doesn't support docx inline)
      const docText = await extractTextFromDocxAsync(fileBuffer);
      if (!docText || docText.trim().length < 50) {
        return errorResponse(c, "EXTRACT_ERROR", "Impossible d'extraire le texte du fichier Word. Essayez de convertir en PDF.", 400);
      }
      contentParts = [
        { text: `Voici le contenu textuel d'un document Word (Tableau de Prestations):\n\n---\n${docText}\n---\n\n${PROMPT_TP_GUARANTEES}` },
      ];
    } else {
      // PDF/Image: send as inline_data
      const u8 = new Uint8Array(fileBuffer);
      let bin = "";
      for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
      const b64 = btoa(bin);
      const mimeType = file.type || (isPdf ? "application/pdf" : "image/jpeg");
      contentParts = [
        { inline_data: { mime_type: mimeType, data: b64 } },
        { text: PROMPT_TP_GUARANTEES },
      ];
    }

    const geminiBody = {
      contents: [{ parts: contentParts }],
      generationConfig: { temperature: 0.05, maxOutputTokens: 65536 },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (!res.ok) {
      const et = await res.text();
      console.error(`[TP upload] Gemini ${res.status}:`, et.slice(0, 300));
      return errorResponse(c, "GEMINI_ERROR", `Erreur Gemini API: ${res.status}`, 500);
    }

    const result = (await res.json()) as GeminiResult;
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return errorResponse(c, "GEMINI_EMPTY", "Réponse Gemini vide — le document n'a peut-être pas de TP lisible", 400);

    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return errorResponse(c, "PARSE_ERROR", "Pas de JSON dans la réponse Gemini", 400);

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      const repaired = tpRepairJson(jsonMatch[0]);
      if (!repaired) return errorResponse(c, "PARSE_ERROR", "JSON Gemini invalide et non réparable", 400);
      parsed = repaired;
    }

    // Validate and fix guarantees
    const rawGuarantees = (parsed.guarantees as Record<string, unknown>[]) || [];
    const validated = rawGuarantees.map(g => tpValidateGuarantee(g));
    tpPostFixGuarantees(validated);

    // Deduplicate by guaranteeNumber
    const gMap = new Map<number, Record<string, unknown>>();
    for (const g of validated) gMap.set(Number(g.guaranteeNumber), g);
    const finalGuarantees = Array.from(gMap.values()).sort((a, b) => Number(a.guaranteeNumber) - Number(b.guaranteeNumber));

    // Create the barème TP
    const now = new Date().toISOString();
    const id = generateId();
    const name = tpName || (parsed.tpName as string) || `Barème TP ${tpYear}`;
    const annualGlobalLimit = tpDinarsToMillimes(parsed.annualGlobalLimit);

    await db.prepare(
      `INSERT INTO baremes_tp (id, name, year, description, insurer_id, document_url, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`
    ).bind(
      id, name, tpYear,
      `Extrait du PDF "${file.name}" via Gemini. ${finalGuarantees.length} garanties. Plafond global: ${annualGlobalLimit != null ? annualGlobalLimit / 1000 : "non détecté"} DT.`,
      insurerId, r2Key, user?.sub ?? null, now, now,
    ).run();

    // Insert guarantees
    for (const g of finalGuarantees) {
      const gid = generateId();
      await db.prepare(
        `INSERT INTO bareme_tp_guarantees (id, bareme_tp_id, guarantee_number, care_type, label,
         reimbursement_rate, is_fixed_amount, annual_limit, per_event_limit, daily_limit, max_days,
         letter_keys_json, sub_limits_json, conditions_text, requires_prescription, requires_cnam_complement,
         renewal_period_months, age_limit, waiting_period_days, exclusions_text, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
      ).bind(
        gid, id, g.guaranteeNumber, g.careType, g.label,
        g.reimbursementRate ?? null, g.isFixedAmount ? 1 : 0,
        g.annualLimit ?? null, g.perEventLimit ?? null, g.dailyLimit ?? null, g.maxDays ?? null,
        g.letterKeysJson ?? null, g.subLimitsJson ?? null, g.conditionsText ?? null,
        (g.requiresPrescription ? 1 : 0), (g.requiresCnamComplement ? 1 : 0),
        g.renewalPeriodMonths ?? null, g.ageLimit ?? null, g.waitingPeriodDays ?? 0, g.exclusionsText ?? null,
        now, now,
      ).run();
    }

    await logAudit(db, {
      userId: user?.sub, action: "bareme_tp.upload_pdf", entityType: "bareme_tp", entityId: id,
      changes: {
        fileName: file.name, fileSize: file.size, r2Key, engine: geminiModel,
        guaranteesExtracted: finalGuarantees.length, annualGlobalLimit,
      },
      ipAddress: c.req.header("CF-Connecting-IP"), userAgent: c.req.header("User-Agent"),
    });

    return created(c, {
      id, name, year: tpYear, status: "draft",
      documentUrl: r2Key,
      guaranteesExtracted: finalGuarantees.length,
      annualGlobalLimit,
      guarantees: finalGuarantees,
      message: `Barème "${name}" créé avec ${finalGuarantees.length} garanties extraites du PDF. Statut: brouillon — vérifiez puis activez.`,
    });
  } catch (err) {
    console.error("[TP upload] Error:", err);
    return errorResponse(c, "UPLOAD_ERROR", `Erreur lors du traitement: ${String(err)}`, 500);
  }
});
