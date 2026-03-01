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
                <Select value={familyFilter} onValueChange={setFamilyFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Toutes familles" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Toutes familles</SelectItem>
                    {familiesData?.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={genericFilter} onValueChange={setGenericFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Tous types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Tous types</SelectItem>
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
