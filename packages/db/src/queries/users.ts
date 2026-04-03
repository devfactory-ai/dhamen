import type { Role, User, UserPublic } from '@dhamen/shared';

type D1Database = {
  prepare(query: string): D1PreparedStatement;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<{ success: boolean; meta: { changes: number } }>;
};

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: Role;
  provider_id: string | null;
  insurer_id: string | null;
  company_id: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  mfa_enabled: number;
  mfa_secret: string | null;
  last_login_at: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    role: row.role,
    providerId: row.provider_id,
    insurerId: row.insurer_id,
    companyId: row.company_id,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    mfaEnabled: row.mfa_enabled === 1,
    mfaSecret: row.mfa_secret,
    lastLoginAt: row.last_login_at,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function userToPublic(user: User & { companyName?: string | null }): UserPublic {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    providerId: user.providerId,
    insurerId: user.insurerId,
    companyId: user.companyId,
    companyName: (user as { companyName?: string | null }).companyName ?? null,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    mfaEnabled: user.mfaEnabled,
    lastLoginAt: user.lastLoginAt,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

export async function findUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();

  return row ? rowToUser(row) : null;
}

export async function findUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
    .bind(email.toLowerCase())
    .first<UserRow>();

  return row ? rowToUser(row) : null;
}

export async function listUsers(
  db: D1Database,
  options: {
    role?: Role;
    providerId?: string;
    insurerId?: string;
    isActive?: boolean;
    search?: string;
    page?: number;
    limit?: number;
  } = {}
): Promise<{ data: User[]; total: number }> {
  const { role, providerId, insurerId, isActive, search, page = 1, limit = 20 } = options;
  const offset = (page - 1) * limit;

  let whereClause = '1=1';
  const params: unknown[] = [];

  if (role) {
    whereClause += ' AND role = ?';
    params.push(role);
  }
  if (providerId) {
    whereClause += ' AND provider_id = ?';
    params.push(providerId);
  }
  if (insurerId) {
    whereClause += ' AND insurer_id = ?';
    params.push(insurerId);
  }
  if (isActive !== undefined) {
    whereClause += ' AND users.is_active = ?';
    params.push(isActive ? 1 : 0);
  }
  if (search) {
    whereClause += ' AND (users.email LIKE ? OR users.first_name LIKE ? OR users.last_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM users WHERE ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const { results } = await db
    .prepare(
      `SELECT users.*, companies.name as company_name FROM users LEFT JOIN companies ON users.company_id = companies.id WHERE ${whereClause} ORDER BY users.last_name, users.first_name ASC LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<UserRow & { company_name: string | null }>();

  return {
    data: results.map((row) => ({ ...rowToUser(row), companyName: row.company_name ?? null })),
    total: countResult?.count ?? 0,
  };
}

export async function createUser(
  db: D1Database,
  id: string,
  data: {
    email: string;
    passwordHash: string;
    role: Role;
    providerId?: string;
    insurerId?: string;
    companyId?: string;
    firstName: string;
    lastName: string;
    phone?: string;
    mfaEnabled?: boolean;
  }
): Promise<User> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, role, provider_id, insurer_id, company_id, first_name, last_name, phone, mfa_enabled, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .bind(
      id,
      data.email.toLowerCase(),
      data.passwordHash,
      data.role,
      data.providerId ?? null,
      data.insurerId ?? null,
      data.companyId ?? null,
      data.firstName,
      data.lastName,
      data.phone ?? null,
      data.mfaEnabled ? 1 : 0,
      now,
      now
    )
    .run();

  const user = await findUserById(db, id);
  if (!user) {
    throw new Error('Failed to create user');
  }
  return user;
}

type UserUpdateData = {
  email?: string;
  passwordHash?: string;
  role?: Role;
  companyId?: string | null;
  firstName?: string;
  lastName?: string;
  phone?: string;
  isActive?: boolean;
  mfaEnabled?: boolean;
  mfaSecret?: string;
  lastLoginAt?: string;
};

type FieldMapping = {
  key: keyof UserUpdateData;
  column: string;
  transform?: (value: unknown) => unknown;
};

const USER_FIELD_MAPPINGS: FieldMapping[] = [
  { key: 'email', column: 'email', transform: (v) => String(v).toLowerCase() },
  { key: 'passwordHash', column: 'password_hash' },
  { key: 'role', column: 'role' },
  { key: 'companyId', column: 'company_id' },
  { key: 'firstName', column: 'first_name' },
  { key: 'lastName', column: 'last_name' },
  { key: 'phone', column: 'phone' },
  { key: 'isActive', column: 'is_active', transform: (v) => (v ? 1 : 0) },
  { key: 'mfaEnabled', column: 'mfa_enabled', transform: (v) => (v ? 1 : 0) },
  { key: 'mfaSecret', column: 'mfa_secret' },
  { key: 'lastLoginAt', column: 'last_login_at' },
];

export async function updateUser(
  db: D1Database,
  id: string,
  data: UserUpdateData
): Promise<User | null> {
  const existing = await findUserById(db, id);
  if (!existing) {
    return null;
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  for (const mapping of USER_FIELD_MAPPINGS) {
    const value = data[mapping.key];
    if (value !== undefined) {
      updates.push(`${mapping.column} = ?`);
      params.push(mapping.transform ? mapping.transform(value) : value);
    }
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push('updated_at = ?');
  params.push(new Date().toISOString());
  params.push(id);

  await db
    .prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...params)
    .run();

  return findUserById(db, id);
}
