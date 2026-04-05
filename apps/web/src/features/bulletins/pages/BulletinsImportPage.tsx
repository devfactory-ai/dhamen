import { useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useAgentContext } from '@/features/agent/stores/agent-context';
import { useBatchValidationQueue } from '@/hooks/use-batch-validation-queue';
import { useBulletinValidation } from '@/hooks/use-bulletin-validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Loader2,
  Check,
  X,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  Pill,
  FlaskConical,
  Building2,
  ThumbsUp,
  ThumbsDown,
  SkipForward,
  Package,
  ArrowLeft,
  FileArchive,
  FolderOpen,
  Settings2,
  UserPlus,
  ExternalLink,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ParsedBulletin {
  adherent_matricule: string;
  adherent_first_name: string;
  adherent_last_name: string;
  bulletin_date: string;
  care_type: 'consultation' | 'pharmacy' | 'lab' | 'hospital';
  actes: Array<{
    code: string;
    label: string;
    amount: number;
    ref_prof_sant: string;
    nom_prof_sant: string;
    cod_msgr?: string;
    lib_msgr?: string;
  }>;
  valid: boolean;
  errors: string[];
}

interface ImportResult {
  batch_id: string;
  batch_name: string;
  total_imported: number;
  skipped: number;
  bulletins: Array<{
    id: string;
    bulletin_number: string;
    adherent_matricule: string;
    adherent_name?: string;
    status: string;
    skipped?: boolean;
    reason?: string;
    adherent_auto_created?: boolean;
  }>;
}

/** A sub-lot extracted from a ZIP file (each CSV/XLSX inside the ZIP = one sub-lot) */
interface ZipSubLot {
  name: string;
  bulletins: ParsedBulletin[];
  format: 'sprols' | 'dhamen' | 'unknown';
  fileName: string;
}

/** Scanned document (image/PDF) found inside a ZIP */
interface ZipScannedDoc {
  name: string;
  file: File;
  type: 'image' | 'pdf';
}

// ─── Constants ───────────────────────────────────────────────────────────────

const careTypeConfig = {
  consultation: { label: 'Consultation', icon: Stethoscope },
  pharmacy: { label: 'Pharmacie', icon: Pill },
  lab: { label: 'Laboratoire', icon: FlaskConical },
  hospital: { label: 'Hospitalisation', icon: Building2 },
} as const;

const CARE_TYPE_MAP: Record<string, 'consultation' | 'pharmacy' | 'lab' | 'hospital'> = {
  consultation: 'consultation',
  pharmacie: 'pharmacy',
  pharmacy: 'pharmacy',
  laboratoire: 'lab',
  lab: 'lab',
  hospitalisation: 'hospital',
  hospital: 'hospital',
};

// ─── Column Mapping ──────────────────────────────────────────────────────────

/** Semantic fields that we need to extract from any file format */
type MappableField =
  | 'num_contrat'
  | 'matricule'
  | 'rang_prest'
  | 'nom_prest'
  | 'date_bs'
  | 'date_acte'
  | 'code_acte'
  | 'frais_engages'
  | 'mnt_remb'
  | 'mnt_a_regler'
  | 'cod_msgr'
  | 'lib_msgr'
  | 'ref_prof_sant'
  | 'nom_prof_sant'
  | 'typ_bs'
  | 'nom_adherent'
  | 'ref_bs'
  | 'ignore';

interface ColumnMapping {
  /** Column index → semantic field */
  [columnIndex: number]: MappableField;
}

const FIELD_LABELS: Record<MappableField, string> = {
  num_contrat: 'N° Contrat',
  matricule: 'Matricule',
  rang_prest: 'Rang bénéficiaire',
  nom_prest: 'Nom bénéficiaire',
  date_bs: 'Date bulletin',
  date_acte: 'Date acte',
  code_acte: 'Code acte',
  frais_engages: 'Frais engagés',
  mnt_remb: 'Montant remboursé',
  mnt_a_regler: 'Montant à régler',
  cod_msgr: 'Code message',
  lib_msgr: 'Libellé message',
  ref_prof_sant: 'Réf. prof. santé (MF)',
  nom_prof_sant: 'Nom prof. santé',
  typ_bs: 'Type bulletin',
  nom_adherent: 'Nom adhérent',
  ref_bs: 'Réf. bulletin',
  ignore: '— Ignorer —',
};

/** Default mapping for SPROLS format (31 columns) */
const SPROLS_DEFAULT_MAPPING: ColumnMapping = {
  0: 'num_contrat',
  1: 'matricule',
  2: 'rang_prest',
  3: 'nom_prest',
  4: 'date_bs',
  5: 'ignore',       // Ref_Bs_Phys_Ass
  6: 'ref_bs',       // Ref_Bs_Phys_Clt
  7: 'ignore',       // Ref_Bord_Clt
  8: 'date_acte',
  9: 'code_acte',
  10: 'frais_engages',
  11: 'ignore',      // Mnt_Revise
  12: 'ignore',      // Nbr_Cle
  13: 'mnt_remb',
  14: 'ignore',      // Mnt_Red_If_Avanc
  15: 'mnt_a_regler',
  16: 'cod_msgr',
  17: 'lib_msgr',
  18: 'ref_prof_sant',
  19: 'nom_prof_sant',
  20: 'typ_bs',
  24: 'nom_adherent',
};

/** Auto-detect column mapping from headers */
function autoDetectMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const headerMap: Record<string, MappableField> = {
    num_cont: 'num_contrat',
    mat: 'matricule',
    rang_pres: 'rang_prest',
    nom_pren_prest: 'nom_prest',
    dat_bs: 'date_bs',
    dat_act: 'date_acte',
    cod_act: 'code_acte',
    frais_engag: 'frais_engages',
    mnt_revise: 'ignore',
    nbr_cle: 'ignore',
    mnt_act_remb: 'mnt_remb',
    mnt_red_if_avanc: 'ignore',
    mnt_act_a_regl: 'mnt_a_regler',
    cod_msgr: 'cod_msgr',
    lib_msgr: 'lib_msgr',
    ref_prof_sant: 'ref_prof_sant',
    nom_prof_sant: 'nom_prof_sant',
    typ_bs: 'typ_bs',
    nom_adh: 'nom_adherent',
    ref_bs_phys_clt: 'ref_bs',
    // Dhamen format
    matricule: 'matricule',
    prenom: 'nom_prest',
    nom: 'nom_adherent',
    date_bulletin: 'date_bs',
    type_soin: 'typ_bs',
    code_acte: 'code_acte',
    libelle_acte: 'lib_msgr',
    montant: 'frais_engages',
    ref_prof_sant_2: 'ref_prof_sant',
    nom_prof_sant_2: 'nom_prof_sant',
  };
  headers.forEach((h, i) => {
    const norm = h.toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (headerMap[norm]) {
      mapping[i] = headerMap[norm]!;
    }
  });
  return mapping;
}

