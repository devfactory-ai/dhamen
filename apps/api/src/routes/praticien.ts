import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';
import { authMiddleware, requireRole } from '../middleware/auth';

const praticien = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// All routes require auth + provider role
praticien.use('*', authMiddleware());

const PROVIDER_ROLES = ['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN'] as const;

/** Types de soins par type de praticien (BH Assurance Tunisie) */
const TYPES_PAR_PRATICIEN: Record<string, Array<{ value: string; label: string }>> = {
  LAB_MANAGER: [
    { value: 'analyse_biologique', label: 'Analyse biologique' },
    { value: 'bilan_sanguin', label: 'Bilan sanguin complet' },
    { value: 'analyse_urinaire', label: 'Analyse urinaire' },
    { value: 'bacteriologie', label: 'Bactériologie / Culture' },
    { value: 'serologie', label: 'Sérologie' },
    { value: 'hematologie', label: 'Hématologie' },
    { value: 'biochimie', label: 'Biochimie' },
    { value: 'hormonologie', label: 'Hormonologie' },
    { value: 'anatomopathologie', label: 'Anatomopathologie' },
    { value: 'autre_analyse', label: 'Autre analyse' },
  ],
  PHARMACIST: [
    { value: 'medicament', label: 'Médicament' },
    { value: 'parapharmacie', label: 'Parapharmacie' },
    { value: 'dispositif_medical', label: 'Dispositif médical' },
    { value: 'autre_pharmacie', label: 'Autre' },
  ],
  DOCTOR: [
    { value: 'consultation', label: 'Consultation' },
    { value: 'acte_technique', label: 'Acte technique' },
    { value: 'imagerie', label: 'Imagerie' },
    { value: 'exploration_fonctionnelle', label: 'Exploration fonctionnelle' },
    { value: 'autre_consultation', label: 'Autre' },
  ],
  CLINIC_ADMIN: [
    { value: 'hospitalisation', label: 'Hospitalisation' },
    { value: 'chirurgie', label: 'Chirurgie' },
    { value: 'urgence', label: 'Urgence' },
    { value: 'maternite', label: 'Maternité' },
    { value: 'autre_clinique', label: 'Autre' },
  ],
};

/**
 * GET /praticien/types-soins
 * Returns care types filtered by the connected practitioner's role
 */
praticien.get('/types-soins', requireRole(...PROVIDER_ROLES), async (c) => {
  const user = c.get('user');
  const types = TYPES_PAR_PRATICIEN[user.role] || [];
  return c.json({ success: true, data: types });
});

/**
 * GET /praticien/profil
 * Returns provider profile for the connected practitioner.
 * If no provider is linked, auto-creates one from user info.
 */
