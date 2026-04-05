/**
 * AdherentsImportPage - Bulk import adhérents from CSV or Excel (XLSX) file
 */
import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Upload, CheckCircle2, XCircle, AlertTriangle, Download, FileSpreadsheet, Zap, Eye, HelpCircle, X, Copy } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import type { AdherentCsvRow } from '@dhamen/shared';
import * as XLSX from 'xlsx';
import { useAgentContext } from '@/features/agent/stores/agent-context';

interface ImportResult {
  success: number;
  skipped: number;
  errors: { row: number; nationalId: string; error: string }[];
}

interface ParsedData {
  valid: AdherentCsvRow[];
  invalid: { row: number; data: Record<string, string>; errors: string[] }[];
}

// Mapping colonnes Acorad (MAJSPROLS) → champs internes
const ACORAD_COLUMN_MAP: Record<string, string> = {
  'wnum contrat': 'contractNumber',
  'wmat': 'matricule',
  'wcode type': 'memberType',
  'wrang prest': 'rang',
  'wnom pren prest': '_fullName',
  'wcode type piece identite': '_idType',
  'wnum piece identite': 'nationalId',
  'wdat nais': 'dateOfBirth',
  'wcode situation fam': 'maritalStatus',
  'wcod sexe': 'gender',
  'wdat deb adh': 'dateDebutAdhesion',
  'wdate mariage': 'dateMarriage',
  'wrib': 'rib',
  'wmaladie cronique': '_chronicDisease',
  'whandicap': '_handicap',
  'wdat fin adh': 'dateFinAdhesion',
  'wtel': 'phone',
  'wrue': 'address',
  'wville': 'city',
  'wcod post': 'postalCode',
};

const SPROLS_HEADERS = ['cod_act', 'frais_engag', 'mnt_act_remb', 'ref_bs_phys', 'typ_bs', 'stat_bs', 'ref_bord_clt'];
const CTRL_SPROLS_HEADERS = ['numero de bordereau', 'remb', 'souscripteur'];

// Mapping des en-têtes français/alternatifs vers les champs internes
const STANDARD_HEADER_MAP: Record<string, string> = {
  // nationalId
  'nationalid': 'nationalId', 'national_id': 'nationalId', 'cin': 'nationalId',
  'num_piece_identite': 'nationalId', 'numero_national': 'nationalId', 'num_national': 'nationalId',
  'num piece identite': 'nationalId', 'numero national': 'nationalId', 'identifiant': 'nationalId',
  'n°cin': 'nationalId', 'n° cin': 'nationalId', 'piece_identite': 'nationalId',
  // firstName
  'firstname': 'firstName', 'first_name': 'firstName', 'prenom': 'firstName', 'prénom': 'firstName',
  // lastName
  'lastname': 'lastName', 'last_name': 'lastName', 'nom': 'lastName', 'nom_famille': 'lastName',
  'nom famille': 'lastName', 'nom de famille': 'lastName',
  // dateOfBirth
  'dateofbirth': 'dateOfBirth', 'date_of_birth': 'dateOfBirth', 'date_naissance': 'dateOfBirth',
  'date naissance': 'dateOfBirth', 'date de naissance': 'dateOfBirth', 'naissance': 'dateOfBirth',
  'dat_nais': 'dateOfBirth', 'dat nais': 'dateOfBirth', 'ddn': 'dateOfBirth',
  // gender
  'gender': 'gender', 'sexe': 'gender', 'genre': 'gender', 'cod_sexe': 'gender', 'cod sexe': 'gender',
  // phone
  'phone': 'phone', 'telephone': 'phone', 'téléphone': 'phone', 'tel': 'phone', 'mobile': 'phone',
  'num_tel': 'phone', 'num tel': 'phone',
  // email
  'email': 'email', 'mail': 'email', 'e-mail': 'email', 'adresse_mail': 'email', 'adresse_email': 'email',
  // address
  'address': 'address', 'adresse': 'address', 'rue': 'address',
  // city
  'city': 'city', 'ville': 'city',
  // matricule
  'matricule': 'matricule', 'mat': 'matricule', 'matricule_assureur': 'matricule',
  'matricule assureur': 'matricule', 'num_matricule': 'matricule',
  // contractNumber
  'contractnumber': 'contractNumber', 'contract_number': 'contractNumber',
  'num_contrat': 'contractNumber', 'numero_contrat': 'contractNumber',
  'num contrat': 'contractNumber', 'numero contrat': 'contractNumber', 'contrat': 'contractNumber',
  // memberType
  'membertype': 'memberType', 'member_type': 'memberType', 'type': 'memberType',
  'code_type': 'memberType', 'code type': 'memberType', 'type_membre': 'memberType',
  // rang
  'rang': 'rang', 'rang_pres': 'rang', 'rang pres': 'rang',
  // maritalStatus
  'maritalstatus': 'maritalStatus', 'marital_status': 'maritalStatus',
  'situation_familiale': 'maritalStatus', 'situation familiale': 'maritalStatus',
  'etat_civil': 'maritalStatus', 'etat civil': 'maritalStatus',
  // dates
  'datedebutadhesion': 'dateDebutAdhesion', 'date_debut_adhesion': 'dateDebutAdhesion',
  'date debut adhesion': 'dateDebutAdhesion', 'debut_adhesion': 'dateDebutAdhesion',
  'date debut': 'dateDebutAdhesion',
  'datefinadhesion': 'dateFinAdhesion', 'date_fin_adhesion': 'dateFinAdhesion',
  'date fin adhesion': 'dateFinAdhesion', 'fin_adhesion': 'dateFinAdhesion',
  'date fin': 'dateFinAdhesion',
  'datemariage': 'dateMarriage', 'date_mariage': 'dateMarriage', 'date mariage': 'dateMarriage',
  // rib
  'rib': 'rib',
  // postalCode
  'postalcode': 'postalCode', 'postal_code': 'postalCode', 'code_postal': 'postalCode',
  'code postal': 'postalCode', 'cod_post': 'postalCode', 'cod post': 'postalCode',
};

