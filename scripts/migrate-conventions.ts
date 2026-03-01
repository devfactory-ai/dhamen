/**
 * Migrate conventions from legacy DB to tenant DBs
 */
import { execSync } from 'child_process';

const TENANTS = [
  { code: 'STAR', insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8C9', dbName: 'dhamen-star' },
  { code: 'GAT', insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8D0', dbName: 'dhamen-gat' },
  { code: 'COMAR', insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8E1', dbName: 'dhamen-comar' },
  { code: 'AMI', insurerId: '01JCVMK8R7P2N3X4Y5Z6A7B8F2', dbName: 'dhamen-ami' },
];

const LEGACY_DB = 'dhamen-db';
const ACCOUNT_ID = '6435a77d3ce17b7de468c6618e7b2b14';

function executeD1(dbName: string, sql: string): string {
  const escapedSql = sql.replace(/"/g, '\\"').replace(/\n/g, ' ');
  try {
    return execSync(
      `CLOUDFLARE_ACCOUNT_ID=${ACCOUNT_ID} npx wrangler d1 execute ${dbName} --remote --command "${escapedSql}"`,
      { encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024 }
    );
  } catch (error: any) {
    console.error(`Error on ${dbName}:`, error.message?.split('\n')[0]);
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
  } catch (e) {}
  return [];
}

function escapeValue(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? '1' : '0';
  return "'" + String(val).replace(/'/g, "''") + "'";
}

async function main() {
  console.log('Migrating conventions to all tenants...\n');

  // Tenant conventions schema:
  // id, insurer_id, provider_id, bareme_json, start_date, end_date, is_active, created_at, updated_at, terms
  // Legacy has: status (text) -> convert to is_active (integer)
  // Legacy may not have bareme_json -> use terms or default '{}'

  for (const tenant of TENANTS) {
    const conventions = queryD1(LEGACY_DB, `SELECT * FROM conventions WHERE insurer_id = '${tenant.insurerId}'`);
    console.log(`${tenant.code}: Found ${conventions.length} conventions`);

    let success = 0;
    for (const c of conventions) {
      const isActive = c.status === 'active' || c.is_active === 1 ? 1 : 0;
      const baremeJson = c.bareme_json || c.terms || '{}';
      const terms = c.terms || '{}';

      const sql = `INSERT OR REPLACE INTO conventions (id, insurer_id, provider_id, bareme_json, start_date, end_date, is_active, created_at, updated_at, terms) VALUES (${escapeValue(c.id)}, ${escapeValue(c.insurer_id)}, ${escapeValue(c.provider_id)}, ${escapeValue(baremeJson)}, ${escapeValue(c.start_date)}, ${escapeValue(c.end_date)}, ${isActive}, ${escapeValue(c.created_at)}, ${escapeValue(c.updated_at)}, ${escapeValue(terms)})`;
      const result = executeD1(tenant.dbName, sql);
      if (result) success++;
    }
    console.log(`   ✓ ${success} conventions migrated to ${tenant.code}`);
  }

  console.log('\nConventions migration complete!');
}

main().catch(console.error);
