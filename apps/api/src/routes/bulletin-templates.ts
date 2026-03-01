/**
 * Bulletin Templates Routes
 * Public routes for downloading blank bulletin forms for printing
 */
import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';

const bulletinTemplates = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Template definitions with base64-encoded minimal PDF placeholders
// In production, these would be stored in R2 or generated dynamically
const TEMPLATES: Record<string, {
  title: string;
  description: string;
  careType: string;
}> = {
  'bulletin_consultation.pdf': {
    title: 'Bulletin de Soins - Consultation',
    description: 'Formulaire pour les consultations médicales',
    careType: 'consultation',
  },
  'bulletin_pharmacie.pdf': {
    title: 'Bulletin de Soins - Pharmacie',
    description: 'Formulaire pour les achats en pharmacie',
    careType: 'pharmacy',
  },
  'bulletin_analyses.pdf': {
    title: 'Bulletin de Soins - Analyses',
    description: 'Formulaire pour les analyses de laboratoire',
    careType: 'lab',
  },
  'bulletin_hospitalisation.pdf': {
    title: 'Bulletin de Soins - Hospitalisation',
    description: 'Formulaire pour les séjours hospitaliers',
    careType: 'hospital',
  },
  'bulletin_universel.pdf': {
    title: 'Bulletin de Soins - Universel',
    description: 'Formulaire multi-usage',
    careType: 'universal',
  },
};

/**
 * GET /bulletins-soins/templates - List available templates
 */
bulletinTemplates.get('/', async (c) => {
  const templates = Object.entries(TEMPLATES).map(([filename, info]) => ({
    filename,
    ...info,
    downloadUrl: `/api/v1/bulletins-soins/templates/${filename}`,
  }));

  return c.json({
    success: true,
    data: templates,
  });
});

/**
 * GET /bulletins-soins/templates/:filename - Download a specific template
 * Query params:
 * - prefill: 'true' to include adherent information
 * - firstName, lastName, dateOfBirth, matricule, address, phone: adherent data for pre-filling
 */
bulletinTemplates.get('/:filename', async (c) => {
  const filename = c.req.param('filename');
  const template = TEMPLATES[filename];

  if (!template) {
    return c.json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Template non trouvé' },
    }, 404);
  }

  // Check for pre-fill parameters
  const prefill = c.req.query('prefill') === 'true';
  const adherentData = prefill ? {
    firstName: c.req.query('firstName') || '',
    lastName: c.req.query('lastName') || '',
    dateOfBirth: c.req.query('dateOfBirth') || '',
    matricule: c.req.query('matricule') || '',
    address: c.req.query('address') || '',
    phone: c.req.query('phone') || '',
  } : null;

  // Try to get the template from R2 storage (only for blank templates)
  if (!prefill) {
    const storage = c.env.STORAGE;
    if (storage) {
      try {
        const object = await storage.get(`templates/bulletins/${filename}`);
        if (object) {
          const pdfData = await object.arrayBuffer();
          return new Response(pdfData, {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${filename}"`,
              'Cache-Control': 'public, max-age=86400',
            },
          });
        }
      } catch (error) {
        console.error('Error fetching template from R2:', error);
      }
    }
  }

  // Generate PDF (blank or pre-filled)
  const pdfContent = generateSimplePDF(template.title, template.description, template.careType, adherentData);

  // Adjust filename for pre-filled
  const finalFilename = prefill
    ? filename.replace('.pdf', '_prerempli.pdf')
    : filename;

  return new Response(pdfContent, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${finalFilename}"`,
      'Cache-Control': prefill ? 'private, no-cache' : 'public, max-age=86400',
    },
  });
});

/**
 * Adherent data interface for pre-filling
 */
interface AdherentPrefillData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  matricule: string;
  address: string;
  phone: string;
}

/**
 * Escape special characters for PDF text strings
 */
function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[àâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[ïî]/g, 'i')
    .replace(/[ôö]/g, 'o')
    .replace(/[ùûü]/g, 'u')
    .replace(/[ç]/g, 'c');
}

/**
 * Format date for display (DD/MM/YYYY)
 */
function formatDateForPdf(dateString: string): string {
  if (!dateString) return '____/____/________';
  try {
    const date = new Date(dateString);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return '____/____/________';
  }
}

/**
 * Pad or truncate text to fit a field
 */
function padField(text: string, maxLength: number): string {
  const escaped = escapePdfText(text);
  if (escaped.length >= maxLength) {
    return escaped.substring(0, maxLength);
  }
  return escaped + '_'.repeat(maxLength - escaped.length);
}

/**
 * Generate a simple PDF bulletin form
 * This creates a basic PDF with form fields, optionally pre-filled
 */