const CSV_TEMPLATE = `nationalId,firstName,lastName,dateOfBirth,gender,phone,email,address,city,matricule,contractNumber,memberType,rang,dateDebutAdhesion,dateFinAdhesion
12345678,Ahmed,Ben Ali,1985-03-15,M,+216 98 123 456,ahmed@email.com,123 Rue Habib Bourguiba,Tunis,001,202670100008,A,00,2026-01-05,
87654321,Fatma,Trabelsi,1990-07-22,F,+216 55 987 654,fatma@email.com,45 Avenue Mohamed V,Sfax,002,202670100008,C,00,2026-01-05,`;

const COLUMN_SPEC = [
  { name: 'nationalId', type: 'Alphanumérique', desc: 'CIN ou identifiant unique (ex: 05046372)', required: true },
  { name: 'firstName', type: 'Texte', desc: 'Prénom de l\'adhérent (ex: Ahmed)', required: true },
  { name: 'lastName', type: 'Texte', desc: 'Nom de famille (ex: Ben Ali)', required: true },
  { name: 'dateOfBirth', type: 'Date', desc: 'YYYY-MM-DD ou DD/MM/YYYY (ex: 1985-03-15)', required: true },
  { name: 'gender', type: 'Enum', desc: 'M ou F', required: false },
  { name: 'matricule', type: 'Alphanumérique', desc: 'Matricule assureur (ex: 001)', required: false },
  { name: 'memberType', type: 'Enum', desc: 'A (principal) / C (conjoint) / E (enfant)', required: false },
  { name: 'phone', type: 'Texte', desc: 'Numéro de téléphone (ex: +216 98 123 456)', required: false },
  { name: 'email', type: 'Email', desc: 'Adresse valide (ex: ahmed@email.com)', required: false },
  { name: 'dateDebutAdhesion', type: 'Date', desc: 'Date début couverture (ex: 2026-01-05)', required: false },
];

