/**
 * Export utilities for CSV and Excel exports
 */

export interface ExportColumn<T> {
  key: keyof T | string;
  header: string;
  format?: (value: unknown, row: T) => string;
}

/**
 * Convert data to CSV string
 */
export function toCSV<T>(
  data: T[],
  columns: ExportColumn<T>[]
): string {
  const headers = columns.map((col) => `"${col.header}"`).join(',');

  const rows = data.map((row) =>
    columns
      .map((col) => {
        const keys = (col.key as string).split('.');
        let value: unknown = row;
        for (const k of keys) {
          value = (value as Record<string, unknown>)?.[k];
        }

        if (col.format) {
          value = col.format(value, row);
        }

        if (value === null || value === undefined) {
          return '""';
        }

        const strValue = String(value).replace(/"/g, '""');
        return `"${strValue}"`;
      })
      .join(',')
  );

  return [headers, ...rows].join('\n');
}

/**
 * Download data as CSV file
 */
export function downloadCSV(content: string, filename: string): void {
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Format date for export
 */
export function formatDateExport(dateString: string | null | undefined): string {
  if (!dateString) return '';
  try {
    return new Date(dateString).toLocaleDateString('fr-TN');
  } catch {
    return '';
  }
}

/**
 * Format amount (millimes to TND)
 */
export function formatAmountExport(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '';
  return (amount / 1000).toFixed(3);
}

/**
 * Parse CSV content to array of objects
 */
export function parseCSV(content: string): Record<string, string>[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]);
  const result: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === 0) continue;

    const row: Record<string, string> = {};
    headers.forEach((header, idx) => {
      row[header.trim()] = values[idx]?.trim() || '';
    });
    result.push(row);
  }

  return result;
}

/**
 * Parse a single CSV line handling quoted values
 */
function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);

  return values;
}
