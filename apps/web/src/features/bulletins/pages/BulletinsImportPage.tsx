import { useState, useCallback, useRef } from 'react';
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
  Eye,
  ThumbsUp,
  ThumbsDown,
  SkipForward,
  Package,
  ArrowLeft,
  FileArchive,
  FolderOpen,
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
    status: string;
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

function parseSPROLSRows(rows: string[][]): ParsedBulletin[] {
  // Group rows by (matricule, date) to form bulletins
  const groups = new Map<string, { rows: string[][]; first: string[] }>();

  for (const row of rows) {
    if (row.length < 7) continue;
    const mat = row[1]?.trim() || '';
    const date = row[4]?.trim() || '';
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
    const mat = firstRow[1]?.trim() || '';
    const nomPren = firstRow[3]?.trim() || '';
    const dateBs = firstRow[4]?.trim() || '';
    const errors: string[] = [];

    // Parse name (format: "NOM Prenom")
    const nameParts = nomPren.split(' ');
    const lastName = nameParts[0] || '';
    const firstName = nameParts.slice(1).join(' ') || '';

    // Normalize date (DD/MM/YYYY -> YYYY-MM-DD)
    let bulletinDate = dateBs;
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateBs)) {
      const [d, m, y] = dateBs.split('/');
      bulletinDate = `${y}-${m}-${d}`;
    }

    if (!mat) errors.push('Matricule manquant');
    if (!firstName && !lastName) errors.push('Nom manquant');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bulletinDate)) errors.push('Date invalide');

    // Build actes from all rows in group
    const actes = group.rows.map(r => ({
      code: r[5]?.trim() || '',
      label: r[9]?.trim() || r[5]?.trim() || 'Acte importé',
      amount: parseFloat(r[6]?.replace(',', '.') || '0') || 0,
      ref_prof_sant: r[10]?.trim() || '',
      nom_prof_sant: r[11]?.trim() || r[3]?.trim() || '',
      cod_msgr: r[8]?.trim() || undefined,
      lib_msgr: r[9]?.trim() || undefined,
    }));

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

function parseDhamenRows(rows: string[][]): ParsedBulletin[] {
  const groups = new Map<string, { rows: string[][]; first: string[] }>();

  for (const row of rows) {
    if (row.length < 8) continue;
    const mat = row[0]?.trim() || '';
    const date = row[3]?.trim() || '';
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
    const mat = f[0]?.trim() || '';
    const firstName = f[1]?.trim() || '';
    const lastName = f[2]?.trim() || '';
    const bulletinDate = f[3]?.trim() || '';
    const typeSoin = f[4]?.trim()?.toLowerCase() || '';
    const errors: string[] = [];

    if (!mat) errors.push('Matricule manquant');
    if (!firstName && !lastName) errors.push('Nom manquant');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bulletinDate)) errors.push('Date invalide');

    const careType = CARE_TYPE_MAP[typeSoin] || 'consultation';

    const actes = group.rows.map(r => ({
      code: r[5]?.trim() || '',
      label: r[6]?.trim() || 'Acte importé',
      amount: parseFloat(r[7]?.replace(',', '.') || '0') || 0,
      ref_prof_sant: r[8]?.trim() || '',
      nom_prof_sant: r[9]?.trim() || '',
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
  const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
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
  const [phase, setPhase] = useState<'upload' | 'confirm' | 'validate'>('upload');

  // Phase 1: Upload
  const [parsedBulletins, setParsedBulletins] = useState<ParsedBulletin[]>([]);
  const [fileFormat, setFileFormat] = useState<'sprols' | 'dhamen' | 'unknown'>('unknown');
  const [fileName, setFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [isProcessingZip, setIsProcessingZip] = useState(false);
  const [zipSubLots, setZipSubLots] = useState<ZipSubLot[]>([]);
  const [zipScannedDocs, setZipScannedDocs] = useState<ZipScannedDoc[]>([]);
  const [selectedSubLot, setSelectedSubLot] = useState<number | null>(null);

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
      setPhase('validate');
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
        const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });
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

  const processRows = (rows: string[][]) => {
    if (rows.length < 2) {
      toast.error('Fichier vide ou invalide');
      return;
    }
    const headers = rows[0]!;
    const format = detectFormat(headers);
    setFileFormat(format);

    const dataRows = rows.slice(1);
    let bulletins: ParsedBulletin[];

    if (format === 'sprols') {
      bulletins = parseSPROLSRows(dataRows);
    } else if (format === 'dhamen') {
      bulletins = parseDhamenRows(dataRows);
    } else {
      // Try dhamen format as default
      bulletins = parseDhamenRows(dataRows);
      if (bulletins.length === 0) {
        bulletins = parseSPROLSRows(dataRows);
      }
    }

    setParsedBulletins(bulletins);
    if (bulletins.length > 0) {
      toast.success(`${bulletins.length} bulletins détectés`);
    } else {
      toast.error('Aucun bulletin détecté. Vérifiez le format du fichier.');
    }
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
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            {phase !== 'upload' && (
              <button
                type="button"
                onClick={() => { setPhase('upload'); setParsedBulletins([]); setImportResult(null); setImportedBatchId(null); setZipSubLots([]); setZipScannedDocs([]); setSelectedSubLot(null); setFileName(''); }}
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
          { step: 3, label: 'Validation', phase: 'validate' as const },
        ].map((s, i) => (
          <div key={s.step} className="flex items-center gap-3">
            {i > 0 && <div className="w-12 h-px bg-gray-200" />}
            <div className="flex items-center gap-2">
              <div className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold',
                phase === s.phase ? 'bg-blue-600 text-white' :
                (['upload', 'confirm', 'validate'].indexOf(phase) > ['upload', 'confirm', 'validate'].indexOf(s.phase))
                  ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'
              )}>
                {['upload', 'confirm', 'validate'].indexOf(phase) > ['upload', 'confirm', 'validate'].indexOf(s.phase)
                  ? <Check className="h-4 w-4" />
                  : s.step}
              </div>
              <span className={cn(
                'text-sm font-medium',
                phase === s.phase ? 'text-gray-900' : 'text-gray-400'
              )}>{s.label}</span>
            </div>
          </div>
        ))}
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
                <p className="text-xs text-gray-400 mt-2">CSV, XLSX ou ZIP — Format SPROLS ou Dhamen standard</p>
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
            <div className="grid grid-cols-3 gap-4">
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

      {/* ═══ Phase 3: Validation Queue ═══ */}
      {phase === 'validate' && (
        <div className="space-y-4">
          {/* Progress bar */}
          <div className="rounded-2xl border border-gray-200 bg-white px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-900">
                Progression : {queue.progress.validated + queue.progress.rejected} / {queue.progress.total} traités
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
              <span className="text-sm">Chargement des bulletins...</span>
            </div>
          ) : (
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
                    <div className="grid grid-cols-2 gap-4 mb-4">
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
                    <div className="grid grid-cols-2 gap-4">
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
          )}
        </div>
      )}
    </div>
  );
}
