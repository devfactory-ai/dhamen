import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { apiClient, API_BASE_URL } from '@/lib/api-client';
import { useToastStore } from '@/stores/toast';
import {
  Pill,
  Upload,
  Search,
  History,
  FileSpreadsheet,
  CheckCircle,
  XCircle,
  Clock,
  Package,
  AlertCircle,
  TrendingUp,
  Plus,
  Pencil,
  Trash2,
  CalendarDays,
  ShieldCheck,
  Eye,
} from 'lucide-react';
import { FilePreview } from '@/components/ui/file-preview';
import * as XLSX from 'xlsx';

interface Medication {
  id: string;
  code_pct: string;
  code_cnam: string | null;
  code_amm: string | null;
  dci: string;
  brand_name: string;
  brand_name_ar: string | null;
  dosage: string;
  form: string;
  packaging: string;
  family_id: string | null;
  family_name: string | null;
  family_code: string | null;
  laboratory: string | null;
  country_origin: string | null;
  price_public: number | null;
  price_hospital: number | null;
  price_reference: number | null;
  is_generic: number;
  is_reimbursable: number;
  reimbursement_rate: number;
  requires_prescription: number;
  is_controlled: number;
  gpb: string | null;
  veic: string | null;
  amm_classe: string | null;
  amm_sous_classe: string | null;
  amm_date: string | null;
  indications: string | null;
  duree_conservation: number | null;
  conditionnement_primaire: string | null;
  spec_conditionnement: string | null;
  tableau_amm: string | null;
  created_at: string;
  updated_at: string;
}

interface AmmRow {
  nom: string;
  dosage: string;
  forme: string;
  presentation: string;
  dci: string;
  classe: string;
  sousClasse: string;
  laboratoire: string;
  amm: string;
  dateAmm: string;
  conditionnementPrimaire: string;
  specConditionnementPrimaire: string;
  tableau: string;
  dureeConservation: string;
  indications: string;
  gpb: string;
  veic: string;
}

/** Column header normalization for AMM Excel */
const AMM_COL_MAP: Record<string, keyof AmmRow> = {
  'nom': 'nom',
  'nom du médicament': 'nom',
  'nom du medicament': 'nom',
  'dosage': 'dosage',
  'forme': 'forme',
  'forme pharmaceutique': 'forme',
  'présentation': 'presentation',
  'presentation': 'presentation',
  'dci': 'dci',
  'classe': 'classe',
  'classe thérapeutique': 'classe',
  'classe therapeutique': 'classe',
  'sous classe': 'sousClasse',
  'sous classe thérapeutique': 'sousClasse',
  'sous-classe': 'sousClasse',
  'laboratoire': 'laboratoire',
  'labo': 'laboratoire',
  'amm': 'amm',
  'n° amm': 'amm',
  'n°amm': 'amm',
  'code amm': 'amm',
  'date amm': 'dateAmm',
  'date d\'amm': 'dateAmm',
  'conditionnement primaire': 'conditionnementPrimaire',
  'spécification du conditionnement primaire': 'specConditionnementPrimaire',
  'specification du conditionnement primaire': 'specConditionnementPrimaire',
  'specifocation conditionnement primaire': 'specConditionnementPrimaire',
  'spécification': 'specConditionnementPrimaire',
  'tableau': 'tableau',
  'durée de conservation': 'dureeConservation',
  'duree de conservation': 'dureeConservation',
  'indications': 'indications',
  'g/p/b': 'gpb',
  'gpb': 'gpb',
  'veic': 'veic',
  'v.e.i.c': 'veic',
  'v/e/i/c': 'veic',
};

interface MedicationFamily {
  id: string;
  code: string;
  name: string;
}

interface ImportBatch {
  id: string;
  file_name: string;
  source: string;
  total_rows: number;
  imported_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  status: string;
  imported_by_name: string;
  created_at: string;
  completed_at: string;
}

interface MedicationFamilyBareme {
  id: string;
  contract_id: string;
  medication_family_id: string;
  family_code: string;
  family_name: string;
  taux_remboursement: number;
  plafond_acte: number | null;
  plafond_famille_annuel: number | null;
  date_effet: string;
  date_fin_effet: string | null;
  is_active: number;
  motif: string | null;
  created_by_name: string | null;
  created_at: string;
}

