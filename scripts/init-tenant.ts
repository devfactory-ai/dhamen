/**
 * Initialize a new tenant (assureur)
 *
 * This script sets up everything needed for a new insurer tenant:
 *   1. Creates D1 database (if --create-db)
 *   2. Runs all migrations
 *   3. Seeds reference data (acts, families, barèmes)
 *   4. Creates default admin users
 *   5. Creates the company (société souscriptrice)
 *   6. Optionally imports legacy Acorad data
 *
 * Usage:
 *   npx tsx scripts/init-tenant.ts --tenant AMI [--remote] [--create-db] [--import-dir ./dossier]
 *
 * Options:
 *   --tenant <CODE>       Tenant code (STAR, GAT, COMAR, AMI)
 *   --remote              Execute against remote D1 (default: local)
 *   --create-db           Create the D1 database first
 *   --import-dir <PATH>   Also import Acorad Excel data from this directory
 *   --company-name <NAME> Company/société name (required for import)
 *   --company-code <CODE> Company/société code (e.g., SPROLS)
 *   --contract-num <NUM>  Contract number for the company
 */

import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as path from 'path';

// ============================================================
// Configuration
// ============================================================

const ACCOUNT_ID = '6435a77d3ce17b7de468c6618e7b2b14';

interface TenantConfig {
  code: string;
  insurerId: string;
  dbName: string;
  insurerName: string;
}

const TENANTS: Record<string, TenantConfig> = {
  STAR: { code: 'STAR', insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8C9', dbName: 'dhamen-star', insurerName: 'STAR Assurances' },
  GAT: { code: 'GAT', insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8D0', dbName: 'dhamen-gat', insurerName: 'GAT Assurances' },
  COMAR: { code: 'COMAR', insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8E1', dbName: 'dhamen-comar', insurerName: 'COMAR Assurances' },
  AMI: { code: 'AMI', insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8F2', dbName: 'dhamen-ami', insurerName: 'AMI Assurances' },
};

// ============================================================
// CLI argument parsing
// ============================================================

function parseArgs() {
  const args = process.argv.slice(2);
  let tenant = '';
  let remote = false;
  let createDb = false;
  let importDir: string | undefined;
  let companyName: string | undefined;
  let companyCode: string | undefined;
  let contractNum: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--tenant': tenant = (args[++i] || '').toUpperCase(); break;
      case '--remote': remote = true; break;
      case '--create-db': createDb = true; break;
      case '--import-dir': importDir = args[++i]; break;
      case '--company-name': companyName = args[++i]; break;
      case '--company-code': companyCode = args[++i]; break;
      case '--contract-num': contractNum = args[++i]; break;
    }
  }

  if (!tenant || !TENANTS[tenant]) {
    console.error(`Erreur: --tenant requis. Valeurs: ${Object.keys(TENANTS).join(', ')}`);
    process.exit(1);
  }

  return { tenant, remote, createDb, importDir, companyName, companyCode, contractNum };
}

// ============================================================
// Helpers
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

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, 'sha256').toString('hex');
  return `${salt}:${iterations}:${hash}`;
}

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
    console.error(`  ✗ Erreur SQL:`, error.message?.split('\n')[0]);
    return '';
  }
}

function escapeValue(val: any): string {
  if (val === null || val === undefined || val === '') return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  return `'${String(val).replace(/'/g, "''")}'`;
}

// ============================================================
// Step 1: Create D1 database
// ============================================================

function createDatabase(dbName: string): void {
  console.log(`\n📦 Étape 1: Création base D1 "${dbName}"...`);
  try {
    const result = execSync(
      `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler d1 create ${dbName}`,
      { encoding: 'utf-8' },
    );
    console.log(result);
    console.log('  ✓ Base créée');
    console.log('  ⚠ IMPORTANT: Mettez à jour le database_id dans wrangler.toml');
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      console.log('  ⚠ Base existe déjà, on continue');
    } else {
      console.error('  ✗ Erreur:', error.message?.split('\n')[0]);
    }
  }
}

// ============================================================
// Step 2: Run migrations
// ============================================================

