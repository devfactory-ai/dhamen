/**
 * PDF Export Service
 *
 * Generates PDF documents for reports, invoices, and summaries
 */
import type { Bindings } from '../types';
import { generateId } from '../lib/ulid';

export interface PDFExportRequest {
  type: 'report' | 'bordereau' | 'facture' | 'attestation' | 'releve';
  templateId?: string;
  data: Record<string, unknown>;
  options?: {
    format?: 'A4' | 'A5' | 'Letter';
    orientation?: 'portrait' | 'landscape';
    margins?: { top: number; right: number; bottom: number; left: number };
    header?: string;
    footer?: string;
    watermark?: string;
  };
}

export interface PDFExportResult {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  url?: string;
  content?: string; // Base64 encoded
  createdAt: string;
}

export class PDFService {
  constructor(private env: Bindings) {}

  /**
   * Generate PDF document
   */
  async generatePDF(request: PDFExportRequest): Promise<PDFExportResult> {
    const documentId = generateId('PDF');
    const now = new Date();

    // Generate HTML content based on type
    const htmlContent = await this.generateHTML(request);

    // In production, use a PDF generation service or Workers AI
    // For now, return HTML that can be converted client-side
    const pdfData = await this.htmlToPDF(htmlContent, request.options);

    // Store in R2 if available
    const filename = this.generateFilename(request.type, documentId);
    let url: string | undefined;

    if (this.env.STORAGE) {
      const key = `exports/${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${filename}`;
      await this.env.STORAGE.put(key, pdfData, {
        httpMetadata: {
          contentType: 'application/pdf',
        },
      });
      url = `https://dhamen-files.r2.dev/${key}`;
    }

    return {
      id: documentId,
      filename,
      contentType: 'application/pdf',
      size: pdfData.length,
      url,
      content: this.arrayBufferToBase64(pdfData),
      createdAt: now.toISOString(),
    };
  }

  /**
   * Generate HTML content for PDF
   */
  private async generateHTML(request: PDFExportRequest): Promise<string> {
    const { type, data, options } = request;

    const styles = `
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 12px; line-height: 1.5; color: #333; }
        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1e40af; padding-bottom: 20px; }
        .logo { font-size: 24px; font-weight: bold; color: #1e40af; }
        .title { font-size: 18px; margin-top: 10px; }
        .subtitle { color: #666; margin-top: 5px; }
        .section { margin-bottom: 20px; }
        .section-title { font-size: 14px; font-weight: bold; margin-bottom: 10px; color: #1e40af; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
        table { width: 100%; border-collapse: collapse; margin: 10px 0; }
        th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f8fafc; font-weight: bold; }
        .amount { text-align: right; font-family: monospace; }
        .total-row { font-weight: bold; background-color: #f0f9ff; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #666; font-size: 10px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; }
        .badge-success { background-color: #dcfce7; color: #166534; }
        .badge-warning { background-color: #fef3c7; color: #92400e; }
        .badge-error { background-color: #fee2e2; color: #991b1b; }
        .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; }
        .info-item { }
        .info-label { color: #666; font-size: 10px; text-transform: uppercase; }
        .info-value { font-weight: bold; }
        ${options?.watermark ? `.watermark { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-45deg); font-size: 80px; color: rgba(0,0,0,0.05); z-index: -1; }` : ''}
      </style>
    `;

    let content = '';

