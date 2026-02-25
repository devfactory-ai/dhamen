import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient } from '@/lib/api-client';
import { ContractForm } from '../components/ContractForm';
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
  adherentCount: number;
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

type ContractFormData = {
  insurerId: string;
  name: string;
  contractNumber: string;
  type: 'INDIVIDUAL' | 'GROUP' | 'CORPORATE';
  startDate: string;
  endDate: string;
  annualCeiling: number;
  coveragePharmacy: number;
  coverageConsultation: number;
  coverageLab: number;
  coverageHospitalization: number;
};

export function ContractsPage() {
  const [page, setPage] = useState(1);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);

  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['contracts', page],
    queryFn: async () => {
      const response = await apiClient.get<{ contracts: Contract[]; total: number }>('/contracts', {
        params: { page, limit: 20 },
      });
      if (!response.success) { throw new Error(response.error?.message); }
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ContractFormData) => {
      const response = await apiClient.post<{ contract: Contract }>('/contracts', data);
      if (!response.success) { throw new Error(response.error?.message); }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setIsCreateDialogOpen(false);
      toast.success('Contrat créé avec succès');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la création du contrat');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ContractFormData }) => {
      const response = await apiClient.put<{ contract: Contract }>(`/contracts/${id}`, data);
      if (!response.success) { throw new Error(response.error?.message); }
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      setEditingContract(null);
      toast.success('Contrat mis à jour avec succès');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la mise à jour');
    },
  });

  const handleCreateContract = (data: ContractFormData) => {
    createMutation.mutate(data);
  };

  const handleUpdateContract = (data: ContractFormData) => {
    if (editingContract) {
      updateMutation.mutate({ id: editingContract.id, data });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000);
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
      header: 'Validité',
      render: (contract: Contract) => (
        <div className="text-sm">
          <p>{formatDate(contract.startDate)}</p>
          <p className="text-muted-foreground">au {formatDate(contract.endDate)}</p>
        </div>
      ),
    },
    {
      key: 'adherents',
      header: 'Adhérents',
      render: (contract: Contract) => (
        <span className="font-medium">{contract.adherentCount}</span>
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
        <Button variant="ghost" size="sm" onClick={() => setSelectedContract(contract)}>
          Détails
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contrats"
        description="Gérer les contrats d'assurance santé"
        action={{
          label: 'Nouveau contrat',
          onClick: () => setIsCreateDialogOpen(true),
        }}
      />

      <DataTable
        columns={columns}
        data={data?.contracts || []}
        isLoading={isLoading}
        emptyMessage="Aucun contrat trouvé"
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

      {/* Contract Details Dialog */}
      <Dialog open={!!selectedContract} onOpenChange={() => setSelectedContract(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedContract?.name}</DialogTitle>
            <DialogDescription>Contrat N° {selectedContract?.contractNumber}</DialogDescription>
          </DialogHeader>
          {selectedContract && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className='text-muted-foreground text-sm'>Assureur</p>
                  <p className="font-medium">{selectedContract.insurerName}</p>
                </div>
                <div>
                  <p className='text-muted-foreground text-sm'>Type</p>
                  <p className="font-medium">{CONTRACT_TYPES[selectedContract.type].label}</p>
                </div>
                <div>
                  <p className='text-muted-foreground text-sm'>Plafond annuel</p>
                  <p className="font-medium">{formatAmount(selectedContract.annualCeiling)}</p>
                </div>
                <div>
                  <p className='text-muted-foreground text-sm'>Adhérents</p>
                  <p className="font-medium">{selectedContract.adherentCount}</p>
                </div>
              </div>

              <div>
                <p className='mb-3 font-medium text-sm'>Taux de couverture</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Pharmacie</span>
                    <span className="font-medium">{selectedContract.coveragePharmacy}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Consultation</span>
                    <span className="font-medium">{selectedContract.coverageConsultation}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Laboratoire</span>
                    <span className="font-medium">{selectedContract.coverageLab}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Hospitalisation</span>
                    <span className="font-medium">{selectedContract.coverageHospitalization}%</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setSelectedContract(null)}>
                  Fermer
                </Button>
                <Button onClick={() => {
                  setEditingContract(selectedContract);
                  setSelectedContract(null);
                }}>
                  Modifier
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create Contract Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nouveau contrat</DialogTitle>
            <DialogDescription>Créer un nouveau contrat d'assurance santé</DialogDescription>
          </DialogHeader>
          <ContractForm
            onSubmit={handleCreateContract}
            onCancel={() => setIsCreateDialogOpen(false)}
            isLoading={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Contract Dialog */}
      <Dialog open={!!editingContract} onOpenChange={() => setEditingContract(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Modifier le contrat</DialogTitle>
            <DialogDescription>Mettre à jour les informations du contrat</DialogDescription>
          </DialogHeader>
          {editingContract && (
            <ContractForm
              contract={editingContract}
              onSubmit={handleUpdateContract}
              onCancel={() => setEditingContract(null)}
              isLoading={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
