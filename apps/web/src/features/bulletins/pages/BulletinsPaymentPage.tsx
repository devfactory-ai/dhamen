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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import {
  CreditCard,
  CheckCircle,
  Clock,
  Loader2,
  Banknote,
  Building2,
  Wallet,
  Smartphone,
  FileText,
  Users,
  TrendingUp,
  Calendar,
} from 'lucide-react';

interface BulletinPayment {
  id: string;
  bulletin_number: string;
  bulletin_date: string;
  provider_name: string;
  care_type: string;
  total_amount: number;
  approved_amount: number;
  approved_date: string;
  status: 'approved' | 'pending_payment';
  adherent_first_name: string;
  adherent_last_name: string;
  adherent_national_id: string;
  adherent_rib: string | null;
  contract_number: string;
  insurer_name: string;
}

interface PaymentStats {
  approved_count: number;
  approved_amount: number;
  pending_payment_count: number;
  pending_payment_amount: number;
  today_paid_count: number;
  today_paid_amount: number;
  week_paid_count: number;
  week_paid_amount: number;
}

const paymentMethods = [
  { value: 'bank_transfer', label: 'Virement bancaire', icon: Building2 },
  { value: 'check', label: 'Cheque', icon: FileText },
  { value: 'cash', label: 'Especes', icon: Banknote },
  { value: 'mobile_payment', label: 'Paiement mobile', icon: Smartphone },
];

