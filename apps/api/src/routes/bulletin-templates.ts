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
  const careTypeLabels: Record<string, string> = {
    consultation: 'CONSULTATION MEDICALE',
    pharmacy: 'PHARMACIE',
    lab: 'ANALYSES DE LABORATOIRE',
    hospital: 'HOSPITALISATION',
    universal: 'MULTI-USAGE',
  };

  const typeLabel = careTypeLabels[careType] || 'SOINS';

  // Prepare field values (pre-filled or blank)
  const lastName = adherentData ? padField(adherentData.lastName, 30) : '______________________________';
  const firstName = adherentData ? padField(adherentData.firstName, 30) : '______________________________';
  const dob = adherentData ? formatDateForPdf(adherentData.dateOfBirth) : '____/____/________';
  const matricule = adherentData ? padField(adherentData.matricule, 24) : '________________________';
  const address = adherentData ? padField(adherentData.address, 60) : '____________________________________________________________';
  const phone = adherentData ? padField(adherentData.phone, 16) : '________________';

  const headerNote = adherentData ? '\\(PRE-REMPLI - Verifiez les informations\\)' : '';

  // Build content stream
  const contentLines: string[] = [
    'BT',
    '/F1 20 Tf',
    '50 800 Td',
    '(DHAMEN - BULLETIN DE SOINS) Tj',
    '/F1 14 Tf',
    '0 -30 Td',
    `(${typeLabel}) Tj`,
  ];

  if (headerNote) {
    contentLines.push('/F1 9 Tf', '0 -18 Td', `(${headerNote}) Tj`);
  }

  contentLines.push(
    '/F1 11 Tf',
    '0 -35 Td',
    '(INFORMATIONS ADHERENT) Tj',
    '/F1 10 Tf',
    '0 -18 Td',
    `(Nom: ${lastName}) Tj`,
    '0 -16 Td',
    `(Prenom: ${firstName}) Tj`,
    '0 -16 Td',
    `(Date de naissance: ${dob}) Tj`,
    '0 -16 Td',
    `(N. Adherent: ${matricule}) Tj`,
    '0 -16 Td',
    `(Adresse: ${address}) Tj`,
  );

  if (adherentData?.phone) {
    contentLines.push('0 -16 Td', `(Telephone: ${phone}) Tj`);
  }

  contentLines.push(
    '/F1 11 Tf',
    '0 -28 Td',
    '(BENEFICIAIRE \\(si different\\)) Tj',
    '/F1 10 Tf',
    '0 -16 Td',
    '(Nom: ______________________________  Prenom: ______________________________) Tj',
    '0 -16 Td',
    '(Lien de parente: ______________________) Tj',
    '/F1 11 Tf',
    '0 -28 Td',
    '(INFORMATIONS PRATICIEN) Tj',
    '/F1 10 Tf',
    '0 -16 Td',
    '(Nom: ____________________________________________________________) Tj',
    '0 -16 Td',
    '(Specialite: ________________________  N. Ordre: ____________________) Tj',
    '0 -16 Td',
    '(Adresse: ____________________________________________________________) Tj',
    '/F1 11 Tf',
    '0 -28 Td',
    '(DETAILS DES SOINS) Tj',
    '/F1 10 Tf',
    '0 -16 Td',
    '(Date des soins: ____/____/________) Tj',
    '0 -16 Td',
    '(Nature: ____________________________________________________________) Tj',
    '0 -16 Td',
    '(________________________________________________________________________) Tj',
    '0 -16 Td',
    '(Montant total: ________________ TND) Tj',
    '/F1 11 Tf',
    '0 -28 Td',
    '(CACHET ET SIGNATURE DU PRATICIEN) Tj',
    '/F1 10 Tf',
    '0 -50 Td',
    '(Date: ____/____/________              Signature:) Tj',
    '/F1 8 Tf',
    '0 -60 Td',
    '(Document a remplir et scanner dans DHAMEN Mobile - Delai: 2 a 5 jours ouvrables) Tj',
    'ET',
  );

  const contentStream = contentLines.join('\n');
  const contentLength = contentStream.length;

  // Build PDF with correct structure
  const objects: string[] = [];
  const offsets: number[] = [];
  let currentOffset = 0;

  // Header
  const header = '%PDF-1.4\n';
  currentOffset = header.length;

  // Object 1: Catalog
  offsets.push(currentOffset);
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  objects.push(obj1);
  currentOffset += obj1.length;

  // Object 2: Pages
  offsets.push(currentOffset);
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  objects.push(obj2);
  currentOffset += obj2.length;

  // Object 3: Page
  offsets.push(currentOffset);
  const obj3 = '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n';
  objects.push(obj3);
  currentOffset += obj3.length;

  // Object 4: Content stream
  offsets.push(currentOffset);
  const obj4 = `4 0 obj\n<< /Length ${contentLength} >>\nstream\n${contentStream}\nendstream\nendobj\n`;
  objects.push(obj4);
  currentOffset += obj4.length;

  // Object 5: Font
  offsets.push(currentOffset);
  const obj5 = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  objects.push(obj5);
  currentOffset += obj5.length;

  // Xref
  const xrefOffset = currentOffset;
  const xrefLines = [
    'xref',
    '0 6',
    '0000000000 65535 f ',
  ];
  for (const offset of offsets) {
    xrefLines.push(offset.toString().padStart(10, '0') + ' 00000 n ');
  }

  const trailer = [
    ...xrefLines,
    'trailer',
    '<< /Size 6 /Root 1 0 R >>',
    'startxref',
    xrefOffset.toString(),
    '%%EOF',
  ].join('\n');

  const pdfString = header + objects.join('') + trailer;
  return new TextEncoder().encode(pdfString);
}

export { bulletinTemplates };
