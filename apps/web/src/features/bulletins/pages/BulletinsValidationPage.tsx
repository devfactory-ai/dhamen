import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  FileImage,
  Stethoscope,
  Pill,
  FlaskConical,
  Building2,
  AlertCircle,
  Package,
  CheckCircle2,
  ThumbsUp,
  ThumbsDown,
  Search,
  Download,
  Calendar,
  User,
  CreditCard,
  FileDown,
  ChevronRight,
  Info,
  Printer,
} from 'lucide-react';

// Types for bulletin workflow
type BulletinStatus =
  | 'scan_uploaded'
  | 'paper_received'
  | 'paper_incomplete'
  | 'paper_complete'
  | 'processing'
  | 'approved'
  | 'pending_payment'
  | 'reimbursed'
  | 'rejected';

interface BulletinSoins {
  id: string;
  bulletin_number: string;
  bulletin_date: string;
  provider_name: string;
  provider_specialty: string;
  care_type: string;
  care_description: string;
  total_amount: number;
  reimbursed_amount: number;
  status: BulletinStatus;
  submission_date: string;
  paper_received_date: string | null;
  processing_date: string | null;
  reimbursement_date: string | null;
  estimated_reimbursement_date: string | null;
  rejection_reason: string | null;
  scan_url: string;
  adherent_id: string;
  adherent_first_name: string;
  adherent_last_name: string;
  adherent_national_id: string;
  beneficiary_name: string | null;
  beneficiary_relationship: string | null;
  missing_documents: string[] | null;
  contract_number?: string;
  contract_type?: string;
}

interface BulletinStats {
  total: number;
  scan_uploaded: number;
  paper_received: number;
  paper_incomplete: number;
  paper_complete: number;
  processing: number;
  approved: number;
  pending_payment: number;
  reimbursed: number;
  rejected: number;
  total_amount: number;
  total_reimbursed: number;
  awaiting_payment_amount: number;
  pending_amount: number;
}

const statusConfig: Record<BulletinStatus, {
  label: string;
  icon: typeof Clock;
  variant: 'default' | 'secondary' | 'success' | 'destructive' | 'warning' | 'outline';
  color: string;
  description: string;
}> = {
  scan_uploaded: {
    label: 'Scan soumis',
    icon: Clock,
    variant: 'secondary',
    color: 'text-yellow-600 bg-yellow-50',
    description: 'En attente du bulletin papier',
  },
  paper_received: {
    label: 'Papier recu',
    icon: Package,
    variant: 'default',
    color: 'text-blue-600 bg-blue-50',
    description: 'Bulletin papier recu, a verifier',
  },
  paper_incomplete: {
    label: 'Dossier incomplet',
    icon: AlertCircle,
    variant: 'warning',
    color: 'text-orange-600 bg-orange-50',
    description: 'Documents manquants - delai 15j',
  },
  paper_complete: {
    label: 'Dossier complet',
    icon: CheckCircle,
    variant: 'success',
    color: 'text-green-600 bg-green-50',
    description: 'Dossier complet - delai 2j',
  },
  processing: {
    label: 'En traitement',
    icon: Loader2,
    variant: 'default',
    color: 'text-blue-600 bg-blue-50',
    description: 'Validation en cours',
  },
  approved: {
    label: 'Approuve',
    icon: ThumbsUp,
    variant: 'success',
    color: 'text-emerald-600 bg-emerald-50',
    description: 'Valide - en attente de paiement',
  },
  pending_payment: {
    label: 'En attente paiement',
    icon: CreditCard,
    variant: 'warning',
    color: 'text-amber-600 bg-amber-50',
    description: 'Paiement en cours par l\'assurance',
  },
  reimbursed: {
    label: 'Rembourse',
    icon: CheckCircle2,
    variant: 'success',
    color: 'text-green-600 bg-green-50',
    description: 'Paiement effectue',
  },
  rejected: {
    label: 'Rejete',
    icon: XCircle,
    variant: 'destructive',
    color: 'text-red-600 bg-red-50',
    description: 'Demande rejetee',
  },
};

const careTypeConfig: Record<string, { label: string; icon: typeof Stethoscope }> = {
  consultation: { label: 'Consultation', icon: Stethoscope },
  pharmacy: { label: 'Pharmacie', icon: Pill },
  lab: { label: 'Analyses', icon: FlaskConical },
  hospital: { label: 'Hospitalisation', icon: Building2 },
};

