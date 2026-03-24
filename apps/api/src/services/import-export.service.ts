/**
 * Import/Export Service
 *
 * Handles CSV and Excel import/export for various data types
 */
import type { Bindings } from '../types';
import { generatePrefixedId } from '../lib/ulid';

export type ExportFormat = 'csv' | 'xlsx' | 'json';
export type ImportableEntity = 'adherents' | 'providers' | 'contracts' | 'claims' | 'bordereaux';

export interface ExportRequest {
  entity: ImportableEntity;
  format: ExportFormat;
  filters?: Record<string, unknown>;
  columns?: string[];
  tenantId?: string;
}

export interface ExportResult {
  id: string;
  filename: string;
  format: ExportFormat;
  size: number;
  rowCount: number;
  url?: string;
  content?: string;
  createdAt: string;
}

export interface ImportRequest {
  entity: ImportableEntity;
  format: ExportFormat;
  data: string; // Base64 encoded file content
  options?: {
    skipHeader?: boolean;
    updateExisting?: boolean;
    dryRun?: boolean;
  };
  tenantId?: string;
}

export interface ImportResult {
  id: string;
  status: 'completed' | 'partial' | 'failed';
  totalRows: number;
  successfulRows: number;
  failedRows: number;
  errors: Array<{
    row: number;
    field?: string;
    error: string;
  }>;
  createdAt: string;
}

// Column definitions for each entity
const COLUMN_DEFINITIONS: Record<ImportableEntity, Array<{ key: string; header: string; required?: boolean }>> = {
  adherents: [
    { key: 'matricule', header: 'Matricule', required: true },
    { key: 'first_name', header: 'Prénom', required: true },
    { key: 'last_name', header: 'Nom', required: true },
    { key: 'date_of_birth', header: 'Date de naissance' },
    { key: 'email', header: 'Email' },
    { key: 'phone', header: 'Téléphone' },
    { key: 'address', header: 'Adresse' },
    { key: 'contract_number', header: 'N° Contrat' },
    { key: 'formule_code', header: 'Code Formule' },
    { key: 'date_affiliation', header: 'Date d\'affiliation' },
    { key: 'est_actif', header: 'Actif (O/N)' },
  ],
  providers: [
    { key: 'code', header: 'Code', required: true },
    { key: 'name', header: 'Nom', required: true },
    { key: 'type', header: 'Type', required: true },
    { key: 'specialty', header: 'Spécialité' },
    { key: 'address', header: 'Adresse' },
    { key: 'city', header: 'Ville' },
    { key: 'phone', header: 'Téléphone' },
    { key: 'email', header: 'Email' },
    { key: 'matricule_fiscal', header: 'Matricule Fiscal' },
    { key: 'rib', header: 'RIB' },
    { key: 'est_conventionne', header: 'Conventionné (O/N)' },
  ],
  contracts: [
    { key: 'numero', header: 'Numéro', required: true },
    { key: 'insurer_name', header: 'Assureur', required: true },
    { key: 'entreprise', header: 'Entreprise' },
    { key: 'date_effet', header: 'Date d\'effet' },
    { key: 'date_fin', header: 'Date de fin' },
    { key: 'formule', header: 'Formule' },
    { key: 'prime_mensuelle', header: 'Prime mensuelle' },
    { key: 'nombre_adherents', header: 'Nb adhérents' },
    { key: 'status', header: 'Statut' },
  ],
  claims: [
    { key: 'numero_demande', header: 'N° Demande', required: true },
    { key: 'adherent_matricule', header: 'Matricule adhérent', required: true },
    { key: 'type_soin', header: 'Type de soin', required: true },
    { key: 'date_soin', header: 'Date du soin' },
    { key: 'montant_demande', header: 'Montant demandé' },
    { key: 'montant_rembourse', header: 'Montant remboursé' },
    { key: 'statut', header: 'Statut' },
    { key: 'provider_name', header: 'Prestataire' },
    { key: 'created_at', header: 'Date création' },
  ],
  bordereaux: [
    { key: 'numero', header: 'Numéro', required: true },
    { key: 'provider_name', header: 'Prestataire', required: true },
    { key: 'periode_debut', header: 'Période début' },
    { key: 'periode_fin', header: 'Période fin' },
    { key: 'montant_total', header: 'Montant total' },
    { key: 'nombre_demandes', header: 'Nb demandes' },
    { key: 'statut', header: 'Statut' },
    { key: 'date_generation', header: 'Date génération' },
    { key: 'date_paiement', header: 'Date paiement' },
  ],
};

export class ImportExportService {
  constructor(private env: Bindings) {}

