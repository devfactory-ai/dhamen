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

export function userToPublic(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    providerId: user.providerId,
    insurerId: user.insurerId,
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone,
    mfaEnabled: user.mfaEnabled,
    isActive: user.isActive,
    createdAt: user.createdAt,
  };
}

export async function findUserById(db: D1Database, id: string): Promise<User | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE id = ?')
    .bind(id)
    .first<UserRow>();

  return row ? rowToUser(row) : null;
}

export async function findUserByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await db
    .prepare('SELECT * FROM users WHERE email = ?')
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
    whereClause += ' AND is_active = ?';
    params.push(isActive ? 1 : 0);
  }
  if (search) {
    whereClause += ' AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  const countResult = await db
    .prepare(`SELECT COUNT(*) as count FROM users WHERE ${whereClause}`)
    .bind(...params)
    .first<{ count: number }>();

  const { results } = await db
    .prepare(
      `SELECT * FROM users WHERE ${whereClause} ORDER BY last_name, first_name ASC LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all<UserRow>();

  return {
    data: results.map(rowToUser),
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
    firstName: string;
    lastName: string;
    phone?: string;
  }
): Promise<User> {
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO users (id, email, password_hash, role, provider_id, insurer_id, first_name, last_name, phone, mfa_enabled, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?)`
    )
    .bind(
      id,
      data.email.toLowerCase(),
      data.passwordHash,
      data.role,
      data.providerId ?? null,
      data.insurerId ?? null,
      data.firstName,
      data.lastName,
      data.phone ?? null,
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

export async function updateUser(
  db: D1Database,
  id: string,
  data: {
    email?: string;
    passwordHash?: string;
    role?: Role;
    firstName?: string;
    lastName?: string;
    phone?: string;
    isActive?: boolean;
    mfaEnabled?: boolean;
    mfaSecret?: string;
    lastLoginAt?: string;
  }
): Promise<User | null> {
  const existing = await findUserById(db, id);
  if (!existing) {
    return null;
  }

  const updates: string[] = [];
  const params: unknown[] = [];

  if (data.email !== undefined) {
    updates.push('email = ?');
    params.push(data.email.toLowerCase());
  }
  if (data.passwordHash !== undefined) {
    updates.push('password_hash = ?');
    params.push(data.passwordHash);
  }
  if (data.role !== undefined) {
    updates.push('role = ?');
    params.push(data.role);
  }
  if (data.firstName !== undefined) {
    updates.push('first_name = ?');
    params.push(data.firstName);
  }
  if (data.lastName !== undefined) {
    updates.push('last_name = ?');
    params.push(data.lastName);
  }
  if (data.phone !== undefined) {
    updates.push('phone = ?');
    params.push(data.phone);
  }
  if (data.isActive !== undefined) {
    updates.push('is_active = ?');
    params.push(data.isActive ? 1 : 0);
  }
  if (data.mfaEnabled !== undefined) {
    updates.push('mfa_enabled = ?');
    params.push(data.mfaEnabled ? 1 : 0);
  }
  if (data.mfaSecret !== undefined) {
    updates.push('mfa_secret = ?');
    params.push(data.mfaSecret);
  }
  if (data.lastLoginAt !== undefined) {
    updates.push('last_login_at = ?');
    params.push(data.lastLoginAt);
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