    switch (type) {
      case 'report':
        content = this.generateReportHTML(data);
        break;
      case 'bordereau':
        content = this.generateBordereauHTML(data);
        break;
      case 'facture':
        content = this.generateFactureHTML(data);
        break;
      case 'attestation':
        content = this.generateAttestationHTML(data);
        break;
      case 'releve':
        content = this.generateReleveHTML(data);
        break;
      default:
        content = this.generateGenericHTML(data);
    }

    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${this.getTitle(type)}</title>
        ${styles}
      </head>
      <body>
        ${options?.watermark ? `<div class="watermark">${options.watermark}</div>` : ''}
        <div class="container">
          ${content}
          <div class="footer">
            <p>Document généré le ${new Date().toLocaleDateString('fr-TN')} à ${new Date().toLocaleTimeString('fr-TN')}</p>
            <p>Dhamen - Plateforme de Tiers Payant Santé</p>
            ${options?.footer || ''}
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateReportHTML(data: Record<string, unknown>): string {
    const report = data as {
      titre?: string;
      periode?: { debut: string; fin: string };
      statistiques?: Record<string, number>;
      details?: Array<Record<string, unknown>>;
    };

    return `
      <div class="header">
        <div class="logo">DHAMEN</div>
        <div class="title">${report.titre || 'Rapport'}</div>
        <div class="subtitle">
          ${report.periode ? `Période: ${report.periode.debut} - ${report.periode.fin}` : ''}
        </div>
      </div>

      ${report.statistiques ? `
        <div class="section">
          <div class="section-title">Statistiques</div>
          <div class="info-grid">
            ${Object.entries(report.statistiques)
              .map(
                ([key, value]) => `
                <div class="info-item">
                  <div class="info-label">${key.replace(/_/g, ' ')}</div>
                  <div class="info-value">${typeof value === 'number' ? value.toLocaleString('fr-TN') : value}</div>
                </div>
              `
              )
              .join('')}
          </div>
        </div>
      ` : ''}

      ${report.details && report.details.length > 0 ? `
        <div class="section">
          <div class="section-title">Détails</div>
          <table>
            <thead>
              <tr>
                ${Object.keys(report.details[0])
                  .map((key) => `<th>${key}</th>`)
                  .join('')}
              </tr>
            </thead>
            <tbody>
              ${report.details
                .map(
                  (row) => `
                  <tr>
                    ${Object.values(row)
                      .map((val) => `<td>${val}</td>`)
                      .join('')}
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
  }

  private generateBordereauHTML(data: Record<string, unknown>): string {
    const bordereau = data as {
      numero?: string;
      praticien?: { nom: string; adresse: string };
      periode?: { debut: string; fin: string };
      lignes?: Array<{ demande: string; adherent: string; montant: number; date: string }>;
      total?: number;
    };

    return `
      <div class="header">
        <div class="logo">DHAMEN</div>
        <div class="title">Bordereau de Paiement</div>
        <div class="subtitle">N° ${bordereau.numero || 'N/A'}</div>
      </div>

      <div class="section">
        <div class="section-title">Informations</div>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Praticien</div>
            <div class="info-value">${bordereau.praticien?.nom || 'N/A'}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Période</div>
            <div class="info-value">${bordereau.periode?.debut || ''} - ${bordereau.periode?.fin || ''}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Détail des Prises en Charge</div>
        <table>
          <thead>
            <tr>
              <th>N° Demande</th>
              <th>Adhérent</th>
              <th>Date</th>
              <th class="amount">Montant</th>
            </tr>
          </thead>
          <tbody>
            ${(bordereau.lignes || [])
              .map(
                (ligne) => `
                <tr>
                  <td>${ligne.demande}</td>
                  <td>${ligne.adherent}</td>
                  <td>${ligne.date}</td>
                  <td class="amount">${(ligne.montant / 1000).toFixed(3)} TND</td>
                </tr>
              `
              )
              .join('')}
            <tr class="total-row">
              <td colspan="3">TOTAL</td>
              <td class="amount">${((bordereau.total || 0) / 1000).toFixed(3)} TND</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  private generateFactureHTML(data: Record<string, unknown>): string {
    const facture = data as {
      numero?: string;
      date?: string;
      emetteur?: { nom: string; adresse: string; matricule: string };
      destinataire?: { nom: string; adresse: string };
      lignes?: Array<{ description: string; quantite: number; prixUnitaire: number; total: number }>;
      sousTotal?: number;
      tva?: number;
      total?: number;
    };

    return `
      <div class="header">
        <div class="logo">DHAMEN</div>
        <div class="title">Facture</div>
        <div class="subtitle">N° ${facture.numero || 'N/A'} - ${facture.date || ''}</div>
      </div>

      <div class="section">
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Émetteur</div>
            <div class="info-value">${facture.emetteur?.nom || ''}</div>
            <div>${facture.emetteur?.adresse || ''}</div>
            <div>MF: ${facture.emetteur?.matricule || ''}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Destinataire</div>
            <div class="info-value">${facture.destinataire?.nom || ''}</div>
            <div>${facture.destinataire?.adresse || ''}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <table>
          <thead>
            <tr>
              <th>Description</th>
              <th class="amount">Qté</th>
              <th class="amount">P.U.</th>
              <th class="amount">Total</th>
            </tr>
          </thead>
          <tbody>
            ${(facture.lignes || [])
              .map(
                (ligne) => `
                <tr>
                  <td>${ligne.description}</td>
                  <td class="amount">${ligne.quantite}</td>
                  <td class="amount">${(ligne.prixUnitaire / 1000).toFixed(3)} TND</td>
                  <td class="amount">${(ligne.total / 1000).toFixed(3)} TND</td>
                </tr>
              `
              )
              .join('')}
            <tr>
              <td colspan="3">Sous-total HT</td>
              <td class="amount">${((facture.sousTotal || 0) / 1000).toFixed(3)} TND</td>
            </tr>
            <tr>
              <td colspan="3">TVA (19%)</td>
              <td class="amount">${((facture.tva || 0) / 1000).toFixed(3)} TND</td>
            </tr>
            <tr class="total-row">
              <td colspan="3">TOTAL TTC</td>
              <td class="amount">${((facture.total || 0) / 1000).toFixed(3)} TND</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  private generateAttestationHTML(data: Record<string, unknown>): string {
    const attestation = data as {
      type?: string;
      adherent?: { nom: string; prenom: string; matricule: string; dateNaissance: string };
      contrat?: { numero: string; assureur: string; validite: { debut: string; fin: string } };
      garanties?: Array<{ type: string; taux: number; plafond: number }>;
    };

    return `
      <div class="header">
        <div class="logo">DHAMEN</div>
        <div class="title">Attestation d'Affiliation</div>
        <div class="subtitle">${attestation.type || 'Assurance Santé'}</div>
      </div>

      <div class="section">
        <p>Nous certifions que l'assuré ci-dessous est bien affilié à notre système de tiers payant santé.</p>
      </div>

      <div class="section">
        <div class="section-title">Informations Assuré</div>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Nom complet</div>
            <div class="info-value">${attestation.adherent?.prenom || ''} ${attestation.adherent?.nom || ''}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Matricule</div>
            <div class="info-value">${attestation.adherent?.matricule || ''}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Date de naissance</div>
            <div class="info-value">${attestation.adherent?.dateNaissance || ''}</div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Couverture</div>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">N° Contrat</div>
            <div class="info-value">${attestation.contrat?.numero || ''}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Assureur</div>
            <div class="info-value">${attestation.contrat?.assureur || ''}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Validité</div>
            <div class="info-value">${attestation.contrat?.validite?.debut || ''} - ${attestation.contrat?.validite?.fin || ''}</div>
          </div>
        </div>
      </div>

      ${attestation.garanties ? `
        <div class="section">
          <div class="section-title">Garanties</div>
          <table>
            <thead>
              <tr>
                <th>Type de soin</th>
                <th class="amount">Taux</th>
                <th class="amount">Plafond</th>
              </tr>
            </thead>
            <tbody>
              ${attestation.garanties
                .map(
                  (g) => `
                  <tr>
                    <td>${g.type}</td>
                    <td class="amount">${g.taux}%</td>
                    <td class="amount">${(g.plafond / 1000).toFixed(3)} TND</td>
                  </tr>
                `
                )
                .join('')}
            </tbody>
          </table>
        </div>
      ` : ''}
    `;
  }

  private generateReleveHTML(data: Record<string, unknown>): string {
    const releve = data as {
      adherent?: { nom: string; matricule: string };
      periode?: { debut: string; fin: string };
      operations?: Array<{ date: string; type: string; description: string; montant: number }>;
      solde?: number;
    };

    return `
      <div class="header">
        <div class="logo">DHAMEN</div>
        <div class="title">Relevé de Consommation</div>
        <div class="subtitle">
          ${releve.adherent?.nom || ''} - ${releve.periode?.debut || ''} à ${releve.periode?.fin || ''}
        </div>
      </div>

      <div class="section">
        <div class="section-title">Historique</div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Description</th>
              <th class="amount">Montant</th>
            </tr>
          </thead>
          <tbody>
            ${(releve.operations || [])
              .map(
                (op) => `
                <tr>
                  <td>${op.date}</td>
                  <td>${op.type}</td>
                  <td>${op.description}</td>
                  <td class="amount">${(op.montant / 1000).toFixed(3)} TND</td>
                </tr>
              `
              )
              .join('')}
            <tr class="total-row">
              <td colspan="3">TOTAL CONSOMMÉ</td>
              <td class="amount">${((releve.solde || 0) / 1000).toFixed(3)} TND</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }

  private generateGenericHTML(data: Record<string, unknown>): string {
    return `
      <div class="header">
        <div class="logo">DHAMEN</div>
        <div class="title">Document</div>
      </div>
      <div class="section">
        <pre>${JSON.stringify(data, null, 2)}</pre>
      </div>
    `;
  }

  private getTitle(type: PDFExportRequest['type']): string {
    const titles: Record<string, string> = {
      report: 'Rapport',
      bordereau: 'Bordereau de Paiement',
      facture: 'Facture',
      attestation: 'Attestation',
      releve: 'Relevé de Consommation',
    };
    return titles[type] || 'Document';
  }

  private generateFilename(type: PDFExportRequest['type'], id: string): string {
    const date = new Date().toISOString().split('T')[0];
    return `${type}-${date}-${id}.pdf`;
  }

  /**
   * Convert HTML to PDF (simplified - returns HTML as buffer for client-side conversion)
   * In production, use puppeteer, wkhtmltopdf, or a PDF service
   */
  private async htmlToPDF(
    html: string,
    _options?: PDFExportRequest['options']
  ): Promise<ArrayBuffer> {
    // For now, return HTML content as buffer
    // Client can use html2pdf.js or similar for actual conversion
    const encoder = new TextEncoder();
    return encoder.encode(html).buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
