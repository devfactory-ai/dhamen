import { useState } from 'react';
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
import { apiClient } from '@/lib/api-client';
import { useToastStore } from '@/stores/toast';
import {
  CheckCircle,
  XCircle,
  Clock,
  Search,
  FileCheck,
  Building,
  AlertCircle,
} from 'lucide-react';

interface MFVerification {
  id: string;
  provider_id: string;
  provider_name: string;
  provider_type: string;
  mf_number: string;
  company_name: string;
  activity_type: string;
  verification_status: 'pending' | 'verified' | 'rejected' | 'expired';
  verification_date: string;
  verified_by_name: string;
  rejection_reason: string;
  created_at: string;
}

interface Provider {
  id: string;
  name: string;
  type: string;
}

const statusConfig = {
  pending: { label: 'En attente', icon: Clock, variant: 'secondary' as const },
  verified: { label: 'Vérifié', icon: CheckCircle, variant: 'success' as const },
  rejected: { label: 'Rejeté', icon: XCircle, variant: 'destructive' as const },
  expired: { label: 'Expiré', icon: AlertCircle, variant: 'outline' as const },
};

export function MFVerificationPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToastStore();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [selectedVerification, setSelectedVérification] = useState<MFVerification | null>(null);
  const [newMF, setNewMF] = useState({
    providerId: '',
    mfNumber: '',
    companyName: '',
    activityType: '',
  });
  const [actionData, setActionData] = useState({
    status: 'verified' as 'verified' | 'rejected',
    rejectionReason: '',
    expiresAt: '',
  });

  // Fetch verifications
  const { data: verifications, isLoading } = useQuery({
    queryKey: ['mf-verifications', statusFilter],
    queryFn: async () => {
      const url = statusFilter
        ? `/mf-verification?status=${statusFilter}`
        : '/mf-verification';
      const response = await apiClient.get<{ data: MFVerification[]; meta: { total: number } }>(url);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
  });

  // Fetch providers for dropdown
  const { data: providersData } = useQuery({
    queryKey: ['providers-list'],
    queryFn: async () => {
      const response = await apiClient.get<{ data: Provider[] }>('/providers?limit=100');
      if (!response.success) throw new Error(response.error?.message);
      return response.data?.data || [];
    },
  });

  // Submit verification
  const submitMutation = useMutation({
    mutationFn: async (data: typeof newMF) => {
      const response = await apiClient.post('/mf-verification/verify', data);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mf-verifications'] });
      setShowVerifyDialog(false);
      setNewMF({ providerId: '', mfNumber: '', companyName: '', activityType: '' });
      addToast({ type: 'success', message: 'Vérification MF soumise avec succès' });
    },
    onError: (error: Error) => {
      addToast({ type: 'error', message: error.message });
    },
  });

  // Update verification status
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof actionData }) => {
      const response = await apiClient.put(`/mf-verification/${id}/status`, data);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mf-verifications'] });
      setShowActionDialog(false);
      setSelectedVérification(null);
      addToast({ type: 'success', message: 'Statut mis à jour avec succès' });
    },
    onError: (error: Error) => {
      addToast({ type: 'error', message: error.message });
    },
  });

  const columns = [
    {
      key: 'provider_name',
      header: 'Prestataire',
      cell: (row: MFVerification) => (
        <div>
          <p className="font-medium">{row.provider_name}</p>
          <p className="text-sm text-muted-foreground">{row.provider_type}</p>
        </div>
      ),
    },
    {
      key: 'mf_number',
      header: 'Matricule Fiscal',
      cell: (row: MFVerification) => (
        <code className="rounded bg-muted px-2 py-1 font-mono text-sm">
          {row.mf_number}
        </code>
      ),
    },
    {
      key: 'company_name',
      header: 'Raison Sociale',
      cell: (row: MFVerification) => row.company_name || '-',
    },
    {
      key: 'verification_status',
      header: 'Statut',
      cell: (row: MFVerification) => {
        const config = statusConfig[row.verification_status];
        const Icon = config.icon;
        return (
          <Badge variant={config.variant} className="gap-1">
            <Icon className="h-3 w-3" />
            {config.label}
          </Badge>
        );
      },
    },
    {
      key: 'created_at',
      header: 'Date soumission',
      cell: (row: MFVerification) =>
        new Date(row.created_at).toLocaleDateString('fr-TN'),
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (row: MFVerification) => (
        <div className="flex gap-2">
          {row.verification_status === 'pending' && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedVérification(row);
                  setActionData({ status: 'verified', rejectionReason: '', expiresAt: '' });
                  setShowActionDialog(true);
                }}
              >
                <CheckCircle className="mr-1 h-4 w-4" />
                Vérifier
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedVérification(row);
                  setActionData({ status: 'rejected', rejectionReason: '', expiresAt: '' });
                  setShowActionDialog(true);
                }}
              >
                <XCircle className="mr-1 h-4 w-4" />
                Rejeter
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vérification Matricule Fiscal"
        description="Vérifier le MF des praticiens et prestataires de sante"
        actions={
          <Button onClick={() => setShowVerifyDialog(true)}>
            <FileCheck className="mr-2 h-4 w-4" />
            Nouvelle vérification
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <Clock className="mx-auto h-8 w-8 text-yellow-500" />
              <p className="mt-2 text-2xl font-bold">
                {verifications?.data?.filter((v) => v.verification_status === 'pending').length || 0}
              </p>
              <p className="text-sm text-muted-foreground">En attente</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="mx-auto h-8 w-8 text-green-500" />
              <p className="mt-2 text-2xl font-bold">
                {verifications?.data?.filter((v) => v.verification_status === 'verified').length || 0}
              </p>
              <p className="text-sm text-muted-foreground">Vérifiés</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <XCircle className="mx-auto h-8 w-8 text-red-500" />
              <p className="mt-2 text-2xl font-bold">
                {verifications?.data?.filter((v) => v.verification_status === 'rejected').length || 0}
              </p>
              <p className="text-sm text-muted-foreground">Rejetes</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <Building className="mx-auto h-8 w-8 text-blue-500" />
              <p className="mt-2 text-2xl font-bold">{verifications?.meta?.total || 0}</p>
              <p className="text-sm text-muted-foreground">Total</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Filtres
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Tous les statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="verified">Vérifiés</SelectItem>
                <SelectItem value="rejected">Rejetes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={verifications?.data || []}
            isLoading={isLoading}
          />
        </CardContent>
      </Card>

      {/* New Vérification Dialog */}
      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle vérification MF</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Prestataire</Label>
              <Select
                value={newMF.providerId}
                onValueChange={(v) => setNewMF({ ...newMF, providerId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un prestataire" />
                </SelectTrigger>
                <SelectContent>
                  {providersData?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({p.type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Matricule Fiscal (MF)</Label>
              <Input
                placeholder="1234567ABC123"
                value={newMF.mfNumber}
                onChange={(e) => setNewMF({ ...newMF, mfNumber: e.target.value.toUpperCase() })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Format: 7 chiffres + 3 lettres + 3 chiffres
              </p>
            </div>
            <div>
              <Label>Raison Sociale</Label>
              <Input
                placeholder="Nom de l'entreprise"
                value={newMF.companyName}
                onChange={(e) => setNewMF({ ...newMF, companyName: e.target.value })}
              />
            </div>
            <div>
              <Label>Type d'activité</Label>
              <Input
                placeholder="Pharmacie, Cabinet médical, etc."
                value={newMF.activityType}
                onChange={(e) => setNewMF({ ...newMF, activityType: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVerifyDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => submitMutation.mutate(newMF)}
              disabled={submitMutation.isPending || !newMF.providerId || !newMF.mfNumber}
            >
              Soumettre
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Action Dialog */}
      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionData.status === 'verified' ? 'Vérifier le MF' : 'Rejeter le MF'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-4">
              <p className="font-medium">{selectedVerification?.provider_name}</p>
              <p className="font-mono text-sm">{selectedVerification?.mf_number}</p>
            </div>
            {actionData.status === 'rejected' && (
              <div>
                <Label>Motif du rejet</Label>
                <Textarea
                  placeholder="Expliquer le motif du rejet..."
                  value={actionData.rejectionReason}
                  onChange={(e) =>
                    setActionData({ ...actionData, rejectionReason: e.target.value })
                  }
                />
              </div>
            )}
            {actionData.status === 'verified' && (
              <div>
                <Label>Date d'expiration (optionnel)</Label>
                <Input
                  type="date"
                  value={actionData.expiresAt}
                  onChange={(e) => setActionData({ ...actionData, expiresAt: e.target.value })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowActionDialog(false)}>
              Annuler
            </Button>
            <Button
              variant={actionData.status === 'verified' ? 'default' : 'destructive'}
              onClick={() =>
                selectedVerification &&
                updateStatusMutation.mutate({
                  id: selectedVerification.id,
                  data: actionData,
                })
              }
              disabled={updateStatusMutation.isPending}
            >
              {actionData.status === 'verified' ? 'Valider' : 'Rejeter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MFVerificationPage;
