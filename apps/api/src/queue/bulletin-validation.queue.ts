/**
 * Bulletin Queue Consumer
 *
 * Handles two message types:
 *
 * 1. OCR_ANALYSE_BULLETIN — Fetches files from R2, calls external OCR API,
 *    parses the response, saves actes, then runs validation.
 *
 * 2. VALIDATE_BULLETIN — Runs validation only (adherent, contract, MF checks).
 */

import type { Bindings } from '../types';
import type { QueueMessage, BulletinValidationMessage, OcrAnalyseMessage, ValidationError } from './bulletin-validation.types';
import { generateId } from '../lib/ulid';

// ---------------------------------------------------------------------------
// Nature-acte → referentiel code mapping (duplicated from routes for queue isolation)
// ---------------------------------------------------------------------------
const NATURE_ACTE_MAPPINGS: { keywords: string[]; code: string; label: string }[] = [
  { keywords: ['consultation', 'visite', 'examen'], code: 'C1', label: 'Consultation médecin généraliste' },
  { keywords: ['specialist', 'spécialist'], code: 'C2', label: 'Consultation médecin spécialiste' },
  { keywords: ['pharmac', 'medicament', 'ordonnance'], code: 'PH1', label: 'Frais pharmaceutiques' },
  { keywords: ['analyse', 'biolog', 'laborat', 'sang'], code: 'B', label: 'Analyses biologiques' },
  { keywords: ['radio', 'radiograph'], code: 'R', label: 'Radiographie' },
  { keywords: ['echograph', 'echo'], code: 'E', label: 'Échographie' },
  { keywords: ['scanner', 'irm', 'imagerie'], code: 'TS', label: 'Traitements spéciaux (scanner/IRM)' },
  { keywords: ['dentaire', 'dent', 'dentist'], code: 'SD', label: 'Soins et prothèses dentaires' },
  { keywords: ['kine', 'physiother', 'reeducation'], code: 'PC', label: 'Pratiques courantes' },
  { keywords: ['clinique', 'hospitalisation'], code: 'CL', label: 'Hospitalisation clinique' },
  { keywords: ['hopital'], code: 'HP', label: 'Hospitalisation hôpital' },
  { keywords: ['chirurg', 'operation', 'bloc'], code: 'FCH', label: 'Frais chirurgicaux' },
  { keywords: ['optique', 'lunettes', 'verres'], code: 'OPT', label: 'Optique (monture + verres)' },
  { keywords: ['accouchement', 'maternite'], code: 'ACC', label: 'Accouchement' },
  { keywords: ['orthodont'], code: 'ODF', label: 'Soins orthodontiques' },
];

