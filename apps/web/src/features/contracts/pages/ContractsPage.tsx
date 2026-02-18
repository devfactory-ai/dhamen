import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient } from '@/lib/api-client';

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

export function ContractsPage() {
  const [page, setPage] = useState(1);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

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
          <p className="text-sm text-muted-foreground">N° {contract.contractNumber}</p>
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
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${typeInfo.color}`}>
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
          onClick: () => {},
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
                  <p className="text-sm text-muted-foreground">Assureur</p>
                  <p className="font-medium">{selectedContract.insurerName}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium">{CONTRACT_TYPES[selectedContract.type].label}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Plafond annuel</p>
                  <p className="font-medium">{formatAmount(selectedContract.annualCeiling)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Adhérents</p>
                  <p className="font-medium">{selectedContract.adherentCount}</p>
                </div>
              </div>

              <div>
                <p className="mb-3 text-sm font-medium">Taux de couverture</p>
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
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