// ─── CSV Parsing ─────────────────────────────────────────────────────────────

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',' || ch === ';') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function detectFormat(headers: string[]): 'sprols' | 'dhamen' | 'unknown' {
  const normalized = headers.map(h => h.toLowerCase().replace(/[^a-z_]/g, ''));
  if (normalized.includes('num_cont') || normalized.includes('mat') || normalized.includes('cod_act')) {
    return 'sprols';
  }
  if (normalized.includes('matricule') || normalized.includes('type_soin') || normalized.includes('code_acte')) {
    return 'dhamen';
  }
  return 'unknown';
}

/** Normalize SPROLS date: DD/MM/YY or DD/MM/YYYY → YYYY-MM-DD */
function normalizeSPROLSDate(raw: string): string {
  // DD/MM/YY
  if (/^\d{2}\/\d{2}\/\d{2}$/.test(raw)) {
    const [d, m, y] = raw.split('/');
    const fullYear = parseInt(y!, 10) < 80 ? `20${y}` : `19${y}`;
    return `${fullYear}-${m}-${d}`;
  }
  // DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [d, m, y] = raw.split('/');
    return `${y}-${m}-${d}`;
  }
  return raw;
}

/** Get field value from a row using the column mapping */
function getField(row: unknown[], mapping: ColumnMapping, field: MappableField): string {
  for (const [idx, f] of Object.entries(mapping)) {
    if (f === field) {
      const raw = row[parseInt(idx)];
      if (raw == null) return '';
      return String(raw).trim();
    }
  }
  return '';
}

/** Convert millimes to DT (SPROLS amounts are in millimes: 355372 = 355.372 DT) */
function millimesToDT(raw: string): number {
  const n = parseFloat(raw.replace(',', '.') || '0') || 0;
  // SPROLS amounts are in millimes (1 DT = 1000 millimes)
  return n >= 1000 ? n / 1000 : n;
}

function parseMappedRows(rows: unknown[][], mapping: ColumnMapping, isSprols: boolean): ParsedBulletin[] {
  const groups = new Map<string, { rows: unknown[][]; first: unknown[] }>();

  for (const row of rows) {
    if (row.length < 5) continue;
    const mat = getField(row, mapping, 'matricule');
    const date = getField(row, mapping, 'date_bs');
    if (!mat || !date) continue;
    const key = `${mat}|${date}`;
    if (!groups.has(key)) {
      groups.set(key, { rows: [], first: row });
    }
    groups.get(key)!.rows.push(row);
  }

  const bulletins: ParsedBulletin[] = [];
  for (const [, group] of groups) {
    const firstRow = group.first;
    const mat = getField(firstRow, mapping, 'matricule');
    const nomPren = getField(firstRow, mapping, 'nom_prest');
    const nomAdh = getField(firstRow, mapping, 'nom_adherent');
    const dateBs = getField(firstRow, mapping, 'date_bs');
    const errors: string[] = [];

    // Parse name (format: " NOM PRENOM" — SPROLS has leading space)
    const cleanName = nomPren.trim();
    const nameParts = cleanName.split(/\s+/).filter(Boolean);
    const lastName = nameParts[0] || '';
    const firstName = nameParts.slice(1).join(' ') || '';

    // Normalize date
    const bulletinDate = isSprols ? normalizeSPROLSDate(dateBs) : dateBs;

    if (!mat) errors.push('Matricule manquant');
    if (!firstName && !lastName && !nomAdh) errors.push('Nom manquant');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bulletinDate)) errors.push(`Date invalide: ${dateBs}`);

    // Build actes from all rows
    const actes = group.rows.map(r => {
      const rawAmount = getField(r, mapping, 'frais_engages');
      const rawRemb = getField(r, mapping, 'mnt_a_regler') || getField(r, mapping, 'mnt_remb');
      return {
        code: getField(r, mapping, 'code_acte'),
        label: getField(r, mapping, 'lib_msgr') || getField(r, mapping, 'code_acte') || 'Acte importé',
        amount: isSprols ? millimesToDT(rawAmount) : (parseFloat(rawAmount.replace(',', '.') || '0') || 0),
        ref_prof_sant: getField(r, mapping, 'ref_prof_sant'),
        nom_prof_sant: getField(r, mapping, 'nom_prof_sant') || cleanName,
        cod_msgr: getField(r, mapping, 'cod_msgr') || undefined,
        lib_msgr: getField(r, mapping, 'lib_msgr') || undefined,
        mnt_remb: isSprols ? millimesToDT(rawRemb) : (parseFloat(rawRemb.replace(',', '.') || '0') || 0),
      };
    });

    if (actes.every(a => a.amount === 0)) errors.push('Aucun montant');

    // Guess care type from acte codes
    let careType: 'consultation' | 'pharmacy' | 'lab' | 'hospital' = 'consultation';
    const codes = actes.map(a => a.code.toLowerCase());
    if (codes.some(c => c.startsWith('ph'))) careType = 'pharmacy';
    else if (codes.some(c => c.startsWith('an') || c.startsWith('r') || c.startsWith('e'))) careType = 'lab';
    else if (codes.some(c => c.startsWith('cl') || c.startsWith('hp') || c.startsWith('fch'))) careType = 'hospital';

    bulletins.push({
      adherent_matricule: mat,
      adherent_first_name: firstName,
      adherent_last_name: lastName || nomAdh,
      bulletin_date: bulletinDate,
      care_type: careType,
      actes,
      valid: errors.length === 0,
      errors,
    });
  }
  return bulletins;
}

/** Legacy wrapper for backward compatibility */
function parseSPROLSRows(rows: unknown[][]): ParsedBulletin[] {
  return parseMappedRows(rows, SPROLS_DEFAULT_MAPPING, true);
}

/** Safe string accessor for XLSX rows that may contain numbers */
function str(val: unknown): string {
  if (val == null) return '';
  return String(val).trim();
}

function parseDhamenRows(rows: unknown[][]): ParsedBulletin[] {
  const groups = new Map<string, { rows: unknown[][]; first: unknown[] }>();

  for (const row of rows) {
    if (row.length < 8) continue;
    const mat = str(row[0]);
    const date = str(row[3]);
    if (!mat) continue;
    const key = `${mat}|${date}`;
    if (!groups.has(key)) {
      groups.set(key, { rows: [], first: row });
    }
    groups.get(key)!.rows.push(row);
  }

  const bulletins: ParsedBulletin[] = [];
  for (const [, group] of groups) {
    const f = group.first;
    const mat = str(f[0]);
    const firstName = str(f[1]);
    const lastName = str(f[2]);
    const bulletinDate = str(f[3]);
    const typeSoin = str(f[4]).toLowerCase();
    const errors: string[] = [];

    if (!mat) errors.push('Matricule manquant');
    if (!firstName && !lastName) errors.push('Nom manquant');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bulletinDate)) errors.push('Date invalide');

    const careType = CARE_TYPE_MAP[typeSoin] || 'consultation';

    const actes = group.rows.map(r => ({
      code: str(r[5]),
      label: str(r[6]) || 'Acte importé',
      amount: parseFloat(str(r[7]).replace(',', '.') || '0') || 0,
      ref_prof_sant: str(r[8]),
      nom_prof_sant: str(r[9]),
    }));

    if (actes.every(a => a.amount === 0)) errors.push('Aucun montant');

    bulletins.push({
      adherent_matricule: mat,
      adherent_first_name: firstName,
      adherent_last_name: lastName,
      bulletin_date: bulletinDate,
      care_type: careType,
      actes,
      valid: errors.length === 0,
      errors,
    });
  }
  return bulletins;
}

