import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { useToast } from '@/stores/toast';
import { usePermissions } from '@/hooks/usePermissions';
import {
  CheckCircle,
  XCircle,
  Clock,
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
  pending: { label: 'En attente', icon: Clock, variant: 'secondary' as const, color: 'bg-yellow-500' },
  verified: { label: 'Vérifié', icon: CheckCircle, variant: 'success' as const, color: 'bg-emerald-500' },
  rejected: { label: 'Rejeté', icon: XCircle, variant: 'destructive' as const, color: 'bg-red-400' },
  expired: { label: 'Expiré', icon: AlertCircle, variant: 'outline' as const, color: 'bg-gray-400' },
};

const TYPE_LABELS: Record<string, string> = {
  pharmacist: 'Pharmacie',
  pharmacy: 'Pharmacie',
  doctor: 'Cabinet médical',
  lab: 'Laboratoire',
  clinic: 'Clinique',
  hospital: 'Hôpital',
  dentist: 'Cabinet dentaire',
  optician: 'Opticien',
};

export function MFVerificationPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('providers', 'create');
  const canApprove = hasPermission('providers', 'update');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [showActionDialog, setShowActionDialog] = useState(false);
  const [selectedVerification, setSelectedVerification] = useState<MFVerification | null>(null);
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

  // Click outside to close dropdown
  useEffect(() => {
    if (!statusDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusDropdownOpen]);

  // Fetch verifications
  const { data: verifications, isLoading } = useQuery({
    queryKey: ['mf-verifications', statusFilter],
    queryFn: async () => {
      const url = statusFilter && statusFilter !== 'all'
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
      const response = await apiClient.get<Provider[]>('/providers?limit=100');
      if (!response.success) throw new Error(response.error?.message);
      return response.data || [];
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
      toast({ title: 'Vérification MF soumise avec succès', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
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
      setSelectedVerification(null);
      toast({ title: 'Statut mis à jour avec succès', variant: 'success' });
    },
    onError: (error: Error) => {
      toast({ title: error.message, variant: 'destructive' });
    },
  });

  // Filter data locally by search
  const allData = verifications?.data || [];
  const filteredData = search
    ? allData.filter((v) =>
        v.provider_name?.toLowerCase().includes(search.toLowerCase()) ||
        v.mf_number?.toLowerCase().includes(search.toLowerCase()) ||
        v.company_name?.toLowerCase().includes(search.toLowerCase())
      )
    : allData;

  // Stats
  const pendingCount = allData.filter((v) => v.verification_status === 'pending').length;
  const verifiedCount = allData.filter((v) => v.verification_status === 'verified').length;
  const rejectedCount = allData.filter((v) => v.verification_status === 'rejected').length;
  const totalCount = verifications?.meta?.total || allData.length;

  // Columns with render (not cell)
  const columns = [
    {
      key: 'provider_name',
      header: 'Praticien',
      render: (row: MFVerification) => {
        const initials = (row.provider_name || '??').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const colors = ['bg-blue-600', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500'];
        let hash = 0;
        for (let i = 0; i < row.provider_name.length; i++) hash = row.provider_name.charCodeAt(i) + ((hash << 5) - hash);
        const color = colors[Math.abs(hash) % colors.length];
        return (
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium text-white ${color}`}>
              {initials}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{row.provider_name}</p>
              <p className="text-xs text-gray-400">{TYPE_LABELS[row.provider_type] || row.provider_type}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'mf_number',
      header: 'Matricule Fiscal',
      render: (row: MFVerification) => (
        <span className="inline-flex rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white font-mono">
          {row.mf_number}
        </span>
      ),
    },
    {
      key: 'company_name',
      header: 'Raison Sociale',
      render: (row: MFVerification) => (
        <span className="text-sm text-gray-700">{row.company_name || '—'}</span>
      ),
    },
    {
      key: 'verification_status',
      header: 'Statut',
      render: (row: MFVerification) => {
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
      render: (row: MFVerification) => (
        <span className="text-sm text-gray-700">
          {new Date(row.created_at).toLocaleDateString('fr-TN')}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: MFVerification) => (
        <div className="flex gap-1">
          {canApprove && row.verification_status === 'pending' && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelectedVerification(row);
                  setActionData({ status: 'verified', rejectionReason: '', expiresAt: '' });
                  setShowActionDialog(true);
                }}
              >
                <CheckCircle className="h-4 w-4 text-green-600" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:text-red-700"
                onClick={() => {
                  setSelectedVerification(row);
                  setActionData({ status: 'rejected', rejectionReason: '', expiresAt: '' });
                  setShowActionDialog(true);
                }}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header: title + button */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Vérification Matricule Fiscal
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Vérifier le MF des praticiens de santé
          </p>
        </div>
        {canCreate && (
          <Button
            className="gap-2 bg-slate-900 hover:bg-[#19355d]"
            onClick={() => setShowVerifyDialog(true)}
          >
            <FileCheck className="h-4 w-4" />
            Nouvelle vérification
          </Button>
        )}
      </div>

      {/* Filters bar + Total card */}
      <div className="flex flex-col items-stretch gap-4 w-full ">
        {/* Stats cards */}
        <div className="sm:grid gap-3 grid-cols-4 flex flex-col">
          <div className="flex items-center gap-2 rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3">
            <Clock className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="text-lg font-bold text-yellow-700">
                {pendingCount}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-yellow-600">
                En attente
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-green-50 border border-green-200 px-4 py-3">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div>
              <p className="text-lg font-bold text-green-700">
                {verifiedCount}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-green-600">
                Vérifiés
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <XCircle className="h-5 w-5 text-red-600" />
            <div>
              <p className="text-lg font-bold text-red-700">{rejectedCount}</p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-red-600">
                Rejetés
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 px-6 py-3 text-white shadow-sm">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white">
                Total
              </p>
              <p className="text-lg font-bold">{totalCount}</p>
            </div>
            <Building className="h-6 w-6 text-white" />
          </div>
        </div>
        {/* Filters */}
        <div className="flex-1 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg
                  className="w-[18px] h-[18px] text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                  />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Rechercher par nom, MF, raison sociale..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full h-11 pl-11 pr-10 rounded-xl bg-[#f3f4f5] text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18 18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>

            {/* Statut dropdown */}
            <div className="relative shrink-0" ref={statusDropdownRef}>
              <button
                type="button"
                onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                className="flex items-center gap-2 w-full sm:w-auto px-4 py-3 bg-[#f3f4f5] rounded-xl hover:bg-gray-200/70 transition-colors cursor-pointer"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Statut
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {statusFilter === "all"
                    ? "Tous"
                    : statusConfig[statusFilter as keyof typeof statusConfig]
                        ?.label || statusFilter}
                </span>
                <svg
                  className={`w-3.5 h-3.5 text-gray-400 ml-auto sm:ml-1 transition-transform ${statusDropdownOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="m19 9-7 7-7-7"
                  />
                </svg>
              </button>
              {statusDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-full sm:w-48 py-1 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 z-50">
                  {[
                    { value: "all", label: "Tous", color: null },
                    {
                      value: "pending",
                      label: "En attente",
                      color: "bg-yellow-500",
                    },
                    {
                      value: "verified",
                      label: "Vérifiés",
                      color: "bg-emerald-500",
                    },
                    {
                      value: "rejected",
                      label: "Rejetés",
                      color: "bg-red-400",
                    },
                    {
                      value: "expired",
                      label: "Expirés",
                      color: "bg-gray-400",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        setStatusFilter(opt.value);
                        setStatusDropdownOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 ${statusFilter === opt.value ? "text-blue-600 font-semibold bg-blue-50/50" : "text-gray-700"}`}
                    >
                      {opt.color && (
                        <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                      )}
                      {opt.label}
                      {statusFilter === opt.value && (
                        <svg
                          className="w-4 h-4 ml-auto text-blue-600"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="m4.5 12.75 6 6 9-13.5"
                          />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={filteredData}
          isLoading={isLoading}
          emptyMessage="Aucune vérification trouvée"
        />
      </div>

      {/* New Vérification Dialog */}
      <Dialog open={showVerifyDialog} onOpenChange={setShowVerifyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle vérification MF</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Praticien</Label>
              <Select
                value={newMF.providerId}
                onValueChange={(v) => setNewMF({ ...newMF, providerId: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un praticien" />
                </SelectTrigger>
                <SelectContent>
                  {(providersData || []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} ({TYPE_LABELS[p.type] || p.type})
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
                onChange={(e) =>
                  setNewMF({ ...newMF, mfNumber: e.target.value.toUpperCase() })
                }
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
                onChange={(e) =>
                  setNewMF({ ...newMF, companyName: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Type d'activité</Label>
              <Input
                placeholder="Pharmacie, Cabinet médical, etc."
                value={newMF.activityType}
                onChange={(e) =>
                  setNewMF({ ...newMF, activityType: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowVerifyDialog(false)}
            >
              Annuler
            </Button>
            <Button
              onClick={() => submitMutation.mutate(newMF)}
              disabled={
                submitMutation.isPending || !newMF.providerId || !newMF.mfNumber
              }
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
              {actionData.status === "verified"
                ? "Vérifier le MF"
                : "Rejeter le MF"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-4">
              <p className="font-medium">
                {selectedVerification?.provider_name}
              </p>
              <p className="font-mono text-sm">
                {selectedVerification?.mf_number}
              </p>
            </div>
            {actionData.status === "rejected" && (
              <div>
                <Label>Motif du rejet</Label>
                <Textarea
                  placeholder="Expliquer le motif du rejet..."
                  value={actionData.rejectionReason}
                  onChange={(e) =>
                    setActionData({
                      ...actionData,
                      rejectionReason: e.target.value,
                    })
                  }
                />
              </div>
            )}
            {actionData.status === "verified" && (
              <div>
                <Label>Date d'expiration (optionnel)</Label>
                <Input
                  type="date"
                  value={actionData.expiresAt}
                  onChange={(e) =>
                    setActionData({ ...actionData, expiresAt: e.target.value })
                  }
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowActionDialog(false)}
            >
              Annuler
            </Button>
            <Button
              variant={
                actionData.status === "verified" ? "default" : "destructive"
              }
              onClick={() =>
                selectedVerification &&
                updateStatusMutation.mutate({
                  id: selectedVerification.id,
                  data: actionData,
                })
              }
              disabled={updateStatusMutation.isPending}
            >
              {actionData.status === "verified" ? "Valider" : "Rejeter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MFVerificationPage;