function runMigrations(dbName: string, remote: boolean): void {
  console.log(`\n📋 Étape 2: Exécution des migrations...`);
  const remoteFlag = remote ? '--remote' : '--local';
  try {
    const cmd = remote
      ? `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler d1 migrations apply ${dbName} ${remoteFlag}`
      : `npx wrangler d1 migrations apply ${dbName} ${remoteFlag}`;
    const result = execSync(cmd, {
      encoding: 'utf-8',
      cwd: path.resolve(__dirname, '..', 'apps', 'api'),
      maxBuffer: 50 * 1024 * 1024,
    });
    console.log(result.split('\n').filter(l => l.includes('✅') || l.includes('applied') || l.includes('migration')).join('\n'));
    console.log('  ✓ Migrations appliquées');
  } catch (error: any) {
    console.error('  ✗ Erreur migrations:', error.message?.split('\n').slice(0, 3).join('\n'));
  }
}

// ============================================================
// Step 3: Seed reference data
// ============================================================

function seedReferenceData(dbName: string, remote: boolean, tenantConfig: TenantConfig): void {
  console.log(`\n🌱 Étape 3: Données de référence...`);

  // Insert insurer
  console.log('  → Assureur...');
  executeD1(dbName, `INSERT OR IGNORE INTO insurers (
    id, name, code, is_active, created_at, updated_at
  ) VALUES (
    ${escapeValue(tenantConfig.insurerId)}, ${escapeValue(tenantConfig.insurerName)},
    ${escapeValue(tenantConfig.code)}, 1,
    datetime('now'), datetime('now')
  )`, remote);

  // Verify familles_actes exist (should be created by migrations)
  const familles = [
    { code: 'FA0001', label: 'Consultations et Visites', ordre: 1 },
    // FA0002 merged into FA0009 (migration 0147)
    { code: 'FA0003', label: 'Frais pharmaceutiques', ordre: 3 },
    { code: 'FA0004', label: 'Analyses', ordre: 4 },
    { code: 'FA0005', label: 'Orthopédie et prothèses non dentaires', ordre: 5 },
    { code: 'FA0006', label: 'Optique', ordre: 6 },
    { code: 'FA0007', label: 'Hospitalisation en clinique', ordre: 7 },
    { code: 'FA0009', label: 'Actes spécialistes et pratique médicale courante', ordre: 8 },
    { code: 'FA0010', label: 'Frais chirurgicaux y compris accessoires', ordre: 9 },
    { code: 'FA0011', label: 'Soins dentaires', ordre: 10 },
    { code: 'FA0012', label: 'Maternité', ordre: 11 },
    { code: 'FA0013', label: 'Cures thermales', ordre: 12 },
    { code: 'FA0014', label: 'Frais funéraires / Orthodontie', ordre: 13 },
    { code: 'FA0015', label: 'Circoncision', ordre: 14 },
    { code: 'FA0016', label: 'Transport du malade', ordre: 15 },
    { code: 'FA0017', label: 'Radiologie', ordre: 16 },
    { code: 'FA0018', label: 'Frais de soins à l étranger', ordre: 17 },
    { code: 'FA0019', label: 'Aide', ordre: 18 },
    { code: 'FA0020', label: 'Non remboursable', ordre: 19 },
  ];

  console.log('  → Familles d\'actes...');
  for (const f of familles) {
    executeD1(dbName, `INSERT OR IGNORE INTO familles_actes (
      id, code, label, ordre, created_at, updated_at
    ) VALUES (
      ${escapeValue(generateId())}, ${escapeValue(f.code)}, ${escapeValue(f.label)},
      ${f.ordre}, datetime('now'), datetime('now')
    )`, remote);
  }

  // Seed actes referentiel
  const actes = [
    { code: 'C1', label: 'Consultation généraliste', famille: 'FA0001' },
    { code: 'C2', label: 'Consultation spécialiste', famille: 'FA0001' },
    { code: 'C3', label: 'Consultation professeur', famille: 'FA0001' },
    { code: 'V1', label: 'Visite généraliste', famille: 'FA0001' },
    { code: 'V2', label: 'Visite spécialiste', famille: 'FA0001' },
    { code: 'V3', label: 'Visite professeur', famille: 'FA0001' },
    { code: 'PH1', label: 'Frais pharmaceutiques', famille: 'FA0003' },
    { code: 'AN', label: 'Analyses biologiques', famille: 'FA0004' },
    { code: 'R', label: 'Radiologie', famille: 'FA0017' },
    { code: 'SD', label: 'Soins dentaires', famille: 'FA0011' },
    { code: 'CL', label: 'Hospitalisation clinique', famille: 'FA0007' },
    { code: 'SO', label: 'Soins opératoires', famille: 'FA0010' },
    { code: 'ANE', label: 'Anesthésie', famille: 'FA0010' },
    { code: 'FCH', label: 'Frais chirurgicaux', famille: 'FA0010' },
    { code: 'TS', label: 'Traitements spéciaux (scanner, IRM)', famille: 'FA0006' },
    { code: 'ODF', label: 'Orthodontie', famille: 'FA0014' },
    { code: 'PUU', label: 'Produits à usage unique', famille: 'FA0010' },
    { code: 'KC', label: 'Frais chirurgicaux (coefficient)', famille: 'FA0010' },
    { code: 'PC', label: 'Pratiques courantes', famille: 'FA0006' },
    { code: 'AM', label: 'Auxiliaires médicaux', famille: 'FA0006' },
    { code: 'AMM', label: 'Injection insuline', famille: 'FA0006' },
  ];

  console.log('  → Actes référentiel...');
  for (const a of actes) {
    executeD1(dbName, `INSERT OR IGNORE INTO actes_referentiel (
      id, code, label, famille_code, is_active, created_at, updated_at
    ) VALUES (
      ${escapeValue(generateId())}, ${escapeValue(a.code)}, ${escapeValue(a.label)},
      ${escapeValue(a.famille)}, 1, datetime('now'), datetime('now')
    )`, remote);
  }

  console.log('  ✓ Données de référence insérées');
}