interface BaremeHistoryEntry {
  id: string;
  bareme_id: string;
  action: 'create' | 'update' | 'deactivate';
  old_taux: number | null;
  new_taux: number | null;
  old_date_effet: string | null;
  new_date_effet: string | null;
  motif: string | null;
  changed_by_name: string | null;
  created_at: string;
  family_code?: string;
  family_name?: string;
}

export function MedicationsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToastStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importNotes, setImportNotes] = useState('');
  const [gpbFilter, setGpbFilter] = useState('');
  const [veicFilter, setVeicFilter] = useState('');
  const [ammClasseFilter, setAmmClasseFilter] = useState('');
  const [showAmmImportDialog, setShowAmmImportDialog] = useState(false);
  const [ammFile, setAmmFile] = useState<File | null>(null);
  const [ammParsedRows, setAmmParsedRows] = useState<AmmRow[]>([]);
  const [ammParseError, setAmmParseError] = useState('');
  const [ammImportNotes, setAmmImportNotes] = useState('');
  const ammFileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState('medications');
  const [showBaremeHistoryDialog, setShowBaremeHistoryDialog] = useState(false);
  const [selectedBaremeForHistory, setSelectedBaremeForHistory] = useState<string | null>(null);
  const [baremePage, setBaremePage] = useState(1);
  const [medsPage, setMedsPage] = useState(1);
  const [importsPage, setImportsPage] = useState(1);

  // Fetch medications
  const { data: medicationsData, isLoading: loadingMeds } = useQuery({
    queryKey: ['medications', search, familyFilter, gpbFilter, veicFilter, ammClasseFilter, medsPage],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', String(medsPage));
      params.append('limit', '20');
      if (search) params.append('search', search);
      if (familyFilter) params.append('familyId', familyFilter);
      if (gpbFilter) params.append('gpb', gpbFilter);
      if (veicFilter) params.append('veic', veicFilter);
      if (ammClasseFilter) params.append('ammClasse', ammClasseFilter);
      const url = `/medications?${params.toString()}`;
      const response = await apiClient.get<Medication[]>(url) as unknown as { success: boolean; data: Medication[]; meta: { page: number; limit: number; total: number; totalPages: number }; error?: { message: string } };
      if (!response.success) throw new Error(response.error?.message);
      return { data: response.data, meta: response.meta };
    },
  });

  // Fetch families
  const { data: familiesData } = useQuery({
    queryKey: ['medication-families'],
    queryFn: async () => {
      const response = await apiClient.get<{ families: MedicationFamily[] }>('/medications/families');
      if (!response.success) throw new Error(response.error?.message);
      return response.data?.families || [];
    },
  });

  // Fetch import history
  const { data: importsData, isLoading: loadingImports } = useQuery({
    queryKey: ['medication-imports', importsPage],
    queryFn: async () => {
      const response = await apiClient.get<ImportBatch[]>(`/medications/imports?page=${importsPage}&limit=20`) as unknown as { success: boolean; data: ImportBatch[]; meta: { page: number; limit: number; total: number; totalPages: number }; error?: { message: string } };
      if (!response.success) throw new Error(response.error?.message);
      return { data: response.data, meta: response.meta };
    },
    enabled: activeTab === 'history',
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', 'PCT');
      formData.append('notes', importNotes);

      const response = await fetch(
        `${API_BASE_URL}/medications/import`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
          },
          body: formData,
        }
      );

      const data = await response.json();
      if (!data.success) throw new Error(data.error?.message || 'Erreur import');
      return data.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      queryClient.invalidateQueries({ queryKey: ['medication-imports'] });
      setShowImportDialog(false);
      setImportFile(null);
      setImportNotes('');
      toast({
        variant: 'success',
        title: `Import terminé: ${data.imported} nouveaux, ${data.updated} mis à jour, ${data.errors?.length || 0} erreurs`,
      });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: error.message });
    },
  });


  // Convert Excel serial date to ISO string
  const excelDateToString = (value: unknown): string => {
    if (!value) return '';
    const num = Number(value);
    if (!isNaN(num) && num > 10000 && num < 100000) {
      // Excel serial date: days since 1900-01-01 (with the Lotus 1-2-3 bug)
      const date = new Date((num - 25569) * 86400 * 1000);
      return date.toISOString().split('T')[0] || '';
    }
    return String(value).trim();
  };

  // Parse AMM Excel file client-side
  const parseAmmFile = useCallback(async (file: File) => {
    setAmmParseError('');
    setAmmParsedRows([]);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        setAmmParseError('Fichier Excel vide');
        return;
      }
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        setAmmParseError('Feuille introuvable');
        return;
      }
      const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { defval: '' });

      if (rawRows.length === 0) {
        setAmmParseError('Aucune ligne trouvée');
        return;
      }

      // Normalize headers
      const firstRow = rawRows[0]!;
      const headerMap: Record<string, keyof AmmRow> = {};
      for (const key of Object.keys(firstRow)) {
        const normalized = key.trim().toLowerCase()
          .replace(/[éè]/g, 'e')
          .replace(/[ûù]/g, 'u')
          .replace(/[ô]/g, 'o');
        const mapped = AMM_COL_MAP[normalized];
        if (mapped) {
          headerMap[key] = mapped;
        }
      }

      // Check required columns
      const mappedValues = Object.values(headerMap);
      if (!mappedValues.includes('nom') || !mappedValues.includes('dci') || !mappedValues.includes('amm')) {
        setAmmParseError(`Colonnes requises manquantes. Trouvées: ${Object.keys(firstRow).join(', ')}`);
        return;
      }

      const parsed: AmmRow[] = [];
      for (const raw of rawRows) {
        const row: Record<string, string> = {};
        for (const [origKey, mappedKey] of Object.entries(headerMap)) {
          if (mappedKey === 'dateAmm') {
            row[mappedKey] = excelDateToString(raw[origKey]);
          } else {
            row[mappedKey] = String(raw[origKey] || '').trim();
          }
        }
        // Skip rows missing required fields (nom, dci, amm)
        if (!row.nom || !row.dci || !row.amm) continue;
        parsed.push({
          nom: row.nom || '',
          dosage: row.dosage || '',
          forme: row.forme || '',
          presentation: row.presentation || '',
          dci: row.dci || '',
          classe: row.classe || '',
          sousClasse: row.sousClasse || '',
          laboratoire: row.laboratoire || '',
          amm: row.amm || '',
          dateAmm: row.dateAmm || '',
          conditionnementPrimaire: row.conditionnementPrimaire || '',
          specConditionnementPrimaire: row.specConditionnementPrimaire || '',
          tableau: row.tableau || '',
          dureeConservation: row.dureeConservation || '',
          indications: row.indications || '',
          gpb: row.gpb || '',
          veic: row.veic || '',
        });
      }

      setAmmParsedRows(parsed);
    } catch (err) {
      setAmmParseError(err instanceof Error ? err.message : 'Erreur lecture fichier');
    }
  }, []);

  // AMM import mutation — sends data in chunks to avoid Worker timeout/body size limits
  const [ammImportProgress, setAmmImportProgress] = useState({ current: 0, total: 0, isRunning: false });

  const importAmmMutation = useMutation({
    mutationFn: async (rows: AmmRow[]) => {
      const CHUNK_SIZE = 500;
      const totalChunks = Math.ceil(rows.length / CHUNK_SIZE);
      const totals = { imported: 0, updated: 0, skipped: 0, errors: [] as unknown[] };

      setAmmImportProgress({ current: 0, total: rows.length, isRunning: true });

      for (let i = 0; i < totalChunks; i++) {
        const chunk = rows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const response = await apiClient.post<{ imported: number; updated: number; skipped: number; errors: unknown[] }>('/medications/import-amm', {
          fileName: ammFile?.name || 'liste_amm.xls',
          rows: chunk,
          notes: i === 0 ? ammImportNotes : `(chunk ${i + 1}/${totalChunks})`,
        });
        if (!response.success) throw new Error(response.error?.message);
        const data = response.data!;
        totals.imported += data.imported;
        totals.updated += data.updated;
        totals.skipped += data.skipped || 0;
        totals.errors.push(...(data.errors || []));
        setAmmImportProgress({ current: (i + 1) * CHUNK_SIZE, total: rows.length, isRunning: true });
      }

      setAmmImportProgress({ current: 0, total: 0, isRunning: false });
      return totals;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['medications'] });
      queryClient.invalidateQueries({ queryKey: ['medication-imports'] });
      setShowAmmImportDialog(false);
      setAmmFile(null);
      setAmmParsedRows([]);
      setAmmImportNotes('');
      toast({
        variant: 'success',
        title: `Import AMM terminé: ${data.imported} nouveaux, ${data.updated} mis à jour, ${data.errors?.length || 0} erreurs`,
      });
    },
    onError: (error: Error) => {
      setAmmImportProgress({ current: 0, total: 0, isRunning: false });
      toast({ variant: 'destructive', title: error.message });
    },
  });

  // Fetch medication family baremes
  const { data: baremesData, isLoading: loadingBaremes } = useQuery({
    queryKey: ['medication-family-baremes', baremePage],
    queryFn: async () => {
      const response = await apiClient.get<MedicationFamilyBareme[]>(
        `/medication-family-baremes?page=${baremePage}&limit=20`
      ) as unknown as { success: boolean; data: MedicationFamilyBareme[]; meta: { page: number; limit: number; total: number; totalPages: number }; error?: { message: string } };
      if (!response.success) throw new Error(response.error?.message);
      return { data: response.data, meta: response.meta };
    },
    enabled: activeTab === 'baremes',
  });

  // Fetch bareme history for a specific bareme
  const { data: baremeHistoryData } = useQuery({
    queryKey: ['bareme-history', selectedBaremeForHistory],
    queryFn: async () => {
      const response = await apiClient.get<BaremeHistoryEntry[]>(
        `/medication-family-baremes/${selectedBaremeForHistory}/history`
      ) as unknown as { success: boolean; data: BaremeHistoryEntry[]; meta: { page: number; limit: number; total: number; totalPages: number }; error?: { message: string } };
      if (!response.success) throw new Error(response.error?.message);
      return { data: response.data, meta: response.meta };
    },
    enabled: !!selectedBaremeForHistory,
  });

  // Create/update bareme mutation
  // Deactivate bareme mutation
  const deactivateBaremeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete(`/medication-family-baremes/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medication-family-baremes'] });
      toast({ variant: 'success', title: 'Barème désactivé' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: error.message });
    },
  });

  const baremeColumns = [
    {
      key: 'family_name',
      header: 'Famille',
      render: (row: MedicationFamilyBareme) => (
        <div>
          <p className="font-medium">{row.family_name}</p>
          <code className="text-xs text-muted-foreground">{row.family_code}</code>
        </div>
      ),
    },
    {
      key: 'taux_remboursement',
      header: 'Taux',
      render: (row: MedicationFamilyBareme) => (
        <Badge variant="default">{Math.round(row.taux_remboursement * 100)}%</Badge>
      ),
    },
    {
      key: 'plafond_acte',
      header: 'Plafond acte',
      render: (row: MedicationFamilyBareme) =>
        row.plafond_acte ? `${row.plafond_acte.toFixed(3)} TND` : '-',
    },
    {
      key: 'date_effet',
      header: 'Date effet',
      render: (row: MedicationFamilyBareme) => (
        <div className="text-sm">
          <p>{new Date(row.date_effet).toLocaleDateString('fr-TN')}</p>
          {row.date_fin_effet && (
            <p className="text-muted-foreground">
              → {new Date(row.date_fin_effet).toLocaleDateString('fr-TN')}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'is_active',
      header: 'Statut',
      render: (row: MedicationFamilyBareme) => (
        <Badge variant={row.is_active ? 'success' : 'secondary'}>
          {row.is_active ? 'Actif' : 'Inactif'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: MedicationFamilyBareme) => (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setSelectedBaremeForHistory(row.id);
              setShowBaremeHistoryDialog(true);
            }}
          >
            <History className="h-4 w-4" />
          </Button>
          {row.is_active ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/admin/medications/baremes/${row.id}/edit`);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  deactivateBaremeMutation.mutate(row.id);
                }}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </>
          ) : null}
        </div>
      ),
    },
  ];

  const gpbLabel: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
    G: { label: 'Générique', variant: 'secondary' },
    P: { label: 'Princeps', variant: 'default' },
    B: { label: 'Biosimilaire', variant: 'outline' },
  };

  const veicLabel: Record<string, { label: string; color: string }> = {
    V: { label: 'Vital', color: 'text-red-600 bg-red-50 border-red-200' },
    E: { label: 'Essentiel', color: 'text-orange-600 bg-orange-50 border-orange-200' },
    I: { label: 'Intermédiaire', color: 'text-blue-600 bg-blue-50 border-blue-200' },
    C: { label: 'Confort', color: 'text-gray-600 bg-gray-50 border-gray-200' },
  };

  const formatPrice = (price: number | null) => {
    if (!price) return '-';
    return `${(price / 1000).toFixed(3)} TND`;
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('fr-TN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const medicationColumns = [
    {
      key: 'code',
      header: 'Code',
      render: (row: Medication) => (
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
          {row.code_amm || row.code_pct || '-'}
        </code>
      ),
    },
    {
      key: 'brand_name',
      header: 'Médicament',
      render: (row: Medication) => (
        <div>
          <p className="font-medium">{row.brand_name}</p>
          <p className="text-xs text-muted-foreground">{row.dci}</p>
        </div>
      ),
    },
    {
      key: 'dosage',
      header: 'Dosage / Forme',
      render: (row: Medication) => (
        <div className="text-sm">
          <p>{row.dosage || '-'}</p>
          <p className="text-xs text-muted-foreground">{row.form || '-'}</p>
        </div>
      ),
    },
    {
      key: 'classe',
      header: 'Classe',
      render: (row: Medication) => {
        const label = row.family_name || row.amm_classe;
        if (!label) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="max-w-[180px]">
            <p className="truncate text-sm" title={label}>{label}</p>
            {row.amm_sous_classe && (
              <p className="truncate text-xs text-muted-foreground" title={row.amm_sous_classe}>{row.amm_sous_classe}</p>
            )}
          </div>
        );
      },
    },
    {
      key: 'laboratory',
      header: 'Laboratoire',
      render: (row: Medication) => (
        <span className="text-sm">{row.laboratory || '-'}</span>
      ),
    },
    {
      key: 'gpb',
      header: 'G/P/B',
      render: (row: Medication) => {
        const info = row.gpb ? gpbLabel[row.gpb] : null;
        return info ? (
          <Badge variant={info.variant}>{info.label}</Badge>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      key: 'veic',
      header: 'VEIC',
      render: (row: Medication) => {
        const info = row.veic ? veicLabel[row.veic] : null;
        return info ? (
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${info.color}`}>
            {info.label}
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      key: 'price_public',
      header: 'Prix Public',
      render: (row: Medication) => (
        <span className="text-sm font-medium">{formatPrice(row.price_public)}</span>
      ),
    },
    {
      key: 'created_at',
      header: 'Créé le',
      render: (row: Medication) => (
        <span className="text-xs text-muted-foreground">{formatDate(row.created_at)}</span>
      ),
    },
    {
      key: 'updated_at',
      header: 'MAJ',
      render: (row: Medication) => (
        <span className="text-xs text-muted-foreground">{formatDate(row.updated_at)}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      className: 'text-right',
      render: (row: Medication) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/admin/medications/${row.id}`)}
          title="Voir détails"
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  const importColumns = [
    {
      key: 'file_name',
      header: 'Fichier',
      render: (row: ImportBatch) => (
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-green-600" />
          <span className="font-medium">{row.file_name}</span>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      render: (row: ImportBatch) => (
        <Badge variant="outline">{row.source}</Badge>
      ),
    },
    {
      key: 'stats',
      header: 'Résultats',
      render: (row: ImportBatch) => (
        <div className="flex gap-2 text-sm">
          <span className="text-green-600">+{row.imported_count}</span>
          <span className="text-blue-600">~{row.updated_count}</span>
          {row.error_count > 0 && <span className="text-red-600">!{row.error_count}</span>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row: ImportBatch) => {
        const config = {
          completed: { icon: CheckCircle, variant: 'success' as const, label: 'Terminé' },
          processing: { icon: Clock, variant: 'secondary' as const, label: 'En cours' },
          failed: { icon: XCircle, variant: 'destructive' as const, label: 'Échoué' },
        };
        const c = config[row.status as keyof typeof config] || config.processing;
        const Icon = c.icon;
        return (
          <Badge variant={c.variant} className="gap-1">
            <Icon className="h-3 w-3" />
            {c.label}
          </Badge>
        );
      },
    },
    {
      key: 'imported_by_name',
      header: 'Importé par',
      render: (row: ImportBatch) => row.imported_by_name || '-',
    },
    {
      key: 'created_at',
      header: 'Date',
      render: (row: ImportBatch) =>
        new Date(row.created_at).toLocaleString('fr-TN'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Gestion des Médicaments
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Base de données des médicaments - Sources: PCT & AMM (DPM Tunisie)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate('/admin/medications/families/new')}
          >
            <Package className="w-4 h-4" />
            Nouvelle famille
          </Button>
          <Button
            className="gap-2 bg-slate-900 hover:bg-[#19355d]"
            onClick={() => setShowAmmImportDialog(true)}
          >
            <ShieldCheck className="w-4 h-4" />
            Importer AMM
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="medications" className="gap-2">
            <Pill className="h-4 w-4" />
            Médicaments
          </TabsTrigger>
          <TabsTrigger value="baremes" className="gap-2">
            <TrendingUp className="h-4 w-4" />
            Barèmes familles
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2">
            <History className="h-4 w-4" />
            Historique imports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="medications" className="space-y-4">
          {/* Filters bar + Total card */}
          <div className="flex flex-col md:flex-row items-stretch gap-4">
            <div className="flex flex-1 flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              {/* Search */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Search className="w-[18px] h-[18px] text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Rechercher par nom, DCI ou code..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setMedsPage(1);
                  }}
                  className="w-full h-11 pl-11 pr-10 rounded-xl bg-[#f3f4f5] text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setMedsPage(1);
                    }}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                  </button>
                )}
              </div>
              {/* Filters */}
              <div className="flex items-center gap-3">
                <Select
                  value={familyFilter || "all"}
                  onValueChange={(v) => {
                    setFamilyFilter(v === "all" ? "" : v);
                    setMedsPage(1);
                  }}
                >
                  <SelectTrigger className="h-10 min-w-[160px] rounded-xl bg-[#f3f4f5] border-0 text-sm">
                    <SelectValue placeholder="Toutes familles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes familles</SelectItem>
                    {familiesData?.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={gpbFilter || "all"}
                  onValueChange={(v) => {
                    setGpbFilter(v === "all" ? "" : v);
                    setMedsPage(1);
                  }}
                >
                  <SelectTrigger className="h-10 min-w-[130px] rounded-xl bg-[#f3f4f5] border-0 text-sm">
                    <SelectValue placeholder="G/P/B" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous G/P/B</SelectItem>
                    <SelectItem value="G">Générique</SelectItem>
                    <SelectItem value="P">Princeps</SelectItem>
                    <SelectItem value="B">Biosimilaire</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={veicFilter || "all"}
                  onValueChange={(v) => {
                    setVeicFilter(v === "all" ? "" : v);
                    setMedsPage(1);
                  }}
                >
                  <SelectTrigger className="h-10 min-w-[140px] rounded-xl bg-[#f3f4f5] border-0 text-sm">
                    <SelectValue placeholder="VEIC" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous VEIC</SelectItem>
                    <SelectItem value="V">Vital</SelectItem>
                    <SelectItem value="E">Essentiel</SelectItem>
                    <SelectItem value="I">Intermédiaire</SelectItem>
                    <SelectItem value="C">Confort</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Classe AMM..."
                  className="h-10 min-w-[150px] max-w-[180px] rounded-xl bg-[#f3f4f5] border-0 text-sm"
                  value={ammClasseFilter}
                  onChange={(e) => {
                    setAmmClasseFilter(e.target.value);
                    setMedsPage(1);
                  }}
                />
              </div>
            </div>
            <div className="flex items-center gap-4 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 px-6 text-white shadow-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white">
                  Total Médicaments
                </p>
                <p className="text-2xl font-bold text-[30px]">
                  {(medicationsData?.meta?.total || 0).toLocaleString("fr-TN")}
                </p>
              </div>
              <Pill className="w-8 h-8 text-white ml-auto" />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
            <DataTable
              columns={medicationColumns}
              data={medicationsData?.data || []}
              isLoading={loadingMeds}
              pagination={{
                page: medsPage,
                limit: 20,
                total: medicationsData?.meta?.total || 0,
                onPageChange: setMedsPage,
              }}
            />
          </div>
        </TabsContent>

        <TabsContent value="baremes" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Taux de remboursement par famille
              </CardTitle>
              <Button
                size="sm"
                onClick={() => navigate('/admin/medications/baremes/new')}
              >
                <Plus className="mr-2 h-4 w-4" />
                Nouveau barème
              </Button>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={baremeColumns}
                data={baremesData?.data || []}
                isLoading={loadingBaremes}
                pagination={{
                  page: baremePage,
                  limit: 20,
                  total: baremesData?.meta?.total || 0,
                  onPageChange: setBaremePage,
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Historique des imports</CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={importColumns}
                data={importsData?.data || []}
                isLoading={loadingImports}
                pagination={{
                  page: importsPage,
                  limit: 20,
                  total: importsData?.meta?.total || 0,
                  onPageChange: setImportsPage,
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importer des médicaments</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              />
              {importFile ? (
                <FilePreview
                  file={importFile}
                  onRemove={() => setImportFile(null)}
                />
              ) : (
                <div
                  className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-12 w-12 text-muted-foreground" />
                  <p className="mt-2">Glissez un fichier CSV ou</p>
                  <Button variant="link" type="button">
                    Parcourir
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-lg bg-muted p-4 text-sm">
              <p className="font-medium mb-2">
                Format CSV attendu (separateur: point-virgule):
              </p>
              <code className="text-xs">
                code_pct;dci;marque;dosage;forme;conditionnement;famille;laboratoire;prix_public;generique;remboursable
              </code>
            </div>

            <div>
              <Label>Notes (optionnel)</Label>
              <Textarea
                placeholder="Ex: Mise à jour trimestrielle PCT Q1 2024"
                value={importNotes}
                onChange={(e) => setImportNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowImportDialog(false)}
            >
              Annuler
            </Button>
            <Button
              onClick={() => importFile && importMutation.mutate(importFile)}
              disabled={!importFile || importMutation.isPending}
            >
              {importMutation.isPending ? "Import en cours..." : "Importer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bareme Dialog */}

      {/* Bareme History Dialog */}
      <Dialog
        open={showBaremeHistoryDialog}
        onOpenChange={(open) => {
          setShowBaremeHistoryDialog(open);
          if (!open) setSelectedBaremeForHistory(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Historique des modifications
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {baremeHistoryData?.data?.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">
                Aucun historique
              </p>
            )}
            {baremeHistoryData?.data?.map((entry) => (
              <div key={entry.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <Badge
                    variant={
                      entry.action === "create"
                        ? "success"
                        : entry.action === "update"
                          ? "secondary"
                          : "destructive"
                    }
                  >
                    {entry.action === "create"
                      ? "Création"
                      : entry.action === "update"
                        ? "Modification"
                        : "Désactivation"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString("fr-TN")}
                  </span>
                </div>
                {entry.action === "update" &&
                  entry.old_taux !== null &&
                  entry.new_taux !== null && (
                    <p className="mt-2 text-sm">
                      Taux: {Math.round(entry.old_taux * 100)}% →{" "}
                      {Math.round(entry.new_taux * 100)}%
                    </p>
                  )}
                {entry.action === "create" && entry.new_taux !== null && (
                  <p className="mt-2 text-sm">
                    Taux: {Math.round(entry.new_taux * 100)}%
                  </p>
                )}
                {entry.motif && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Motif: {entry.motif}
                  </p>
                )}
                {entry.changed_by_name && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Par: {entry.changed_by_name}
                  </p>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>


      {/* AMM Import Dialog */}
      <Dialog
        open={showAmmImportDialog}
        onOpenChange={(open) => {
          setShowAmmImportDialog(open);
          if (!open) {
            setAmmFile(null);
            setAmmParsedRows([]);
            setAmmParseError("");
            setAmmImportNotes("");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              Importer la liste AMM (DPM Tunisie)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <input
              ref={ammFileInputRef}
              type="file"
              accept=".xls,.xlsx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setAmmFile(file);
                  parseAmmFile(file);
                }
              }}
            />

            {ammFile ? (
              <div className="space-y-3">
                <FilePreview
                  file={ammFile}
                  onRemove={() => {
                    setAmmFile(null);
                    setAmmParsedRows([]);
                    setAmmParseError("");
                  }}
                />
                {ammParseError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    <AlertCircle className="mr-1 inline h-4 w-4" />
                    {ammParseError}
                  </div>
                )}
                {ammParsedRows.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-4 text-sm">
                      <Badge variant="success">
                        {ammParsedRows.length} médicaments détectés
                      </Badge>
                      <span className="text-muted-foreground">
                        Classes:{" "}
                        {
                          new Set(
                            ammParsedRows.map((r) => r.classe).filter(Boolean),
                          ).size
                        }{" "}
                        | DCI:{" "}
                        {
                          new Set(
                            ammParsedRows.map((r) => r.dci).filter(Boolean),
                          ).size
                        }
                      </span>
                    </div>
                    {/* Preview first 5 rows */}
                    <div className="max-h-48 overflow-auto rounded border">
                      <table className="w-full text-xs">
                        <thead className="bg-muted">
                          <tr>
                            <th className="p-1.5 text-left">AMM</th>
                            <th className="p-1.5 text-left">Nom</th>
                            <th className="p-1.5 text-left">DCI</th>
                            <th className="p-1.5 text-left">Classe</th>
                            <th className="p-1.5 text-left">G/P/B</th>
                            <th className="p-1.5 text-left">VEIC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ammParsedRows.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-t">
                              <td className="p-1.5 font-mono">{row.amm}</td>
                              <td className="p-1.5 max-w-32 truncate">
                                {row.nom}
                              </td>
                              <td className="p-1.5 max-w-24 truncate">
                                {row.dci}
                              </td>
                              <td className="p-1.5 max-w-24 truncate">
                                {row.classe}
                              </td>
                              <td className="p-1.5">{row.gpb}</td>
                              <td className="p-1.5">{row.veic}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {ammParsedRows.length > 5 && (
                        <p className="border-t p-1.5 text-center text-xs text-muted-foreground">
                          ... et {ammParsedRows.length - 5} autres
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => ammFileInputRef.current?.click()}
              >
                <ShieldCheck className="h-12 w-12 text-muted-foreground" />
                <p className="mt-2 font-medium">
                  Fichier AMM (Excel .xls / .xlsx)
                </p>
                <p className="text-sm text-muted-foreground">
                  liste_amm.xls de la DPM Tunisie
                </p>
                <Button variant="link" type="button">
                  Parcourir
                </Button>
              </div>
            )}

            <div className="rounded-lg bg-muted p-3 text-sm">
              <p className="font-medium mb-1">Colonnes attendues:</p>
              <p className="text-xs text-muted-foreground">
                Nom, Dosage, Forme, Présentation, DCI, Classe, Sous Classe,
                Laboratoire, AMM, Date AMM, G/P/B, VEIC, Indications...
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Les médicaments existants seront mis à jour par code AMM. Les
                nouveaux seront créés.
              </p>
            </div>

            <div>
              <Label>Notes (optionnel)</Label>
              <Textarea
                placeholder="Ex: Mise à jour liste AMM Mars 2026"
                value={ammImportNotes}
                onChange={(e) => setAmmImportNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAmmImportDialog(false)}
            >
              Annuler
            </Button>
            <Button
              onClick={() => importAmmMutation.mutate(ammParsedRows)}
              disabled={
                ammParsedRows.length === 0 || importAmmMutation.isPending
              }
            >
              {importAmmMutation.isPending
                ? `Import en cours... ${Math.min(ammImportProgress.current, ammImportProgress.total)}/${ammImportProgress.total}`
                : `Importer ${ammParsedRows.length} médicaments`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

export default MedicationsPage;
