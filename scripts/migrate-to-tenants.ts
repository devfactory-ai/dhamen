/**
 * Migration Script: Migrate data from legacy DB to tenant-specific databases
 *
 * This script:
 * 1. Exports data from the legacy DB filtered by insurer_id
 * 2. Imports into the corresponding tenant D1 database
 *
 * Usage: npx tsx scripts/migrate-to-tenants.ts
 */

import { execSync } from 'child_process';

// Tenant configuration
const TENANTS = [
  {
    code: 'STAR',
    insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8C9',
    dbName: 'dhamen-star',
  },
  {
    code: 'GAT',
    insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8D0',
    dbName: 'dhamen-gat',
  },
  {
    code: 'COMAR',
    insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8E1',
    dbName: 'dhamen-comar',
  },
  {
    code: 'AMI',
    insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8F2',
    dbName: 'dhamen-ami',
  },
];

const LEGACY_DB = 'dhamen-db';
const ACCOUNT_ID = '6435a77d3ce17b7de468c6618e7b2b14';

function executeD1(dbName: string, sql: string): string {
  const escapedSql = sql.replace(/"/g, '\\"').replace(/\n/g, ' ');
  try {
    const result = execSync(
      `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler d1 execute ${dbName} --remote --command "${escapedSql}"`,
      { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
    );
    return result;
  } catch (error: any) {
    console.error(`Error executing SQL on ${dbName}:`, error.message?.split('\n')[0]);
    return '';
  }
}

function queryD1(dbName: string, sql: string): any[] {
  const result = executeD1(dbName, sql);
  try {
    const match = result.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      return parsed[0]?.results || [];
    }
  } catch (e) {
    // No results
  }
  return [];
}

function escapeValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function migrateInsurer(tenant: typeof TENANTS[0]) {
  console.log(`\n========== Migrating ${tenant.code} ==========`);

  // 1. Migrate the insurer record itself
  // Schema: id, name, code, tax_id, address, phone, email, config_json, is_active, created_at, updated_at, deleted_at
  console.log(`\n1. Migrating insurer record...`);
  const insurers = queryD1(LEGACY_DB, `SELECT * FROM insurers WHERE id = '${tenant.insurerId}'`);
  if (insurers.length > 0) {
    const i = insurers[0];
    const insertSql = `INSERT OR REPLACE INTO insurers (id, name, code, tax_id, address, phone, email, config_json, is_active, created_at, updated_at, deleted_at) VALUES (${escapeValue(i.id)}, ${escapeValue(i.name)}, ${escapeValue(i.code)}, ${escapeValue(i.tax_id)}, ${escapeValue(i.address)}, ${escapeValue(i.phone)}, ${escapeValue(i.email)}, ${escapeValue(i.config_json || '{}')}, ${i.is_active ?? 1}, ${escapeValue(i.created_at)}, ${escapeValue(i.updated_at)}, ${escapeValue(i.deleted_at)})`;
    executeD1(tenant.dbName, insertSql);
    console.log(`   ✓ Insurer ${tenant.code} migrated`);
  } else {
    console.log(`   ⚠ No insurer found for ${tenant.code}`);
  }

  // 2. Migrate users for this insurer
  // Schema: id, email, password_hash, role, provider_id, insurer_id, company_id, first_name, last_name, phone, mfa_enabled, mfa_secret, last_login_at, is_active, created_at, updated_at
  console.log(`\n2. Migrating users...`);
  const users = queryD1(LEGACY_DB, `SELECT * FROM users WHERE insurer_id = '${tenant.insurerId}'`);
  console.log(`   Found ${users.length} users to migrate`);
  for (const u of users) {
    const insertSql = `INSERT OR REPLACE INTO users (id, email, password_hash, role, provider_id, insurer_id, company_id, first_name, last_name, phone, mfa_enabled, mfa_secret, last_login_at, is_active, created_at, updated_at) VALUES (${escapeValue(u.id)}, ${escapeValue(u.email)}, ${escapeValue(u.password_hash)}, ${escapeValue(u.role)}, ${escapeValue(u.provider_id)}, ${escapeValue(u.insurer_id)}, ${escapeValue(u.company_id)}, ${escapeValue(u.first_name)}, ${escapeValue(u.last_name)}, ${escapeValue(u.phone)}, ${u.mfa_enabled ?? 0}, ${escapeValue(u.mfa_secret)}, ${escapeValue(u.last_login_at)}, ${u.is_active ?? 1}, ${escapeValue(u.created_at)}, ${escapeValue(u.updated_at)})`;
    executeD1(tenant.dbName, insertSql);
  }
  console.log(`   ✓ ${users.length} users migrated`);

  // 3. Migrate adherents for this insurer
  // Schema: id, national_id_encrypted, first_name, last_name, date_of_birth, gender, phone_encrypted, email, address, city, lat, lng, created_at, updated_at, deleted_at, module, matricule, formule_id, plafond_global, ayants_droit_json, company_name, company_id
  console.log(`\n3. Migrating adherents...`);
  // Get adherent IDs from contracts for this insurer
  const adherentIds = queryD1(LEGACY_DB, `SELECT DISTINCT adherent_id FROM contracts WHERE insurer_id = '${tenant.insurerId}'`);
  console.log(`   Found ${adherentIds.length} adherents via contracts`);
  for (const row of adherentIds) {
    if (!row.adherent_id) continue;
    const adherents = queryD1(LEGACY_DB, `SELECT * FROM adherents WHERE id = '${row.adherent_id}'`);
    if (adherents.length > 0) {
      const a = adherents[0];
      const insertSql = `INSERT OR REPLACE INTO adherents (id, national_id_encrypted, first_name, last_name, date_of_birth, gender, phone_encrypted, email, address, city, lat, lng, created_at, updated_at, deleted_at, module, matricule, formule_id, plafond_global, ayants_droit_json, company_name, company_id) VALUES (${escapeValue(a.id)}, ${escapeValue(a.national_id_encrypted)}, ${escapeValue(a.first_name)}, ${escapeValue(a.last_name)}, ${escapeValue(a.date_of_birth)}, ${escapeValue(a.gender)}, ${escapeValue(a.phone_encrypted)}, ${escapeValue(a.email)}, ${escapeValue(a.address)}, ${escapeValue(a.city)}, ${a.lat ?? 'NULL'}, ${a.lng ?? 'NULL'}, ${escapeValue(a.created_at)}, ${escapeValue(a.updated_at)}, ${escapeValue(a.deleted_at)}, ${escapeValue(a.module)}, ${escapeValue(a.matricule)}, ${escapeValue(a.formule_id)}, ${a.plafond_global ?? 0}, ${escapeValue(a.ayants_droit_json || '[]')}, ${escapeValue(a.company_name)}, ${escapeValue(a.company_id)})`;
      executeD1(tenant.dbName, insertSql);
    }
  }
  console.log(`   ✓ ${adherentIds.length} adherents migrated`);

  // 4. Migrate contracts for this insurer
  // Schema: id, insurer_id, adherent_id, contract_number, plan_type, start_date, end_date, carence_days, annual_limit, coverage_json, exclusions_json, status, created_at, updated_at, document_url, document_id, policy_number
  console.log(`\n4. Migrating contracts...`);
  const contracts = queryD1(LEGACY_DB, `SELECT * FROM contracts WHERE insurer_id = '${tenant.insurerId}'`);
  console.log(`   Found ${contracts.length} contracts to migrate`);
  for (const c of contracts) {
    const insertSql = `INSERT OR REPLACE INTO contracts (id, insurer_id, adherent_id, contract_number, plan_type, start_date, end_date, carence_days, annual_limit, coverage_json, exclusions_json, status, created_at, updated_at, document_url, document_id, policy_number) VALUES (${escapeValue(c.id)}, ${escapeValue(c.insurer_id)}, ${escapeValue(c.adherent_id)}, ${escapeValue(c.contract_number)}, ${escapeValue(c.plan_type)}, ${escapeValue(c.start_date)}, ${escapeValue(c.end_date)}, ${c.carence_days ?? 0}, ${c.annual_limit ?? 0}, ${escapeValue(c.coverage_json || '{}')}, ${escapeValue(c.exclusions_json || '{}')}, ${escapeValue(c.status || 'active')}, ${escapeValue(c.created_at)}, ${escapeValue(c.updated_at)}, ${escapeValue(c.document_url)}, ${escapeValue(c.document_id)}, ${escapeValue(c.policy_number)})`;
    executeD1(tenant.dbName, insertSql);
  }
  console.log(`   ✓ ${contracts.length} contracts migrated`);

  // 5. Migrate claims for this insurer
  console.log(`\n5. Migrating claims...`);
  const claims = queryD1(LEGACY_DB, `SELECT * FROM claims WHERE insurer_id = '${tenant.insurerId}'`);
  console.log(`   Found ${claims.length} claims to migrate`);
  for (const c of claims) {
    // Check claims schema and migrate accordingly
    const insertSql = `INSERT OR REPLACE INTO claims (id, contract_id, provider_id, insurer_id, adherent_id, claim_number, type, amount, approved_amount, status, submitted_at, processed_at, processed_by, notes, created_at, updated_at) VALUES (${escapeValue(c.id)}, ${escapeValue(c.contract_id)}, ${escapeValue(c.provider_id)}, ${escapeValue(c.insurer_id)}, ${escapeValue(c.adherent_id)}, ${escapeValue(c.claim_number)}, ${escapeValue(c.type)}, ${c.amount || 0}, ${c.approved_amount || 0}, ${escapeValue(c.status)}, ${escapeValue(c.submitted_at)}, ${escapeValue(c.processed_at)}, ${escapeValue(c.processed_by)}, ${escapeValue(c.notes)}, ${escapeValue(c.created_at)}, ${escapeValue(c.updated_at)})`;
    executeD1(tenant.dbName, insertSql);
  }
  console.log(`   ✓ ${claims.length} claims migrated`);

  // 6. Migrate conventions (insurer-provider agreements)
  console.log(`\n6. Migrating conventions...`);
  const conventions = queryD1(LEGACY_DB, `SELECT * FROM conventions WHERE insurer_id = '${tenant.insurerId}'`);
  console.log(`   Found ${conventions.length} conventions to migrate`);
  for (const c of conventions) {
    const insertSql = `INSERT OR REPLACE INTO conventions (id, insurer_id, provider_id, start_date, end_date, terms, status, created_at, updated_at) VALUES (${escapeValue(c.id)}, ${escapeValue(c.insurer_id)}, ${escapeValue(c.provider_id)}, ${escapeValue(c.start_date)}, ${escapeValue(c.end_date)}, ${escapeValue(c.terms || '{}')}, ${escapeValue(c.status || 'active')}, ${escapeValue(c.created_at)}, ${escapeValue(c.updated_at)})`;
    executeD1(tenant.dbName, insertSql);
  }
  console.log(`   ✓ ${conventions.length} conventions migrated`);

  console.log(`\n========== ${tenant.code} Migration Complete ==========`);
}

async function migrateProviders() {
  console.log(`\n========== Migrating Providers to All Tenants ==========`);

  // Providers are shared - copy all to each tenant
  const providers = queryD1(LEGACY_DB, `SELECT * FROM providers`);
  console.log(`Found ${providers.length} providers to migrate to all tenants`);

  for (const tenant of TENANTS) {
    console.log(`\nMigrating providers to ${tenant.code}...`);
    let success = 0;
    for (const p of providers) {
      // Schema: id, type, name, license_no, speciality, address, city, lat, lng, phone, email, is_active, created_at, updated_at, deleted_at, mf_number, mf_verified, mf_verification_id
      const insertSql = `INSERT OR REPLACE INTO providers (id, type, name, license_no, speciality, address, city, lat, lng, phone, email, is_active, created_at, updated_at, deleted_at, mf_number, mf_verified, mf_verification_id) VALUES (${escapeValue(p.id)}, ${escapeValue(p.type)}, ${escapeValue(p.name)}, ${escapeValue(p.license_no)}, ${escapeValue(p.speciality)}, ${escapeValue(p.address)}, ${escapeValue(p.city)}, ${p.lat ?? 'NULL'}, ${p.lng ?? 'NULL'}, ${escapeValue(p.phone)}, ${escapeValue(p.email)}, ${p.is_active ?? 1}, ${escapeValue(p.created_at)}, ${escapeValue(p.updated_at)}, ${escapeValue(p.deleted_at)}, ${escapeValue(p.mf_number)}, ${p.mf_verified ?? 0}, ${escapeValue(p.mf_verification_id)})`;
      const result = executeD1(tenant.dbName, insertSql);
      if (result) success++;
    }
    console.log(`   ✓ ${success} providers migrated to ${tenant.code}`);
  }
}

async function main() {
  console.log('==============================================');
  console.log('  DHAMEN Multi-Tenant Data Migration Script');
  console.log('==============================================\n');

  // First migrate providers (shared across all tenants)
  await migrateProviders();

  // Then migrate tenant-specific data
  for (const tenant of TENANTS) {
    await migrateInsurer(tenant);
  }

  console.log('\n\n==============================================');
  console.log('  Migration Complete!');
  console.log('==============================================');
}

main().catch(console.error);