praticien.get('/profil', requireRole(...PROVIDER_ROLES), async (c) => {
  const { getDb } = await import('../lib/db');
  const db = getDb(c);
  const user = c.get('user');

  try {
    // If user has a providerId, fetch the provider
    if (user.providerId) {
      const provider = await db.prepare(`
        SELECT id, name, type, license_no, speciality, mf_number, address, city, phone, email, is_active, created_at
        FROM providers
        WHERE id = ? AND (deleted_at IS NULL OR deleted_at = '')
      `).bind(user.providerId).first();

      if (provider) {
        return c.json({ success: true, data: provider });
      }
    }

    // No provider linked — auto-create one from user info
    const ROLE_TO_TYPE: Record<string, string> = {
      PHARMACIST: 'pharmacist',
      DOCTOR: 'doctor',
      LAB_MANAGER: 'lab',
      CLINIC_ADMIN: 'clinic',
    };
    const providerType = ROLE_TO_TYPE[user.role] || 'lab';
    const providerName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email;
    const newId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO providers (id, name, type, email, phone, address, city, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, '', '', '', 1, ?, ?)
    `).bind(newId, providerName, providerType, user.email, now, now).run();

    // Link to user
    await db.prepare(`
      UPDATE users SET provider_id = ?, updated_at = ? WHERE id = ?
    `).bind(newId, now, user.id).run();

    const created = await db.prepare(`
      SELECT id, name, type, license_no, speciality, mf_number, address, city, phone, email, is_active, created_at
      FROM providers WHERE id = ?
    `).bind(newId).first();

    return c.json({ success: true, data: created });
  } catch (err) {
    return c.json({ success: false, error: { code: 'DB_ERROR', message: String(err) } }, 500);
  }
});

/**
 * PUT /praticien/profil
 * Update editable fields: phone, address, city, email
 * Non-editable: mf_number, is_active, license_no
 */
praticien.put('/profil', requireRole(...PROVIDER_ROLES), async (c) => {
  const { getDb } = await import('../lib/db');
  const db = getDb(c);
  const user = c.get('user');

  if (!user.providerId) {
    return c.json({ success: false, error: { code: 'NO_PROVIDER', message: 'Aucun praticien associé' } }, 403);
  }

  try {
    const body = await c.req.json<{ phone?: string; address?: string; city?: string; email?: string }>();
    const updates: string[] = [];
    const params: string[] = [];

    if (body.phone !== undefined) { updates.push('phone = ?'); params.push(body.phone); }
    if (body.address !== undefined) { updates.push('address = ?'); params.push(body.address); }
    if (body.city !== undefined) { updates.push('city = ?'); params.push(body.city); }
    if (body.email !== undefined) { updates.push('email = ?'); params.push(body.email); }

    if (updates.length === 0) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Aucun champ à mettre à jour' } }, 400);
    }

    updates.push('updated_at = ?');
    params.push(new Date().toISOString());
    params.push(user.providerId);

    await db.prepare(`
      UPDATE providers SET ${updates.join(', ')} WHERE id = ?
    `).bind(...params).run();

    const updated = await db.prepare(`
      SELECT id, name, type, license_no, speciality, mf_number, address, city, phone, email, is_active, created_at
      FROM providers WHERE id = ?
    `).bind(user.providerId).first();

    return c.json({ success: true, data: updated });
  } catch (err) {
    return c.json({ success: false, error: { code: 'DB_ERROR', message: String(err) } }, 500);
  }
});

/**
 * GET /praticien/actes
 * Returns bulletins/acts for the connected practitioner (scoped by provider_id)
 */
praticien.get('/actes', requireRole(...PROVIDER_ROLES), async (c) => {
  const { getDb } = await import('../lib/db');
  const db = getDb(c);
  const user = c.get('user');

  const page = Number(c.req.query('page')) || 1;
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
  const offset = (page - 1) * limit;
  const status = c.req.query('status');

  try {
    const scope = await buildPraticienScope(db, user);
    let whereClause = `WHERE ${scope.clause}`;
    const params: (string | number)[] = [...scope.params];

    if (status && status !== 'all') {
      whereClause += ' AND bs.status = ?';
      params.push(status);
    }

    const countRow = await db.prepare(`
      SELECT COUNT(DISTINCT bs.id) as total FROM bulletins_soins bs ${whereClause}
    `).bind(...params).first<{ total: number }>();

    const rows = await db.prepare(`
      SELECT DISTINCT
        bs.id, bs.bulletin_number, bs.status, bs.care_type, bs.bulletin_date,
        bs.total_amount, bs.reimbursed_amount, bs.created_at,
        a.first_name as adherent_first_name, a.last_name as adherent_last_name,
        a.matricule as adherent_national_id,
        co.name as company_name
      FROM bulletins_soins bs
      LEFT JOIN adherents a ON bs.adherent_id = a.id
      LEFT JOIN companies co ON a.company_id = co.id
      ${whereClause}
      ORDER BY bs.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    const data = (rows.results ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      bulletinNumber: r.bulletin_number,
      status: r.status,
      careType: r.care_type,
      careDate: r.bulletin_date,
      totalAmount: r.total_amount,
      reimbursedAmount: r.reimbursed_amount,
      createdAt: r.created_at,
      adherentName: `${r.adherent_first_name || ''} ${r.adherent_last_name || ''}`.trim(),
      adherentNationalId: r.adherent_national_id,
      companyName: r.company_name || '—',
    }));

    return c.json({
      success: true,
      data,
      meta: { page, limit, total: Number(countRow?.total) || 0 },
    });
  } catch (err) {
    return c.json({ success: false, error: { code: 'DB_ERROR', message: String(err) } }, 500);
  }
});

/**
 * Build scope conditions + params for practitioner bulletin queries.
 * Matches by provider_id, created_by, acte provider_id, MF number, or practitioner name.
 */