function mapNatureActeToCode(natureActe: string): { code: string; label: string } | null {
  const text = natureActe.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const mapping of NATURE_ACTE_MAPPINGS) {
    if (mapping.keywords.some((kw) => text.includes(kw))) {
      return { code: mapping.code, label: mapping.label };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveDb(env: Bindings, dbBinding: string): D1Database {
  const db = (env as unknown as Record<string, unknown>)[dbBinding] as D1Database | undefined;
  return db || env.DB;
}

/**
 * Insert a minimal bulletin_soins record for OCR-created bulletins.
 * Uses empty adherent_id with FK checks disabled since the real adherent
 * will be resolved later during validation.
 */
async function insertBulletinShell(
  db: D1Database,
  bulletinId: string,
  companyId: string,
  batchId: string | null,
  ocrJobId: string,
  userId: string,
  now: string
): Promise<void> {
  // Check if already exists (idempotency for retries)
  const existing = await db.prepare('SELECT id FROM bulletins_soins WHERE id = ?').bind(bulletinId).first();
  if (existing) return;

  await db.batch([
    db.prepare('PRAGMA foreign_keys = OFF'),
    db.prepare(
      `INSERT INTO bulletins_soins
       (id, adherent_id, bulletin_number, bulletin_date, submission_date,
        company_id, batch_id, status, source,
        validation_status, ocr_job_id, created_by, created_at, updated_at)
       VALUES (?, '', '', ?, ?, ?, ?, 'draft', 'ocr_bulk', 'pending_ocr', ?, ?, ?, ?)`
    ).bind(bulletinId, now, now, companyId, batchId, ocrJobId, userId, now, now),
    db.prepare('PRAGMA foreign_keys = ON'),
  ]);
}

// ---------------------------------------------------------------------------
// Validation logic (unchanged)
// ---------------------------------------------------------------------------

async function validateBulletin(
  db: D1Database,
  bulletinId: string,
  companyId: string
): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  const bulletin = await db.prepare(
    `SELECT id, adherent_matricule, adherent_id, company_id
     FROM bulletins_soins WHERE id = ?`
  ).bind(bulletinId).first<{
    id: string;
    adherent_matricule: string | null;
    adherent_id: string | null;
    company_id: string | null;
  }>();

  if (!bulletin) {
    errors.push({ field: 'bulletin', code: 'NOT_FOUND', message: 'Bulletin introuvable' });
    return errors;
  }

  // Validate adherent
  if (bulletin.adherent_matricule) {
    const adherent = await db.prepare(
      `SELECT id FROM adherents
       WHERE matricule = ? AND company_id = ? AND deleted_at IS NULL
       LIMIT 1`
    ).bind(bulletin.adherent_matricule, companyId).first<{ id: string }>();

    if (!adherent) {
      errors.push({
        field: 'adherent_matricule',
        code: 'ADHERENT_NOT_FOUND',
        message: `Adhérent avec matricule "${bulletin.adherent_matricule}" introuvable dans cette entreprise`,
        value: bulletin.adherent_matricule,
      });
    }
  } else if (!bulletin.adherent_id) {
    errors.push({
      field: 'adherent_matricule',
      code: 'ADHERENT_MISSING',
      message: 'Matricule adhérent manquant',
    });
  }

  // Validate contract
  const effectiveCompanyId = bulletin.company_id || companyId;
  if (effectiveCompanyId) {
    const contract = await db.prepare(
      `SELECT id FROM group_contracts
       WHERE company_id = ? AND deleted_at IS NULL
       LIMIT 1`
    ).bind(effectiveCompanyId).first<{ id: string }>();

    if (!contract) {
      errors.push({
        field: 'contract',
        code: 'CONTRACT_NOT_FOUND',
        message: 'Aucun contrat trouvé pour cette entreprise',
        value: effectiveCompanyId,
      });
    }
  }

  // Validate actes MF
  const actes = await db.prepare(
    `SELECT id, ref_prof_sant, nom_prof_sant, label
     FROM actes_bulletin WHERE bulletin_id = ?`
  ).bind(bulletinId).all<{
    id: string;
    ref_prof_sant: string | null;
    nom_prof_sant: string | null;
    label: string | null;
  }>();

  for (const acte of actes.results) {
    if (!acte.ref_prof_sant) {
      errors.push({
        field: `acte.${acte.id}.ref_prof_sant`,
        code: 'MF_MISSING',
        message: `Matricule fiscale manquant pour l'acte "${acte.label || acte.id}"`,
      });
      continue;
    }

    const provider = await db.prepare(
      `SELECT id FROM providers
       WHERE matricule_fiscale = ? AND deleted_at IS NULL
       LIMIT 1`
    ).bind(acte.ref_prof_sant).first<{ id: string }>();

    if (!provider) {
      errors.push({
        field: `acte.${acte.id}.ref_prof_sant`,
        code: 'PROVIDER_NOT_FOUND',
        message: `Praticien avec MF "${acte.ref_prof_sant}" introuvable (acte: ${acte.label || acte.id})`,
        value: acte.ref_prof_sant,
      });
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// OCR analysis logic (new)
// ---------------------------------------------------------------------------

export async function processOcrBulletin(
  env: Bindings,
  db: D1Database,
  msg: OcrAnalyseMessage
): Promise<void> {
  const { bulletinId, r2FileKeys, ocrJobId, companyId, batchId, userId } = msg;
  const now = new Date().toISOString();

  // Ensure bulletin record exists (created here instead of analyse-bulk
  // because bulletins_soins has NOT NULL + FK constraints on adherent_id)
  await insertBulletinShell(db, bulletinId, companyId, batchId, ocrJobId, userId, now);

  // Mark as processing
  await db.prepare(
    `UPDATE bulletins_soins SET validation_status = 'processing_ocr', updated_at = ? WHERE id = ?`
  ).bind(now, bulletinId).run();

  // 2. Fetch files from R2
  const fileBlobs: { name: string; data: ArrayBuffer; type: string }[] = [];
  for (const key of r2FileKeys) {
    const obj = await env.STORAGE.get(key);
    if (!obj) continue;
    const data = await obj.arrayBuffer();
    const name = key.split('/').pop() || 'file';
    const type = obj.httpMetadata?.contentType || 'application/octet-stream';
    fileBlobs.push({ name, data, type });
  }

  if (fileBlobs.length === 0) {
    await db.prepare(
      `UPDATE bulletins_soins SET validation_status = 'pending_correction',
       validation_errors = ?, updated_at = ? WHERE id = ?`
    ).bind(JSON.stringify([{ field: 'files', code: 'NO_FILES', message: 'Aucun fichier trouvé en R2' }]), now, bulletinId).run();
    await updateJobCounter(db, ocrJobId, 'pending', now);
    return;
  }

  // 3. Call external OCR API
  const proxyForm = new FormData();
  for (const blob of fileBlobs) {
    proxyForm.append('files', new File([blob.data], blob.name, { type: blob.type }));
  }

  const ocrUrl = env.OCR_URL || 'https://ocr-api-bh-assurance-dev.yassine-techini.workers.dev/analyse-bulletin';
  let ocrRes: Response;
  try {
    ocrRes = await fetch(ocrUrl, {
      method: 'POST',
      headers: { accept: 'application/json' },
      body: proxyForm,
    });
  } catch (err) {
    await db.prepare(
      `UPDATE bulletins_soins SET validation_status = 'pending_correction',
       validation_errors = ?, updated_at = ? WHERE id = ?`
    ).bind(JSON.stringify([{ field: 'ocr', code: 'OCR_NETWORK_ERROR', message: 'Erreur réseau lors de l\'appel OCR' }]), now, bulletinId).run();
    await updateJobCounter(db, ocrJobId, 'pending', now);
    return;
  }

  if (!ocrRes.ok) {
    await db.prepare(
      `UPDATE bulletins_soins SET validation_status = 'pending_correction',
       validation_errors = ?, updated_at = ? WHERE id = ?`
    ).bind(JSON.stringify([{ field: 'ocr', code: 'OCR_ERROR', message: `OCR retourné ${ocrRes.status}` }]), now, bulletinId).run();
    await updateJobCounter(db, ocrJobId, 'pending', now);
    return;
  }

  // 4. Parse OCR response
  const ocrData: Record<string, unknown> = await ocrRes.json();
  const raw = typeof ocrData.raw_response === 'string' ? ocrData.raw_response : JSON.stringify(ocrData);
  const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    await db.prepare(
      `UPDATE bulletins_soins SET validation_status = 'pending_correction',
       validation_errors = ?, updated_at = ? WHERE id = ?`
    ).bind(JSON.stringify([{ field: 'ocr', code: 'OCR_PARSE_ERROR', message: 'Erreur parsing résultat OCR' }]), now, bulletinId).run();
    await updateJobCounter(db, ocrJobId, 'pending', now);
    return;
  }

  // If the response wraps data in donnees_ia, unwrap it
  const bulletinData = (parsed.donnees_ia && typeof parsed.donnees_ia === 'object' && !Array.isArray(parsed.donnees_ia))
    ? parsed.donnees_ia as Record<string, unknown>
    : parsed;

  // 5. Extract adherent info and update bulletin
  const infos = (bulletinData.infos_adherent || {}) as Record<string, unknown>;
  const voletMedical = bulletinData.volet_medical as Record<string, unknown>[] | undefined;

  const matricule = String(infos.matricule || infos.numero_adherent || infos.numero_matricule || '').trim();
  const nomPrenom = String(infos.nom_prenom || '').trim();
  const nomAdherent = String(infos.nom || infos.nom_adherent || '').trim() || (nomPrenom ? nomPrenom.split(/\s+/).slice(1).join(' ') : '');
  const prenomAdherent = String(infos.prenom || '').trim() || (nomPrenom ? nomPrenom.split(/\s+/)[0] || '' : '');
  const bulletinDate = String(infos.date_soins || infos.date_signature || infos.date || '').trim() || now.split('T')[0];
  const numeroBulletin = String(infos.numero_bulletin || '').trim() || null;
  const beneficiaire = String(infos.beneficiaire_coche || infos.beneficiaire || '').trim() || null;
  const nomBeneficiaire = String(infos.nom_beneficiaire || '').trim() || null;

  // Determine beneficiary relationship
  let beneficiaryRelationship: string | null = null;
  if (beneficiaire) {
    const benLower = beneficiaire.toLowerCase();
    if (benLower.includes('conjoint')) beneficiaryRelationship = 'spouse';
    else if (benLower.includes('enfant')) beneficiaryRelationship = 'child';
    else if (benLower.includes('adh') || benLower.includes('assur')) beneficiaryRelationship = 'self';
  }

  // Update bulletin with OCR-extracted data
  await db.prepare(
    `UPDATE bulletins_soins SET
       adherent_matricule = COALESCE(NULLIF(?, ''), adherent_matricule),
       adherent_first_name = COALESCE(NULLIF(?, ''), adherent_first_name),
       adherent_last_name = COALESCE(NULLIF(?, ''), adherent_last_name),
       bulletin_date = COALESCE(NULLIF(?, ''), bulletin_date),
       bulletin_number = COALESCE(?, bulletin_number),
       beneficiary_name = COALESCE(?, beneficiary_name),
       beneficiary_relationship = COALESCE(?, beneficiary_relationship),
       validation_status = 'pending_validation',
       updated_at = ?
     WHERE id = ?`
  ).bind(
    matricule, prenomAdherent, nomAdherent, bulletinDate,
    numeroBulletin, nomBeneficiaire, beneficiaryRelationship,
    now, bulletinId
  ).run();

  // 6. Insert actes from volet_medical
  let totalAmount = 0;
  if (Array.isArray(voletMedical)) {
    for (const acte of voletMedical) {
      const acteObj = acte as Record<string, unknown>;
      const acteId = generateId();

      const natureActe = String(acteObj.nature_acte || acteObj.designation || acteObj.label || '');
      const match = mapNatureActeToCode(natureActe);
      const code = String(acteObj.code || acteObj.matched_code || match?.code || '');
      const label = String(match?.label || natureActe || '');
      const amount = Number(acteObj.montant_honoraires || acteObj.montant_facture || acteObj.montant || acteObj.amount || 0);
      const refProfSant = String(acteObj.matricule_fiscale || acteObj.ref_prof_sant || '');
      const nomProfSant = String(acteObj.nom_praticien || acteObj.nom_prof_sant || '');
      const careType = String(acteObj.type_soin || acteObj.care_type || '');

      totalAmount += amount;

      await db.prepare(
        `INSERT INTO actes_bulletin (id, bulletin_id, code, label, amount, ref_prof_sant, nom_prof_sant, care_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(acteId, bulletinId, code, label, amount, refProfSant, nomProfSant, careType, now, now).run();
    }
  }

  // Update total amount
  if (totalAmount > 0) {
    await db.prepare(
      `UPDATE bulletins_soins SET total_amount = ? WHERE id = ?`
    ).bind(totalAmount, bulletinId).run();
  }

  // 7. Now run validation (adherent, contract, MF)
  const errors = await validateBulletin(db, bulletinId, companyId);

  if (errors.length === 0) {
    await db.prepare(
      `UPDATE bulletins_soins
       SET validation_status = 'ready_for_validation',
           validation_errors = NULL,
           validation_attempts = validation_attempts + 1,
           updated_at = ?
       WHERE id = ?`
    ).bind(now, bulletinId).run();
    await updateJobCounter(db, ocrJobId, 'ready', now);
  } else {
    await db.prepare(
      `UPDATE bulletins_soins
       SET validation_status = 'pending_correction',
           validation_errors = ?,
           validation_attempts = validation_attempts + 1,
           updated_at = ?
       WHERE id = ?`
    ).bind(JSON.stringify(errors), now, bulletinId).run();
    await updateJobCounter(db, ocrJobId, 'pending', now);
  }
}

async function updateJobCounter(db: D1Database, ocrJobId: string, type: 'ready' | 'pending', now: string) {
  if (!ocrJobId) return;
  const field = type === 'ready' ? 'bulletins_ready' : 'bulletins_pending';
  await db.prepare(
    `UPDATE bulletin_ocr_jobs SET ${field} = ${field} + 1, updated_at = ? WHERE id = ?`
  ).bind(now, ocrJobId).run();

  // Check if all bulletins are processed → mark job as completed
  const job = await db.prepare(
    `SELECT total_bulletins_extracted, bulletins_ready, bulletins_pending FROM bulletin_ocr_jobs WHERE id = ?`
  ).bind(ocrJobId).first<{ total_bulletins_extracted: number; bulletins_ready: number; bulletins_pending: number }>();

  if (job && (job.bulletins_ready + job.bulletins_pending) >= job.total_bulletins_extracted && job.total_bulletins_extracted > 0) {
    await db.prepare(
      `UPDATE bulletin_ocr_jobs SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`
    ).bind(now, now, ocrJobId).run();
    console.log(`[bulletin-queue] OCR job ${ocrJobId} completed (${job.bulletins_ready} ready, ${job.bulletins_pending} pending)`);
  }
}

// ---------------------------------------------------------------------------
// Queue consumer handler
// ---------------------------------------------------------------------------

export async function bulletinQueueHandler(
  batch: MessageBatch<QueueMessage>,
  env: Bindings
): Promise<void> {
  for (const message of batch.messages) {
    const msg = message.body;

    try {
      console.log(`[bulletin-queue] Processing message type=${msg.type} bulletinId=${msg.bulletinId} dbBinding=${msg.dbBinding}`);
      const db = resolveDb(env, msg.dbBinding);
      if (!db) {
        console.error(`[bulletin-queue] DB binding "${msg.dbBinding}" not found`);
        message.ack();
        continue;
      }
      const now = new Date().toISOString();

      if (msg.type === 'OCR_ANALYSE_BULLETIN') {
        console.log(`[bulletin-queue] Starting OCR processing for ${msg.bulletinId}`);
        await processOcrBulletin(env, db, msg);
        console.log(`[bulletin-queue] OCR processing done for ${msg.bulletinId}`);
        message.ack();

      } else if (msg.type === 'VALIDATE_BULLETIN') {
        // Mark as validating
        await db.prepare(
          `UPDATE bulletins_soins SET validation_status = 'validating', updated_at = ? WHERE id = ?`
        ).bind(now, msg.bulletinId).run();

        const errors = await validateBulletin(db, msg.bulletinId, msg.companyId);

        if (errors.length === 0) {
          await db.prepare(
            `UPDATE bulletins_soins
             SET validation_status = 'ready_for_validation',
                 validation_errors = NULL,
                 validation_attempts = validation_attempts + 1,
                 updated_at = ?
             WHERE id = ?`
          ).bind(now, msg.bulletinId).run();
          await updateJobCounter(db, msg.ocrJobId, 'ready', now);
        } else {
          await db.prepare(
            `UPDATE bulletins_soins
             SET validation_status = 'pending_correction',
                 validation_errors = ?,
                 validation_attempts = validation_attempts + 1,
                 updated_at = ?
             WHERE id = ?`
          ).bind(JSON.stringify(errors), now, msg.bulletinId).run();
          await updateJobCounter(db, msg.ocrJobId, 'pending', now);
        }

        message.ack();
      } else {
        // Unknown message type — ack to avoid infinite retries
        console.error('[bulletin-queue] Unknown message type:', (msg as Record<string, unknown>).type);
        message.ack();
      }
    } catch (err) {
      console.error(`[bulletin-queue] Error processing message type=${msg.type} bulletinId=${msg.bulletinId}:`, err instanceof Error ? err.message : err);
      message.retry();
    }
  }
}