function generateSimplePDF(
  title: string,
  description: string,
  careType: string,
  adherentData: AdherentPrefillData | null = null
): Uint8Array {
  // PDF header and basic structure
  const careTypeLabels: Record<string, string> = {
    consultation: 'CONSULTATION MEDICALE',
    pharmacy: 'PHARMACIE',
    lab: 'ANALYSES DE LABORATOIRE',
    hospital: 'HOSPITALISATION',
    universal: 'MULTI-USAGE',
  };

  const typeLabel = careTypeLabels[careType] || 'SOINS';

  // Prepare field values (pre-filled or blank)
  const lastName = adherentData ? padField(adherentData.lastName, 32) : '________________________________';
  const firstName = adherentData ? padField(adherentData.firstName, 32) : '________________________________';
  const dob = adherentData ? formatDateForPdf(adherentData.dateOfBirth) : '____/____/________';
  const matricule = adherentData ? padField(adherentData.matricule, 28) : '____________________________';
  const address = adherentData ? padField(adherentData.address, 68) : '____________________________________________________________________';
  const phone = adherentData ? padField(adherentData.phone, 20) : '____________________';

  // Header text indicating if pre-filled
  const headerNote = adherentData
    ? '(PRE-REMPLI - Verifiez les informations)'
    : '';

  // Create a simple PDF (minimal valid PDF structure)
  const pdfLines = [
    '%PDF-1.4',
    '1 0 obj',
    '<< /Type /Catalog /Pages 2 0 R >>',
    'endobj',
    '2 0 obj',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    'endobj',
    '3 0 obj',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    'endobj',
    '4 0 obj',
    '<< /Length 6 0 R >>',
    'stream',
    'BT',
    '/F1 24 Tf',
    '50 780 Td',
    `(DHAMEN - BULLETIN DE SOINS) Tj`,
    '/F1 18 Tf',
    '0 -35 Td',
    `(${typeLabel}) Tj`,
    ...(headerNote ? [
      '/F1 10 Tf',
      '0 -20 Td',
      `(${headerNote}) Tj`,
      '0 -30 Td',
    ] : [
      '0 -50 Td',
    ]),
    '/F1 12 Tf',
    '(INFORMATIONS ADHERENT) Tj',
    '0 -20 Td',
    `(Nom: ${lastName}  Prenom: ${firstName}) Tj`,
    '0 -20 Td',
    `(Date de naissance: ${dob}  N. Adherent: ${matricule}) Tj`,
    '0 -20 Td',
    `(Adresse: ${address}) Tj`,
    ...(adherentData?.phone ? [
      '0 -20 Td',
      `(Telephone: ${phone}) Tj`,
      '0 -20 Td',
    ] : [
      '0 -40 Td',
    ]),
    '(INFORMATIONS BENEFICIAIRE \\(si different de l adherent\\)) Tj',
    '0 -20 Td',
    '(Nom: ________________________________  Prenom: ________________________________) Tj',
    '0 -20 Td',
    '(Lien de parente: __________________________) Tj',
    '0 -40 Td',
    '(INFORMATIONS PRATICIEN) Tj',
    '0 -20 Td',
    '(Nom du praticien: ____________________________________________________________) Tj',
    '0 -20 Td',
    '(Specialite: __________________________  N. Ordre: ______________________________) Tj',
    '0 -20 Td',
    '(Adresse cabinet: ____________________________________________________________) Tj',
    '0 -40 Td',
    '(DETAILS DES SOINS) Tj',
    '0 -20 Td',
    '(Date des soins: ____/____/________) Tj',
    '0 -20 Td',
    '(Nature des soins: ____________________________________________________________) Tj',
    '0 -20 Td',
    '(____________________________________________________________________________) Tj',
    '0 -20 Td',
    '(Montant total: ________________ TND) Tj',
    '0 -40 Td',
    '(CACHET ET SIGNATURE DU PRATICIEN) Tj',
    '0 -60 Td',
    '(                                                          ) Tj',
    '0 -20 Td',
    '(Date: ____/____/________                    Signature:) Tj',
    '0 -80 Td',
    '/F1 10 Tf',
    '(Document a remplir et a scanner dans l application DHAMEN Mobile) Tj',
    '0 -15 Td',
    '(Conservez l original pour vos archives - Delai de traitement: 2 a 5 jours ouvrables) Tj',
    'ET',
    'endstream',
    'endobj',
    '5 0 obj',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    'endobj',
    '6 0 obj',
    '1800',
    'endobj',
    'xref',
    '0 7',
    '0000000000 65535 f ',
    '0000000009 00000 n ',
    '0000000058 00000 n ',
    '0000000115 00000 n ',
    '0000000266 00000 n ',
    '0000002100 00000 n ',
    '0000002197 00000 n ',
    'trailer',
    '<< /Size 7 /Root 1 0 R >>',
    'startxref',
    '2217',
    '%%EOF',
  ];

  const pdfString = pdfLines.join('\n');
  return new TextEncoder().encode(pdfString);
}

export { bulletinTemplates };
