/**
 * Import Acorad Legacy Data
 *
 * Parses Excel files exported from the legacy Acorad/RIADH system and imports
 * adherents, family members, and bulletin history into a Dhamen tenant database.
 *
 * Excel files expected:
 *   - MAJSPROLS_*.xlsx  → Adherents + ayants-droit (family members)
 *   - SPROLS_*.xlsx     → Bulletin/bordereau history (claims)
 *   - CTRL_SPROLS_*.xlsx → Control/reconciliation summary
 *
 * Usage:
 *   npx tsx scripts/import-acorad.ts --tenant AMI --dir ./dossier [--remote] [--dry-run]
 *
 * Options:
 *   --tenant <CODE>  Tenant code (STAR, GAT, COMAR, AMI)
 *   --dir <PATH>     Directory containing the Excel files
 *   --remote         Execute against remote D1 (default: local)
 *   --dry-run        Parse and validate only, do not insert
 *   --contract <NUM> Contract number filter (if Excel contains multiple contracts)
 *   --company <ID>   Company ID to associate adherents with
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as XLSX from 'xlsx';

// ============================================================
// Configuration
// ============================================================

const ACCOUNT_ID = '6435a77d3ce17b7de468c6618e7b2b14';

const TENANTS: Record<string, { insurerId: string; dbName: string }> = {
  STAR: { insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8C9', dbName: 'dhamen-star' },
  GAT: { insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8D0', dbName: 'dhamen-gat' },
  COMAR: { insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8E1', dbName: 'dhamen-comar' },
  AMI: { insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8F2', dbName: 'dhamen-ami' },
};

// Acorad code_type mapping
const CODE_TYPE_MAP: Record<string, string> = {
  A: 'A', // Adhérent principal
  C: 'C', // Conjoint
  E: 'E', // Enfant
};

// Acorad situation familiale mapping
const SITUATION_FAM_MAP: Record<string, string> = {
  M: 'marie',
  C: 'celibataire',
  D: 'divorce',
  V: 'veuf',
};

// ============================================================
// CLI argument parsing
// ============================================================

function parseArgs(): {
  tenant: string;
  dir: string;
  remote: boolean;
  dryRun: boolean;
  contractFilter?: string;
  companyId?: string;
} {
  const args = process.argv.slice(2);
  let tenant = '';
  let dir = '';
  let remote = false;
  let dryRun = false;
  let contractFilter: string | undefined;
  let companyId: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--tenant':
        tenant = (args[++i] || '').toUpperCase();
        break;
      case '--dir':
        dir = args[++i] || '';
        break;
      case '--remote':
        remote = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--contract':
        contractFilter = args[++i];
        break;
      case '--company':
        companyId = args[++i];
        break;
    }
  }

  if (!tenant || !TENANTS[tenant]) {
    console.error(`Erreur: --tenant requis. Valeurs: ${Object.keys(TENANTS).join(', ')}`);
    process.exit(1);
  }
  if (!dir) {
    console.error('Erreur: --dir requis (dossier contenant les fichiers Excel)');
    process.exit(1);
  }
  if (!fs.existsSync(dir)) {
    console.error(`Erreur: dossier introuvable: ${dir}`);
    process.exit(1);
  }

  return { tenant, dir, remote, dryRun, contractFilter, companyId };
}

// ============================================================
// D1 helpers (same pattern as migrate-to-tenants.ts)
// ============================================================

function executeD1(dbName: string, sql: string, remote: boolean): string {
  const escapedSql = sql.replace(/"/g, '\\"').replace(/\n/g, ' ');
  const remoteFlag = remote ? '--remote' : '--local';
  try {
    const cmd = remote
      ? `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler d1 execute ${dbName} ${remoteFlag} --command "${escapedSql}"`
      : `npx wrangler d1 execute ${dbName} ${remoteFlag} --command "${escapedSql}"`;
    const result = execSync(cmd, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
      cwd: path.resolve(__dirname, '..', 'apps', 'api'),
    });
    return result;
  } catch (error: any) {
    console.error(`  ✗ Erreur SQL sur ${dbName}:`, error.message?.split('\n')[0]);
    return '';
  }
}

function queryD1(dbName: string, sql: string, remote: boolean): any[] {
  const result = executeD1(dbName, sql, remote);
  try {
    const match = result.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return parsed[0]?.results || parsed;
    }
  } catch {
    // No results
  }
  return [];
}

function escapeValue(val: any): string {
  if (val === null || val === undefined || val === '') return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  return `'${String(val).replace(/'/g, "''")}'`;
}

// ============================================================
// ULID generation (simplified, same as app)
// ============================================================

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function generateId(): string {
  const now = Date.now();
  let timeStr = '';
  let t = now;
  for (let i = 0; i < 10; i++) {
    timeStr = ENCODING[t % 32] + timeStr;
    t = Math.floor(t / 32);
  }
  let randomStr = '';
  for (let i = 0; i < 16; i++) {
    randomStr += ENCODING[Math.floor(Math.random() * 32)];
  }
  return timeStr + randomStr;
}

// ============================================================
// Excel file discovery
// ============================================================

function findExcelFiles(dir: string): {
  majsprols?: string;
  sprols?: string;
  ctrl?: string;
} {
  const files = fs.readdirSync(dir);
  const result: { majsprols?: string; sprols?: string; ctrl?: string } = {};

  for (const f of files) {
    const lower = f.toLowerCase();
    if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) continue;

    if (lower.includes('majsprols') || lower.includes('maj_sprols')) {
      result.majsprols = path.join(dir, f);
    } else if (lower.includes('ctrl') || lower.includes('controle')) {
      result.ctrl = path.join(dir, f);
    } else if (lower.includes('sprols')) {
      result.sprols = path.join(dir, f);
    }
  }

  return result;
}

// ============================================================
// Date parsing (Acorad uses dd/mm/yyyy or dd/mm/yy)
// ============================================================

function parseAcoradDate(val: any): string | null {
  if (!val) return null;

  // Handle Excel serial date numbers
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val);
    if (date) {
      return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
    }
    return null;
  }

  const str = String(val).trim();
  if (!str) return null;

  // Try dd/mm/yyyy
  const match1 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match1) {
    return `${match1[3]}-${match1[2]?.padStart(2, '0')}-${match1[1]?.padStart(2, '0')}`;
  }

  // Try dd/mm/yy
  const match2 = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
  if (match2) {
    const year = Number(match2[3]) > 50 ? `19${match2[3]}` : `20${match2[3]}`;
    return `${year}-${match2[2]?.padStart(2, '0')}-${match2[1]?.padStart(2, '0')}`;
  }

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  return null;
}

// ============================================================
// Parse MAJSPROLS (adherents + family)
// ============================================================

interface AcoradAdherent {
  numContrat: string;
  matricule: string;
  codeType: string;     // A, C, E
  rangPres: number;      // 00, 01-98, 99
  nomPrenPrest: string;
  typePieceIdentite: string;
  numPieceIdentite: string;
  dateNaissance: string | null;
  situationFam: string;
  sexe: string;
  codeNatureOrganisme: string;
  codeOrganisme: string;
  dateDebutAdh: string | null;
  dateMarriage: string | null;
  rib: string;
  maladieCronique: boolean;
  handicap: boolean;
  dateFinAdh: string | null;
  telephone: string;
  rue: string;
  ville: string;
  codePostal: string;
  codTypMaj: string;
  codMaj: string;
  dateMaj: string | null;
}

function parseMajsprols(filePath: string, contractFilter?: string): AcoradAdherent[] {
  console.log(`\n📄 Parsing MAJSPROLS: ${path.basename(filePath)}`);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb?.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  if (rows.length < 2) {
    console.log('  ⚠ Fichier vide');
    return [];
  }

  // Map header names to indices
  const headers = (rows[0] || []).map((h: any) => String(h).trim());
  const colIndex = (name: string): number => {
    // Match flexibly (with or without spaces/underscores)
    const normalized = name.toLowerCase().replace(/[\s_]/g, '');
    return headers.findIndex(h => h.toLowerCase().replace(/[\s_]/g, '') === normalized);
  };

  const col = {
    numContrat: colIndex('WnumContrat'),
    mat: colIndex('Wmat'),
    codeType: colIndex('WcodeType'),
    rangPrest: colIndex('WrangPrest'),
    nomPrenPrest: colIndex('WnomPrenPrest'),
    typePiece: colIndex('WcodeTypePieceIdentite'),
    numPiece: colIndex('WnumPieceIdentite'),
    datNais: colIndex('WdatNais'),
    situationFam: colIndex('WcodeSituationFam'),
    sexe: colIndex('WcodSexe'),
    natureOrg: colIndex('WcodeNatureOrganisme'),
    codeOrg: colIndex('WcodeOrganisme'),
    datDebAdh: colIndex('WdatDebAdh'),
    dateMariage: colIndex('WdateMariage'),
    rib: colIndex('Wrib'),
    maladieCronique: colIndex('WMALADIECRONIQUE'),
    handicap: colIndex('WHANDICAP'),
    datFinAdh: colIndex('WdatFinAdh'),
    tel: colIndex('Wtel'),
    rue: colIndex('Wrue'),
    ville: colIndex('Wville'),
    codPost: colIndex('WcodPost'),
    codTypMaj: colIndex('WcodTypMaj'),
    codMaj: colIndex('WcodMaj'),
    datMaj: colIndex('WdatMaj'),
  };

  const adherents: AcoradAdherent[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const get = (idx: number) => (idx >= 0 && row[idx] != null ? String(row[idx]).trim() : '');

    const numContrat = get(col.numContrat);
    if (contractFilter && numContrat !== contractFilter) continue;

    const maladieCroniqueVal = get(col.maladieCronique).toUpperCase();
    const handicapVal = get(col.handicap).toUpperCase();

    adherents.push({
      numContrat,
      matricule: get(col.mat),
      codeType: get(col.codeType) || 'A',
      rangPres: Number(get(col.rangPrest)) || 0,
      nomPrenPrest: get(col.nomPrenPrest),
      typePieceIdentite: get(col.typePiece) || 'CIN',
      numPieceIdentite: get(col.numPiece),
      dateNaissance: parseAcoradDate(row[col.datNais]),
      situationFam: get(col.situationFam),
      sexe: get(col.sexe),
      codeNatureOrganisme: get(col.natureOrg),
      codeOrganisme: get(col.codeOrg),
      dateDebutAdh: parseAcoradDate(row[col.datDebAdh]),
      dateMarriage: parseAcoradDate(row[col.dateMariage]),
      rib: get(col.rib),
      maladieCronique: maladieCroniqueVal === 'O' || maladieCroniqueVal === 'OUI' || maladieCroniqueVal === '1',
      handicap: handicapVal === 'O' || handicapVal === 'OUI' || handicapVal === '1',
      dateFinAdh: parseAcoradDate(row[col.datFinAdh]),
      telephone: get(col.tel),
      rue: get(col.rue),
      ville: get(col.ville),
      codePostal: get(col.codPost),
      codTypMaj: get(col.codTypMaj),
      codMaj: get(col.codMaj),
      dateMaj: parseAcoradDate(row[col.datMaj]),
    });
  }

  console.log(`  ✓ ${adherents.length} lignes parsées`);
  return adherents;
}

// ============================================================
// Parse SPROLS (bulletin/bordereau history)
// ============================================================

interface AcoradBulletin {
  numContrat: string;
  matricule: string;
  rangPres: number;
  nomPrenPrest: string;
  dateBs: string | null;
  refBsPhysAss: string;
  refBsPhysClt: string;
  refBordClt: string;
  dateActe: string | null;
  codeActe: string;
  fraisEngages: number;
  montantRevise: number;
  nbrCle: number;
  montantActeRemb: number;
  montantRedIfAvanc: number;
  montantActeARegler: number;
  codMsgr: string;
  libMsgr: string;
  refProfSant: string;
  nomProfSant: string;
  typeBs: string;
  statBs: string;
  motifStatBs: string;
  rangBs: number;
  nomAdh: string;
  codSoc: string;
  statutBord: string;
}

function parseSprols(filePath: string, contractFilter?: string): AcoradBulletin[] {
  console.log(`\n📄 Parsing SPROLS: ${path.basename(filePath)}`);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb?.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  if (rows.length < 2) {
    console.log('  ⚠ Fichier vide');
    return [];
  }

  const headers = (rows[0] || []).map((h: any) => String(h).trim());
  const colIndex = (name: string): number => {
    const normalized = name.toLowerCase().replace(/[\s_]/g, '');
    return headers.findIndex(h => h.toLowerCase().replace(/[\s_]/g, '') === normalized);
  };

  const col = {
    numCont: colIndex('NumCont'),
    mat: colIndex('Mat'),
    rangPres: colIndex('RangPres'),
    nomPrenPrest: colIndex('NomPrenPrest'),
    datBs: colIndex('DatBs'),
    refBsPhysAss: colIndex('RefBsPhysAss'),
    refBsPhysClt: colIndex('RefBsPhysClt'),
    refBordClt: colIndex('RefBordClt'),
    datAct: colIndex('DatAct'),
    codAct: colIndex('CodAct'),
    fraisEngag: colIndex('FraisEngag'),
    mntRevise: colIndex('MntRevise'),
    nbrCle: colIndex('NbrCle'),
    mntActRemb: colIndex('MntActRemb'),
    mntRedIfAvanc: colIndex('MntRedIfAvanc'),
    mntActARegl: colIndex('MntActARegl'),
    codMsgr: colIndex('CodMsgr'),
    libMsgr: colIndex('LibMsgr'),
    refProfSant: colIndex('RefProfSant'),
    nomProfSant: colIndex('NomProfSant'),
    typBs: colIndex('TypBs'),
    statBs: colIndex('StatBs'),
    motifStatBs: colIndex('MotifStatBs'),
    rangBs: colIndex('RangBs'),
    nomAdh: colIndex('NomAdh'),
    codSoc: colIndex('CodSoc'),
    statutBord: colIndex('STATUTBORD'),
  };

  const bulletins: AcoradBulletin[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const get = (idx: number) => (idx >= 0 && row[idx] != null ? String(row[idx]).trim() : '');
    const getNum = (idx: number) => (idx >= 0 && row[idx] != null ? Number(row[idx]) || 0 : 0);

    const numContrat = get(col.numCont);
    if (contractFilter && numContrat !== contractFilter) continue;

    bulletins.push({
      numContrat,
      matricule: get(col.mat),
      rangPres: Number(get(col.rangPres)) || 0,
      nomPrenPrest: get(col.nomPrenPrest),
      dateBs: parseAcoradDate(row[col.datBs]),
      refBsPhysAss: get(col.refBsPhysAss),
      refBsPhysClt: get(col.refBsPhysClt),
      refBordClt: get(col.refBordClt),
      dateActe: parseAcoradDate(row[col.datAct]),
      codeActe: get(col.codAct),
      fraisEngages: getNum(col.fraisEngag),
      montantRevise: getNum(col.mntRevise),
      nbrCle: getNum(col.nbrCle),
      montantActeRemb: getNum(col.mntActRemb),
      montantRedIfAvanc: getNum(col.mntRedIfAvanc),
      montantActeARegler: getNum(col.mntActARegl),
      codMsgr: get(col.codMsgr),
      libMsgr: get(col.libMsgr),
      refProfSant: get(col.refProfSant),
      nomProfSant: get(col.nomProfSant),
      typeBs: get(col.typBs),
      statBs: get(col.statBs),
      motifStatBs: get(col.motifStatBs),
      rangBs: Number(get(col.rangBs)) || 0,
      nomAdh: get(col.nomAdh),
      codSoc: get(col.codSoc),
      statutBord: get(col.statutBord),
    });
  }

  console.log(`  ✓ ${bulletins.length} lignes parsées`);
  return bulletins;
}

// ============================================================
// Parse CTRL (control/reconciliation summary)
// ============================================================

interface AcoradCtrl {
  numContrat: string;
  souscripteur: string;
  numBordereau: string;
  matriculeIsante: string;
  matriculeAssureur: string;
  nom: string;
  prenom: string;
  rib: string;
  remboursement: number;
}

function parseCtrl(filePath: string): AcoradCtrl[] {
  console.log(`\n📄 Parsing CTRL: ${path.basename(filePath)}`);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb?.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  if (rows.length < 2) {
    console.log('  ⚠ Fichier vide');
    return [];
  }

  const headers = (rows[0] || []).map((h: any) => String(h).trim());
  const colIndex = (name: string): number => {
    const normalized = name.toLowerCase().replace(/[\s_]/g, '');
    return headers.findIndex(h => h.toLowerCase().replace(/[\s_]/g, '') === normalized);
  };

  const col = {
    numContrat: colIndex('NumeroDeContrat'),
    souscripteur: colIndex('Souscripteur'),
    numBordereau: colIndex('NumeroDeBordereau'),
    matIsante: colIndex('MatriculeIsante'),
    matAssureur: colIndex('MatriculeAssureur'),
    nom: colIndex('Nom'),
    prenom: colIndex('Prenom'),
    rib: colIndex('Rib'),
    remb: colIndex('Remb'),
  };

  const ctrls: AcoradCtrl[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;

    const get = (idx: number) => (idx >= 0 && row[idx] != null ? String(row[idx]).trim() : '');

    ctrls.push({
      numContrat: get(col.numContrat),
      souscripteur: get(col.souscripteur),
      numBordereau: get(col.numBordereau),
      matriculeIsante: get(col.matIsante),
      matriculeAssureur: get(col.matAssureur),
      nom: get(col.nom),
      prenom: get(col.prenom),
      rib: get(col.rib),
      remboursement: Number(get(col.remb)) || 0,
    });
  }

  console.log(`  ✓ ${ctrls.length} lignes parsées`);
  return ctrls;
}

// ============================================================
// Split name into firstName / lastName
// ============================================================

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  // Last word = first name, rest = last name (convention tunisienne)
  const firstName = parts[parts.length - 1];
  const lastName = parts.slice(0, -1).join(' ');
  return { firstName, lastName };
}

// ============================================================
// Group adherents by family (matricule)
// ============================================================

interface FamilyGroup {
  matricule: string;
  principal: AcoradAdherent;
  conjoint?: AcoradAdherent;
  enfants: AcoradAdherent[];
}

function groupByFamily(adherents: AcoradAdherent[]): FamilyGroup[] {
  const groups = new Map<string, FamilyGroup>();

  for (const adh of adherents) {
    const mat = adh.matricule;
    if (!groups.has(mat)) {
      groups.set(mat, {
        matricule: mat,
        principal: adh,
        enfants: [],
      });
    }

    const group = groups.get(mat)!;
    const type = (adh.codeType || 'A').toUpperCase();

    if (type === 'A' || adh.rangPres === 0) {
      group.principal = adh;
    } else if (type === 'C' || adh.rangPres === 99) {
      group.conjoint = adh;
    } else {
      group.enfants.push(adh);
    }
  }

  return Array.from(groups.values());
}

// ============================================================
// Import adherents into D1
// ============================================================

function importAdherents(
  families: FamilyGroup[],
  dbName: string,
  remote: boolean,
  dryRun: boolean,
  companyId?: string,
): { inserted: number; skipped: number; errors: string[] } {
  console.log(`\n🔄 Import adhérents dans ${dbName}...`);
  const stats = { inserted: 0, skipped: 0, errors: [] as string[] };
  const now = new Date().toISOString();

  for (const family of families) {
    const principal = family.principal;
    const { firstName, lastName } = splitName(principal.nomPrenPrest);

    // Check if adherent already exists by matricule
    if (!dryRun) {
      const existing = queryD1(
        dbName,
        `SELECT id FROM adherents WHERE matricule = ${escapeValue(family.matricule)} AND deleted_at IS NULL`,
        remote,
      );
      if (existing.length > 0) {
        stats.skipped++;
        continue;
      }
    }

    const principalId = generateId();
    const gender = principal.sexe === 'M' ? 'M' : principal.sexe === 'F' ? 'F' : null;
    const etatCivil = SITUATION_FAM_MAP[principal.situationFam] || null;

    const sql = `INSERT INTO adherents (
      id, first_name, last_name, date_of_birth, gender,
      matricule, company_id, code_type, rang_pres, code_situation_fam,
      type_piece_identite, national_id_encrypted, national_id_hash,
      date_debut_adhesion, date_fin_adhesion, date_mariage,
      rib_encrypted, maladie_chronique, handicap,
      phone_encrypted, rue, city, postal_code,
      plafond_global, is_active, etat_civil, etat_fiche,
      created_at, updated_at
    ) VALUES (
      ${escapeValue(principalId)}, ${escapeValue(firstName)}, ${escapeValue(lastName)},
      ${escapeValue(principal.dateNaissance)}, ${escapeValue(gender)},
      ${escapeValue(family.matricule)}, ${escapeValue(companyId)},
      'A', 0, ${escapeValue(etatCivil)},
      ${escapeValue(principal.typePieceIdentite || 'CIN')},
      ${escapeValue(principal.numPieceIdentite ? `LEGACY_${principal.numPieceIdentite}` : null)},
      ${escapeValue(principal.numPieceIdentite ? `HASH_${principal.numPieceIdentite}` : null)},
      ${escapeValue(principal.dateDebutAdh)}, ${escapeValue(principal.dateFinAdh)},
      ${escapeValue(principal.dateMarriage)},
      ${escapeValue(principal.rib ? `LEGACY_${principal.rib}` : null)},
      ${principal.maladieCronique ? 1 : 0}, ${principal.handicap ? 1 : 0},
      ${escapeValue(principal.telephone ? `LEGACY_${principal.telephone}` : null)},
      ${escapeValue(principal.rue)}, ${escapeValue(principal.ville)}, ${escapeValue(principal.codePostal)},
      6000000, 1, ${escapeValue(etatCivil)}, 'NON_TEMPORAIRE',
      ${escapeValue(now)}, ${escapeValue(now)}
    )`;

    if (dryRun) {
      console.log(`  [DRY] ${family.matricule} - ${lastName} ${firstName} (${family.enfants.length} enfants${family.conjoint ? ', conjoint' : ''})`);
      stats.inserted++;
    } else {
      const result = executeD1(dbName, sql, remote);
      if (result.includes('Error') || result === '') {
        stats.errors.push(`Matricule ${family.matricule}: échec insertion principal`);
        continue;
      }
      stats.inserted++;
    }

    // Import conjoint
    if (family.conjoint) {
      const conj = family.conjoint;
      const { firstName: cFirstName, lastName: cLastName } = splitName(conj.nomPrenPrest);
      const conjId = generateId();
      const conjGender = conj.sexe === 'M' ? 'M' : conj.sexe === 'F' ? 'F' : null;

      const conjSql = `INSERT INTO adherents (
        id, first_name, last_name, date_of_birth, gender,
        matricule, company_id, code_type, rang_pres, parent_adherent_id,
        type_piece_identite, national_id_encrypted, national_id_hash,
        date_debut_adhesion, date_fin_adhesion,
        maladie_chronique, handicap, is_active, etat_fiche,
        created_at, updated_at
      ) VALUES (
        ${escapeValue(conjId)}, ${escapeValue(cFirstName)}, ${escapeValue(cLastName)},
        ${escapeValue(conj.dateNaissance)}, ${escapeValue(conjGender)},
        ${escapeValue(family.matricule)}, ${escapeValue(companyId)},
        'C', 99, ${escapeValue(principalId)},
        ${escapeValue(conj.typePieceIdentite || 'CIN')},
        ${escapeValue(conj.numPieceIdentite ? `LEGACY_${conj.numPieceIdentite}` : null)},
        ${escapeValue(conj.numPieceIdentite ? `HASH_${conj.numPieceIdentite}` : null)},
        ${escapeValue(conj.dateDebutAdh)}, ${escapeValue(conj.dateFinAdh)},
        ${conj.maladieCronique ? 1 : 0}, ${conj.handicap ? 1 : 0},
        1, 'NON_TEMPORAIRE',
        ${escapeValue(now)}, ${escapeValue(now)}
      )`;

      if (!dryRun) {
        executeD1(dbName, conjSql, remote);
      }
    }

    // Import enfants
    for (const enfant of family.enfants) {
      const { firstName: eFirstName, lastName: eLastName } = splitName(enfant.nomPrenPrest);
      const enfantId = generateId();
      const enfGender = enfant.sexe === 'M' ? 'M' : enfant.sexe === 'F' ? 'F' : null;

      const enfSql = `INSERT INTO adherents (
        id, first_name, last_name, date_of_birth, gender,
        matricule, company_id, code_type, rang_pres, parent_adherent_id,
        type_piece_identite, national_id_encrypted, national_id_hash,
        date_debut_adhesion, date_fin_adhesion,
        maladie_chronique, handicap, is_active, etat_fiche,
        created_at, updated_at
      ) VALUES (
        ${escapeValue(enfantId)}, ${escapeValue(eFirstName)}, ${escapeValue(eLastName)},
        ${escapeValue(enfant.dateNaissance)}, ${escapeValue(enfGender)},
        ${escapeValue(family.matricule)}, ${escapeValue(companyId)},
        'E', ${enfant.rangPres}, ${escapeValue(principalId)},
        ${escapeValue(enfant.typePieceIdentite || 'CIN')},
        ${escapeValue(enfant.numPieceIdentite ? `LEGACY_${enfant.numPieceIdentite}` : null)},
        ${escapeValue(enfant.numPieceIdentite ? `HASH_${enfant.numPieceIdentite}` : null)},
        ${escapeValue(enfant.dateDebutAdh)}, ${escapeValue(enfant.dateFinAdh)},
        ${enfant.maladieCronique ? 1 : 0}, ${enfant.handicap ? 1 : 0},
        1, 'NON_TEMPORAIRE',
        ${escapeValue(now)}, ${escapeValue(now)}
      )`;

      if (!dryRun) {
        executeD1(dbName, enfSql, remote);
      }
    }
  }

  return stats;
}

// ============================================================
// Import bulletins/bordereaux into D1
// ============================================================

function importBulletins(
  bulletins: AcoradBulletin[],
  dbName: string,
  remote: boolean,
  dryRun: boolean,
): { inserted: number; skipped: number; errors: string[] } {
  console.log(`\n🔄 Import bulletins dans ${dbName}...`);
  const stats = { inserted: 0, skipped: 0, errors: [] as string[] };
  const now = new Date().toISOString();

  // Group bulletins by ref_bs_phys_ass (physical bulletin reference)
  const byRef = new Map<string, AcoradBulletin[]>();
  for (const b of bulletins) {
    const ref = b.refBsPhysAss || `${b.matricule}_${b.dateBs}_${b.rangPres}`;
    if (!byRef.has(ref)) byRef.set(ref, []);
    byRef.get(ref)!.push(b);
  }

  for (const [ref, actes] of byRef) {
    const first = actes[0];
    const bulletinId = generateId();

    // Find adherent by matricule
    let adherentId: string | null = null;
    if (!dryRun) {
      const adherents = queryD1(
        dbName,
        `SELECT id FROM adherents WHERE matricule = ${escapeValue(first.matricule)} AND code_type = 'A' AND deleted_at IS NULL LIMIT 1`,
        remote,
      );
      adherentId = adherents[0]?.id || null;

      if (!adherentId) {
        stats.skipped++;
        continue;
      }
    }

    // Calculate totals
    const totalAmount = actes.reduce((sum, a) => sum + a.fraisEngages, 0);
    const reimbursedAmount = actes.reduce((sum, a) => sum + a.montantActeRemb, 0);

    // Determine care_type from first acte code
    const careType = first.codeActe || 'consultation';

    // Map status
    const statusMap: Record<string, string> = {
      'En cours de reglement': 'approved',
      '(Voir Obs)': 'pending',
    };
    const status = statusMap[first.statutBord] || 'draft';

    const bulletinSql = `INSERT INTO bulletins_soins (
      id, adherent_id, bulletin_number, bulletin_date, care_type, status,
      total_amount, reimbursed_amount, rang_bs,
      ref_bs_phys_ass, ref_bs_phys_clt,
      cod_msgr, lib_msgr,
      created_at, updated_at
    ) VALUES (
      ${escapeValue(bulletinId)}, ${escapeValue(adherentId)},
      ${escapeValue(ref)}, ${escapeValue(first.dateBs)},
      ${escapeValue(careType)}, ${escapeValue(status)},
      ${totalAmount}, ${reimbursedAmount}, ${first.rangBs},
      ${escapeValue(first.refBsPhysAss)}, ${escapeValue(first.refBsPhysClt)},
      ${escapeValue(first.codMsgr)}, ${escapeValue(first.libMsgr)},
      ${escapeValue(now)}, ${escapeValue(now)}
    )`;

    if (dryRun) {
      console.log(`  [DRY] Bulletin ${ref}: ${actes.length} acte(s), total=${totalAmount}`);
      stats.inserted++;
      continue;
    }

    const result = executeD1(dbName, bulletinSql, remote);
    if (result.includes('Error') || result === '') {
      stats.errors.push(`Bulletin ${ref}: échec insertion`);
      continue;
    }

    // Insert actes for this bulletin
    for (const acte of actes) {
      const acteId = generateId();
      const acteSql = `INSERT INTO actes_bulletin (
        id, bulletin_id, code_acte, date_acte, nature_acte,
        montant_engage, montant_revise, montant_rembourse, montant_a_regler,
        nbr_cle, ref_prof_sant, nom_prof_sant,
        cod_msgr, lib_msgr,
        created_at, updated_at
      ) VALUES (
        ${escapeValue(acteId)}, ${escapeValue(bulletinId)},
        ${escapeValue(acte.codeActe)}, ${escapeValue(acte.dateActe)},
        ${escapeValue(acte.codeActe)},
        ${acte.fraisEngages}, ${acte.montantRevise},
        ${acte.montantActeRemb}, ${acte.montantActeARegler},
        ${acte.nbrCle}, ${escapeValue(acte.refProfSant)}, ${escapeValue(acte.nomProfSant)},
        ${escapeValue(acte.codMsgr)}, ${escapeValue(acte.libMsgr)},
        ${escapeValue(now)}, ${escapeValue(now)}
      )`;
      executeD1(dbName, acteSql, remote);
    }

    stats.inserted++;
  }

  return stats;
}

// ============================================================
// Validation report (using CTRL data)
// ============================================================

function validateImport(
  ctrls: AcoradCtrl[],
  dbName: string,
  remote: boolean,
): void {
  console.log(`\n✅ Validation croisée avec CTRL...`);

  let matched = 0;
  let mismatched = 0;

  for (const ctrl of ctrls) {
    if (!ctrl.matriculeIsante && !ctrl.nom) continue;

    const adherents = queryD1(
      dbName,
      `SELECT id, first_name, last_name, matricule FROM adherents WHERE matricule = ${escapeValue(ctrl.matriculeIsante)} AND code_type = 'A' AND deleted_at IS NULL LIMIT 1`,
      remote,
    );

    if (adherents.length > 0) {
      matched++;
    } else {
      mismatched++;
      console.log(`  ⚠ Non trouvé: matricule=${ctrl.matriculeIsante} nom=${ctrl.nom} ${ctrl.prenom}`);
    }
  }

  console.log(`  Résultat: ${matched} trouvés, ${mismatched} manquants sur ${ctrls.length} total`);
}

// ============================================================
// Main
// ============================================================

async function main() {
  const config = parseArgs();
  const tenantConfig = TENANTS[config.tenant];
  const dbName = tenantConfig.dbName;

  console.log('╔══════════════════════════════════════════════════╗');
  console.log(`║  Import Acorad → Dhamen (${config.tenant})                  `);
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║  Tenant:    ${config.tenant}`);
  console.log(`║  Database:  ${dbName}`);
  console.log(`║  Dossier:   ${config.dir}`);
  console.log(`║  Mode:      ${config.remote ? 'REMOTE' : 'LOCAL'}${config.dryRun ? ' (DRY RUN)' : ''}`);
  if (config.companyId) console.log(`║  Company:   ${config.companyId}`);
  if (config.contractFilter) console.log(`║  Contrat:   ${config.contractFilter}`);
  console.log('╚══════════════════════════════════════════════════╝');

  // Discover Excel files
  const files = findExcelFiles(config.dir);

  if (!files.majsprols && !files.sprols) {
    console.error('\n✗ Aucun fichier MAJSPROLS ou SPROLS trouvé dans le dossier');
    console.log('  Fichiers attendus: MAJSPROLS_*.xlsx, SPROLS_*.xlsx, CTRL_*.xlsx');
    process.exit(1);
  }

  // ---- Phase 1: Parse all files ----
  console.log('\n═══════ Phase 1: Parsing des fichiers Excel ═══════');

  let adherents: AcoradAdherent[] = [];
  let bulletins: AcoradBulletin[] = [];
  let ctrls: AcoradCtrl[] = [];

  if (files.majsprols) {
    adherents = parseMajsprols(files.majsprols, config.contractFilter);
  }
  if (files.sprols) {
    bulletins = parseSprols(files.sprols, config.contractFilter);
  }
  if (files.ctrl) {
    ctrls = parseCtrl(files.ctrl);
  }

  // ---- Phase 2: Group and analyze ----
  console.log('\n═══════ Phase 2: Analyse des données ═══════');

  const families = groupByFamily(adherents);
  const principaux = families.length;
  const conjoints = families.filter(f => f.conjoint).length;
  const enfantsCount = families.reduce((s, f) => s + f.enfants.length, 0);

  console.log(`\n  Familles:    ${principaux}`);
  console.log(`  Principaux:  ${principaux}`);
  console.log(`  Conjoints:   ${conjoints}`);
  console.log(`  Enfants:     ${enfantsCount}`);
  console.log(`  Total:       ${principaux + conjoints + enfantsCount}`);
  console.log(`  Bulletins:   ${bulletins.length} lignes`);
  console.log(`  CTRL:        ${ctrls.length} lignes`);

  // ---- Phase 3: Import ----
  console.log('\n═══════ Phase 3: Import dans D1 ═══════');

  if (adherents.length > 0) {
    const adhStats = importAdherents(families, dbName, config.remote, config.dryRun, config.companyId);
    console.log(`\n  Adhérents: ${adhStats.inserted} insérés, ${adhStats.skipped} ignorés (doublons), ${adhStats.errors.length} erreurs`);
    for (const err of adhStats.errors) {
      console.log(`    ✗ ${err}`);
    }
  }

  if (bulletins.length > 0) {
    const bulStats = importBulletins(bulletins, dbName, config.remote, config.dryRun);
    console.log(`\n  Bulletins: ${bulStats.inserted} insérés, ${bulStats.skipped} ignorés, ${bulStats.errors.length} erreurs`);
    for (const err of bulStats.errors) {
      console.log(`    ✗ ${err}`);
    }
  }

  // ---- Phase 4: Validation ----
  if (ctrls.length > 0 && !config.dryRun) {
    console.log('\n═══════ Phase 4: Validation ═══════');
    validateImport(ctrls, dbName, config.remote);
  }

  console.log('\n✅ Import terminé.');
  if (config.dryRun) {
    console.log('   (Mode DRY RUN — aucune donnée insérée)');
  }
}

main().catch((err) => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