// ─── ZIP Helpers ────────────────────────────────────────────────────────────

const CSV_EXTENSIONS = ['.csv', '.txt'];
const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif'];
const PDF_EXTENSION = '.pdf';

function isCSVFile(name: string): boolean {
  return CSV_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));
}
function isExcelFile(name: string): boolean {
  return EXCEL_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));
}
function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.some(ext => name.toLowerCase().endsWith(ext));
}
function isPDFFile(name: string): boolean {
  return name.toLowerCase().endsWith(PDF_EXTENSION);
}

function parseCSVContent(text: string): ParsedBulletin[] {
  const lines = text.split('\n').filter(l => l.trim());
  const rows = lines.map(l => parseCSVLine(l));
  if (rows.length < 2) return [];
  const headers = rows[0]!;
  const format = detectFormat(headers);
  const dataRows = rows.slice(1);
  if (format === 'sprols') return parseSPROLSRows(dataRows);
  if (format === 'dhamen') return parseDhamenRows(dataRows);
  const dhamen = parseDhamenRows(dataRows);
  return dhamen.length > 0 ? dhamen : parseSPROLSRows(dataRows);
}

function parseExcelContent(buffer: ArrayBuffer): ParsedBulletin[] {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  if (rows.length < 2) return [];
  const headers = rows[0]!;
  const format = detectFormat(headers);
  const dataRows = rows.slice(1);
  if (format === 'sprols') return parseSPROLSRows(dataRows);
  if (format === 'dhamen') return parseDhamenRows(dataRows);
  const dhamen = parseDhamenRows(dataRows);
  return dhamen.length > 0 ? dhamen : parseSPROLSRows(dataRows);
}

