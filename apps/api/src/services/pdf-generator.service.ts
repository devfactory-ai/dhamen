/**
 * PDF Generator Service
 *
 * Generates PDF documents for exports (bordereaux, rapports, attestations)
 * Uses a simple HTML-to-PDF approach compatible with Workers
 */

// Types
export interface PDFGeneratorOptions {
  title: string;
  subtitle?: string;
  date?: string;
  logo?: boolean;
}

export interface TableColumn {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  format?: (value: unknown) => string;
}

export interface PDFContent {
  type: 'heading' | 'paragraph' | 'table' | 'summary' | 'spacer';
  data: unknown;
}

/**
 * Generate HTML content for PDF
 * Workers don't support native PDF generation, so we generate HTML
 * that can be converted to PDF by the client or a dedicated service
 */
export function generatePDFHTML(
  options: PDFGeneratorOptions,
  contents: PDFContent[]
): string {
  const today = options.date || new Date().toLocaleDateString('fr-TN');

  let html = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(options.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-size: 12px;
      color: #333;
      padding: 40px;
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #1e3a5f;
    }
    .logo {
      font-size: 24px;
      font-weight: bold;
      color: #1e3a5f;
    }
    .logo-subtitle {
      font-size: 12px;
      color: #666;
      margin-top: 4px;
    }
    .header-right { text-align: right; }
    .header-date { color: #666; font-size: 11px; }
    .title {
      font-size: 20px;
      font-weight: 600;
      color: #1e3a5f;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 14px;
      color: #666;
      margin-bottom: 24px;
    }
    .heading {
      font-size: 16px;
      font-weight: 600;
      color: #1e3a5f;
      margin-top: 24px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid #eee;
    }
    .paragraph {
      margin-bottom: 12px;
      line-height: 1.6;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
    }
    th {
      background: #f5f5f5;
      padding: 10px 8px;
      text-align: left;
      font-weight: 600;
      border-bottom: 2px solid #ddd;
      font-size: 11px;
      text-transform: uppercase;
      color: #555;
    }
    td {
      padding: 10px 8px;
      border-bottom: 1px solid #eee;
    }
    tr:nth-child(even) { background: #fafafa; }
    tr:hover { background: #f0f7ff; }
    .align-right { text-align: right; }
    .align-center { text-align: center; }
    .summary {
      background: #f8f9fa;
      padding: 16px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #eee;
    }
    .summary-row:last-child {
      border-bottom: none;
      font-weight: 600;
      font-size: 14px;
      color: #1e3a5f;
      padding-top: 12px;
    }
    .summary-label { color: #666; }
    .summary-value { font-weight: 500; }
    .spacer { height: 20px; }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #eee;
      font-size: 10px;
      color: #999;
      text-align: center;
    }
    .amount { font-family: 'Courier New', monospace; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 500;
    }
    .badge-success { background: #d4edda; color: #155724; }
    .badge-warning { background: #fff3cd; color: #856404; }
    .badge-danger { background: #f8d7da; color: #721c24; }
    .badge-info { background: #d1ecf1; color: #0c5460; }
    @media print {
      body { padding: 20px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      ${options.logo !== false ? '<div class="logo">Dhamen</div><div class="logo-subtitle">Plateforme Tiers Payant Sante</div>' : ''}
    </div>
    <div class="header-right">
      <div class="header-date">Genere le ${today}</div>
    </div>
  </div>

  <h1 class="title">${escapeHtml(options.title)}</h1>
  ${options.subtitle ? `<p class="subtitle">${escapeHtml(options.subtitle)}</p>` : ''}
`;

  // Add contents
  for (const content of contents) {
    html += renderContent(content);
  }

  html += `
  <div class="footer">
    Dhamen - Plateforme de Tiers Payant Sante - Document genere automatiquement
  </div>
</body>
</html>`;

  return html;
}

function renderContent(content: PDFContent): string {
  switch (content.type) {
    case 'heading':
      return `<h2 class="heading">${escapeHtml(content.data as string)}</h2>`;

    case 'paragraph':
      return `<p class="paragraph">${escapeHtml(content.data as string)}</p>`;

    case 'spacer':
      return '<div class="spacer"></div>';

    case 'table': {
      const tableData = content.data as { columns: TableColumn[]; rows: Record<string, unknown>[] };
      let tableHtml = '<table><thead><tr>';

      for (const col of tableData.columns) {
        const alignClass = col.align === 'right' ? ' class="align-right"' : col.align === 'center' ? ' class="align-center"' : '';
        tableHtml += `<th${alignClass}${col.width ? ` style="width:${col.width}"` : ''}>${escapeHtml(col.header)}</th>`;
      }

      tableHtml += '</tr></thead><tbody>';

      for (const row of tableData.rows) {
        tableHtml += '<tr>';
        for (const col of tableData.columns) {
          const value = row[col.key];
          const formatted = col.format ? col.format(value) : String(value ?? '');
          const alignClass = col.align === 'right' ? ' class="align-right amount"' : col.align === 'center' ? ' class="align-center"' : '';
          tableHtml += `<td${alignClass}>${formatted}</td>`;
        }
        tableHtml += '</tr>';
      }

      tableHtml += '</tbody></table>';
      return tableHtml;
    }

    case 'summary': {
      const summaryData = content.data as { items: Array<{ label: string; value: string }> };
      let summaryHtml = '<div class="summary">';

      for (const item of summaryData.items) {
        summaryHtml += `
          <div class="summary-row">
            <span class="summary-label">${escapeHtml(item.label)}</span>
            <span class="summary-value">${escapeHtml(item.value)}</span>
          </div>`;
      }

      summaryHtml += '</div>';
      return summaryHtml;
    }

    default:
      return '';
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate CSV content for exports
 */
export function generateCSV(
  columns: TableColumn[],
  rows: Record<string, unknown>[]
): string {
  // Header row
  const header = columns.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(',');

  // Data rows
  const dataRows = rows.map((row) => {
    return columns
      .map((col) => {
        const value = row[col.key];
        const formatted = col.format ? col.format(value) : String(value ?? '');
        return `"${formatted.replace(/"/g, '""')}"`;
      })
      .join(',');
  });

  return [header, ...dataRows].join('\n');
}

/**
 * Format amount for display (millimes to TND)
 */
export function formatAmount(millimes: number): string {
  return (millimes / 1000).toFixed(3) + ' TND';
}

/**
 * Format date for display
 */
export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('fr-TN');
}

/**
 * Get status badge HTML
 */
export function getStatusBadge(status: string): string {
  const statusMap: Record<string, { class: string; label: string }> = {
    soumise: { class: 'badge-info', label: 'Soumise' },
    en_examen: { class: 'badge-warning', label: 'En examen' },
    approuvee: { class: 'badge-success', label: 'Approuvee' },
    payee: { class: 'badge-success', label: 'Payee' },
    rejetee: { class: 'badge-danger', label: 'Rejetee' },
    en_paiement: { class: 'badge-info', label: 'En paiement' },
  };

  const info = statusMap[status] || { class: 'badge-info', label: status };
  return `<span class="badge ${info.class}">${info.label}</span>`;
}
