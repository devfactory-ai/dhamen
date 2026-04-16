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

/** Parse French date format (DD.MM.YY or DD/MM/YYYY) to ISO YYYY-MM-DD */
function parseFrenchDate(input: string): string {
  const cleaned = input.replace(/\s/g, '');
  const m = cleaned.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})$/);
  if (!m) return '';
  const day = m[1]!.padStart(2, '0');
  const month = m[2]!.padStart(2, '0');
  let year = m[3]!;
  if (year.length === 2) year = (Number(year) > 50 ? '19' : '20') + year;
  return `${year}-${month}-${day}`;
}

/** Parse amount string: handles "50.000", "10,340", etc. */
function parseAmount(val: unknown): number {
  if (typeof val === 'number') return val;
  const s = String(val || '0').replace(/\s/g, '');
  // If comma is used as decimal separator (French format): "10,340" → "10.340"
  const normalized = s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s;
  return Number(normalized) || 0;
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
  // Use INSERT OR IGNORE for idempotency (avoids UNIQUE constraint errors on retries)
  await db.prepare(
      `INSERT OR IGNORE INTO bulletins_soins
       (id, adherent_id, bulletin_number, bulletin_date, submission_date,
        company_id, status, source,
        validation_status, ocr_job_id, created_by, created_at, updated_at)
       VALUES (?, '__OCR_PENDING__', ?, ?, ?, ?, 'draft', 'ocr_bulk', 'pending_ocr', ?, ?, ?, ?)`
    ).bind(bulletinId, `OCR-${bulletinId}`, now, now, companyId, ocrJobId, userId, now, now).run();
  if (batchId) {
    await db.prepare(
      'UPDATE bulletins_soins SET batch_id = ? WHERE id = ?'
    ).bind(batchId, bulletinId).run();
  }
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
       WHERE mf_number = ? AND deleted_at IS NULL
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
    // Use Blob with explicit filename — File constructor may not be available in all runtimes
    const fileBlob = new Blob([blob.data], { type: blob.type });
    proxyForm.append('files', fileBlob, blob.name);
  }

  const ocrPath = '/analyse-bulletin';
  const hasServiceBinding = !!env.OCR_SERVICE;
  console.log(`[processOcrBulletin] Calling OCR: ${ocrPath} with ${fileBlobs.length} file(s), serviceBinding=${hasServiceBinding}, files: ${fileBlobs.map(f => f.name).join(', ')}`);
  let ocrRes: Response;
  try {
    if (env.OCR_SERVICE) {
      // Use Service Binding (Worker-to-Worker, avoids error 1042)
      ocrRes = await env.OCR_SERVICE.fetch(`https://ocr-service${ocrPath}`, {
        method: 'POST',
        body: proxyForm,
      });
    } else {
      // Fallback to direct URL (works only cross-account or local dev)
      const ocrUrl = env.OCR_URL || "https://ocr-api-bh-assurance-staging.yassine-techini.workers.dev/analyse-bulletin";
      ocrRes = await fetch(ocrUrl, {
        method: 'POST',
        headers: { accept: 'application/json' },
        body: proxyForm,
      });
    }
  } catch (err) {
    await db.prepare(
      `UPDATE bulletins_soins SET validation_status = 'pending_correction',
       validation_errors = ?, updated_at = ? WHERE id = ?`
    ).bind(JSON.stringify([{ field: 'ocr', code: 'OCR_NETWORK_ERROR', message: 'Erreur réseau lors de l\'appel OCR' }]), now, bulletinId).run();
    await updateJobCounter(db, ocrJobId, 'pending', now);
    return;
  }

  if (!ocrRes.ok) {
    let errBody = '';
    try { errBody = await ocrRes.text(); } catch { /* ignore */ }
    console.error(`[processOcrBulletin] OCR error ${ocrRes.status} for ${bulletinId}: ${errBody.slice(0, 500)}`);
    console.error(`[processOcrBulletin] OCR path: ${ocrPath}, files: ${fileBlobs.length}, names: ${fileBlobs.map(f => f.name).join(', ')}`);
    await db.prepare(
      `UPDATE bulletins_soins SET validation_status = 'pending_correction',
       validation_errors = ?, updated_at = ? WHERE id = ?`
    ).bind(JSON.stringify([{ field: 'ocr', code: 'OCR_ERROR', message: `OCR retourné ${ocrRes.status}: ${errBody.slice(0, 200)}` }]), now, bulletinId).run();
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

  // Unwrap response: support donnees_ia wrapper AND resultat wrapper
  let bulletinData = parsed as Record<string, unknown>;
  if (parsed.donnees_ia && typeof parsed.donnees_ia === 'object' && !Array.isArray(parsed.donnees_ia)) {
    bulletinData = parsed.donnees_ia as Record<string, unknown>;
  }
  if (parsed.resultat && typeof parsed.resultat === 'object' && !Array.isArray(parsed.resultat)) {
    bulletinData = parsed.resultat as Record<string, unknown>;
  }

  // 5. Extract adherent info — support multiple OCR response formats:
  //   Format A: { infos_adherent, infos_patient, actes_independants }
  //   Format B: { adherent, actes } (praticien is object, details_lignes under analyse)
  const infos = (bulletinData.infos_adherent || bulletinData.adherent || {}) as Record<string, unknown>;
  const infosPatient = (bulletinData.infos_patient || {}) as Record<string, unknown>;

  // Support all actes array formats
  const actesSource = (bulletinData.volet_medical || bulletinData.actes_independants || bulletinData.actes || []) as Record<string, unknown>[];

  const matricule = String(infos.matricule || infos.numero_adherent || infos.numero_contrat || infos.numero_matricule || '').trim();
  const nomPrenom = String(infos.nom_prenom || '').trim();
  const nomAdherent = String(infos.nom || infos.nom_adherent || '').trim() || (nomPrenom ? nomPrenom.split(/\s+/).slice(1).join(' ') : '');
  const prenomAdherent = String(infos.prenom || '').trim() || (nomPrenom ? nomPrenom.split(/\s+/)[0] || '' : '');
  const numeroBulletin = String(infos.numero_bulletin || '').trim() || null;
  const beneficiaire = String(infos.beneficiaire_coche || infos.beneficiaire || '').trim() || null;

  // Beneficiary name: from multiple possible locations
  const conjointObj = (infos.conjoint || {}) as Record<string, unknown>;
  const enfantsArr = (infos.enfants || []) as Record<string, unknown>[];
  let nomBeneficiaire: string | null = null;
  if (infosPatient.nom_prenom_malade) {
    nomBeneficiaire = String(infosPatient.nom_prenom_malade).trim();
  } else if (conjointObj.nom_prenom) {
    nomBeneficiaire = String(conjointObj.nom_prenom).trim();
  } else if (enfantsArr.length > 0 && enfantsArr[0]?.nom_prenom) {
    nomBeneficiaire = String(enfantsArr[0].nom_prenom).trim();
  } else if (infos.nom_beneficiaire) {
    nomBeneficiaire = String(infos.nom_beneficiaire).trim();
  }

  // Parse bulletin date: try adherent fields, then first acte date, then fallback to now
  let bulletinDate = String(infos.date_soins || infos.date_signature || infos.date || '').trim();
  if (!bulletinDate && Array.isArray(actesSource) && actesSource.length > 0) {
    const firstActe = actesSource[0] as Record<string, unknown>;
    const firstActeDate = String(firstActe.date_acte || firstActe.date || '').trim();
    if (firstActeDate) bulletinDate = parseFrenchDate(firstActeDate);
  }
  if (!bulletinDate) bulletinDate = now.split('T')[0]!;

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

  // 6. Insert actes — support both volet_medical and actes_independants formats
  // actes_independants format: { type, date, praticien, matricule_fiscale, acte, montant, details_lignes? }
  // volet_medical format: { nature_acte, montant_honoraires, ... }
  let totalAmount = 0;

  // Map OCR type to care_type
  const typeToCaretype: Record<string, string> = {
    'MEDECIN': 'consultation', 'CONSULTATION': 'consultation',
    'PHARMACIE': 'pharmacie', 'PHARMACY': 'pharmacie',
    'LABORATOIRE': 'lab', 'LABO': 'lab', 'ANALYSES': 'lab',
    'RADIOLOGIE': 'radio', 'RADIO': 'radio',
    'OPTIQUE': 'optique', 'OPTICAL': 'optique',
    'DENTAIRE': 'dentaire', 'DENTAL': 'dentaire',
    'HOSPITALISATION': 'hospital', 'HOSPITAL': 'hospital',
  };

  if (Array.isArray(actesSource)) {
    for (const acte of actesSource) {
      const acteObj = acte as Record<string, unknown>;

      // Determine care type from 'type' field (actes_independants) or 'type_soin'/'care_type' (volet_medical)
      const rawType = String(acteObj.type || acteObj.type_soin || acteObj.care_type || '').toUpperCase().trim();
      const careType = typeToCaretype[rawType] || rawType.toLowerCase() || '';

      // Extract acte label
      const natureActe = String(acteObj.acte || acteObj.nature_acte || acteObj.designation || acteObj.label || '');
      const match = mapNatureActeToCode(natureActe);
      const code = String(acteObj.code || acteObj.matched_code || match?.code || '');
      const label = String(match?.label || natureActe || '');

      // Extract MF and praticien name — praticien can be string or object
      const praticienObj = (typeof acteObj.praticien === 'object' && acteObj.praticien !== null)
        ? acteObj.praticien as Record<string, unknown>
        : null;
      const refProfSant = String(
        praticienObj?.matricule_fiscale || acteObj.matricule_fiscale || acteObj.ref_prof_sant || ''
      ).replace(/\[ILLISIBLE\]/gi, '').trim();
      const nomProfSant = String(
        praticienObj?.nom_prenom || (typeof acteObj.praticien === 'string' ? acteObj.praticien : '') ||
        acteObj.pharmacie || acteObj.nom_praticien || acteObj.nom_prof_sant || ''
      ).replace(/\[ILLISIBLE\]/gi, '').trim();

      // Amount: montant_facture (preferred), montant_total, montant_honoraires, montant
      const analyseObj = (typeof acteObj.analyse === 'object' && acteObj.analyse !== null)
        ? acteObj.analyse as Record<string, unknown>
        : null;
      const mainAmount = parseAmount(
        acteObj.montant_facture || analyseObj?.montant_total || acteObj.montant_total ||
        acteObj.montant_honoraires || acteObj.montant || acteObj.amount || 0
      );

      // Sub-lines: details_lignes can be at acte level OR under analyse
      const detailsLignes = (acteObj.details_lignes || analyseObj?.details_lignes || undefined) as Record<string, unknown>[] | undefined;

      if (mainAmount > 0 || (Array.isArray(detailsLignes) && detailsLignes.length > 0)) {
        const acteId = generateId();
        const effectiveAmount = mainAmount > 0 ? mainAmount : (
          Array.isArray(detailsLignes) ? detailsLignes.reduce((s, l) => s + parseAmount(l.montant), 0) : 0
        );
        totalAmount += effectiveAmount;

        await db.prepare(
          `INSERT INTO actes_bulletin (id, bulletin_id, code, label, amount, ref_prof_sant, nom_prof_sant, care_type, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(acteId, bulletinId, code, label, effectiveAmount || 0.001, refProfSant || null, nomProfSant || null, careType, now).run();

        // Insert sub_items for pharmacy detail lines (table may not exist yet)
        if (Array.isArray(detailsLignes) && detailsLignes.length > 0) {
          try {
            for (const ligne of detailsLignes) {
              const ligneObj = ligne as Record<string, unknown>;
              const subId = generateId();
              const subLabel = String(ligneObj.designation || ligneObj.label || '').replace(/\[ILLISIBLE\]/gi, 'Médicament').trim();
              const subAmount = parseAmount(ligneObj.montant || ligneObj.prix_unitaire || 0);
              const subCode = String(ligneObj.code_amm || '').trim();
              await db.prepare(
                `INSERT OR IGNORE INTO sub_items_acte (id, acte_bulletin_id, label, code, amount, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
              ).bind(subId, acteId, subLabel, subCode, subAmount, now, now).run();
            }
          } catch { /* sub_items_acte table may not exist — skip */ }
        }
      }
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