async function buildPraticienScope(
  db: { prepare(q: string): { bind(...v: unknown[]): { first<T>(): Promise<T | null> } } },
  user: { id: string; providerId?: string | null; firstName?: string; lastName?: string; role: string },
  tableAlias: string = 'bs'
): Promise<{ clause: string; params: (string | number)[] }> {
  const params: (string | number)[] = [];

  if (!user.providerId) {
    return { clause: `${tableAlias}.created_by = ?`, params: [user.id] };
  }

  // Fetch provider info for broader matching (mf_number may not exist on all tenants)
  let providerMf: string | null = null;
  let providerName: string | null = null;
  try {
    const prov = await db.prepare(
      `SELECT name FROM providers WHERE id = ? AND deleted_at IS NULL`
    ).bind(user.providerId).first<{ name: string | null }>();
    providerName = prov?.name || null;
  } catch { /* column may not exist */ }

  try {
    const provMf = await db.prepare(
      `SELECT mf_number FROM providers WHERE id = ? AND deleted_at IS NULL`
    ).bind(user.providerId).first<{ mf_number: string | null }>();
    providerMf = provMf?.mf_number || null;
  } catch { /* mf_number column may not exist on this tenant */ }

  const conditions = [
    `${tableAlias}.provider_id = ?`,
    `${tableAlias}.created_by = ?`,
    `${tableAlias}.id IN (SELECT ab.bulletin_id FROM actes_bulletin ab WHERE ab.provider_id = ?)`,
  ];
  params.push(user.providerId, user.id, user.providerId);

  const userFullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();

  if (providerMf) {
    const normalizedMf = providerMf.replace(/[/\s\-.]/g, '');
    conditions.push(
      `${tableAlias}.id IN (SELECT ab.bulletin_id FROM actes_bulletin ab WHERE ab.ref_prof_sant = ? OR REPLACE(REPLACE(REPLACE(REPLACE(ab.ref_prof_sant, '/', ''), '.', ''), '-', ''), ' ', '') = ?)`
    );
    params.push(providerMf, normalizedMf);
  }

  // Match by provider name in actes
  if (providerName && providerName.length >= 3) {
    conditions.push(
      `${tableAlias}.id IN (SELECT ab.bulletin_id FROM actes_bulletin ab WHERE ab.nom_prof_sant = ?)`
    );
    params.push(providerName);
  }
  // Match by user full name in actes
  if (userFullName.length >= 3 && userFullName !== providerName) {
    conditions.push(
      `${tableAlias}.id IN (SELECT ab.bulletin_id FROM actes_bulletin ab WHERE ab.nom_prof_sant = ?)`
    );
    params.push(userFullName);
  }
  // Also match by provider_name on the bulletin itself
  if (providerName && providerName.length >= 3) {
    conditions.push(`${tableAlias}.provider_name = ?`);
    params.push(providerName);
  }
  if (userFullName.length >= 3 && userFullName !== providerName) {
    conditions.push(`${tableAlias}.provider_name = ?`);
    params.push(userFullName);
  }

  return { clause: `(${conditions.join('\n        OR ')})`, params };
}

/**
 * GET /praticien/actes/:id
 * Returns a single act/bulletin detail (scoped by provider_id)
 */
praticien.get('/actes/:id', requireRole(...PROVIDER_ROLES), async (c) => {
  const { getDb } = await import('../lib/db');
  const db = getDb(c);
  const user = c.get('user');
  const { id } = c.req.param();

  try {
    const scope = await buildPraticienScope(db, user);

    const row = await db.prepare(`
      SELECT
        bs.*,
        a.first_name as adherent_first_name, a.last_name as adherent_last_name,
        a.matricule as adherent_national_id, a.date_of_birth as adherent_dob,
        co.name as company_name
      FROM bulletins_soins bs
      LEFT JOIN adherents a ON bs.adherent_id = a.id
      LEFT JOIN companies co ON a.company_id = co.id
      WHERE bs.id = ? AND ${scope.clause}
    `).bind(id, ...scope.params).first();

    if (!row) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Acte non trouvé' } }, 404);
    }

    return c.json({ success: true, data: row });
  } catch (err) {
    return c.json({ success: false, error: { code: 'DB_ERROR', message: String(err) } }, 500);
  }
});

/**
 * GET /praticien/stats
 * Returns KPI stats for the connected practitioner (scoped by provider_id)
 */
praticien.get('/stats', requireRole(...PROVIDER_ROLES), async (c) => {
  const { getDb } = await import('../lib/db');
  const db = getDb(c);
  const user = c.get('user');

  try {
    // Use same scoping as /praticien/actes (alias = bulletins_soins, no table alias needed here)
    const scope = await buildPraticienScope(db, user, 'bulletins_soins');
    const whereClause = `WHERE ${scope.clause}`;
    const params = [...scope.params];

    const stats = await db.prepare(`
      SELECT
        COUNT(DISTINCT id) as totalActes,
        SUM(CASE WHEN status IN ('submitted','processing','scan_uploaded','paper_received','paper_incomplete','paper_complete','pending') THEN 1 ELSE 0 END) as enAttente,
        SUM(CASE WHEN status IN ('approved','paid','in_batch') THEN 1 ELSE 0 END) as approuves,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejetes,
        COALESCE(SUM(total_amount), 0) as montantTotal,
        COALESCE(SUM(reimbursed_amount), 0) as montantRembourse
      FROM bulletins_soins
      ${whereClause}
    `).bind(...params).first();

    return c.json({
      success: true,
      data: {
        totalActes: Number(stats?.totalActes) || 0,
        enAttente: Number(stats?.enAttente) || 0,
        approuves: Number(stats?.approuves) || 0,
        rejetes: Number(stats?.rejetes) || 0,
        montantTotal: Number(stats?.montantTotal) || 0,
        montantRembourse: Number(stats?.montantRembourse) || 0,
      },
    });
  } catch (err) {
    return c.json({ success: false, error: { code: 'DB_ERROR', message: String(err) } }, 500);
  }
});

export { praticien };
export default praticien;