  /**
   * Export data to file
   */
  async export(request: ExportRequest): Promise<ExportResult> {
    const exportId = generatePrefixedId('EXP');
    const now = new Date();

    // Fetch data
    const data = await this.fetchData(request);

    // Generate file content
    let content: string;
    let contentType: string;

    switch (request.format) {
      case 'csv':
        content = this.toCSV(data, request.entity, request.columns);
        contentType = 'text/csv';
        break;
      case 'xlsx':
        content = this.toXLSX(data, request.entity, request.columns);
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      case 'json':
        content = JSON.stringify(data, null, 2);
        contentType = 'application/json';
        break;
      default:
        throw new Error(`Unsupported format: ${request.format}`);
    }

    const filename = `${request.entity}_${now.toISOString().split('T')[0]}_${exportId}.${request.format}`;

    // Store in R2 if available
    let url: string | undefined;
    if (this.env.STORAGE) {
      const key = `exports/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${filename}`;
      await this.env.STORAGE.put(key, content, {
        httpMetadata: { contentType },
      });
      url = `https://dhamen-files.r2.dev/${key}`;
    }

    return {
      id: exportId,
      filename,
      format: request.format,
      size: content.length,
      rowCount: data.length,
      url,
      content: Buffer.from(content).toString('base64'),
      createdAt: now.toISOString(),
    };
  }

  /**
   * Import data from file
   */
  async import(request: ImportRequest): Promise<ImportResult> {
    const importId = generatePrefixedId('IMP');
    const errors: ImportResult['errors'] = [];

    // Parse file content
    let rows: Record<string, unknown>[];
    try {
      const content = Buffer.from(request.data, 'base64').toString('utf-8');

      switch (request.format) {
        case 'csv':
          rows = this.parseCSV(content, request.options?.skipHeader);
          break;
        case 'xlsx':
          rows = this.parseXLSX(content);
          break;
        case 'json':
          rows = JSON.parse(content);
          break;
        default:
          throw new Error(`Unsupported format: ${request.format}`);
      }
    } catch (error) {
      return {
        id: importId,
        status: 'failed',
        totalRows: 0,
        successfulRows: 0,
        failedRows: 0,
        errors: [{ row: 0, error: `Failed to parse file: ${error}` }],
        createdAt: new Date().toISOString(),
      };
    }

    // Validate and import rows
    let successfulRows = 0;
    let failedRows = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const rowNum = i + 1 + (request.options?.skipHeader ? 1 : 0);

      // Validate row
      const validation = this.validateRow(row, request.entity);
      if (!validation.valid) {
        errors.push({
          row: rowNum,
          field: validation.field,
          error: validation.error || 'Validation failed',
        });
        failedRows++;
        continue;
      }

      // Import row (unless dry run)
      if (!request.options?.dryRun) {
        try {
          await this.importRow(row, request.entity, request.tenantId, request.options?.updateExisting);
          successfulRows++;
        } catch (error) {
          errors.push({
            row: rowNum,
            error: error instanceof Error ? error.message : 'Import failed',
          });
          failedRows++;
        }
      } else {
        successfulRows++;
      }
    }

