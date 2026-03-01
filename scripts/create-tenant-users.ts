/**
 * Create default admin users for each tenant
 *
 * This script creates:
 * - An INSURER_ADMIN user for each insurance company tenant
 * - Test users with proper password hashes
 *
 * Usage: npx tsx scripts/create-tenant-users.ts
 */

import { execSync } from 'child_process';
import * as crypto from 'crypto';

// Tenant configuration
const TENANTS = [
  {
    code: 'STAR',
    name: 'STAR Assurances',
    dbName: 'dhamen-star',
    insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8C9',
  },
  {
    code: 'GAT',
    name: 'GAT Assurances',
    dbName: 'dhamen-gat',
    insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8D0',
  },
  {
    code: 'COMAR',
    name: 'COMAR Assurances',
    dbName: 'dhamen-comar',
    insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8E1',
  },
  {
    code: 'AMI',
    name: 'AMI Assurances',
    dbName: 'dhamen-ami',
    insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8F2',
  },
];

const ACCOUNT_ID = '6435a77d3ce17b7de468c6618e7b2b14';

// Simple password hash function (matches the one in the API)
// Using pbkdf2 with SHA-256
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 100000;
  const keylen = 64;
  const digest = 'sha256';
  const hash = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString('hex');
  return `${salt}:${iterations}:${hash}`;
}

// Generate a ULID-like ID
function generateId(): string {
  const timestamp = Date.now().toString(36).toUpperCase().padStart(10, '0');
  const random = Array.from({ length: 16 }, () =>
    '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[Math.floor(Math.random() * 32)]
  ).join('');
  return `01${timestamp.slice(-8)}${random.slice(0, 18)}`;
}

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

function escapeValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function createTenantUsers() {
  console.log('==============================================');
  console.log('  DHAMEN Tenant User Creation Script');
  console.log('==============================================\n');

  const defaultPassword = 'Dhamen2026!'; // Default password for all test users
  const passwordHash = hashPassword(defaultPassword);

  console.log(`Default password for all users: ${defaultPassword}`);
  console.log(`Password hash: ${passwordHash.substring(0, 50)}...\n`);

  for (const tenant of TENANTS) {
    console.log(`\n========== Creating users for ${tenant.code} ==========`);

    const now = new Date().toISOString();

    // 1. Create INSURER_ADMIN user
    const adminId = generateId();
    const adminEmail = `admin@${tenant.code.toLowerCase()}.dhamen.tn`;
    console.log(`\nCreating INSURER_ADMIN: ${adminEmail}`);

    // Schema: id, email, password_hash, role, provider_id, insurer_id, company_id, first_name, last_name, phone, mfa_enabled, mfa_secret, last_login_at, is_active, created_at, updated_at
    const adminSql = `INSERT OR REPLACE INTO users (id, email, password_hash, role, provider_id, insurer_id, company_id, first_name, last_name, phone, mfa_enabled, mfa_secret, last_login_at, is_active, created_at, updated_at) VALUES (${escapeValue(adminId)}, ${escapeValue(adminEmail)}, ${escapeValue(passwordHash)}, 'INSURER_ADMIN', NULL, ${escapeValue(tenant.insurerId)}, NULL, 'Admin', ${escapeValue(tenant.name)}, '+21671000001', 0, NULL, NULL, 1, ${escapeValue(now)}, ${escapeValue(now)})`;
    executeD1(tenant.dbName, adminSql);
    console.log(`   ✓ Created INSURER_ADMIN: ${adminEmail}`);

    // 2. Create INSURER_AGENT user
    const agentId = generateId();
    const agentEmail = `agent@${tenant.code.toLowerCase()}.dhamen.tn`;
    console.log(`\nCreating INSURER_AGENT: ${agentEmail}`);

    const agentSql = `INSERT OR REPLACE INTO users (id, email, password_hash, role, provider_id, insurer_id, company_id, first_name, last_name, phone, mfa_enabled, mfa_secret, last_login_at, is_active, created_at, updated_at) VALUES (${escapeValue(agentId)}, ${escapeValue(agentEmail)}, ${escapeValue(passwordHash)}, 'INSURER_AGENT', NULL, ${escapeValue(tenant.insurerId)}, NULL, 'Agent', ${escapeValue(tenant.name)}, '+21671000002', 0, NULL, NULL, 1, ${escapeValue(now)}, ${escapeValue(now)})`;
    executeD1(tenant.dbName, agentSql);
    console.log(`   ✓ Created INSURER_AGENT: ${agentEmail}`);

    // 3. Create SOIN_GESTIONNAIRE user
    const gestId = generateId();
    const gestEmail = `gestionnaire@${tenant.code.toLowerCase()}.dhamen.tn`;
    console.log(`\nCreating SOIN_GESTIONNAIRE: ${gestEmail}`);

    const gestSql = `INSERT OR REPLACE INTO users (id, email, password_hash, role, provider_id, insurer_id, company_id, first_name, last_name, phone, mfa_enabled, mfa_secret, last_login_at, is_active, created_at, updated_at) VALUES (${escapeValue(gestId)}, ${escapeValue(gestEmail)}, ${escapeValue(passwordHash)}, 'SOIN_GESTIONNAIRE', NULL, ${escapeValue(tenant.insurerId)}, NULL, 'Gestionnaire', ${escapeValue(tenant.name)}, '+21671000003', 0, NULL, NULL, 1, ${escapeValue(now)}, ${escapeValue(now)})`;
    executeD1(tenant.dbName, gestSql);
    console.log(`   ✓ Created SOIN_GESTIONNAIRE: ${gestEmail}`);

    console.log(`\n   ========== ${tenant.code} Users Created ==========`);
  }

  console.log('\n\n==============================================');
  console.log('  User Creation Complete!');
  console.log('==============================================');
  console.log('\nAll users created with password: ' + defaultPassword);
  console.log('\nUsers per tenant:');
  for (const tenant of TENANTS) {
    console.log(`\n${tenant.name}:`);
    console.log(`  - admin@${tenant.code.toLowerCase()}.dhamen.tn (INSURER_ADMIN)`);
    console.log(`  - agent@${tenant.code.toLowerCase()}.dhamen.tn (INSURER_AGENT)`);
    console.log(`  - gestionnaire@${tenant.code.toLowerCase()}.dhamen.tn (SOIN_GESTIONNAIRE)`);
  }
}

createTenantUsers().catch(console.error);