// ============================================================
// Step 4: Create admin users
// ============================================================

function createUsers(dbName: string, remote: boolean, tenantConfig: TenantConfig): void {
  console.log(`\n👤 Étape 4: Création utilisateurs admin...`);

  const year = new Date().getFullYear();
  const defaultPassword = `Dhamen@${year}!`;
  const hashedPassword = hashPassword(defaultPassword);

  const code = tenantConfig.code.toLowerCase();
  const users = [
    {
      email: `admin@${code}.com.tn`,
      firstName: 'Admin',
      lastName: tenantConfig.insurerName,
      role: 'INSURER_ADMIN',
    },
    {
      email: `agent@${code}.com.tn`,
      firstName: 'Agent',
      lastName: tenantConfig.insurerName,
      role: 'INSURER_AGENT',
    },
    {
      email: `gestionnaire@${code}.com.tn`,
      firstName: 'Gestionnaire',
      lastName: tenantConfig.insurerName,
      role: 'INSURER_AGENT',
    },
  ];

  for (const user of users) {
    const id = generateId();
    executeD1(dbName, `INSERT OR IGNORE INTO users (
      id, email, password_hash, first_name, last_name, role,
      insurer_id, is_active, created_at, updated_at
    ) VALUES (
      ${escapeValue(id)}, ${escapeValue(user.email)}, ${escapeValue(hashedPassword)},
      ${escapeValue(user.firstName)}, ${escapeValue(user.lastName)}, ${escapeValue(user.role)},
      ${escapeValue(tenantConfig.insurerId)}, 1,
      datetime('now'), datetime('now')
    )`, remote);
    console.log(`  ✓ ${user.role}: ${user.email}`);
  }

  console.log(`  ℹ Mot de passe par défaut: ${defaultPassword}`);
}

// ============================================================
// Step 5: Create company (société souscriptrice)
// ============================================================

function createCompany(
  dbName: string,
  remote: boolean,
  tenantConfig: TenantConfig,
  companyName?: string,
  companyCode?: string,
  contractNum?: string,
): string | null {
  if (!companyName) {
    console.log('\n🏢 Étape 5: Création société — ignorée (pas de --company-name)');
    return null;
  }

  console.log(`\n🏢 Étape 5: Création société "${companyName}"...`);

  const companyId = generateId();
  executeD1(dbName, `INSERT OR IGNORE INTO companies (
    id, name, code, insurer_id, is_active, created_at, updated_at
  ) VALUES (
    ${escapeValue(companyId)}, ${escapeValue(companyName)},
    ${escapeValue(companyCode || companyName.substring(0, 10).toUpperCase())},
    ${escapeValue(tenantConfig.insurerId)}, 1,
    datetime('now'), datetime('now')
  )`, remote);

  console.log(`  ✓ Société créée: ${companyName} (ID: ${companyId})`);

  // Create contract if specified
  if (contractNum) {
    const contractId = generateId();
    executeD1(dbName, `INSERT OR IGNORE INTO group_contracts (
      id, contract_number, company_id, insurer_id, plan_type,
      start_date, end_date, status, created_at, updated_at
    ) VALUES (
      ${escapeValue(contractId)}, ${escapeValue(contractNum)},
      ${escapeValue(companyId)}, ${escapeValue(tenantConfig.insurerId)},
      'GROUPE', '2025-01-01', '2026-12-31', 'ACTIVE',
      datetime('now'), datetime('now')
    )`, remote);
    console.log(`  ✓ Contrat groupe: ${contractNum}`);
  }

  return companyId;
}

