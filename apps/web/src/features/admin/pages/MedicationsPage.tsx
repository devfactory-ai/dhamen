import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
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
import { apiClient } from '@/lib/api-client';
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
} from 'lucide-react';
import { FilePreview } from '@/components/ui/file-preview';

interface Medication {
  id: string;
  code_pct: string;
  code_cnam: string;
  dci: string;
  brand_name: string;
  dosage: string;
  form: string;
  packaging: string;
  family_name: string;
  laboratory: string;
  price_public: number;
  price_référence: number;
  is_generic: number;
  is_reimbursable: number;
  reimbursement_rate: number;
}

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
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('');
  const [genericFilter, setGenericFilter] = useState('');
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showFamilyDialog, setShowFamilyDialog] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importNotes, setImportNotes] = useState('');
  const [newFamily, setNewFamily] = useState({ code: '', name: '', nameAr: '', description: '' });
  const [activeTab, setActiveTab] = useState('medications');
  const [showBaremeDialog, setShowBaremeDialog] = useState(false);
  const [editingBareme, setEditingBareme] = useState<MedicationFamilyBareme | null>(null);
  const [showBaremeHistoryDialog, setShowBaremeHistoryDialog] = useState(false);
  const [selectedBaremeForHistory, setSelectedBaremeForHistory] = useState<string | null>(null);
  const [baremeForm, setBaremeForm] = useState({
    medicationFamilyId: '',
    tauxRemboursement: '',
    plafondActe: '',
    plafondFamilleAnnuel: '',
    dateEffet: new Date().toISOString().split('T')[0],
    dateFinEffet: '',
    motif: '',
  });
  const [baremePage, setBaremePage] = useState(1);

  // Fetch medications
  const { data: medicationsData, isLoading: loadingMeds } = useQuery({
    queryKey: ['medications', search, familyFilter, genericFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (familyFilter) params.append('familyId', familyFilter);
      if (genericFilter) params.append('isGeneric', genericFilter);
      const url = `/medications?${params.toString()}`;
      const response = await apiClient.get<{ data: Medication[]; meta: { total: number } }>(url);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
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
    queryKey: ['medication-imports'],
    queryFn: async () => {
      const response = await apiClient.get<{ data: ImportBatch[]; meta: { total: number } }>('/medications/imports');
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
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
        `${import.meta.env.VITE_API_URL || '/api/v1'}/medications/import`,
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
      addToast({
        type: 'success',
        message: `Import terminé: ${data.imported} nouveaux, ${data.updated} mis à jour, ${data.errors?.length || 0} erreurs`,
      });
    },
    onError: (error: Error) => {
      addToast({ type: 'error', message: error.message });
    },
  });

  // Create family mutation
  const createFamilyMutation = useMutation({
    mutationFn: async (data: typeof newFamily) => {
      const response = await apiClient.post('/medications/families', data);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medication-families'] });
      setShowFamilyDialog(false);
      setNewFamily({ code: '', name: '', nameAr: '', description: '' });
      addToast({ type: 'success', message: 'Famille créée avec succès' });
    },
    onError: (error: Error) => {
      addToast({ type: 'error', message: error.message });
    },
  });

  // Fetch medication family baremes
  const { data: baremesData, isLoading: loadingBaremes } = useQuery({
    queryKey: ['medication-family-baremes', baremePage],
    queryFn: async () => {
      const response = await apiClient.get<{ data: MedicationFamilyBareme[]; meta: { total: number } }>(
        `/medication-family-baremes?page=${baremePage}&limit=20`
      );
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: activeTab === 'baremes',
  });

  // Fetch bareme history for a specific bareme
  const { data: baremeHistoryData } = useQuery({
    queryKey: ['bareme-history', selectedBaremeForHistory],
    queryFn: async () => {
      const response = await apiClient.get<{ data: BaremeHistoryEntry[]; meta: { total: number } }>(
        `/medication-family-baremes/${selectedBaremeForHistory}/history`
      );
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!selectedBaremeForHistory,
  });

  // Create/update bareme mutation
  interface BaremeFormData {
    medicationFamilyId: string;
    tauxRemboursement: number;
    plafondActe?: number;
    plafondFamilleAnnuel?: number;
    dateEffet: string;
    dateFinEffet?: string;
    motif?: string;
  }
  const saveBaremeMutation = useMutation({
    mutationFn: async (data: BaremeFormData) => {
      if (editingBareme) {
        const response = await apiClient.put(`/medication-family-baremes/${editingBareme.id}`, data);
        if (!response.success) throw new Error(response.error?.message);
        return response.data;
      }
      // For create, we need a contractId - use first available contract
      const response = await apiClient.post('/medication-family-baremes', {
        ...data,
        contractId: 'default', // Will be replaced by actual contract selection
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medication-family-baremes'] });
      setShowBaremeDialog(false);
      setEditingBareme(null);
      resetBaremeForm();
      addToast({
        type: 'success',
        message: editingBareme ? 'Barème mis à jour' : 'Barème créé avec succès',
      });
    },
    onError: (error: Error) => {
      addToast({ type: 'error', message: error.message });
    },
  });

  // Deactivate bareme mutation
  const deactivateBaremeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete(`/medication-family-baremes/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medication-family-baremes'] });
      addToast({ type: 'success', message: 'Barème désactivé' });
    },
    onError: (error: Error) => {
      addToast({ type: 'error', message: error.message });
    },
  });

  function resetBaremeForm() {
    setBaremeForm({
      medicationFamilyId: '',
      tauxRemboursement: '',
      plafondActe: '',
      plafondFamilleAnnuel: '',
      dateEffet: new Date().toISOString().split('T')[0],
      dateFinEffet: '',
      motif: '',
    });
  }

  function openEditBareme(bareme: MedicationFamilyBareme) {
    setEditingBareme(bareme);
    setBaremeForm({
      medicationFamilyId: bareme.medication_family_id,
      tauxRemboursement: String(bareme.taux_remboursement * 100),
      plafondActe: bareme.plafond_acte ? String(bareme.plafond_acte) : '',
      plafondFamilleAnnuel: bareme.plafond_famille_annuel ? String(bareme.plafond_famille_annuel) : '',
      dateEffet: bareme.date_effet,
      dateFinEffet: bareme.date_fin_effet || '',
      motif: '',
    });
    setShowBaremeDialog(true);
  }

  function handleSaveBareme() {
    const taux = parseFloat(baremeForm.tauxRemboursement) / 100;
    if (isNaN(taux) || taux < 0 || taux > 1) {
      addToast({ type: 'error', message: 'Taux invalide (0-100%)' });
      return;
    }
    const formData: BaremeFormData = {
      medicationFamilyId: baremeForm.medicationFamilyId,
      tauxRemboursement: taux,
      dateEffet: baremeForm.dateEffet || new Date().toISOString().split('T')[0]!,
    };
    if (baremeForm.plafondActe) formData.plafondActe = parseFloat(baremeForm.plafondActe);
    if (baremeForm.plafondFamilleAnnuel) formData.plafondFamilleAnnuel = parseFloat(baremeForm.plafondFamilleAnnuel);
    if (baremeForm.dateFinEffet) formData.dateFinEffet = baremeForm.dateFinEffet;
    if (baremeForm.motif) formData.motif = baremeForm.motif;
    saveBaremeMutation.mutate(formData);
  }

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
                  openEditBareme(row);
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

  const medicationColumns = [
    {
      key: 'code_pct',
      header: 'Code PCT',
      cell: (row: Medication) => (
        <code className="rounded bg-muted px-2 py-1 font-mono text-xs">{row.code_pct}</code>
      ),
    },
    {
      key: 'brand_name',
      header: 'Nom Commercial',
      cell: (row: Medication) => (
        <div>
          <p className="font-medium">{row.brand_name}</p>
          <p className="text-xs text-muted-foreground">{row.dci}</p>
        </div>
      ),
    },
    {
      key: 'dosage',
      header: 'Dosage / Forme',
      cell: (row: Medication) => (
        <div className="text-sm">
          <p>{row.dosage || '-'}</p>
          <p className="text-muted-foreground">{row.form || '-'}</p>
        </div>
      ),
    },
    {
      key: 'family_name',
      header: 'Famille',
      cell: (row: Medication) => row.family_name || '-',
    },
    {
      key: 'price_public',
      header: 'Prix Public',
      cell: (row: Medication) =>
        row.price_public ? `${row.price_public.toFixed(3)} TND` : '-',
    },
    {
      key: 'is_generic',
      header: 'Type',
      cell: (row: Medication) => (
        <Badge variant={row.is_generic ? 'secondary' : 'default'}>
          {row.is_generic ? 'Generique' : 'Princeps'}
        </Badge>
      ),
    },
    {
      key: 'reimbursement_rate',
      header: 'Remboursement',
      cell: (row: Medication) =>
        row.is_reimbursable ? (
          <Badge variant="success">{Math.round(row.reimbursement_rate * 100)}%</Badge>
        ) : (
          <Badge variant="outline">Non</Badge>
        ),
    },
  ];

  const importColumns = [
    {
      key: 'file_name',
      header: 'Fichier',
      cell: (row: ImportBatch) => (
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-green-600" />
          <span className="font-medium">{row.file_name}</span>
        </div>
      ),
    },
    {
      key: 'source',
      header: 'Source',
      cell: (row: ImportBatch) => (
        <Badge variant="outline">{row.source}</Badge>
      ),
    },
    {
      key: 'stats',
      header: 'Résultats',
      cell: (row: ImportBatch) => (
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
      cell: (row: ImportBatch) => {
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
      cell: (row: ImportBatch) => row.imported_by_name || '-',
    },
    {
      key: 'created_at',
      header: 'Date',
      cell: (row: ImportBatch) =>
        new Date(row.created_at).toLocaleString('fr-TN'),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des Medicaments"
        description="Base de données des medicaments - Source: Pharmacie Centrale de Tunisie"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowFamilyDialog(true)}>
              <Package className="mr-2 h-4 w-4" />
              Nouvelle famille
            </Button>
            <Button onClick={() => setShowImportDialog(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Importer CSV
            </Button>
          </div>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="medications" className="gap-2">
            <Pill className="h-4 w-4" />
            Medicaments
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
          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <Pill className="mx-auto h-8 w-8 text-blue-500" />
                  <p className="mt-2 text-2xl font-bold">{medicationsData?.meta?.total || 0}</p>
                  <p className="text-sm text-muted-foreground">Total médicaments</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <Package className="mx-auto h-8 w-8 text-purple-500" />
                  <p className="mt-2 text-2xl font-bold">{familiesData?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Familles</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <CheckCircle className="mx-auto h-8 w-8 text-green-500" />
                  <p className="mt-2 text-2xl font-bold">
                    {medicationsData?.data?.filter((m) => m.is_reimbursable).length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Remboursables</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <AlertCircle className="mx-auto h-8 w-8 text-orange-500" />
                  <p className="mt-2 text-2xl font-bold">
                    {medicationsData?.data?.filter((m) => m.is_generic).length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Generiques</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Recherche et filtres
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex-1 min-w-64">
                  <Input
                    placeholder="Rechercher par nom, DCI ou code..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select value={familyFilter || 'all'} onValueChange={(v) => setFamilyFilter(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-48">
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
                <Select value={genericFilter || 'all'} onValueChange={(v) => setGenericFilter(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Tous types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous types</SelectItem>
                    <SelectItem value="true">Generiques</SelectItem>
                    <SelectItem value="false">Princeps</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="pt-6">
              <DataTable
                columns={medicationColumns}
                data={medicationsData?.data || []}
                isLoading={loadingMeds}
              />
            </CardContent>
          </Card>
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
                onClick={() => {
                  setEditingBareme(null);
                  resetBaremeForm();
                  setShowBaremeDialog(true);
                }}
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
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Import Dialog */}
      <Dialog open={showImportDialog} onOpenChange={setShowImportDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importer des medicaments</DialogTitle>
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
              <p className="font-medium mb-2">Format CSV attendu (separateur: point-virgule):</p>
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
            <Button variant="outline" onClick={() => setShowImportDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => importFile && importMutation.mutate(importFile)}
              disabled={!importFile || importMutation.isPending}
            >
              {importMutation.isPending ? 'Import en cours...' : 'Importer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bareme Dialog */}
      <Dialog open={showBaremeDialog} onOpenChange={setShowBaremeDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingBareme ? 'Modifier le barème' : 'Nouveau barème de remboursement'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Famille de médicaments</Label>
              <Select
                value={baremeForm.medicationFamilyId}
                onValueChange={(v) => setBaremeForm({ ...baremeForm, medicationFamilyId: v })}
                disabled={!!editingBareme}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une famille" />
                </SelectTrigger>
                <SelectContent>
                  {familiesData?.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name} ({f.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Taux de remboursement (%)</Label>
              <Input
                type="number"
                min="0"
                max="100"
                placeholder="Ex: 80"
                value={baremeForm.tauxRemboursement}
                onChange={(e) => setBaremeForm({ ...baremeForm, tauxRemboursement: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Plafond par acte (TND, optionnel)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="Ex: 50.000"
                  value={baremeForm.plafondActe}
                  onChange={(e) => setBaremeForm({ ...baremeForm, plafondActe: e.target.value })}
                />
              </div>
              <div>
                <Label>Plafond famille/an (TND, optionnel)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.001"
                  placeholder="Ex: 500.000"
                  value={baremeForm.plafondFamilleAnnuel}
                  onChange={(e) => setBaremeForm({ ...baremeForm, plafondFamilleAnnuel: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date d'effet</Label>
                <Input
                  type="date"
                  value={baremeForm.dateEffet}
                  onChange={(e) => setBaremeForm({ ...baremeForm, dateEffet: e.target.value })}
                />
              </div>
              <div>
                <Label>Date fin d'effet (optionnel)</Label>
                <Input
                  type="date"
                  value={baremeForm.dateFinEffet}
                  onChange={(e) => setBaremeForm({ ...baremeForm, dateFinEffet: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Motif du changement</Label>
              <Textarea
                placeholder="Ex: Révision annuelle des taux, décision CA..."
                value={baremeForm.motif}
                onChange={(e) => setBaremeForm({ ...baremeForm, motif: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBaremeDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleSaveBareme}
              disabled={
                saveBaremeMutation.isPending ||
                !baremeForm.medicationFamilyId ||
                !baremeForm.tauxRemboursement ||
                !baremeForm.dateEffet
              }
            >
              {saveBaremeMutation.isPending
                ? 'Enregistrement...'
                : editingBareme
                  ? 'Mettre à jour'
                  : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bareme History Dialog */}
      <Dialog open={showBaremeHistoryDialog} onOpenChange={(open) => {
        setShowBaremeHistoryDialog(open);
        if (!open) setSelectedBaremeForHistory(null);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Historique des modifications
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-96 space-y-3 overflow-y-auto">
            {baremeHistoryData?.data?.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">Aucun historique</p>
            )}
            {baremeHistoryData?.data?.map((entry) => (
              <div key={entry.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <Badge
                    variant={
                      entry.action === 'create'
                        ? 'success'
                        : entry.action === 'update'
                          ? 'secondary'
                          : 'destructive'
                    }
                  >
                    {entry.action === 'create'
                      ? 'Création'
                      : entry.action === 'update'
                        ? 'Modification'
                        : 'Désactivation'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString('fr-TN')}
                  </span>
                </div>
                {entry.action === 'update' && entry.old_taux !== null && entry.new_taux !== null && (
                  <p className="mt-2 text-sm">
                    Taux: {Math.round(entry.old_taux * 100)}% → {Math.round(entry.new_taux * 100)}%
                  </p>
                )}
                {entry.action === 'create' && entry.new_taux !== null && (
                  <p className="mt-2 text-sm">Taux: {Math.round(entry.new_taux * 100)}%</p>
                )}
                {entry.motif && (
                  <p className="mt-1 text-xs text-muted-foreground">Motif: {entry.motif}</p>
                )}
                {entry.changed_by_name && (
                  <p className="mt-1 text-xs text-muted-foreground">Par: {entry.changed_by_name}</p>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* New Family Dialog */}
      <Dialog open={showFamilyDialog} onOpenChange={setShowFamilyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle famille de medicaments</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Code</Label>
              <Input
                placeholder="Ex: ANTIB"
                value={newFamily.code}
                onChange={(e) => setNewFamily({ ...newFamily, code: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label>Nom</Label>
              <Input
                placeholder="Ex: Antibiotiques"
                value={newFamily.name}
                onChange={(e) => setNewFamily({ ...newFamily, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Nom en arabe (optionnel)</Label>
              <Input
                placeholder="Ex: مضادات حيوية"
                value={newFamily.nameAr}
                onChange={(e) => setNewFamily({ ...newFamily, nameAr: e.target.value })}
                dir="rtl"
              />
            </div>
            <div>
              <Label>Description (optionnel)</Label>
              <Textarea
                placeholder="Description de la famille..."
                value={newFamily.description}
                onChange={(e) => setNewFamily({ ...newFamily, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFamilyDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => createFamilyMutation.mutate(newFamily)}
              disabled={createFamilyMutation.isPending || !newFamily.code || !newFamily.name}
            >
              Créer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MedicationsPage;
