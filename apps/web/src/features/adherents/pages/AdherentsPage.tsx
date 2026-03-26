import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Download } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toCSV, downloadCSV, formatDateExport, type ExportColumn } from '@/lib/export-utils';
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
import { Adherent, useAdherents, useDeleteAdherent } from '../hooks/useAdherents';
import { useToast } from '@/stores/toast';

const RELATIONSHIP_LABELS = {
  PRIMARY: 'Titulaire',
  SPOUSE: 'Conjoint(e)',
  CHILD: 'Enfant',
  PARENT: 'Parent',
};

const GENDER_LABELS = {
  M: 'Masculin',
  F: 'Feminin',
};

export function AdherentsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Adherent | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useAdherents(page, 20, search || undefined);
  const deleteAdherent = useDeleteAdherent();

  const exportColumns: ExportColumn<Adherent>[] = [
    { key: 'nationalId', header: 'CIN' },
    { key: 'firstName', header: 'Prénom' },
    { key: 'lastName', header: 'Nom' },
    { key: 'dateOfBirth', header: 'Date de naissance', format: (v) => formatDateExport(v as string) },
    { key: 'gender', header: 'Genre' },
    { key: 'phone', header: 'Téléphone' },
    { key: 'email', header: 'Email' },
    { key: 'city', header: 'Ville' },
    { key: 'address', header: 'Adresse' },
    { key: 'memberNumber', header: 'N° Adhérent' },
    { key: 'relationship', header: 'Lien', format: (v) => RELATIONSHIP_LABELS[v as keyof typeof RELATIONSHIP_LABELS] || '' },
    { key: 'isActive', header: 'Actif', format: (v) => v ? 'Oui' : 'Non' },
  ];

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      // Fetch all data for export
      const response = await apiClient.get<{ data: Adherent[]; meta: { total: number } }>('/adherents?limit=10000');
      if (!response.success) throw new Error(response.error?.message);

      const allData = response.data?.data || [];
      const csv = toCSV(allData, exportColumns);
      downloadCSV(csv, 'adhérents');
      toast({ title: `${allData.length} adhérents exportés`, variant: 'success' });
    } catch (error) {
      toast({ title: 'Erreur lors de l\'export', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteAdherent.mutateAsync(deleteConfirm.id);
      setDeleteConfirm(null);
      toast({ title: 'Adhérent supprimé avec succès', variant: 'success' });
    } catch {
      toast({ title: 'Erreur lors de la suppression', description: 'Veuillez réessayer', variant: 'destructive' });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const columns = [
    {
      key: 'member',
      header: 'Adhérent',
      render: (adherent: Adherent) => (
        <div>
          <p className="font-medium">{adherent.firstName} {adherent.lastName}</p>
          <p className='text-muted-foreground text-sm'>N° {adherent.memberNumber}</p>
        </div>
      ),
    },
    {
      key: 'nationalId',
      header: 'CIN',
      render: (adherent: Adherent) => adherent.nationalId,
    },
    {
      key: 'info',
      header: 'Informations',
      render: (adherent: Adherent) => (
        <div>
          <p className="text-sm">{formatDate(adherent.dateOfBirth)}</p>
          <p className='text-muted-foreground text-xs'>{GENDER_LABELS[adherent.gender]}</p>
        </div>
      ),
    },
    {
      key: 'relationship',
      header: 'Lien',
      render: (adherent: Adherent) => (
        <Badge variant="secondary">{RELATIONSHIP_LABELS[adherent.relationship]}</Badge>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (adherent: Adherent) => (
        <div>
          {adherent.phone && <p className="text-sm">{adherent.phone}</p>}
          {adherent.city && <p className='text-muted-foreground text-xs'>{adherent.city}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (adherent: Adherent) => (
        <Badge variant={adherent.isActive ? 'success' : 'destructive'}>
          {adherent.isActive ? 'Actif' : 'Inactif'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (adherent: Adherent) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/adherents/${adherent.id}/edit`)}>
            Modifier
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteConfirm(adherent)}
          >
            Supprimer
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <PageHeader
          title="Adhérents"
          description="Gérer les adhérents et leurs ayants droit"
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExportCSV} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Export...' : 'Exporter'}
          </Button>
          <Button variant="outline" onClick={() => navigate('/adhérents/import')}>
            <Upload className="mr-2 h-4 w-4" />
            Import CSV
          </Button>
          <Button onClick={() => navigate('/adhérents/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Nouvel adhérent
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-4">
        <Input
          placeholder="Rechercher par nom, CIN ou N° adhérent..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <DataTable
        columns={columns}
        data={(data?.data as Adherent[]) || []}
        isLoading={isLoading}
        emptyMessage="Aucun adhérent trouvé"
        pagination={
          data?.meta
            ? {
                page,
                limit: 20,
                total: data.meta.total,
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
              Êtes-vous sûr de vouloir supprimer l'adhérent{' '}
              <strong>{deleteConfirm?.firstName} {deleteConfirm?.lastName}</strong> ?
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAdherent.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default AdherentsPage;