// ============================================================
// Step 6: Import legacy data (optional)
// ============================================================

function importLegacyData(
  importDir: string,
  tenant: string,
  companyId: string | null,
  contractFilter?: string,
): void {
  console.log(`\n📥 Étape 6: Import données legacy Acorad...`);

  const args = [
    'npx', 'tsx', 'scripts/import-acorad.ts',
    '--tenant', tenant,
    '--dir', importDir,
    '--dry-run', // First do a dry run
  ];
  if (companyId) args.push('--company', companyId);
  if (contractFilter) args.push('--contract', contractFilter);

  console.log('  → Dry run (validation)...');
  try {
    const result = execSync(args.join(' '), {
      encoding: 'utf-8',
      cwd: path.resolve(__dirname, '..'),
      maxBuffer: 50 * 1024 * 1024,
    });
    console.log(result);
  } catch (error: any) {
    console.error('  ✗ Erreur dry run:', error.message?.split('\n')[0]);
    return;
  }

  // Real import (remove --dry-run)
  const realArgs = args.filter(a => a !== '--dry-run');
  console.log('\n  → Import réel...');
  try {
    const result = execSync(realArgs.join(' '), {
      encoding: 'utf-8',
      cwd: path.resolve(__dirname, '..'),
      maxBuffer: 50 * 1024 * 1024,
    });
    console.log(result);
  } catch (error: any) {
    console.error('  ✗ Erreur import:', error.message?.split('\n')[0]);
  }
}

// ============================================================
// Main
// ============================================================

async function main() {
  const config = parseArgs();
  const tenantConfig = TENANTS[config?.tenant]!;

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  Initialisation Tenant: ${tenantConfig.insurerName.padEnd(28)}║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Code:     ${tenantConfig.code.padEnd(40)}║`);
  console.log(`║  Database: ${tenantConfig.dbName.padEnd(40)}║`);
  console.log(`║  Mode:     ${(config.remote ? 'REMOTE' : 'LOCAL').padEnd(40)}║`);
  console.log('╚══════════════════════════════════════════════════════╝');

  // Step 1: Create DB
  if (config.createDb) {
    createDatabase(tenantConfig.dbName);
  }

  // Step 2: Run migrations
  runMigrations(tenantConfig.dbName, config.remote);

  // Step 3: Seed reference data
  seedReferenceData(tenantConfig.dbName, config.remote, tenantConfig);

  // Step 4: Create admin users
  createUsers(tenantConfig.dbName, config.remote, tenantConfig);

  // Step 5: Create company
  const companyId = createCompany(
    tenantConfig.dbName, config.remote, tenantConfig,
    config.companyName, config.companyCode, config.contractNum,
  );

  // Step 6: Import legacy data
  if (config.importDir) {
    importLegacyData(config.importDir, config.tenant, companyId, config.contractNum);
  }

  console.log('\n══════════════════════════════════════════════════════');
  console.log('✅ Initialisation terminée !');
  console.log('══════════════════════════════════════════════════════');
  console.log('\nProchaines étapes:');
  if (config.createDb) {
    console.log('  1. Mettre à jour le database_id dans apps/api/wrangler.toml');
  }
  if (!config.importDir) {
    console.log('  2. Importer les données legacy:');
    console.log(`     npx tsx scripts/import-acorad.ts --tenant ${config.tenant} --dir ./dossier`);
  }
  console.log(`  3. Tester la connexion: curl http://localhost:8787/api/v1/auth/login`);
  console.log(`     Email: admin@${tenantConfig.code.toLowerCase()}.com.tn`);
  console.log(`     Pass:  Dhamen@${new Date().getFullYear()}!`);
}

main().catch((err) => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