function parseAcoradDate(dateStr: string | undefined): string {
  if (!dateStr) return '';
  const trimmed = String(dateStr).trim();
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (match) {
    const day = match[1]!.padStart(2, '0');
    const month = match[2]!.padStart(2, '0');
    let year = match[3]!;
    if (year.length === 2) {
      year = Number(year) > 50 ? `19${year}` : `20${year}`;
    }
    return `${year}-${month}-${day}`;
  }
  const num = Number(trimmed);
  if (!isNaN(num) && num > 1000) {
    const d = new Date((num - 25569) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return '';
}

function parseFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { lastName: parts[0] ?? '', firstName: '' };
  const lastName = parts[0] ?? '';
  const firstName = parts.slice(1).join(' ');
  return { lastName, firstName };
}

function validateRow(data: Record<string, string>, isAcorad: boolean): string[] {
  const errors: string[] = [];
  const isDependant = isAcorad && (data.memberType === 'C' || data.memberType === 'E');
  if (!isDependant && (!data.nationalId || data.nationalId.length < 1)) {
    errors.push('Numéro national requis');
  }
  if (!data.firstName) errors.push('Prénom requis');
  if (!data.lastName) errors.push('Nom requis');
  if (!data.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(data.dateOfBirth)) {
    errors.push('Date de naissance invalide (format: YYYY-MM-DD)');
  }
  if (data.gender && !['M', 'F'].includes(data.gender)) {
    errors.push('Genre invalide (M ou F)');
  }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.push('Email invalide');
  }
  return errors;
}