// Workflow valid transitions
const validTransitions: Record<BulletinStatus, BulletinStatus[]> = {
  scan_uploaded: ['paper_received', 'rejected'],
  paper_received: ['paper_incomplete', 'paper_complete', 'rejected'],
  paper_incomplete: ['paper_complete', 'rejected'],
  paper_complete: ['processing', 'rejected'],
  processing: ['reimbursed', 'rejected'],
  reimbursed: [],
  rejected: [],
};

export function BulletinsValidationPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBulletin, setSelectedBulletin] = useState<BulletinSoins | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showStatusDialog, setShowStatusDialog] = useState(false);
  const [reimbursedAmount, setReimbursedAmount] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [newStatus, setNewStatus] = useState<BulletinStatus | ''>('');
  const [missingDocuments, setMissingDocuments] = useState('');

  // Fetch bulletins
  const { data: bulletinsData, isLoading } = useQuery({
    queryKey: ['bulletins-validation', page, statusFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', '20');
      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'pending') {
          params.append('status', 'scan_uploaded,paper_received,paper_incomplete,paper_complete,processing');
        } else {
          params.append('status', statusFilter);
        }
      }
      if (searchQuery) params.append('search', searchQuery);

      const response = await apiClient.get<BulletinSoins[]>(`/bulletins-soins/manage?${params}`);
      if (!response.success) throw new Error(response.error?.message);
      return {
        data: response.data || [],
        meta: (response as { meta?: { total: number; page: number; limit: number } }).meta || { total: 0, page: 1, limit: 20 },
      };
    },
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['bulletins-validation-stats'],
    queryFn: async () => {
      const response = await apiClient.get<BulletinStats>('/bulletins-soins/manage/stats');
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async ({ id, amount }: { id: string; amount: number }) => {
      const response = await apiClient.post(`/bulletins-soins/manage/${id}/approve`, {
        reimbursed_amount: amount,
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bulletins-validation'] });
      queryClient.invalidateQueries({ queryKey: ['bulletins-validation-stats'] });
      toast.success('Bulletin approuve avec succes!');
      setShowApproveDialog(false);
      setShowDetailsDialog(false);
      setSelectedBulletin(null);
      setReimbursedAmount('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de l\'approbation');
    },
  });

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await apiClient.post(`/bulletins-soins/manage/${id}/reject`, {
        reason,
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bulletins-validation'] });
      queryClient.invalidateQueries({ queryKey: ['bulletins-validation-stats'] });
      toast.success('Bulletin rejete');
      setShowRejectDialog(false);
      setShowDetailsDialog(false);
      setSelectedBulletin(null);
      setRejectionReason('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors du rejet');
    },
  });

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, missing_documents }: { id: string; status: BulletinStatus; missing_documents?: string[] }) => {
      const response = await apiClient.put(`/bulletins-soins/manage/${id}/status`, {
        status,
        missing_documents,
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bulletins-validation'] });
      queryClient.invalidateQueries({ queryKey: ['bulletins-validation-stats'] });
      toast.success('Statut mis a jour');
      setShowStatusDialog(false);
      setShowDetailsDialog(false);
      setSelectedBulletin(null);
      setNewStatus('');
      setMissingDocuments('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la mise a jour');
    },
  });

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
      minimumFractionDigits: 3,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const handleViewScan = (bulletin: BulletinSoins) => {
    if (bulletin.scan_url) {
      window.open(bulletin.scan_url, '_blank');
    }
  };

  const handleApprove = () => {
    if (!selectedBulletin || !reimbursedAmount) return;
    approveMutation.mutate({
      id: selectedBulletin.id,
      amount: parseFloat(reimbursedAmount),
    });
  };

  const handleReject = () => {
    if (!selectedBulletin || !rejectionReason) return;
    rejectMutation.mutate({
      id: selectedBulletin.id,
      reason: rejectionReason,
    });
  };

  const handleUpdateStatus = () => {
    if (!selectedBulletin || !newStatus) return;
    const missingDocs = missingDocuments.trim()
      ? missingDocuments.split('\n').map(d => d.trim()).filter(d => d)
      : undefined;
    updateStatusMutation.mutate({
      id: selectedBulletin.id,
      status: newStatus,
      missing_documents: missingDocs,
    });
  };

  const getAvailableTransitions = (currentStatus: BulletinStatus): BulletinStatus[] => {
    return validTransitions[currentStatus] || [];
  };

  const columns = [
    {
      key: 'bulletin',
      header: 'Bulletin',
      render: (row: BulletinSoins) => (
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100">
            <FileText className="h-5 w-5 text-gray-600" />
          </div>
          <div>
            <p className="font-mono font-medium text-sm">{row.bulletin_number}</p>
            <p className="text-xs text-muted-foreground">{formatDate(row.bulletin_date)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'adherent',
      header: 'Adherent',
      render: (row: BulletinSoins) => (
        <div>
          <p className="font-medium">{row.adherent_first_name} {row.adherent_last_name}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.adherent_national_id}</p>
          {row.beneficiary_name && (
            <p className="text-xs text-blue-600 mt-0.5">
              Ayant droit: {row.beneficiary_name}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'care_type',
      header: 'Type',
      render: (row: BulletinSoins) => {
        const config = careTypeConfig[row.care_type] || careTypeConfig.consultation;
        const Icon = config.icon;
        return (
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{config.label}</span>
          </div>
        );
      },
    },
    {
      key: 'provider',
      header: 'Praticien',
      render: (row: BulletinSoins) => (
        <div>
          <p className="text-sm">{row.provider_name || '-'}</p>
          {row.provider_specialty && (
            <p className="text-xs text-muted-foreground">{row.provider_specialty}</p>
          )}
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Montant',
      render: (row: BulletinSoins) => (
        <div className="text-right">
          <p className="font-medium">{formatAmount(row.total_amount)}</p>
          {row.reimbursed_amount > 0 && (
            <p className="text-xs text-green-600">
              Rembourse: {formatAmount(row.reimbursed_amount)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'submission_date',
      header: 'Soumis le',
      render: (row: BulletinSoins) => (
        <div className="text-sm">
          <p>{formatDate(row.submission_date)}</p>
          {row.paper_received_date && (
            <p className="text-xs text-muted-foreground">
              Papier: {formatDate(row.paper_received_date)}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row: BulletinSoins) => {
        const config = statusConfig[row.status];
        const Icon = config.icon;
        return (
          <Badge variant={config.variant as 'default' | 'secondary' | 'destructive' | 'outline'} className="gap-1">
            <Icon className={`h-3 w-3 ${row.status === 'processing' ? 'animate-spin' : ''}`} />
            {config.label}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: BulletinSoins) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedBulletin(row);
              setShowDetailsDialog(true);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {row.scan_url && (
            <Button size="sm" variant="ghost" onClick={() => handleViewScan(row)}>
              <FileImage className="h-4 w-4" />
            </Button>
          )}
          {['paper_complete', 'processing'].includes(row.status) && (
            <>
              <Button
                size="sm"
                variant="default"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => {
                  setSelectedBulletin(row);
                  setReimbursedAmount(row.total_amount.toString());
                  setShowApproveDialog(true);
                }}
              >
                <ThumbsUp className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setSelectedBulletin(row);
                  setShowRejectDialog(true);
                }}
              >
                <ThumbsDown className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  const pendingCount = (stats?.scan_uploaded || 0) +
    (stats?.paper_received || 0) +
    (stats?.paper_incomplete || 0) +
    (stats?.paper_complete || 0) +
    (stats?.processing || 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Validation des Bulletins de Soins"
        description="Verifiez et validez les bulletins soumis par les adherents"
        actions={
          <Button variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Exporter
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card className="border-l-4 border-l-yellow-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">A traiter</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Scans recus</p>
                <p className="text-2xl font-bold">{stats?.scan_uploaded || 0}</p>
              </div>
              <FileImage className="h-8 w-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-indigo-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Papiers recus</p>
                <p className="text-2xl font-bold">{stats?.paper_received || 0}</p>
              </div>
              <Package className="h-8 w-8 text-indigo-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Incomplets</p>
                <p className="text-2xl font-bold text-orange-600">{stats?.paper_incomplete || 0}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-orange-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rembourses</p>
                <p className="text-2xl font-bold text-green-600">{stats?.reimbursed || 0}</p>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Rejetes</p>
                <p className="text-2xl font-bold text-red-600">{stats?.rejected || 0}</p>
              </div>
              <XCircle className="h-8 w-8 text-red-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Amount Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-700">Montant en attente</p>
                <p className="text-3xl font-bold text-blue-900">{formatAmount(stats?.pending_amount || 0)}</p>
              </div>
              <CreditCard className="h-10 w-10 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-green-700">Total rembourse</p>
                <p className="text-3xl font-bold text-green-900">{formatAmount(stats?.total_reimbursed || 0)}</p>
              </div>
              <CheckCircle2 className="h-10 w-10 text-green-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom, CIN, numero..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-48">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous les statuts" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les statuts</SelectItem>
                  <SelectItem value="pending">A traiter</SelectItem>
                  <SelectItem value="scan_uploaded">Scan soumis</SelectItem>
                  <SelectItem value="paper_received">Papier recu</SelectItem>
                  <SelectItem value="paper_incomplete">Dossier incomplet</SelectItem>
                  <SelectItem value="paper_complete">Dossier complet</SelectItem>
                  <SelectItem value="processing">En traitement</SelectItem>
                  <SelectItem value="approved">Approuve</SelectItem>
                  <SelectItem value="pending_payment">En attente paiement</SelectItem>
                  <SelectItem value="reimbursed">Rembourse</SelectItem>
                  <SelectItem value="rejected">Rejete</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={bulletinsData?.data || []}
            isLoading={isLoading}
            emptyMessage="Aucun bulletin trouve"
            pagination={
              bulletinsData?.meta
                ? {
                    page: bulletinsData.meta.page,
                    limit: bulletinsData.meta.limit,
                    total: bulletinsData.meta.total,
                    onPageChange: setPage,
                  }
                : undefined
            }
          />
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Bulletin {selectedBulletin?.bulletin_number}
            </DialogTitle>
          </DialogHeader>
          {selectedBulletin && (
            <div className="space-y-6">
              {/* Status */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Badge variant={statusConfig[selectedBulletin.status].variant as 'default' | 'secondary' | 'destructive' | 'outline'} className="gap-1">
                    {(() => {
                      const Icon = statusConfig[selectedBulletin.status].icon;
                      return <Icon className={`h-3 w-3 ${selectedBulletin.status === 'processing' ? 'animate-spin' : ''}`} />;
                    })()}
                    {statusConfig[selectedBulletin.status].label}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {statusConfig[selectedBulletin.status].description}
                  </span>
                </div>
                {getAvailableTransitions(selectedBulletin.status).length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowStatusDialog(true)}
                  >
                    Changer le statut
                  </Button>
                )}
              </div>

              {/* Adherent Info */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Informations Adherent
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Adherent</p>
                      <p className="font-medium">{selectedBulletin.adherent_first_name} {selectedBulletin.adherent_last_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">CIN</p>
                      <p className="font-mono">{selectedBulletin.adherent_national_id}</p>
                    </div>
                    {selectedBulletin.beneficiary_name && (
                      <>
                        <div>
                          <p className="text-sm text-muted-foreground">Ayant droit</p>
                          <p className="font-medium">{selectedBulletin.beneficiary_name}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Lien</p>
                          <p>{selectedBulletin.beneficiary_relationship || '-'}</p>
                        </div>
                      </>
                    )}
                    {selectedBulletin.contract_number && (
                      <>
                        <div>
                          <p className="text-sm text-muted-foreground">N Contrat</p>
                          <p className="font-mono">{selectedBulletin.contract_number}</p>
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">Type contrat</p>
                          <p>{selectedBulletin.contract_type || '-'}</p>
                        </div>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Bulletin Details */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Details du Bulletin
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">N Bulletin</p>
                      <p className="font-mono font-medium">{selectedBulletin.bulletin_number}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Date bulletin</p>
                      <p>{formatDate(selectedBulletin.bulletin_date)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Type de soin</p>
                      <div className="flex items-center gap-2">
                        {(() => {
                          const config = careTypeConfig[selectedBulletin.care_type] || careTypeConfig.consultation;
                          const Icon = config.icon;
                          return (
                            <>
                              <Icon className="h-4 w-4 text-muted-foreground" />
                              <span>{config.label}</span>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Praticien</p>
                      <p>{selectedBulletin.provider_name || '-'}</p>
                      {selectedBulletin.provider_specialty && (
                        <p className="text-xs text-muted-foreground">{selectedBulletin.provider_specialty}</p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Montant total</p>
                      <p className="font-medium text-lg">{formatAmount(selectedBulletin.total_amount)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Montant rembourse</p>
                      <p className="font-medium text-lg text-green-600">{formatAmount(selectedBulletin.reimbursed_amount)}</p>
                    </div>
                  </div>
                  {selectedBulletin.care_description && (
                    <div className="mt-4">
                      <p className="text-sm text-muted-foreground">Description</p>
                      <p className="mt-1">{selectedBulletin.care_description}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Timeline */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    Historique
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-sm">Soumis le {formatDate(selectedBulletin.submission_date)}</span>
                    </div>
                    {selectedBulletin.paper_received_date && (
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-sm">Papier recu le {formatDate(selectedBulletin.paper_received_date)}</span>
                      </div>
                    )}
                    {selectedBulletin.processing_date && (
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-blue-500" />
                        <span className="text-sm">Traitement demarre le {formatDate(selectedBulletin.processing_date)}</span>
                      </div>
                    )}
                    {selectedBulletin.reimbursement_date && (
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span className="text-sm">Rembourse le {formatDate(selectedBulletin.reimbursement_date)}</span>
                      </div>
                    )}
                    {selectedBulletin.rejection_reason && (
                      <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200">
                        <p className="text-sm font-medium text-red-800">Motif du rejet:</p>
                        <p className="text-sm text-red-700">{selectedBulletin.rejection_reason}</p>
                      </div>
                    )}
                    {selectedBulletin.missing_documents && selectedBulletin.missing_documents.length > 0 && (
                      <div className="mt-3 p-3 rounded-lg bg-orange-50 border border-orange-200">
                        <p className="text-sm font-medium text-orange-800">Documents manquants:</p>
                        <ul className="text-sm text-orange-700 list-disc list-inside">
                          {selectedBulletin.missing_documents.map((doc, i) => (
                            <li key={i}>{doc}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                {selectedBulletin.scan_url && (
                  <Button variant="outline" onClick={() => handleViewScan(selectedBulletin)}>
                    <FileImage className="mr-2 h-4 w-4" />
                    Voir le scan
                  </Button>
                )}
                {['paper_complete', 'processing'].includes(selectedBulletin.status) && (
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      setReimbursedAmount(selectedBulletin.total_amount.toString());
                      setShowApproveDialog(true);
                    }}
                  >
                    <ThumbsUp className="mr-2 h-4 w-4" />
                    Approuver
                  </Button>
                )}
                {!['reimbursed', 'rejected'].includes(selectedBulletin.status) && (
                  <Button
                    variant="destructive"
                    onClick={() => setShowRejectDialog(true)}
                  >
                    <ThumbsDown className="mr-2 h-4 w-4" />
                    Rejeter
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Approve Dialog */}
      <AlertDialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approuver le remboursement</AlertDialogTitle>
            <AlertDialogDescription>
              Confirmez le montant a rembourser pour le bulletin {selectedBulletin?.bulletin_number}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>Montant du remboursement (TND)</Label>
            <Input
              type="number"
              step="0.001"
              value={reimbursedAmount}
              onChange={(e) => setReimbursedAmount(e.target.value)}
              className="mt-2"
            />
            {selectedBulletin && (
              <p className="text-sm text-muted-foreground mt-2">
                Montant demande: {formatAmount(selectedBulletin.total_amount)}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              disabled={!reimbursedAmount || approveMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Traitement...
                </>
              ) : (
                <>
                  <ThumbsUp className="mr-2 h-4 w-4" />
                  Approuver
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeter le bulletin</AlertDialogTitle>
            <AlertDialogDescription>
              Indiquez le motif du rejet pour le bulletin {selectedBulletin?.bulletin_number}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label>Motif du rejet</Label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Ex: Documents illisibles, ordonnance manquante..."
              className="mt-2"
              rows={3}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={!rejectionReason || rejectMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Traitement...
                </>
              ) : (
                <>
                  <ThumbsDown className="mr-2 h-4 w-4" />
                  Rejeter
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Status Change Dialog */}
      <Dialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changer le statut</DialogTitle>
          </DialogHeader>
          {selectedBulletin && (
            <div className="space-y-4">
              <div>
                <Label>Nouveau statut</Label>
                <Select value={newStatus} onValueChange={(v) => setNewStatus(v as BulletinStatus)}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Choisir un statut" />
                  </SelectTrigger>
                  <SelectContent>
                    {getAvailableTransitions(selectedBulletin.status).map((status) => (
                      <SelectItem key={status} value={status}>
                        {statusConfig[status].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {newStatus === 'paper_incomplete' && (
                <div>
                  <Label>Documents manquants (un par ligne)</Label>
                  <Textarea
                    value={missingDocuments}
                    onChange={(e) => setMissingDocuments(e.target.value)}
                    placeholder="Ex: Ordonnance originale&#10;Ticket de caisse&#10;Resultats d'analyse"
                    className="mt-2"
                    rows={4}
                  />
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowStatusDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleUpdateStatus}
              disabled={!newStatus || updateStatusMutation.isPending}
            >
              {updateStatusMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mise a jour...
                </>
              ) : (
                'Mettre a jour'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default BulletinsValidationPage;
