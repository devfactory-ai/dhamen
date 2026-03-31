import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Download } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { useInsurers, useDeleteInsurer, useToggleInsurerStatus, type Insurer } from '../hooks/useInsurers';
import { useToast } from '@/stores/toast';

const INSURER_TYPES: Record<string, { label: string; color: string }> = {
  INSURANCE: { label: 'Assurance', color: 'bg-blue-100 text-blue-800' },
  MUTUAL: { label: 'Mutuelle', color: 'bg-green-100 text-green-800' },
  cnam: { label: 'CNAM', color: 'bg-red-100 text-red-800' },
  mutuelle: { label: 'Mutuelle', color: 'bg-green-100 text-green-800' },
  compagnie: { label: 'Compagnie', color: 'bg-blue-100 text-blue-800' },
  reassureur: { label: 'Réassureur', color: 'bg-purple-100 text-purple-800' },
  autre: { label: 'Autre', color: 'bg-gray-100 text-gray-800' },
};

export function InsurersPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState<Insurer | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

  const { data, isLoading } = useInsurers(page);
  const deleteInsurer = useDeleteInsurer();
  const toggleStatus = useToggleInsurerStatus();

  const exportColumns: ExportColumn<Insurer>[] = [
    { key: 'code', header: 'Code' },
    { key: 'name', header: 'Nom' },
    { key: 'registrationNumber', header: 'N° Registre' },
    { key: 'type', header: 'Type', format: (v) => INSURER_TYPES[v as keyof typeof INSURER_TYPES]?.label || String(v) },
    { key: 'address', header: 'Adresse' },
    { key: 'city', header: 'Ville' },
    { key: 'phone', header: 'Téléphone' },
    { key: 'email', header: 'Email' },
    { key: 'isActive', header: 'Actif', format: (v) => v ? 'Oui' : 'Non' },
  ];

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const response = await apiClient.get<{ data: Insurer[]; meta: { total: number } }>('/insurers?limit=10000');
      if (!response.success) throw new Error(response.error?.message);

      const allData = response.data?.data || [];
      const csv = toCSV(allData, exportColumns);
      downloadCSV(csv, 'assureurs');
      toast({ title: `${allData.length} assureurs exportés`, variant: 'success' });
    } catch {
      toast({ title: 'Erreur lors de l\'export', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteInsurer.mutateAsync(deleteConfirm.id);
      setDeleteConfirm(null);
      toast({ title: 'Assureur supprimé avec succès', variant: 'success' });
    } catch {
      toast({ title: 'Erreur lors de la suppression', description: 'Veuillez réessayer', variant: 'destructive' });
    }
  };

  const handleToggleStatus = async (insurer: Insurer) => {
    const newStatus = insurer.isActive ? 'suspended' : 'active';
    try {
      await toggleStatus.mutateAsync({ id: insurer.id, status: newStatus as 'active' | 'suspended' });
      toast({ title: `Compagnie ${newStatus === 'active' ? 'activée' : 'suspendue'}`, variant: 'success' });
    } catch {
      toast({ title: 'Erreur lors du changement de statut', variant: 'destructive' });
    }
  };

  const columns = [
    {
      key: 'name',
      header: 'Compagnie',
      render: (insurer: Insurer) => (
        <div className="flex items-center gap-3">
          <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-muted font-bold text-sm'>
            {insurer.code}
          </div>
          <div>
            <p className="font-medium">{insurer.name}</p>
            <p className='text-muted-foreground text-sm'>{insurer.registrationNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (insurer: Insurer) => {
        const typeKey = insurer.typeAssureur || insurer.type;
        const typeInfo = INSURER_TYPES[typeKey] || INSURER_TYPES.autre;
        return (
          <span className={`rounded-full px-2 py-1 font-medium text-xs ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
        );
      },
    },
    {
      key: 'matriculeFiscal',
      header: 'Matricule Fiscal',
      render: (insurer: Insurer) => (
        <div>
          {insurer.matriculeFiscal ? (
            <div>
              <span className="font-mono text-sm">{insurer.matriculeFiscal}</span>
              {!insurer.matriculeValide && (
                <p className="text-xs text-amber-600 mt-0.5">⚠ MF invalide</p>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </div>
      ),
    },
    {
      key: 'convention',
      header: 'Convention',
      render: (insurer: Insurer) => (
        <div>
          {insurer.dateFinConvention ? (
            <div>
              <span className="text-sm">{new Date(insurer.dateFinConvention).toLocaleDateString('fr-TN')}</span>
              {insurer.conventionExpireBientot && (
                <p className="text-xs text-amber-600 mt-0.5">⚠ Expire bientôt</p>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (insurer: Insurer) => (
        <div>
          <p className="text-sm">{insurer.phone}</p>
          {insurer.email && <p className='text-muted-foreground text-xs'>{insurer.email}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (insurer: Insurer) => (
        <Badge variant={insurer.isActive ? 'success' : 'destructive'}>
          {insurer.isActive ? 'Actif' : 'Suspendu'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (insurer: Insurer) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/insurers/${insurer.id}/edit`)}>
            Modifier
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleToggleStatus(insurer)}
            disabled={toggleStatus.isPending}
          >
            {insurer.isActive ? 'Suspendre' : 'Activer'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteConfirm(insurer)}
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
          title="Compagnies Partenaires"
          description="Gérer les organismes partenaires et conventions de remboursement"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Export...' : 'Exporter'}
          </Button>
          <Button className="gap-2 bg-slate-900 hover:bg-[#19355d]" onClick={() => navigate('/insurers/new')}>
            <Plus className="w-4 h-4" /> Nouvelle compagnie
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.insurers || []}
        isLoading={isLoading}
        emptyMessage="Aucune compagnie partenaire enregistrée"
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
              Êtes-vous sûr de vouloir supprimer l'assureur{' '}
              <strong>{deleteConfirm?.name}</strong> ?
              Cette action est irréversible et supprimera tous les contrats associés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteInsurer.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default InsurersPage;