function rowToAdherent(data: Record<string, string>): AdherentCsvRow {
  return {
    nationalId: data.nationalId ?? '',
    firstName: data.firstName ?? '',
    lastName: data.lastName ?? '',
    dateOfBirth: data.dateOfBirth ?? '',
    gender: (data.gender as 'M' | 'F') || undefined,
    phone: data.phone || undefined,
    email: data.email || undefined,
    address: data.address || undefined,
    city: data.city || undefined,
    matricule: data.matricule || undefined,
    contractNumber: data.contractNumber || undefined,
    memberType: (data.memberType as 'A' | 'C' | 'E') || undefined,
    rang: data.rang || undefined,
    maritalStatus: data.maritalStatus || undefined,
    dateDebutAdhesion: data.dateDebutAdhesion || undefined,
    dateFinAdhesion: data.dateFinAdhesion || undefined,
    dateMarriage: data.dateMarriage || undefined,
    rib: data.rib || undefined,
    postalCode: data.postalCode || undefined,
    chronicDisease: data._chronicDisease === 'O' || undefined,
    handicap: data._handicap === 'O' || undefined,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' o';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' Ko';
  return (bytes / 1048576).toFixed(1) + ' Mo';
}

export function AdhérentsImportPage() {
  const navigate = useNavigate();
  const { selectedCompany } = useAgentContext();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const errorsRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [fileFormat, setFileFormat] = useState<'csv' | 'xlsx' | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const normalizeRows = useCallback((rawRows: Record<string, string>[]): Record<string, string>[] | null => {
    if (rawRows.length === 0) return [];
    const firstRow = rawRows[0]!;
    const headers = Object.keys(firstRow);
    const lowerHeaders = headers.map(h => h.toLowerCase().trim().replace(/_/g, ' '));
    const isSprols = SPROLS_HEADERS.some(h => lowerHeaders.some(lh => lh.includes(h.replace(/_/g, ' '))));
    const isCtrlSprols = CTRL_SPROLS_HEADERS.every(h => lowerHeaders.some(lh => lh.includes(h)));
    if (isSprols || isCtrlSprols) return null;
    const isAcorad = lowerHeaders.some(h => h.startsWith('wnum') || h.startsWith('wmat') || h.startsWith('wnom'));
    if (!isAcorad) {
      // Map standard/French headers to internal field names
      const headerMapping: Record<string, string> = {};
      for (const header of headers) {
        const normalized = header.toLowerCase().trim().replace(/[_\s]+/g, ' ').replace(/[éè]/g, 'e').replace(/[àâ]/g, 'a').replace(/[ôö]/g, 'o').replace(/[ùû]/g, 'u').replace(/[îï]/g, 'i');
        const normalizedUnderscore = header.toLowerCase().trim().replace(/\s+/g, '_');
        const mapped = STANDARD_HEADER_MAP[normalized] || STANDARD_HEADER_MAP[normalizedUnderscore] || STANDARD_HEADER_MAP[header.toLowerCase().trim()];
        headerMapping[header] = mapped || header;
      }
      // Check if any mapping was applied
      const needsMapping = headers.some(h => headerMapping[h] !== h);
      if (!needsMapping) return rawRows;
      return rawRows.map(row => {
        const mapped: Record<string, string> = {};
        for (const [key, value] of Object.entries(row)) {
          const newKey = headerMapping[key] || key;
          mapped[newKey] = String(value ?? '').trim();
        }
        // Normalize date formats (DD/MM/YYYY → YYYY-MM-DD)
        if (mapped.dateOfBirth) mapped.dateOfBirth = parseAcoradDate(mapped.dateOfBirth);
        if (mapped.dateDebutAdhesion) mapped.dateDebutAdhesion = parseAcoradDate(mapped.dateDebutAdhesion);
        if (mapped.dateFinAdhesion) mapped.dateFinAdhesion = parseAcoradDate(mapped.dateFinAdhesion);
        if (mapped.dateMarriage) mapped.dateMarriage = parseAcoradDate(mapped.dateMarriage);
        // Normalize gender
        if (mapped.gender) {
          const g = mapped.gender.toUpperCase().trim();
          mapped.gender = g === 'MASCULIN' || g === 'HOMME' || g === 'H' ? 'M' :
                          g === 'FEMININ' || g === 'FÉMININ' || g === 'FEMME' ? 'F' : g;
        }
        return mapped;
      });
    }
    return rawRows.map(row => {
      const mapped: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        const lowerKey = key.toLowerCase().trim().replace(/_/g, ' ');
        const mappedKey = ACORAD_COLUMN_MAP[lowerKey];
        if (mappedKey) mapped[mappedKey] = String(value ?? '').trim();
      }
      if (mapped._fullName) {
        const { firstName, lastName } = parseFullName(mapped._fullName);
        mapped.firstName = firstName;
        mapped.lastName = lastName;
        delete mapped._fullName;
      }
      mapped.dateOfBirth = parseAcoradDate(mapped.dateOfBirth);
      mapped.dateDebutAdhesion = parseAcoradDate(mapped.dateDebutAdhesion);
      mapped.dateFinAdhesion = parseAcoradDate(mapped.dateFinAdhesion);
      mapped.dateMarriage = parseAcoradDate(mapped.dateMarriage);
      // Normalize Acorad gender codes (1=M, 2=F)
      if (mapped.gender) {
        const g = mapped.gender.toUpperCase().trim();
        mapped.gender = g === '1' || g === 'MASCULIN' || g === 'HOMME' || g === 'H' ? 'M' :
                        g === '2' || g === 'FEMININ' || g === 'FÉMININ' || g === 'FEMME' ? 'F' : g;
      }
      mapped._chronicDisease = mapped._chronicDisease || '';
      mapped._handicap = mapped._handicap || '';
      return mapped;
    });
  }, []);

  const parseCSV = useCallback((content: string): Record<string, string>[] => {
    const lines = content.trim().split('\n');
    if (lines.length < 2) return [];
    const headerLine = lines[0];
    if (!headerLine) return [];
    // Auto-detect delimiter: semicolon (French Excel) vs comma
    const commaCount = (headerLine.match(/,/g) || []).length;
    const semicolonCount = (headerLine.match(/;/g) || []).length;
    const tabCount = (headerLine.match(/\t/g) || []).length;
    let delimiter = ',';
    if (semicolonCount > commaCount && semicolonCount >= tabCount) delimiter = ';';
    else if (tabCount > commaCount && tabCount > semicolonCount) delimiter = '\t';
    const headers = headerLine.split(delimiter).map(h => h.trim().replace(/^["']|["']$/g, '').replace(/^\uFEFF/, ''));
    const rows: Record<string, string>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (const char of line) {
        if (char === '"' || char === "'") { inQuotes = !inQuotes; }
        else if (char === delimiter && !inQuotes) { values.push(current.trim()); current = ''; }
        else { current += char; }
      }
      values.push(current.trim());
      const data: Record<string, string> = {};
      headers.forEach((header, idx) => { data[header] = values[idx] || ''; });
      rows.push(data);
    }
    return rows;
  }, []);

  const parseXLSXFile = useCallback((buffer: ArrayBuffer): Record<string, string>[] => {
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheetName = wb.SheetNames[0];
    if (!sheetName) return [];
    const firstSheet = wb.Sheets[sheetName];
    if (!firstSheet) return [];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet);
    return jsonData.map(row => {
      const strRow: Record<string, string> = {};
      for (const [key, value] of Object.entries(row)) {
        strRow[key] = value != null ? String(value) : '';
      }
      return strRow;
    });
  }, []);

  const processRows = useCallback((rawRows: Record<string, string>[]): ParsedData | 'wrong_file' => {
    const normalized = normalizeRows(rawRows);
    if (normalized === null) return 'wrong_file';
    const firstRaw = rawRows[0];
    const rawHeaders = firstRaw ? Object.keys(firstRaw).map(h => h.toLowerCase().trim()) : [];
    const isAcorad = rawHeaders.some(h => h.startsWith('wnum') || h.startsWith('wmat') || h.startsWith('wnom'));
    const valid: AdherentCsvRow[] = [];
    const invalid: ParsedData['invalid'] = [];
    for (let i = 0; i < normalized.length; i++) {
      const data = normalized[i]!;
      if (isAcorad && !data.nationalId && (data.memberType === 'C' || data.memberType === 'E')) {
        data.nationalId = `${data.matricule || 'X'}-${data.rang || i}`;
      }
      const errors = validateRow(data, isAcorad);
      if (errors.length > 0) { invalid.push({ row: i + 2, data, errors }); }
      else { valid.push(rowToAdherent(data)); }
    }
    return { valid, invalid };
  }, [normalizeRows]);

  const processFile = useCallback((selectedFile: File) => {
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      toast.error('Format non supporté. Utilisez CSV ou Excel (.xlsx)');
      return;
    }
    setFile(selectedFile);
    setImportResult(null);
    setFileFormat(ext === 'csv' ? 'csv' : 'xlsx');

    const handleParsed = (parsed: ParsedData | 'wrong_file', rowCount?: number) => {
      if (parsed === 'wrong_file') {
        toast.error('Ce fichier est un bordereau SPROLS (bulletins de soins), pas un fichier d\'adhérents. Utilisez le fichier MAJSPROLS.');
        setFile(null);
        setParsedData(null);
        return;
      }
      setParsedData(parsed);
      if (parsed.valid.length === 0 && parsed.invalid.length === 0) {
        toast.error('Le fichier est vide ou mal formaté');
      } else if (ext !== 'csv' && rowCount) {
        toast.success(`${rowCount} ligne(s) détectées dans le fichier Excel`);
      }
      // Scroll vers les erreurs si des lignes invalides
      if (parsed.invalid.length > 0) {
        setTimeout(() => {
          errorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
    };

    if (ext === 'csv') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const rawRows = parseCSV(event.target?.result as string);
        handleParsed(processRows(rawRows));
      };
      reader.readAsText(selectedFile);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        const rawRows = parseXLSXFile(event.target?.result as ArrayBuffer);
        handleParsed(processRows(rawRows), rawRows.length);
      };
      reader.readAsArrayBuffer(selectedFile);
    }
  }, [parseCSV, parseXLSXFile, processRows]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) processFile(selectedFile);
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) processFile(droppedFile);
  }, [processFile]);

  const importMutation = useMutation({
    mutationFn: async (data: { adherents: AdherentCsvRow[]; skipDuplicates: boolean; companyId?: string }) => {
      console.log('[adherent-import] Sending to API:', JSON.stringify({ count: data.adherents.length, skipDuplicates: data.skipDuplicates, companyId: data.companyId, firstRow: data.adherents[0] }));
      const response = await apiClient.post<ImportResult>('/adherents/import', data, { timeout: 120000 });
      console.log('[adherent-import] API response:', JSON.stringify(response));
      if (!response.success) {
        const errResp = response as { error?: { message?: string; details?: { path: string; message: string }[] } };
        const details = errResp.error?.details;
        if (details && details.length > 0) {
          const detailMsg = details.slice(0, 3).map(d => `${d.path}: ${d.message}`).join('; ');
          throw new Error(`Validation: ${detailMsg}`);
        }
        throw new Error(errResp.error?.message || 'Erreur serveur');
      }
      return response.data;
    },
    onSuccess: (data) => {
      setImportResult(data);
      if (data.success > 0) toast.success(`${data.success} adhérent(s) importé(s) avec succès`);
      if (data.skipped > 0) toast.info(`${data.skipped} adhérent(s) ignoré(s) (doublons)`);
      if (data.errors.length > 0) toast.warning(`${data.errors.length} erreur(s) lors de l'import`);
      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erreur lors de l'import");
    },
  });

  const handleImport = () => {
    if (!parsedData || parsedData.valid.length === 0) {
      toast.error('Aucune donnée valide à importer');
      return;
    }
    importMutation.mutate({
      adherents: parsedData.valid,
      skipDuplicates,
      companyId: selectedCompany?.id,
    });
  };

  const downloadTemplate = () => {
    const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'adherents_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearFile = () => {
    setFile(null);
    setParsedData(null);
    setImportResult(null);
    setFileFormat(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const previewRows = parsedData?.valid.slice(0, 5) ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <PageHeader
          title="Importation de données"
          description="Mettez à jour votre base de données en important vos fichiers CSV ou Excel. Assurez-vous que le format respecte les spécifications techniques."
          breadcrumb={[
            { label: 'Adhérents', href: '/adherents/agent' },
            { label: 'Importation CSV' },
          ]}
        />
        <button
          onClick={downloadTemplate}
          className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors shrink-0"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Télécharger le template</span>
          <span className="sm:hidden">Template</span>
        </button>
      </div>

      {/* Main 2-column layout */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-2">

        {/* LEFT COLUMN — Configuration de l'import */}
        <div className="space-y-5">
          <h2 className="text-lg font-semibold text-gray-900">Configuration de l'import</h2>

          <p className="text-sm text-gray-500">
            Fichier source ({fileFormat === 'xlsx' ? 'Excel' : 'CSV'})
          </p>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="hidden"
            id="file-upload"
          />

          {/* File selected or Drop zone */}
          {file ? (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50">
                      <FileSpreadsheet className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{file.name}</p>
                      <p className="text-xs text-gray-400">
                        {formatFileSize(file.size)} — Format {fileFormat?.toUpperCase()}
                        {fileFormat === 'xlsx' && ' (Acorad auto-détecté)'}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={clearFile}
                    className="rounded-full p-1.5 hover:bg-gray-100 transition-colors"
                  >
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                </div>

                {/* Parse results */}
                {parsedData && (
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span className="text-sm font-medium text-emerald-700">{parsedData.valid.length} valides</span>
                    </div>
                    {parsedData.invalid.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <XCircle className="h-4 w-4 text-red-500" />
                        <span className="text-sm font-medium text-red-600">{parsedData.invalid.length} invalides</span>
                      </div>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">
                      {parsedData.valid.length + parsedData.invalid.length} ligne(s) analysées
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <label
              htmlFor="file-upload"
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 sm:p-10 cursor-pointer transition-all ${
                isDragging
                  ? 'border-blue-400 bg-blue-50/50'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50/50'
              }`}
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-50 mb-4">
                <Upload className="h-7 w-7 text-blue-600" />
              </div>
              <p className="text-sm font-semibold text-gray-900">
                Glissez-déposez votre fichier ici
              </p>
              <p className="text-xs text-gray-400 mt-1">
                ou parcourez vos fichiers (Max 25MB)
              </p>
            </label>
          )}

          {/* Toggle options */}
          <Card>
            <CardContent className="p-0 divide-y divide-gray-100">
              <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100">
                    <Copy className="h-4 w-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Ignorer les doublons</p>
                    <p className="text-xs text-gray-400">Ne pas importer les enregistrements déjà existants</p>
                  </div>
                </div>
                <Switch
                  checked={skipDuplicates}
                  onCheckedChange={setSkipDuplicates}
                />
              </div>
            </CardContent>
          </Card>

          {/* Import button */}
          <Button
            onClick={handleImport}
            disabled={!parsedData || parsedData.valid.length === 0 || importMutation.isPending}
            className="w-full h-11 text-sm font-semibold gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25"
            size="lg"
          >
            <Zap className="h-4 w-4" />
            {importMutation.isPending ? 'Import en cours...' : 'Lancer l\'importation'}
          </Button>

          {/* Help card */}
          <div className="rounded-xl bg-gradient-to-br from-gray-900 to-gray-800 p-4 sm:p-6 text-white relative overflow-hidden">
            <div className="absolute right-4 bottom-2 opacity-10">
              <HelpCircle className="h-24 w-24" />
            </div>
            <h3 className="text-sm font-semibold mb-1">Besoin d'aide ?</h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              Consultez notre documentation sur la structure des fichiers CSV/Excel pour éviter les erreurs de formatage.
              Formats supportés : CSV, Excel (.xlsx), Acorad MAJSPROLS.
            </p>
          </div>
        </div>

        {/* RIGHT COLUMN — Structure + Preview */}
        <div className="space-y-5">
          {/* Structure de fichier requise */}
          <Card>
            <CardContent className="p-0">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-2 p-4 sm:p-5 pb-3">
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">Structure de fichier requise</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Format CSV (UTF-8) ou Excel (.xlsx) — Acorad auto-détecté
                  </p>
                </div>
                <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 shrink-0">
                  E-Santé v1.0
                </span>
              </div>

              <div className="px-3 sm:px-5 pb-5 overflow-x-auto">
                <table className="w-full text-sm min-w-[500px]">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="pb-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Colonne</th>
                      <th className="pb-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Type</th>
                      <th className="pb-2 text-left text-xs font-medium uppercase tracking-wider text-gray-400">Description / Exemple</th>
                      <th className="pb-2 text-right text-xs font-medium uppercase tracking-wider text-gray-400">Requis</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {COLUMN_SPEC.map((col) => (
                      <tr key={col.name}>
                        <td className="py-3 pr-4">
                          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono font-medium text-gray-700">
                            {col.name}
                          </code>
                        </td>
                        <td className="py-3 pr-4 text-xs text-gray-400">{col.type}</td>
                        <td className="py-3 pr-4 text-xs text-gray-500">{col.desc}</td>
                        <td className="py-3 text-right">
                          {col.required ? (
                            <div className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-600">
                              <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                            </div>
                          ) : (
                            <div className="inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-gray-300" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Aperçu du fichier */}
          <Card>
            <CardContent className="p-0">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-4 sm:p-5 pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-gray-900">Aperçu du fichier</h3>
                </div>
                <span className="text-xs text-gray-400">
                  {previewRows.length > 0
                    ? `${previewRows.length} premières lignes sur ${parsedData?.valid.length ?? 0}`
                    : 'L\'aperçu s\'affichera ici une fois le fichier sélectionné.'}
                </span>
              </div>

              <div className="px-3 sm:px-5 pb-5">
                {previewRows.length > 0 ? (
                  <div className="overflow-auto rounded-lg border border-gray-100 max-h-56">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-400">#</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-400">CIN</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-400">Nom</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-400">Prénom</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-400">Naissance</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-400">Genre</th>
                          <th className="px-3 py-2 text-left font-medium text-gray-400">Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {previewRows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                            <td className="px-3 py-2 font-mono text-gray-700">{row.nationalId}</td>
                            <td className="px-3 py-2 text-gray-900">{row.lastName}</td>
                            <td className="px-3 py-2 text-gray-900">{row.firstName}</td>
                            <td className="px-3 py-2 text-gray-500">{row.dateOfBirth}</td>
                            <td className="px-3 py-2 text-gray-500">{row.gender || '—'}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                row.memberType === 'A' ? 'bg-blue-50 text-blue-700' :
                                row.memberType === 'C' ? 'bg-purple-50 text-purple-700' :
                                row.memberType === 'E' ? 'bg-amber-50 text-amber-700' :
                                'bg-gray-50 text-gray-500'
                              }`}>
                                {row.memberType === 'A' ? 'Principal' : row.memberType === 'C' ? 'Conjoint' : row.memberType === 'E' ? 'Enfant' : '—'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                    <div className="flex items-end gap-1 mb-3 opacity-30">
                      <div className="w-5 h-8 bg-gray-300 rounded-sm" />
                      <div className="w-5 h-12 bg-gray-300 rounded-sm" />
                      <div className="w-5 h-6 bg-gray-300 rounded-sm" />
                      <div className="w-5 h-10 bg-gray-300 rounded-sm" />
                      <div className="w-5 h-7 bg-gray-300 rounded-sm" />
                    </div>
                    <p className="text-sm text-gray-400">Aucun fichier à prévisualiser</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Validation Errors */}
      {parsedData && parsedData.invalid.length > 0 && (
        <Card ref={errorsRef} className="border-amber-200">
          <CardContent className="p-0">
            <div className="p-4 sm:p-5 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h3 className="text-sm font-semibold text-gray-900">
                  Lignes invalides ({parsedData.invalid.length})
                </h3>
              </div>
              <p className="text-xs text-gray-400 mt-1">Ces lignes ne seront pas importées</p>
            </div>
            <div className="px-3 sm:px-5 pb-5">
              <div className="max-h-52 overflow-auto rounded-lg border border-gray-100">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16 text-xs font-medium uppercase tracking-wider text-gray-400">Ligne</TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">Données</TableHead>
                      <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">Erreurs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.invalid.slice(0, 20).map((item) => (
                      <TableRow key={item.row}>
                        <TableCell className="text-xs font-mono text-gray-500">{item.row}</TableCell>
                        <TableCell className="text-xs text-gray-700">
                          {item.data.firstName || item.data.lastName
                            ? `${item.data.firstName ?? ''} ${item.data.lastName ?? ''}`.trim()
                            : '(données manquantes)'}
                        </TableCell>
                        <TableCell>
                          <ul className="text-xs text-red-600 space-y-0.5">
                            {item.errors.map((err, idx) => (
                              <li key={idx}>{err}</li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Import Results */}
      {importResult && (
        <Card ref={resultRef} className={importResult.errors.length > 0 ? 'border-amber-200' : 'border-emerald-200'}>
          <CardContent className="p-0">
            <div className="p-4 sm:p-5 pb-3">
              <div className="flex items-center gap-2">
                {importResult.errors.length === 0 ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                )}
                <h3 className="text-sm font-semibold text-gray-900">Résultat de l'import</h3>
              </div>
            </div>
            <div className="px-3 sm:px-5 pb-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                <div className="rounded-xl border border-gray-100 bg-emerald-50 p-4 text-center">
                  <p className="text-2xl font-bold text-emerald-600">{importResult.success}</p>
                  <p className="text-xs text-emerald-700 mt-1">Importés</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-blue-50 p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">{importResult.skipped}</p>
                  <p className="text-xs text-blue-700 mt-1">Ignorés (doublons)</p>
                </div>
                <div className="rounded-xl border border-gray-100 bg-red-50 p-4 text-center">
                  <p className="text-2xl font-bold text-red-600">{importResult.errors.length}</p>
                  <p className="text-xs text-red-700 mt-1">Erreurs</p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="max-h-48 overflow-auto rounded-lg border border-gray-100">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16 text-xs font-medium uppercase tracking-wider text-gray-400">Ligne</TableHead>
                        <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">Numéro national</TableHead>
                        <TableHead className="text-xs font-medium uppercase tracking-wider text-gray-400">Erreur</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResult.errors.map((err, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs text-gray-500">{err.row}</TableCell>
                          <TableCell className="text-xs font-mono text-gray-700">{err.nationalId}</TableCell>
                          <TableCell className="text-xs text-red-600">{err.error}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex justify-end mt-4">
                <Button
                  onClick={() => navigate('/adherents/agent')}
                  className="gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25"
                >
                  Voir les adhérents
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default AdhérentsImportPage;
