import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Download } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toCSV, downloadCSV, formatDateExport, formatAmountExport, type ExportColumn } from '@/lib/export-utils';
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
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

interface Contract {
  id: string;
  insurerId: string;
  insurerName: string;
  contractNumber: string;
  name: string;
  type: 'INDIVIDUAL' | 'GROUP' | 'CORPORATE';
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED' | 'CANCELLED';
  coveragePharmacy: number;
  coverageConsultation: number;
  coverageLab: number;
  coverageHospitalization: number;
  annualCeiling: number;
  adhérentCount: number;
  createdAt: string;
}

const CONTRACT_TYPES = {
  INDIVIDUAL: { label: 'Individuel', color: 'bg-blue-100 text-blue-800' },
  GROUP: { label: 'Groupe', color: 'bg-green-100 text-green-800' },
  CORPORATE: { label: 'Entreprise', color: 'bg-purple-100 text-purple-800' },
};

const CONTRACT_STATUS = {
  ACTIVE: { label: 'Actif', variant: 'success' as const },
  SUSPENDED: { label: 'Suspendu', variant: 'warning' as const },
  EXPIRED: { label: 'Expiré', variant: 'secondary' as const },
  CANCELLED: { label: 'Annulé', variant: 'destructive' as const },
};

export function ContractsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState<Contract | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const queryClient = useQueryClient();

  const exportColumns: ExportColumn<Contract>[] = [
    { key: 'contractNumber', header: 'N° Contrat' },
    { key: 'name', header: 'Nom' },
    { key: 'insurerName', header: 'Assureur' },
    { key: 'type', header: 'Type', format: (v) => CONTRACT_TYPES[v as keyof typeof CONTRACT_TYPES]?.label || String(v) },
    { key: 'status', header: 'Statut', format: (v) => CONTRACT_STATUS[v as keyof typeof CONTRACT_STATUS]?.label || String(v) },
    { key: 'startDate', header: 'Debut', format: (v) => formatDateExport(v as string) },
    { key: 'endDate', header: 'Fin', format: (v) => formatDateExport(v as string) },
    { key: 'adhérentCount', header: 'Adhérents' },
    { key: 'coveragePharmacy', header: 'Couverture Pharmacie %' },
    { key: 'coverageConsultation', header: 'Couverture Consultation %' },
    { key: 'coverageLab', header: 'Couverture Labo %' },
    { key: 'coverageHospitalization', header: 'Couverture Hospitalisation %' },
    { key: 'annualCeiling', header: 'Plafond Annuel (TND)', format: (v) => formatAmountExport(v as number) },
  ];

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const response = await apiClient.get<{ contracts: Contract[]; total: number }>('/contracts?limit=10000');
      if (!response.success) throw new Error(response.error?.message);

      const allData = response.data?.contracts || [];
      const csv = toCSV(allData, exportColumns);
      downloadCSV(csv, 'contrats');
      toast.success(`${allData.length} contrats exportés`);
    } catch {
      toast.error('Erreur lors de l\'export');
    } finally {
      setIsExporting(false);
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ['contracts', page],
    queryFn: async () => {
      const response = await apiClient.get<{ contracts: Contract[]; total: number }>('/contracts', {
        params: { page, limit: 20 },
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiClient.delete(`/contracts/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setDeleteConfirm(null);
      toast.success('Contrat supprimé avec succès');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la suppression');
    },
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const columns = [
    {
      key: 'contract',
      header: 'Contrat',
      render: (contract: Contract) => (
        <div>
          <p className="font-medium">{contract.name}</p>
          <p className='text-muted-foreground text-sm'>N° {contract.contractNumber}</p>
        </div>
      ),
    },
    {
      key: 'insurer',
      header: 'Assureur',
      render: (contract: Contract) => contract.insurerName,
    },
    {
      key: 'type',
      header: 'Type',
      render: (contract: Contract) => {
        const typeInfo = CONTRACT_TYPES[contract.type];
        return (
          <span className={`rounded-full px-2 py-1 font-medium text-xs ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
        );
      },
    },
    {
      key: 'validity',
      header: 'Validite',
      render: (contract: Contract) => (
        <div className="text-sm">
          <p>{formatDate(contract.startDate)}</p>
          <p className="text-muted-foreground">au {formatDate(contract.endDate)}</p>
        </div>
      ),
    },
    {
      key: 'adhérents',
      header: 'Adhérents',
      render: (contract: Contract) => (
        <span className="font-medium">{contract.adhérentCount}</span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (contract: Contract) => {
        const statusInfo = CONTRACT_STATUS[contract.status];
        return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (contract: Contract) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/contracts/${contract.id}`)}>
            Details
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate(`/contracts/${contract.id}/edit`)}>
            Modifier
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteConfirm(contract)}
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
          title="Contrats"
          description="Gérer les contrats d'assurance sante"
        />
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV} disabled={isExporting}>
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Export...' : 'Exporter'}
          </Button>
          <Button className="gap-2 bg-slate-900 hover:bg-[#19355d]" onClick={() => navigate('/contracts/new')}>
            <Plus className="w-4 h-4" /> Nouveau contrat
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={data?.contracts || []}
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
              Êtes-vous sûr de vouloir supprimer le contrat{' '}
              <strong>{deleteConfirm?.name}</strong> ?
              Cette action est irréversible et affectera tous les adhérents associés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && deleteMutation.mutate(deleteConfirm.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ContractsPage;