    return {
      id: importId,
      status: failedRows === 0 ? 'completed' : successfulRows === 0 ? 'failed' : 'partial',
      totalRows: rows.length,
      successfulRows,
      failedRows,
      errors: errors.slice(0, 100), // Limit to first 100 errors
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Get import template
   */
  getTemplate(entity: ImportableEntity, format: ExportFormat): string {
    const columns = COLUMN_DEFINITIONS[entity];

    if (format === 'csv') {
      return columns.map((c) => c.header).join(',') + '\n';
    } else if (format === 'json') {
      const template: Record<string, string> = {};
      columns.forEach((c) => {
        template[c.key] = c.required ? '(requis)' : '(optionnel)';
      });
      return JSON.stringify([template], null, 2);
    }

    return '';
  }

  /**
   * Fetch data for export
   */
  private async fetchData(request: ExportRequest): Promise<Record<string, unknown>[]> {
    const { entity, filters, tenantId } = request;

    let query = '';
    const conditions: string[] = [];
    const bindParams: unknown[] = [];

    switch (entity) {
      case 'adherents':
        query = `
          SELECT a.*, c.numero as contract_number, f.code as formule_code
          FROM adherents a
          LEFT JOIN contracts c ON a.contract_id = c.id
          LEFT JOIN formules f ON a.formule_id = f.id
        `;
        if (tenantId) {
          conditions.push('c.insurer_id = ?');
          bindParams.push(tenantId);
        }
        break;

      case 'providers':
        query = `SELECT * FROM providers`;
        if (tenantId) {
          query = `
            SELECT p.*, pc.status as convention_status
            FROM providers p
            JOIN provider_conventions pc ON p.id = pc.provider_id
            WHERE pc.insurer_id = ?
          `;
          bindParams.push(tenantId);
        }
        break;

      case 'contracts':
        query = `
          SELECT c.*, i.name as insurer_name
          FROM contracts c
          JOIN insurers i ON c.insurer_id = i.id
        `;
        if (tenantId) {
          conditions.push('c.insurer_id = ?');
          bindParams.push(tenantId);
        }
        break;

      case 'claims':
        query = `
          SELECT sd.*, a.matricule as adherent_matricule, p.name as provider_name
          FROM sante_demandes sd
          JOIN adherents a ON sd.adherent_id = a.id
          LEFT JOIN providers p ON sd.provider_id = p.id
          JOIN contracts c ON sd.contract_id = c.id
        `;
        if (tenantId) {
          conditions.push('c.insurer_id = ?');
          bindParams.push(tenantId);
        }
        break;

      case 'bordereaux':
        query = `
          SELECT b.*, p.name as provider_name
          FROM bordereaux b
          JOIN providers p ON b.provider_id = p.id
        `;
        if (tenantId) {
          conditions.push('b.insurer_id = ?');
          bindParams.push(tenantId);
        }
        break;

      default:
        throw new Error(`Unknown entity: ${entity}`);
    }

    // Apply filters
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          conditions.push(`${key} = ?`);
          bindParams.push(value);
        }
      });
    }

    conditions.push('deleted_at IS NULL');

    if (conditions.length > 0) {
      query += (query.includes('WHERE') ? ' AND ' : ' WHERE ') + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC LIMIT 10000';

    const { results } = await this.env.DB.prepare(query).bind(...bindParams).all();
    return results || [];
  }

  /**
   * Convert data to CSV
   */
  private toCSV(data: Record<string, unknown>[], entity: ImportableEntity, selectedColumns?: string[]): string {
    const columns = COLUMN_DEFINITIONS[entity].filter(
      (c) => !selectedColumns || selectedColumns.includes(c.key)
    );

    const header = columns.map((c) => this.escapeCSV(c.header)).join(',');
    const rows = data.map((row) =>
      columns.map((c) => this.escapeCSV(String(row[c.key] ?? ''))).join(',')
    );

    return [header, ...rows].join('\n');
  }

  /**
   * Convert data to XLSX (simplified XML format)
   */
  private toXLSX(data: Record<string, unknown>[], entity: ImportableEntity, selectedColumns?: string[]): string {
    const columns = COLUMN_DEFINITIONS[entity].filter(
      (c) => !selectedColumns || selectedColumns.includes(c.key)
    );

    // Generate simple SpreadsheetML format
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="${entity}">
<Table>
<Row>`;

    columns.forEach((c) => {
      xml += `<Cell><Data ss:Type="String">${this.escapeXML(c.header)}</Data></Cell>`;
    });
    xml += '</Row>';

    data.forEach((row) => {
      xml += '<Row>';
      columns.forEach((c) => {
        const value = row[c.key];
        const type = typeof value === 'number' ? 'Number' : 'String';
        xml += `<Cell><Data ss:Type="${type}">${this.escapeXML(String(value ?? ''))}</Data></Cell>`;
      });
      xml += '</Row>';
    });

    xml += '</Table></Worksheet></Workbook>';
    return xml;
  }

  /**
   * Parse CSV content
   */
  private parseCSV(content: string, skipHeader = true): Record<string, unknown>[] {
    const lines = content.split('\n').filter((line) => line.trim());
    const headerLine = lines[0];
    if (!headerLine) return [];
    const dataLines = skipHeader ? lines.slice(1) : lines;

    const headers = this.parseCSVLine(headerLine);

    return dataLines.map((line) => {
      const values = this.parseCSVLine(line);
      const row: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        row[this.headerToKey(header)] = values[index]?.trim() || null;
      });
      return row;
    });
  }

  /**
   * Parse XLSX content (SpreadsheetML XML format)
   * Handles both the simplified XML we generate and basic SpreadsheetML files.
   * For complex .xlsx files (ZIP-based), callers should convert to CSV first
   * or use the CSV import path which is more robust.
   */
  private parseXLSX(content: string): Record<string, unknown>[] {
    try {
      // Try to parse SpreadsheetML XML format (what our toXLSX generates)
      const rows: Record<string, unknown>[] = [];

      // Extract all Row elements
      const rowMatches = content.match(/<Row[^>]*>([\s\S]*?)<\/Row>/gi);
      if (!rowMatches || rowMatches.length < 2) return [];

      // First row is headers
      const headerCells = rowMatches[0].match(/<Data[^>]*>([\s\S]*?)<\/Data>/gi) ?? [];
      const headers = headerCells.map((cell) => {
        const match = cell.match(/<Data[^>]*>([\s\S]*?)<\/Data>/i);
        return match ? match[1].trim() : '';
      });

      // Data rows
      for (let i = 1; i < rowMatches.length; i++) {
        const dataCells = rowMatches[i].match(/<Data[^>]*>([\s\S]*?)<\/Data>/gi) ?? [];
        const row: Record<string, unknown> = {};
        dataCells.forEach((cell, idx) => {
          const match = cell.match(/<Data[^>]*>([\s\S]*?)<\/Data>/i);
          const value = match ? match[1].trim() : '';
          if (idx < headers.length) {
            row[this.headerToKey(headers[idx])] = value || null;
          }
        });
        rows.push(row);
      }

      return rows;
    } catch {
      return [];
    }
  }

  /**
   * Parse a single CSV line
   */
  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);

    return result;
  }

  /**
   * Convert header to key
   */
  private headerToKey(header: string): string {
    return header
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  }

  /**
   * Escape CSV value
   */
  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Escape XML value
   */
  private escapeXML(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Validate row for import
   */
  private validateRow(
    row: Record<string, unknown>,
    entity: ImportableEntity
  ): { valid: boolean; field?: string; error?: string } {
    const columns = COLUMN_DEFINITIONS[entity];

    for (const column of columns) {
      if (column.required) {
        const value = row[column.key] || row[this.headerToKey(column.header)];
        if (!value || (typeof value === 'string' && !value.trim())) {
          return {
            valid: false,
            field: column.key,
            error: `${column.header} est requis`,
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Import a single row
   */
  private async importRow(
    row: Record<string, unknown>,
    entity: ImportableEntity,
    tenantId?: string,
    updateExisting?: boolean
  ): Promise<void> {
    const id = generatePrefixedId(entity.toUpperCase().substring(0, 3));

    switch (entity) {
      case 'adherents': {
        const matricule = row.matricule || row.Matricule;
        if (updateExisting) {
          const existing = await this.env.DB.prepare(
            'SELECT id FROM adherents WHERE matricule = ?'
          )
            .bind(matricule)
            .first();
          if (existing) {
            // Update existing
            await this.env.DB.prepare(
              `UPDATE adherents SET
                first_name = ?, last_name = ?, date_of_birth = ?,
                email = ?, phone = ?, address = ?, updated_at = datetime('now')
              WHERE matricule = ?`
            )
              .bind(
                row.first_name || row.prenom,
                row.last_name || row.nom,
                row.date_of_birth || row.date_naissance,
                row.email,
                row.phone || row.telephone,
                row.address || row.adresse,
                matricule
              )
              .run();
            return;
          }
        }
        // Insert new
        await this.env.DB.prepare(
          `INSERT INTO adherents (id, matricule, first_name, last_name, date_of_birth, email, phone, address, est_actif, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
        )
          .bind(
            id,
            matricule,
            row.first_name || row.prenom,
            row.last_name || row.nom,
            row.date_of_birth || row.date_naissance,
            row.email,
            row.phone || row.telephone,
            row.address || row.adresse
          )
          .run();
        break;
      }

      case 'providers': {
        const code = row.code || row.Code;
        if (updateExisting) {
          const existing = await this.env.DB.prepare('SELECT id FROM providers WHERE code = ?')
            .bind(code)
            .first();
          if (existing) {
            await this.env.DB.prepare(
              `UPDATE providers SET
                name = ?, type = ?, specialty = ?, address = ?,
                city = ?, phone = ?, email = ?, updated_at = datetime('now')
              WHERE code = ?`
            )
              .bind(
                row.name || row.nom,
                row.type,
                row.specialty || row.specialite,
                row.address || row.adresse,
                row.city || row.ville,
                row.phone || row.telephone,
                row.email,
                code
              )
              .run();
            return;
          }
        }
        await this.env.DB.prepare(
          `INSERT INTO providers (id, code, name, type, specialty, address, city, phone, email, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
        )
          .bind(
            id,
            code,
            row.name || row.nom,
            row.type,
            row.specialty || row.specialite,
            row.address || row.adresse,
            row.city || row.ville,
            row.phone || row.telephone,
            row.email
          )
          .run();
        break;
      }

      // Add other entity handlers as needed
      default:
        throw new Error(`Import not supported for entity: ${entity}`);
    }
  }
}