async function processZipFile(file: File): Promise<{ subLots: ZipSubLot[]; scannedDocs: ZipScannedDoc[] }> {
  const zip = await JSZip.loadAsync(file);
  const subLots: ZipSubLot[] = [];
  const scannedDocs: ZipScannedDoc[] = [];

  // Collect all files (flattening directories)
  const entries: { path: string; zipEntry: JSZip.JSZipObject }[] = [];
  zip.forEach((relativePath, entry) => {
    if (!entry.dir) {
      entries.push({ path: relativePath, zipEntry: entry });
    }
  });

  // Group by parent directory
  const dirGroups = new Map<string, typeof entries>();
  for (const entry of entries) {
    const parts = entry.path.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
    if (!dirGroups.has(dir)) dirGroups.set(dir, []);
    dirGroups.get(dir)!.push(entry);
  }

  // Process each file
  for (const entry of entries) {
    const name = entry.path.split('/').pop() || entry.path;
    if (name.startsWith('.') || name.startsWith('__MACOSX')) continue;

    if (isCSVFile(name)) {
      const text = await entry.zipEntry.async('text');
      const bulletins = parseCSVContent(text);
      if (bulletins.length > 0) {
        const lotName = name.replace(/\.(csv|txt)$/i, '');
        subLots.push({
          name: lotName,
          bulletins,
          format: detectFormat(text.split('\n')[0]?.split(/[,;]/).map(h => h.trim()) || []),
          fileName: name,
        });
      }
    } else if (isExcelFile(name)) {
      const buffer = await entry.zipEntry.async('arraybuffer');
      const bulletins = parseExcelContent(buffer);
      if (bulletins.length > 0) {
        const lotName = name.replace(/\.(xlsx?|xls)$/i, '');
        subLots.push({
          name: lotName,
          bulletins,
          format: 'dhamen',
          fileName: name,
        });
      }
    } else if (isImageFile(name) || isPDFFile(name)) {
      const blob = await entry.zipEntry.async('blob');
      const docFile = new File([blob], name, { type: isImageFile(name) ? `image/${name.split('.').pop()}` : 'application/pdf' });
      scannedDocs.push({
        name,
        file: docFile,
        type: isImageFile(name) ? 'image' : 'pdf',
      });
    }
  }

  return { subLots, scannedDocs };
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function BulletinsImportPage() {
  const { selectedCompany } = useAgentContext();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase state
  const [phase, setPhase] = useState<'upload' | 'confirm' | 'review' | 'validate'>('upload');

  // Phase 1: Upload
  const [parsedBulletins, setParsedBulletins] = useState<ParsedBulletin[]>([]);
  const [fileFormat, setFileFormat] = useState<'sprols' | 'dhamen' | 'unknown'>('unknown');
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [isProcessingZip, setIsProcessingZip] = useState(false);
  const [zipSubLots, setZipSubLots] = useState<ZipSubLot[]>([]);
  const [zipScannedDocs, setZipScannedDocs] = useState<ZipScannedDoc[]>([]);
  const [selectedSubLot, setSelectedSubLot] = useState<number | null>(null);

  // Column mapping
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawDataRows, setRawDataRows] = useState<unknown[][]>([]);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [showColumnMapping, setShowColumnMapping] = useState(false);

  // Phase 2: Confirm
  const [batchName, setBatchName] = useState(`Import_${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', 'h')}`);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  // Phase 3: Validate
  const [importedBatchId, setImportedBatchId] = useState<string | null>(null);
  const queue = useBatchValidationQueue({ batchId: importedBatchId });
  const validateMutation = useBulletinValidation();

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const response = await apiClient.post(`/bulletins-soins/agent/${id}/reject`, { notes });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-bulletins'] });
      queryClient.invalidateQueries({ queryKey: ['agent-bulletins'] });
      toast.success('Bulletin rejeté');
    },
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (data: { companyId: string; batchName: string; bulletins: ParsedBulletin[] }) => {
      const payload = {
        companyId: data.companyId,
        batchName: data.batchName,
        bulletins: data.bulletins.filter(b => b.valid).map(b => ({
          adherent_matricule: b.adherent_matricule,
          adherent_first_name: b.adherent_first_name,
          adherent_last_name: b.adherent_last_name,
          bulletin_date: b.bulletin_date,
          care_type: b.care_type,
          actes: b.actes.map(a => ({
            code: a.code || undefined,
            label: a.label,
            amount: a.amount,
            ref_prof_sant: a.ref_prof_sant || 'N/A',
            nom_prof_sant: a.nom_prof_sant || 'N/A',
            cod_msgr: a.cod_msgr,
            lib_msgr: a.lib_msgr,
          })),
        })),
      };
      const response = await apiClient.post<ImportResult>('/bulletins-soins/agent/import-lot', payload);
      if (!response.success) throw new Error(response.error?.message);
      return response.data as ImportResult;
    },
    onSuccess: (data) => {
      setImportResult(data);
      setImportedBatchId(data.batch_id);
      queryClient.invalidateQueries({ queryKey: ['agent-bulletins'] });
      queryClient.invalidateQueries({ queryKey: ['agent-batches'] });
      toast.success(`${data.total_imported} bulletins importés avec succès`);
      setPhase('review');
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erreur lors de l'import");
    },
  });

  // ─── File handling ───
  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setZipSubLots([]);
    setZipScannedDocs([]);
    setSelectedSubLot(null);
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isZip = file.name.endsWith('.zip');

    if (isZip) {
      setIsProcessingZip(true);
      try {
        const { subLots, scannedDocs } = await processZipFile(file);
        setZipSubLots(subLots);
        setZipScannedDocs(scannedDocs);

        if (subLots.length === 0 && scannedDocs.length === 0) {
          toast.error('Aucun fichier exploitable trouvé dans le ZIP');
          return;
        }

        if (subLots.length === 1) {
          // Single CSV/Excel in ZIP → treat like normal import
          setParsedBulletins(subLots[0]!.bulletins);
          setFileFormat(subLots[0]!.format);
          setBatchName(subLots[0]!.name);
          toast.success(`${subLots[0]!.bulletins.length} bulletins détectés depuis ${subLots[0]!.fileName}`);
        } else if (subLots.length > 1) {
          // Multiple CSVs → show sub-lot picker
          const totalBulletins = subLots.reduce((sum, sl) => sum + sl.bulletins.length, 0);
          toast.success(`${subLots.length} lots détectés (${totalBulletins} bulletins au total)${scannedDocs.length > 0 ? ` + ${scannedDocs.length} document(s) scanné(s)` : ''}`);
        } else if (scannedDocs.length > 0) {
          toast.info(`${scannedDocs.length} document(s) scanné(s) trouvé(s). Les fichiers seront disponibles pour traitement OCR.`);
        }
      } catch (err) {
        toast.error('Erreur lors de la lecture du fichier ZIP');
        console.error('[zip-import]', err);
      } finally {
        setIsProcessingZip(false);
      }
      return;
    }

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]!]!;
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        processRows(rows);
      };
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(l => l.trim());
        const rows = lines.map(l => parseCSVLine(l));
        processRows(rows);
      };
      reader.readAsText(file, 'UTF-8');
    }
  }, []);

  const processRows = (rows: unknown[][]) => {
    if (rows.length < 2) {
      toast.error('Fichier vide ou invalide');
      return;
    }
    const headers = (rows[0] || []).map(h => String(h ?? ''));
    const format = detectFormat(headers);
    setFileFormat(format);

    const dataRows = rows.slice(1);
    // Store raw data for re-parsing after column mapping changes
    setRawHeaders(headers);
    setRawDataRows(dataRows);

    // Auto-detect column mapping
    let mapping: ColumnMapping;
    if (format === 'sprols') {
      // Use known SPROLS mapping, refined by header matching
      const detected = autoDetectMapping(headers);
      mapping = Object.keys(detected).length >= 5 ? detected : { ...SPROLS_DEFAULT_MAPPING };
    } else {
      mapping = autoDetectMapping(headers);
    }
    setColumnMapping(mapping);

    // Parse with mapping
    const isSprols = format === 'sprols';
    let bulletins: ParsedBulletin[];
    if (format === 'dhamen') {
      bulletins = parseDhamenRows(dataRows);
    } else {
      bulletins = parseMappedRows(dataRows, mapping, isSprols);
    }

    setParsedBulletins(bulletins);
    if (bulletins.length > 0) {
      toast.success(`${bulletins.length} bulletins détectés (format ${format === 'sprols' ? 'SPROLS' : format === 'dhamen' ? 'Dhamen' : 'auto'})`);
    } else {
      toast.error('Aucun bulletin détecté. Vérifiez le format du fichier.');
    }
  };

  /** Re-parse data after user changes column mapping */
  const reParseWithMapping = (newMapping: ColumnMapping) => {
    setColumnMapping(newMapping);
    if (rawDataRows.length === 0) return;
    const isSprols = fileFormat === 'sprols';
    const bulletins = parseMappedRows(rawDataRows, newMapping, isSprols);
    setParsedBulletins(bulletins);
    toast.success(`${bulletins.length} bulletins re-détectés avec le nouveau mapping`);
  };

  const updateColumnField = (colIndex: number, field: MappableField) => {
    const newMapping = { ...columnMapping, [colIndex]: field };
    reParseWithMapping(newMapping);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const validCount = parsedBulletins.filter(b => b.valid).length;
  const invalidCount = parsedBulletins.filter(b => !b.valid).length;

  // ─── Phase 3: Validation handlers ───
  const handleValidate = () => {
    if (!queue.currentBulletin) return;
    const totalAmount = queue.currentBulletin.total_amount;
    const estimated = queue.currentBulletin.reimbursed_amount || Math.round(totalAmount * 0.7);
    validateMutation.mutate(
      { id: queue.currentBulletin.id, reimbursed_amount: estimated },
      { onSuccess: () => { queue.refreshBulletins(); queue.goToNext(); } }
    );
  };

  const handleReject = () => {
    if (!queue.currentBulletin) return;
    rejectMutation.mutate(
      { id: queue.currentBulletin.id, notes: 'Rejeté lors de la validation du lot' },
      { onSuccess: () => { queue.refreshBulletins(); queue.goToNext(); } }
    );
  };

  const handleSkip = () => {
    queue.goToNext();
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/bulletins" className="hover:text-gray-900 transition-colors">Bulletins</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Importer un lot</span>
      </nav>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            {phase !== 'upload' && (
              <button
                type="button"
                onClick={() => { setPhase('upload'); setParsedBulletins([]); setImportResult(null); setImportedBatchId(null); setZipSubLots([]); setZipScannedDocs([]); setSelectedSubLot(null); setFileName(''); setRawHeaders([]); setRawDataRows([]); setColumnMapping({}); setShowColumnMapping(false); }}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <h1 className="text-2xl font-bold text-gray-900">
              Import de Lot
            </h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            {phase === 'upload' && 'Importez un fichier CSV, Excel ou ZIP contenant vos bulletins de soins.'}
            {phase === 'confirm' && 'Vérifiez les données et lancez l\'import.'}
            {phase === 'review' && 'Vérifiez les adhérents créés automatiquement avant de continuer.'}
            {phase === 'validate' && 'Validez chaque bulletin un par un.'}
          </p>
        </div>
        {selectedCompany && (
          <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-[10px] font-bold text-white">
              {selectedCompany.name?.slice(0, 3).toUpperCase()}
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">Entreprise active</p>
              <p className="text-sm font-semibold text-gray-900">{selectedCompany.name}</p>
            </div>
          </div>
        )}
      </div>

      {/* Phase steps indicator */}
      <div className="flex items-center gap-3">
        {[
          { step: 1, label: 'Upload', phase: 'upload' as const },
          { step: 2, label: 'Prévisualisation', phase: 'confirm' as const },
          { step: 3, label: 'Revue adhérents', phase: 'review' as const },
          { step: 4, label: 'Validation', phase: 'validate' as const },
        ].map((s, i) => {
          const phases: typeof phase[] = ['upload', 'confirm', 'review', 'validate'];
          const currentIdx = phases.indexOf(phase);
          const stepIdx = phases.indexOf(s.phase);
          return (
          <div key={s.step} className="flex items-center gap-3">
            {i > 0 && <div className="w-12 h-px bg-gray-200" />}
            <div className="flex items-center gap-2">
              <div className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                currentIdx === stepIdx ? 'bg-blue-600 text-white' :
                currentIdx > stepIdx
                  ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
              )}>
                {currentIdx > stepIdx
                  ? <Check className="h-4 w-4" />
                  : s.step}
              </div>
              <span className={cn(
                'text-sm font-medium',
                currentIdx === stepIdx ? 'text-gray-900' : 'text-gray-400'
              )}>{s.label}</span>
            </div>
          </div>
          );
        })}
      </div>

      {/* ═══ Phase 1: Upload ═══ */}
      {phase === 'upload' && (
        <div className="space-y-6">
          {/* Drop zone */}
          <div
            className={cn(
              'rounded-2xl border-2 border-dashed p-12 text-center transition-colors cursor-pointer',
              dragOver ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200 bg-white hover:border-gray-300'
            )}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.zip"
              onChange={handleFileInput}
              className="hidden"
            />
            {isProcessingZip ? (
              <>
                <Loader2 className="h-12 w-12 text-blue-400 mx-auto mb-4 animate-spin" />
                <p className="text-sm font-medium text-gray-700">Extraction du fichier ZIP en cours...</p>
              </>
            ) : (
              <>
                <Upload className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <p className="text-sm font-medium text-gray-700">
                  Glissez votre fichier ici ou <span className="text-blue-600">parcourir</span>
                </p>
                <p className="text-xs text-gray-400 mt-2">CSV, XLSX ou ZIP — Format SPROLS ou E-Santé standard</p>
                <p className="text-xs text-gray-400 mt-1">ZIP : peut contenir plusieurs fichiers CSV/Excel (un par lot) ou des documents scannés</p>
              </>
            )}
            {fileName && !isProcessingZip && zipSubLots.length === 0 && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2 text-sm text-blue-700">
                <FileSpreadsheet className="h-4 w-4" />
                {fileName}
                <span className="text-blue-500 font-medium">
                  ({fileFormat === 'sprols' ? 'Format SPROLS' : fileFormat === 'dhamen' ? 'Format Dhamen' : 'Auto-détecté'})
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setParsedBulletins([]);
                    setFileName('');
                    setFileFormat('unknown');
                    setRawHeaders([]);
                    setRawDataRows([]);
                    setColumnMapping({});
                    setShowColumnMapping(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    toast.info('Fichier supprimé. Vous pouvez importer un autre fichier.');
                  }}
                  className="ml-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-200 text-blue-700 hover:bg-red-200 hover:text-red-700 transition-colors"
                  title="Supprimer et ré-importer"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          {/* ZIP sub-lots picker (when ZIP contains multiple lots) */}
          {zipSubLots.length > 1 && (
            <div className="rounded-2xl border border-gray-200 bg-white">
              <div className="px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <FileArchive className="h-5 w-5 text-orange-500" />
                  <h3 className="text-sm font-bold text-gray-900">Lots détectés dans le ZIP</h3>
                  <span className="text-xs text-gray-400">({zipSubLots.length} lots)</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Sélectionnez un lot à importer ou importez-les tous</p>
              </div>
              <div className="divide-y divide-gray-100">
                {zipSubLots.map((lot, idx) => {
                  const lotValid = lot.bulletins.filter(b => b.valid).length;
                  const lotInvalid = lot.bulletins.filter(b => !b.valid).length;
                  return (
                    <div
                      key={idx}
                      className={cn(
                        'flex items-center justify-between px-6 py-3 cursor-pointer transition-colors',
                        selectedSubLot === idx ? 'bg-blue-50' : 'hover:bg-gray-50'
                      )}
                      onClick={() => {
                        setSelectedSubLot(idx);
                        setParsedBulletins(lot.bulletins);
                        setFileFormat(lot.format);
                        setBatchName(lot.name);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-50">
                          <FolderOpen className="h-4 w-4 text-orange-600" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{lot.name}</p>
                          <p className="text-xs text-gray-400">{lot.fileName} — {lot.format.toUpperCase()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                          <Check className="h-3 w-3" /> {lotValid}
                        </span>
                        {lotInvalid > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                            <X className="h-3 w-3" /> {lotInvalid}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">{lot.bulletins.length} bulletins</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {/* Import all lots button */}
              <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/50 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    // Merge all sub-lots into one
                    const allBulletins = zipSubLots.flatMap(sl => sl.bulletins);
                    setParsedBulletins(allBulletins);
                    setFileFormat('dhamen');
                    setBatchName(`ZIP_${new Date().toISOString().slice(0, 10)}`);
                    setSelectedSubLot(null);
                    toast.success(`${allBulletins.length} bulletins fusionnés depuis ${zipSubLots.length} lots`);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Package className="h-3.5 w-3.5" />
                  Fusionner tous les lots ({zipSubLots.reduce((s, l) => s + l.bulletins.filter(b => b.valid).length, 0)} bulletins)
                </button>
              </div>
            </div>
          )}

          {/* ZIP scanned documents info */}
          {zipScannedDocs.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/50 px-6 py-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <p className="text-sm font-semibold text-amber-800">{zipScannedDocs.length} document(s) scanné(s) détecté(s)</p>
              </div>
              <p className="text-xs text-amber-700">
                Les fichiers images et PDF seront disponibles pour saisie manuelle ou traitement OCR ultérieurement.
                Formats : {zipScannedDocs.map(d => d.name).join(', ')}
              </p>
            </div>
          )}

          {/* Column Mapping Editor */}
          {rawHeaders.length > 0 && parsedBulletins.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white">
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-gray-500" />
                  <h3 className="text-sm font-bold text-gray-900">Mapping des colonnes</h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {fileFormat === 'sprols' ? 'SPROLS' : fileFormat === 'dhamen' ? 'Dhamen' : 'Auto'}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowColumnMapping(!showColumnMapping)}
                  className="text-xs gap-1"
                >
                  {showColumnMapping ? 'Masquer' : 'Modifier les colonnes'}
                  <ChevronRight className={cn('h-3 w-3 transition-transform', showColumnMapping && 'rotate-90')} />
                </Button>
              </div>
              {showColumnMapping && (
                <div className="p-4 space-y-3 max-h-[400px] overflow-y-auto">
                  <p className="text-xs text-gray-500 mb-2">
                    Associez chaque colonne du fichier au champ correspondant. Les 3 premières lignes de données sont affichées en aperçu.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="px-2 py-2 text-left font-semibold text-gray-500 w-8">#</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-500">En-tête fichier</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-500 min-w-[180px]">Champ mappé</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-400">Aperçu (ligne 1)</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-400">Ligne 2</th>
                          <th className="px-2 py-2 text-left font-semibold text-gray-400">Ligne 3</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {rawHeaders.map((header, colIdx) => {
                          const currentField = columnMapping[colIdx] || 'ignore';
                          const isImportant = currentField !== 'ignore';
                          return (
                            <tr key={colIdx} className={cn(isImportant ? 'bg-blue-50/30' : 'opacity-60')}>
                              <td className="px-2 py-1.5 text-gray-400">{colIdx}</td>
                              <td className="px-2 py-1.5 font-mono text-gray-700 truncate max-w-[150px]" title={header}>
                                {header}
                              </td>
                              <td className="px-2 py-1.5">
                                <Select
                                  value={currentField}
                                  onValueChange={(val) => updateColumnField(colIdx, val as MappableField)}
                                >
                                  <SelectTrigger className="h-7 text-xs rounded-lg">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(Object.keys(FIELD_LABELS) as MappableField[]).map((f) => (
                                      <SelectItem key={f} value={f} className="text-xs">
                                        {FIELD_LABELS[f]}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-2 py-1.5 text-gray-400 truncate max-w-[120px]" title={String(rawDataRows[0]?.[colIdx] ?? '')}>
                                {String(rawDataRows[0]?.[colIdx] ?? '—')}
                              </td>
                              <td className="px-2 py-1.5 text-gray-400 truncate max-w-[120px]">
                                {String(rawDataRows[1]?.[colIdx] ?? '—')}
                              </td>
                              <td className="px-2 py-1.5 text-gray-400 truncate max-w-[120px]">
                                {String(rawDataRows[2]?.[colIdx] ?? '—')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Preview table */}
          {parsedBulletins.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white">
              {/* Summary header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div className="flex items-center gap-4">
                  <h3 className="text-sm font-bold text-gray-900">Prévisualisation</h3>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                      <Check className="h-3 w-3" /> {validCount} valides
                    </span>
                    {invalidCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                        <X className="h-3 w-3" /> {invalidCount} erreurs
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { setPhase('confirm'); }}
                  disabled={validCount === 0}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25 disabled:opacity-40"
                >
                  Continuer ({validCount} bulletins)
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Table */}
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <th className="w-10 px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500">#</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Statut</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Matricule</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Adhérent</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Date</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Type</th>
                    <th className="px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-gray-500">Actes</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parsedBulletins.map((b, i) => {
                    const total = b.actes.reduce((s, a) => s + a.amount, 0);
                    const config = careTypeConfig[b.care_type];
                    const Icon = config.icon;
                    return (
                      <tr key={i} className={cn('transition-colors', b.valid ? 'hover:bg-gray-50/50' : 'bg-red-50/30')}>
                        <td className="px-4 py-3 text-center text-xs text-gray-400">{i + 1}</td>
                        <td className="px-4 py-3">
                          {b.valid ? (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
                              <Check className="h-3.5 w-3.5 text-green-600" />
                            </span>
                          ) : (
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-100" title={b.errors.join(', ')}>
                              <X className="h-3.5 w-3.5 text-red-600" />
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-700">{b.adherent_matricule}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-900">{b.adherent_first_name} {b.adherent_last_name}</p>
                          {!b.valid && b.errors.length > 0 && (
                            <p className="text-[10px] text-red-500 mt-0.5">{b.errors.join(' · ')}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{b.bulletin_date}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Icon className="h-3.5 w-3.5 text-gray-400" />
                            <span className="text-sm text-gray-700">{config.label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-medium text-gray-900">{b.actes.length}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                          {total.toLocaleString('fr-TN', { minimumFractionDigits: 2 })} DT
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ Phase 2: Confirm ═══ */}
      {phase === 'confirm' && (
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Summary card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
                <Package className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Confirmer l'import</h3>
                <p className="text-sm text-gray-500">{validCount} bulletins seront importés dans un nouveau lot</p>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-gray-50 p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">{validCount}</p>
                <p className="text-xs text-gray-500">Bulletins valides</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {parsedBulletins.filter(b => b.valid).reduce((s, b) => s + b.actes.length, 0)}
                </p>
                <p className="text-xs text-gray-500">Actes total</p>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-gray-900 to-blue-950 p-4 text-center text-white">
                <p className="text-2xl font-bold">
                  {parsedBulletins.filter(b => b.valid).reduce((s, b) => s + b.actes.reduce((a, act) => a + act.amount, 0), 0).toLocaleString('fr-TN', { minimumFractionDigits: 2 })} DT
                </p>
                <p className="text-xs text-blue-200">Montant total</p>
              </div>
            </div>

            {/* Batch name */}
            <div className="space-y-2">
              <Label className="text-sm text-gray-700">Nom du lot</Label>
              <Input
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                className="rounded-xl"
                placeholder="Import_2026-03-24_14h30"
              />
            </div>

            {invalidCount > 0 && (
              <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">{invalidCount} bulletin(s) avec erreurs seront ignorés</p>
                  <p className="text-xs text-amber-600 mt-0.5">Seuls les bulletins valides seront importés.</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="rounded-xl flex-1"
                onClick={() => setPhase('upload')}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Retour
              </Button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedCompany) {
                    toast.error('Veuillez sélectionner une entreprise');
                    return;
                  }
                  importMutation.mutate({
                    companyId: selectedCompany.id,
                    batchName,
                    bulletins: parsedBulletins,
                  });
                }}
                disabled={importMutation.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-2.5 text-sm font-medium text-white hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25 flex-1 disabled:opacity-50"
              >
                {importMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Import en cours...</>
                ) : (
                  <><Upload className="h-4 w-4" /> Importer {validCount} bulletins</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Phase 3: Review adherents before validation ═══ */}
      {phase === 'review' && importResult && (() => {
        const autoCreatedBulletins = importResult.bulletins?.filter(b => b.adherent_auto_created && !b.skipped) || [];
        const existingBulletins = importResult.bulletins?.filter(b => !b.adherent_auto_created && !b.skipped) || [];
        const hasAutoCreated = autoCreatedBulletins.length > 0;
        return (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Import success summary */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">Import réussi</h3>
                <p className="text-sm text-gray-500">
                  Lot : <strong>{importResult.batch_name}</strong> — {importResult.total_imported} bulletin(s) importés
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-green-50 p-4 text-center">
                <p className="text-2xl font-bold text-green-700">{existingBulletins.length}</p>
                <p className="text-xs text-green-600">Adhérents existants</p>
              </div>
              <div className="rounded-xl bg-amber-50 p-4 text-center">
                <p className="text-2xl font-bold text-amber-700">{autoCreatedBulletins.length}</p>
                <p className="text-xs text-amber-600">Adhérents créés auto.</p>
              </div>
              <div className="rounded-xl bg-gray-50 p-4 text-center">
                <p className="text-2xl font-bold text-gray-700">{importResult.skipped}</p>
                <p className="text-xs text-gray-500">Ignorés</p>
              </div>
            </div>
          </div>

          {/* Auto-created adherents warning */}
          {hasAutoCreated && (
            <div className="rounded-2xl border border-amber-200 bg-white p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50">
                  <UserPlus className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-gray-900">Adhérents créés automatiquement</h4>
                  <p className="text-sm text-gray-500">
                    {autoCreatedBulletins.length} adhérent(s) n'existaient pas et ont été créés automatiquement.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl bg-amber-50 border border-amber-200 p-4">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Vérifiez ces adhérents avant de continuer</p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    Vous pouvez modifier leurs informations dans la page Adhérents avant de passer à la validation.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase text-gray-500">Matricule</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase text-gray-500">Nom</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase text-gray-500">N° Bulletin</th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase text-gray-500">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {autoCreatedBulletins.map((b) => (
                      <tr key={b.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 font-mono text-gray-700">{b.adherent_matricule}</td>
                        <td className="px-4 py-2.5 text-gray-900">{b.adherent_name || '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-gray-600">{b.bulletin_number}</td>
                        <td className="px-4 py-2.5">
                          <Badge className="bg-amber-100 text-amber-700 text-[10px]">Créé automatiquement</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* No auto-created: all adherents found */}
          {!hasAutoCreated && (
            <div className="flex items-start gap-3 rounded-2xl bg-green-50 border border-green-200 p-5">
              <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-800">Tous les adhérents existent dans la base</p>
                <p className="text-xs text-green-600 mt-0.5">Vous pouvez passer directement à la validation des bulletins.</p>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            {hasAutoCreated && (
              <a
                href="/adherents"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors flex-1"
              >
                <ExternalLink className="h-4 w-4" />
                Modifier les adhérents
              </a>
            )}
            <button
              type="button"
              onClick={() => setPhase('validate')}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-2.5 text-sm font-medium text-white hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25 flex-1"
            >
              Continuer vers la validation
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
        );
      })()}

      {/* ═══ Phase 4: Validation Queue ═══ */}
      {phase === 'validate' && (
        <div className="space-y-4">
          {/* Import result summary */}
          {importResult && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-green-50">
                  <Check className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Import réussi</h3>
                  <p className="text-sm text-gray-500">
                    Lot : <strong>{importResult.batch_name}</strong>
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="rounded-xl bg-green-50 p-4 text-center">
                  <p className="text-2xl font-bold text-green-700">{importResult.total_imported}</p>
                  <p className="text-xs text-green-600">Bulletins importés</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-4 text-center">
                  <p className="text-2xl font-bold text-amber-700">{importResult.skipped}</p>
                  <p className="text-xs text-amber-600">Ignorés (adhérent non trouvé)</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4 text-center">
                  <p className="text-2xl font-bold text-gray-700">{importResult.bulletins?.length || 0}</p>
                  <p className="text-xs text-gray-500">Total traités</p>
                </div>
              </div>
              {/* Show skipped bulletins */}
              {importResult.bulletins?.filter(b => b.skipped).length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 mb-4">
                  <p className="text-xs font-semibold text-amber-800 mb-2">Bulletins ignorés :</p>
                  {importResult.bulletins.filter(b => b.skipped).map((b, i) => (
                    <p key={i} className="text-xs text-amber-700">
                      Matricule <strong>{b.adherent_matricule}</strong> : {b.reason}
                    </p>
                  ))}
                </div>
              )}
              {/* Show imported bulletins list */}
              {importResult.bulletins?.filter(b => !b.skipped).length > 0 && (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">N° Bulletin</th>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">Adhérent</th>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">Matricule</th>
                        <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase text-gray-500">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {importResult.bulletins.filter(b => !b.skipped).map((b) => (
                        <tr key={b.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-2 font-mono text-gray-700">{b.bulletin_number}</td>
                          <td className="px-4 py-2">
                            <span className="text-gray-900">{b.adherent_name || '—'}</span>
                            {b.adherent_auto_created && (
                              <Badge className="ml-2 bg-amber-100 text-amber-700 text-[10px]">Nouveau</Badge>
                            )}
                          </td>
                          <td className="px-4 py-2 font-mono text-gray-600">{b.adherent_matricule}</td>
                          <td className="px-4 py-2">
                            <Badge className="bg-blue-100 text-blue-700">{b.status === 'in_batch' ? 'En attente' : b.status}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Progress bar */}
          {queue.bulletins.length > 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-900">
                Validation : {queue.progress.validated + queue.progress.rejected} / {queue.progress.total} traités
              </p>
              <div className="flex items-center gap-3 text-xs">
                <span className="flex items-center gap-1 text-green-600">
                  <ThumbsUp className="h-3.5 w-3.5" /> {queue.progress.validated} validés
                </span>
                <span className="flex items-center gap-1 text-red-500">
                  <ThumbsDown className="h-3.5 w-3.5" /> {queue.progress.rejected} rejetés
                </span>
                <span className="flex items-center gap-1 text-gray-400">
                  <FileText className="h-3.5 w-3.5" /> {queue.progress.pending} en attente
                </span>
              </div>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-500 transition-all"
                style={{ width: `${queue.progress.total > 0 ? ((queue.progress.validated + queue.progress.rejected) / queue.progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
          )}

          {/* Navigation buttons */}
          {!queue.isLoading && queue.bulletins.length === 0 && (
            <div className="flex justify-center gap-3 mt-4">
              <Button
                variant="outline"
                className="rounded-xl"
                onClick={() => window.location.href = '/bulletins/history'}
              >
                Voir l'historique des bulletins
              </Button>
              <button
                type="button"
                onClick={() => { setPhase('upload'); setParsedBulletins([]); setImportResult(null); setImportedBatchId(null); setZipSubLots([]); setZipScannedDocs([]); setSelectedSubLot(null); setFileName(''); setRawHeaders([]); setRawDataRows([]); setColumnMapping({}); setShowColumnMapping(false); }}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25"
              >
                Importer un autre lot
              </button>
            </div>
          )}

          {queue.isComplete ? (
            /* Completion card */
            <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mx-auto mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Validation terminée</h3>
              <p className="text-sm text-gray-500 mb-6">
                {queue.progress.validated} bulletins validés, {queue.progress.rejected} rejetés sur {queue.progress.total} total.
              </p>
              <div className="flex justify-center gap-3">
                <Button
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => window.location.href = '/bulletins/saisie'}
                >
                  Retour aux bulletins
                </Button>
                <button
                  type="button"
                  onClick={() => window.location.href = '/bulletins/history'}
                  className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-2.5 text-sm font-medium text-white hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25"
                >
                  Voir l'historique des bulletins
                </button>
              </div>
            </div>
          ) : queue.isLoading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Chargement des bulletins pour validation...</span>
            </div>
          ) : queue.bulletins.length > 0 ? (
            /* Main validation area */
            <div className="grid grid-cols-[280px_1fr] gap-4">
              {/* Left sidebar: bulletin list */}
              <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                    Bulletins ({queue.bulletins.length})
                  </p>
                </div>
                <div className="max-h-[600px] overflow-y-auto divide-y divide-gray-50">
                  {queue.bulletins.map((b, i) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => queue.goToIndex(i)}
                      className={cn(
                        'w-full text-left px-4 py-3 transition-colors',
                        i === queue.currentIndex ? 'bg-blue-50 border-l-2 border-l-blue-600' : 'hover:bg-gray-50'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-gray-900 truncate">{b.bulletin_number}</p>
                        {b.status === 'approved' && <span className="h-2 w-2 rounded-full bg-green-500" />}
                        {b.status === 'rejected' && <span className="h-2 w-2 rounded-full bg-red-500" />}
                        {!['approved', 'rejected'].includes(b.status) && <span className="h-2 w-2 rounded-full bg-gray-300" />}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                        {b.adherent_first_name} {b.adherent_last_name} · {b.adherent_matricule}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Main content: current bulletin detail */}
              {queue.currentBulletin && (
                <div className="space-y-4">
                  {/* Bulletin header */}
                  <div className="rounded-2xl border border-gray-200 bg-white p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">{queue.currentBulletin.bulletin_number}</h3>
                        <p className="text-sm text-gray-500">
                          Bulletin {queue.currentIndex + 1} sur {queue.bulletins.length}
                        </p>
                      </div>
                      <Badge variant={
                        queue.currentBulletin.status === 'approved' ? 'default' :
                        queue.currentBulletin.status === 'rejected' ? 'destructive' : 'secondary'
                      }>
                        {queue.currentBulletin.status === 'approved' ? 'Validé' :
                         queue.currentBulletin.status === 'rejected' ? 'Rejeté' : 'En attente'}
                      </Badge>
                    </div>

                    {/* Adherent info */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div className="rounded-xl bg-gray-50 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Adhérent</p>
                        <p className="text-sm font-semibold text-gray-900">
                          {queue.currentBulletin.adherent_first_name} {queue.currentBulletin.adherent_last_name}
                        </p>
                        <p className="text-xs text-gray-500 font-mono">{queue.currentBulletin.adherent_matricule}</p>
                      </div>
                      <div className="rounded-xl bg-gray-50 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Détails</p>
                        <p className="text-sm text-gray-700">
                          {careTypeConfig[queue.currentBulletin.care_type as keyof typeof careTypeConfig]?.label || queue.currentBulletin.care_type}
                        </p>
                        <p className="text-xs text-gray-500">{queue.currentBulletin.bulletin_date}</p>
                      </div>
                    </div>

                    {/* Amounts */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="rounded-xl border border-gray-200 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Frais engagés</p>
                        <p className="text-xl font-bold text-gray-900">
                          {queue.currentBulletin.total_amount.toLocaleString('fr-TN', { minimumFractionDigits: 2 })} DT
                        </p>
                      </div>
                      <div className="rounded-xl bg-gradient-to-br from-gray-900 to-blue-950 p-4 text-white">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-200 mb-1">Remboursement estimé</p>
                        <p className="text-xl font-bold">
                          {(queue.currentBulletin.reimbursed_amount || 0).toLocaleString('fr-TN', { minimumFractionDigits: 2 })} DT
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actes table */}
                  <div className="rounded-2xl border border-gray-200 bg-white">
                    <div className="px-6 py-3 border-b border-gray-100 bg-gray-50/50">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Actes ({queue.currentBulletin.actes?.length || 0})
                      </p>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Code</th>
                          <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Libellé</th>
                          <th className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">Praticien</th>
                          <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Montant</th>
                          <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">Remb.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(queue.currentBulletin.actes || []).map((acte) => (
                          <tr key={acte.id} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3 text-sm font-mono text-gray-600">{acte.code || '—'}</td>
                            <td className="px-4 py-3 text-sm text-gray-900">{acte.label}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{acte.nom_prof_sant || '—'}</td>
                            <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                              {acte.amount.toLocaleString('fr-TN', { minimumFractionDigits: 2 })} DT
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium text-green-700">
                              {(acte.montant_rembourse || 0).toLocaleString('fr-TN', { minimumFractionDigits: 2 })} DT
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Action buttons */}
                  {!['approved', 'rejected'].includes(queue.currentBulletin.status) && (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleReject}
                        disabled={rejectMutation.isPending}
                        className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-5 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors flex-1 justify-center disabled:opacity-50"
                      >
                        <ThumbsDown className="h-4 w-4" />
                        Rejeter
                      </button>
                      <button
                        type="button"
                        onClick={handleSkip}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors justify-center"
                      >
                        <SkipForward className="h-4 w-4" />
                        Passer
                      </button>
                      <button
                        type="button"
                        onClick={handleValidate}
                        disabled={validateMutation.isPending}
                        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-green-700 px-5 py-3 text-sm font-medium text-white hover:from-green-700 hover:to-green-800 shadow-lg shadow-green-600/25 flex-1 justify-center disabled:opacity-50"
                      >
                        <ThumbsUp className="h-4 w-4" />
                        Valider
                      </button>
                    </div>
                  )}

                  {/* Navigation */}
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={queue.goToPrevious}
                      disabled={queue.currentIndex === 0}
                      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" /> Précédent
                    </button>
                    <span className="text-xs text-gray-400">
                      {queue.currentIndex + 1} / {queue.bulletins.length}
                    </span>
                    <button
                      type="button"
                      onClick={queue.goToNext}
                      disabled={queue.currentIndex === queue.bulletins.length - 1}
                      className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-40"
                    >
                      Suivant <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
