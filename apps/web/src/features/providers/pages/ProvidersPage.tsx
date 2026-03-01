import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Download } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toCSV, downloadCSV, type ExportColumn } from '@/lib/export-utils';
import { apiClient } from '@/lib/api-client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useProviders, useDeleteProvider, type Provider } from '../hooks/useProviders';
import { useToast } from '@/stores/toast';

const PROVIDER_TYPES = {
  PHARMACY: { label: 'Pharmacie', color: 'bg-green-100 text-green-800' },
  DOCTOR: { label: 'Cabinet Medical', color: 'bg-blue-100 text-blue-800' },
  LAB: { label: 'Laboratoire', color: 'bg-purple-100 text-purple-800' },
  CLINIC: { label: 'Clinique', color: 'bg-orange-100 text-orange-800' },
};

export function ProvidersPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [deleteConfirm, setDeleteConfirm] = useState<Provider | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useProviders(page, 20, typeFilter);
  const deleteProvider = useDeleteProvider();

  const exportColumns: ExportColumn<Provider>[] = [
    { key: 'name', header: 'Nom' },
    { key: 'type', header: 'Type', format: (v) => PROVIDER_TYPES[v as keyof typeof PROVIDER_TYPES]?.label || String(v) },
    { key: 'licenseNo', header: 'N° Licence' },
    { key: 'registrationNumber', header: 'N° Enregistrément' },
    { key: 'speciality', header: 'Spécialité' },
    { key: 'address', header: 'Adresse' },
    { key: 'city', header: 'Ville' },
    { key: 'phone', header: 'Téléphone' },
    { key: 'email', header: 'Email' },
    { key: 'isActive', header: 'Actif', format: (v) => v ? 'Oui' : 'Non' },
  ];

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const response = await apiClient.get<{ data: Provider[]; meta: { total: number } }>('/providers?limit=10000');
      if (!response.success) throw new Error(response.error?.message);

      const allData = response.data?.data || [];
      const csv = toCSV(allData, exportColumns);
      downloadCSV(csv, 'prestataires');
      toast({ title: `${allData.length} prestataires exportés`, variant: 'success' });
    } catch {
      toast({ title: 'Erreur lors de l\'export', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteProvider.mutateAsync(deleteConfirm.id);
      setDeleteConfirm(null);
      toast({ title: 'Prestataire supprimé avec succès', variant: 'success' });
    } catch {
      toast({ title: 'Erreur lors de la suppression', description: 'Veuillez réessayer', variant: 'destructive' });
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Prestataire',
      render: (provider: Provider) => (
        <div>
          <p className="font-medium">{provider.name}</p>
          <p className='text-muted-foreground text-sm'>{provider.registrationNumber}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (provider: Provider) => {
        const typeInfo = PROVIDER_TYPES[provider.type];
        return (
          <span className={`rounded-full px-2 py-1 font-medium text-xs ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
        );
      },
    },
    {
      key: 'location',
      header: 'Localisation',
      render: (provider: Provider) => (
        <div>
          <p className="text-sm">{provider.city}</p>
          <p className='text-muted-foreground text-xs'>{provider.address}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (provider: Provider) => (
        <div>
          <p className="text-sm">{provider.phone}</p>
          {provider.email && <p className='text-muted-foreground text-xs'>{provider.email}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (provider: Provider) => (
        <Badge variant={provider.isActive ? 'success' : 'destructive'}>
          {provider.isActive ? 'Actif' : 'Inactif'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (provider: Provider) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/providers/${provider.id}/edit`)}>
            Modifier
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteConfirm(provider)}
          >
            Supprimer
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="Prestataires"
          description="Gérer les prestataires de sante"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Export...' : 'Exporter'}
          </Button>
          <Button variant="outline" onClick={() => navigate('/providers/import')}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
          <Button onClick={() => navigate('/providers/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Nouveau prestataire
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4">
        <Select value={typeFilter || 'all'} onValueChange={(v) => setTypeFilter(v === 'all' ? undefined : v)}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tous les types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            {Object.entries(PROVIDER_TYPES).map(([value, { label }]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.providers || []}
        isLoading={isLoading}
        emptyMessage="Aucun adhérent trouvé"
        pagination={
          data
            ? {
                page,
                limit: 20,
                total: data.total,
                onPageChange: setPage,
              }
            : undefined
        }
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer le prestataire{' '}
              <strong>{deleteConfirm?.name}</strong> ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteProvider.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ProvidersPage;