export default function BulletinsPaymentPage() {
  const queryClient = useQueryClient();
  const [selectedBulletins, setSelectedBulletins] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState('approved,pending_payment');
  const [page, setPage] = useState(1);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [batchPaymentDialogOpen, setBatchPaymentDialogOpen] = useState(false);
  const [selectedBulletin, setSelectedBulletin] = useState<BulletinPayment | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('bank_transfer');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Fetch bulletins pending payment
  const { data: bulletinsData, isLoading } = useQuery({
    queryKey: ['bulletins-payments', statusFilter, page],
    queryFn: async () => {
      const response = await apiClient.get(`/bulletins-soins/payments?status=${statusFilter}&page=${page}&limit=50`);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur chargement paiements');
      }
      // API returns { success, data: [...], meta: {...} } — data and meta are siblings at top level
      const raw = response as unknown as { success: boolean; data: BulletinPayment[]; meta: { page: number; limit: number; total: number; totalPages: number } };
      return { data: raw.data ?? [], meta: raw.meta };
    },
  });

  // Fetch payment stats
  const { data: statsData } = useQuery({
    queryKey: ['bulletins-payment-stats'],
    queryFn: async () => {
      const response = await apiClient.get('/bulletins-soins/payments/stats');
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur chargement stats');
      }
      return response.data as PaymentStats;
    },
  });

  // Process single payment
  const processPaymentMutation = useMutation({
    mutationFn: async (data: { bulletin_id: string; payment_method: string; payment_reference?: string; payment_notes?: string }) => {
      const response = await apiClient.post('/bulletins-soins/payments/process', data);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Paiement effectue avec succes');
      queryClient.invalidateQueries({ queryKey: ['bulletins-payments'] });
      queryClient.invalidateQueries({ queryKey: ['bulletins-payment-stats'] });
      setPaymentDialogOpen(false);
      resetPaymentForm();
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });

  // Process batch payments
  const batchPaymentMutation = useMutation({
    mutationFn: async (data: { bulletin_ids: string[]; payment_method: string; payment_reference?: string; payment_notes?: string }) => {
      const response = await apiClient.post('/bulletins-soins/payments/batch', data);
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`${data.data.processed} paiement(s) effectue(s) sur ${data.data.results.length}`);
      queryClient.invalidateQueries({ queryKey: ['bulletins-payments'] });
      queryClient.invalidateQueries({ queryKey: ['bulletins-payment-stats'] });
      setBatchPaymentDialogOpen(false);
      setSelectedBulletins([]);
      resetPaymentForm();
    },
    onError: (error: Error) => {
      toast.error(`Erreur: ${error.message}`);
    },
  });

  const resetPaymentForm = () => {
    setPaymentMethod('bank_transfer');
    setPaymentReference('');
    setPaymentNotes('');
    setSelectedBulletin(null);
  };

  const handleSinglePayment = (bulletin: BulletinPayment) => {
    setSelectedBulletin(bulletin);
    setPaymentDialogOpen(true);
  };

  const handleProcessPayment = () => {
    if (!selectedBulletin) return;
    processPaymentMutation.mutate({
      bulletin_id: selectedBulletin.id,
      payment_method: paymentMethod,
      payment_reference: paymentReference || undefined,
      payment_notes: paymentNotes || undefined,
    });
  };

  const handleBatchPayment = () => {
    if (selectedBulletins.length === 0) return;
    batchPaymentMutation.mutate({
      bulletin_ids: selectedBulletins,
      payment_method: paymentMethod,
      payment_reference: paymentReference || undefined,
      payment_notes: paymentNotes || undefined,
    });
  };

  const toggleBulletinSelection = (id: string) => {
    setSelectedBulletins((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAllSelection = () => {
    if (!bulletinsData?.data) return;
    if (selectedBulletins.length === bulletinsData.data.length) {
      setSelectedBulletins([]);
    } else {
      setSelectedBulletins(bulletinsData.data.map((b: BulletinPayment) => b.id));
    }
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount);
  };

  const stats = statsData || {
    approved_count: 0,
    approved_amount: 0,
    pending_payment_count: 0,
    pending_payment_amount: 0,
    today_paid_count: 0,
    today_paid_amount: 0,
    week_paid_count: 0,
    week_paid_amount: 0,
  };

  const bulletins: BulletinPayment[] = bulletinsData?.data || [];
  const totalSelectedAmount = bulletins
    .filter((b) => selectedBulletins.includes(b.id))
    .reduce((sum, b) => sum + (b.approved_amount || b.total_amount), 0);

  const columns = [
    {
      key: 'select',
      header: (
        <Checkbox
          checked={bulletins.length > 0 && selectedBulletins.length === bulletins.length}
          onCheckedChange={toggleAllSelection}
        />
      ),
      render: (row: BulletinPayment) => (
        <Checkbox
          checked={selectedBulletins.includes(row.id)}
          onCheckedChange={() => toggleBulletinSelection(row.id)}
        />
      ),
    },
    {
      key: 'bulletin',
      header: 'Bulletin',
      render: (row: BulletinPayment) => (
        <div>
          <p className="font-mono text-sm">{row.bulletin_number}</p>
          <p className="text-xs text-muted-foreground">{new Date(row.bulletin_date).toLocaleDateString('fr-TN')}</p>
        </div>
      ),
    },
    {
      key: 'adherent',
      header: 'Adherent',
      render: (row: BulletinPayment) => (
        <div>
          <p className="font-medium">{row.adherent_first_name} {row.adherent_last_name}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.adherent_national_id}</p>
        </div>
      ),
    },
    {
      key: 'provider',
      header: 'Prestataire',
      render: (row: BulletinPayment) => (
        <div>
          <p className="text-sm">{row.provider_name}</p>
          <p className="text-xs text-muted-foreground capitalize">{row.care_type}</p>
        </div>
      ),
    },
    {
      key: 'amount',
      header: 'Montant',
      render: (row: BulletinPayment) => (
        <div className="text-right">
          <p className="font-semibold text-green-600">{formatAmount(row.approved_amount || row.total_amount)}</p>
          {row.approved_amount && row.approved_amount !== row.total_amount && (
            <p className="text-xs text-muted-foreground line-through">{formatAmount(row.total_amount)}</p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row: BulletinPayment) => (
        <Badge variant={row.status === 'approved' ? 'default' : 'secondary'} className="gap-1">
          {row.status === 'approved' ? (
            <>
              <CheckCircle className="h-3 w-3" />
              Approuve
            </>
          ) : (
            <>
              <Clock className="h-3 w-3" />
              En attente
            </>
          )}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: BulletinPayment) => (
        <Button
          size="sm"
          onClick={() => handleSinglePayment(row)}
          disabled={processPaymentMutation.isPending}
        >
          <CreditCard className="h-4 w-4 mr-1" />
          Payer
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Traitement des paiements"
        description="Gerer les paiements des bulletins de soins approuves"
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">A payer</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{stats.approved_count}</p>
                <p className="text-sm text-green-600 font-semibold">{formatAmount(stats.approved_amount)}</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-lg">
                <CheckCircle className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">En cours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{stats.pending_payment_count}</p>
                <p className="text-sm text-amber-600 font-semibold">{formatAmount(stats.pending_payment_amount)}</p>
              </div>
              <div className="p-3 bg-amber-50 rounded-lg">
                <Clock className="h-6 w-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Payes aujourd'hui</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{stats.today_paid_count}</p>
                <p className="text-sm text-blue-600 font-semibold">{formatAmount(stats.today_paid_amount)}</p>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cette semaine</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{stats.week_paid_count}</p>
                <p className="text-sm text-purple-600 font-semibold">{formatAmount(stats.week_paid_amount)}</p>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <TrendingUp className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Batch Payment Bar */}
      {selectedBulletins.length > 0 && (
        <Card className="border-primary bg-primary/5">
          <CardContent className="py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="font-medium">{selectedBulletins.length} bulletin(s) selectionne(s)</span>
                </div>
                <div className="text-lg font-bold text-primary">
                  Total: {formatAmount(totalSelectedAmount)}
                </div>
              </div>
              <Button onClick={() => setBatchPaymentDialogOpen(true)}>
                <Wallet className="h-4 w-4 mr-2" />
                Paiement groupe
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <Label>Filtrer par statut:</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full md:w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="approved,pending_payment">Tous (a payer)</SelectItem>
                <SelectItem value="approved">Approuves uniquement</SelectItem>
                <SelectItem value="pending_payment">En cours de paiement</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>Bulletins en attente de paiement</CardTitle>
          <CardDescription>
            Selectionnez les bulletins a payer et traitez-les individuellement ou en lot
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <DataTable
              data={bulletins}
              columns={columns}
              pagination={{
                page,
                limit: 50,
                total: bulletinsData?.meta?.total || 0,
                onPageChange: setPage,
              }}
            />
          )}
        </CardContent>
      </Card>

      {/* Single Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Traiter le paiement</DialogTitle>
            <DialogDescription>
              {selectedBulletin && (
                <span>
                  Bulletin {selectedBulletin.bulletin_number} - {selectedBulletin.adherent_first_name} {selectedBulletin.adherent_last_name}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedBulletin && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Montant a payer:</span>
                  <span className="text-xl font-bold text-green-600">
                    {formatAmount(selectedBulletin.approved_amount || selectedBulletin.total_amount)}
                  </span>
                </div>
                {selectedBulletin.adherent_rib && (
                  <div className="mt-2 pt-2 border-t">
                    <span className="text-sm text-muted-foreground">RIB: </span>
                    <span className="font-mono text-sm">{selectedBulletin.adherent_rib}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Methode de paiement</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((method) => (
                      <SelectItem key={method.value} value={method.value}>
                        <div className="flex items-center gap-2">
                          <method.icon className="h-4 w-4" />
                          {method.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Reference de paiement (optionnel)</Label>
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="Ex: VIR-2025-001234"
                />
              </div>

              <div className="space-y-2">
                <Label>Notes (optionnel)</Label>
                <Textarea
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Notes internes sur ce paiement..."
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleProcessPayment} disabled={processPaymentMutation.isPending}>
              {processPaymentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmer le paiement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Payment Dialog */}
      <Dialog open={batchPaymentDialogOpen} onOpenChange={setBatchPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paiement groupe</DialogTitle>
            <DialogDescription>
              Traiter {selectedBulletins.length} paiement(s) simultanement
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Nombre de bulletins:</span>
                <span className="font-bold">{selectedBulletins.length}</span>
              </div>
              <div className="flex justify-between items-center mt-2">
                <span className="text-sm text-muted-foreground">Montant total:</span>
                <span className="text-xl font-bold text-green-600">
                  {formatAmount(totalSelectedAmount)}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Methode de paiement</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      <div className="flex items-center gap-2">
                        <method.icon className="h-4 w-4" />
                        {method.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Reference de paiement groupe (optionnel)</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="Ex: BATCH-2025-001234"
              />
            </div>

            <div className="space-y-2">
              <Label>Notes (optionnel)</Label>
              <Textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Notes sur ce lot de paiements..."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchPaymentDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleBatchPayment} disabled={batchPaymentMutation.isPending}>
              {batchPaymentMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmer les paiements
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
