import { useState, useCallback, useEffect } from 'react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Search,
  Download,
  Eye,
  FileText,
  CheckCircle,
  XCircle,
  CreditCard,
  Loader2,
  RotateCcw,
  Image,
  AlertCircle,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import {
  useHistoryList,
  useHistoryStats,
  useHistoryDetail,
  exportHistoryCSV,
} from '@/hooks/use-bulletin-history';
import type { HistoryBulletin, HistoryFilters } from '@/hooks/use-bulletin-history';
import { getAccessToken } from '@/lib/auth';
import { apiClient } from '@/lib/api-client';

const careTypeLabels: Record<string, string> = {
  consultation: 'Consultation',
  pharmacie: 'Pharmacie',
  hospital: 'Hospitalisation',
  lab: 'Laboratoire',
  radio: 'Radiologie',
  optique: 'Optique',
  dentaire: 'Dentaire',
};

const statusConfig: Record<string, { label: string; variant: string; icon: typeof CheckCircle }> = {
  approved: { label: 'Approuve', variant: 'default', icon: CheckCircle },
  reimbursed: { label: 'Rembourse', variant: 'success', icon: CreditCard },
  rejected: { label: 'Rejete', variant: 'destructive', icon: XCircle },
};

function formatAmount(amount: number | null | undefined): string {
  if (amount == null) return '0.000 TND';
  return `${(amount / 1000).toFixed(3)} TND`;
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '-';
  try {
    return new Date(date).toLocaleDateString('fr-TN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return date;
  }
}

export default function BulletinsHistoryPage() {
  const token = getAccessToken();
  const [filters, setFilters] = useState<HistoryFilters>({
    page: 1,
    limit: 20,
    sortBy: 'bulletin_date',
    sortOrder: 'desc',
  });
  const [searchInput, setSearchInput] = useState('');
  const [selectedBulletinId, setSelectedBulletinId] = useState<string | null>(null);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: historyData, isLoading } = useHistoryList(filters);
  const { data: stats } = useHistoryStats(filters.dateFrom, filters.dateTo);
  const { data: detail, isLoading: detailLoading } = useHistoryDetail(
    showDetailDialog ? selectedBulletinId : null
  );

  const [scanBlobUrl, setScanBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!detail?.scanUrl || !selectedBulletinId) {
      setScanBlobUrl(null);
      return;
    }
    let revoked = false;
    apiClient.get<Blob>(`/bulletins-soins/manage/${selectedBulletinId}/scan`, { responseType: 'blob' }).then((res) => {
      if (!revoked && res.success && res.data) {
        setScanBlobUrl(URL.createObjectURL(res.data));
      }
    });
    return () => {
      revoked = true;
      setScanBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [detail?.scanUrl, selectedBulletinId]);

  const updateFilter = useCallback((key: keyof HistoryFilters, value: string | number | undefined) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({ page: 1, limit: 20, sortBy: 'bulletin_date', sortOrder: 'desc' });
    setSearchInput('');
  }, []);

  const handleSearch = useCallback(() => {
    updateFilter('search', searchInput || undefined);
  }, [searchInput, updateFilter]);

  const handleExport = useCallback(async () => {
    if (!token) return;
    setExporting(true);
    try {
      await exportHistoryCSV(filters, token);
      toast.success('Export CSV telecharge');
    } catch {
      toast.error('Erreur lors de l\'export CSV');
    } finally {
      setExporting(false);
    }
  }, [filters, token]);

  const handleViewDetail = useCallback((bulletin: HistoryBulletin) => {
    setSelectedBulletinId(bulletin.id);
    setShowDetailDialog(true);
  }, []);

  const columns = [
    {
      key: 'bulletinNumber',
      header: 'Numero',
      render: (row: HistoryBulletin) => (
        <span className="font-mono text-sm">{row.bulletinNumber}</span>
      ),
    },
    {
      key: 'bulletinDate',
      header: 'Date',
      render: (row: HistoryBulletin) => (
        <span className="text-sm">{formatDate(row.bulletinDate)}</span>
      ),
    },
    {
      key: 'adherent',
      header: 'Adherent',
      render: (row: HistoryBulletin) => (
        <div>
          <p className="text-sm font-medium">{row.adherentFirstName} {row.adherentLastName}</p>
          {row.adherentMatricule && (
            <p className="text-xs text-muted-foreground">{row.adherentMatricule}</p>
          )}
        </div>
      ),
    },
    {
      key: 'careType',
      header: 'Type',
      render: (row: HistoryBulletin) => (
        <span className="text-sm">{careTypeLabels[row.careType] || row.careType}</span>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Declare',
      render: (row: HistoryBulletin) => (
        <span className="text-sm text-right font-medium">{formatAmount(row.totalAmount)}</span>
      ),
    },
    {
      key: 'reimbursedAmount',
      header: 'Rembourse',
      render: (row: HistoryBulletin) => (
        <span className={`text-sm text-right font-medium ${row.reimbursedAmount && row.reimbursedAmount > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
          {formatAmount(row.reimbursedAmount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row: HistoryBulletin) => {
        const config = statusConfig[row.status] || statusConfig.approved;
        return (
          <Badge variant={config.variant as 'default' | 'destructive' | 'secondary'} className="gap-1">
            <config.icon className="h-3 w-3" />
            {config.label}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      render: (row: HistoryBulletin) => (
        <Button variant="ghost" size="sm" onClick={() => handleViewDetail(row)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Historique des bulletins de soins"
        description="Consultez l'historique des actions et le suivi des bulletins de soins"
      />

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total rembourse</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{formatAmount(stats.totalReimbursed)}</div>
              <p className="text-xs text-muted-foreground">sur {formatAmount(stats.totalDeclared)} declare</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bulletins approuves</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byStatus.approved || 0}</div>
              <p className="text-xs text-muted-foreground">en attente de paiement</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bulletins rembourses</CardTitle>
              <CreditCard className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.byStatus.reimbursed || 0}</div>
              <p className="text-xs text-muted-foreground">paiement effectue</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bulletins rejetes</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.byStatus.rejected || 0}</div>
              <p className="text-xs text-muted-foreground">non rembourses</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
            <div className="md:col-span-2">
              <Label>Recherche</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  placeholder="Nom, matricule, numero..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button variant="outline" size="icon" onClick={handleSearch}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Date debut</Label>
              <Input
                type="date"
                className="mt-1"
                value={filters.dateFrom || ''}
                onChange={(e) => updateFilter('dateFrom', e.target.value || undefined)}
              />
            </div>
            <div>
              <Label>Date fin</Label>
              <Input
                type="date"
                className="mt-1"
                value={filters.dateTo || ''}
                onChange={(e) => updateFilter('dateTo', e.target.value || undefined)}
              />
            </div>
            <div>
              <Label>Type de soin</Label>
              <Select value={filters.careType || 'all'} onValueChange={(v) => updateFilter('careType', v === 'all' ? undefined : v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {Object.entries(careTypeLabels).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Statut</Label>
              <Select value={filters.status || 'all'} onValueChange={(v) => updateFilter('status', v === 'all' ? undefined : v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Tous" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  <SelectItem value="approved">Approuve</SelectItem>
                  <SelectItem value="reimbursed">Rembourse</SelectItem>
                  <SelectItem value="rejected">Rejete</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={resetFilters}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Reinitialiser
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={exporting || !historyData?.meta?.total}
            >
              {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              Exporter CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <DataTable
        data={historyData?.data || []}
        columns={columns}
        isLoading={isLoading}
        emptyMessage="Aucun bulletin dans l'historique"
        pagination={historyData?.meta ? {
          page: historyData.meta.page,
          limit: historyData.meta.limit ?? filters.limit,
          total: historyData.meta.total,
          onPageChange: (p) => setFilters((prev) => ({ ...prev, page: p })),
        } : undefined}
      />

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detail bulletin {detail?.bulletinNumber}
            </DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : detail ? (
            <Tabs defaultValue="infos" className="mt-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="infos">Informations</TabsTrigger>
                <TabsTrigger value="actes">Actes ({detail.totaux.nbActes})</TabsTrigger>
                <TabsTrigger value="scan">Scan</TabsTrigger>
              </TabsList>

              {/* Infos tab */}
              <TabsContent value="infos" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Adherent</p>
                    <p className="font-medium">{detail.adherent.firstName} {detail.adherent.lastName}</p>
                    {detail.adherent.matricule && (
                      <p className="text-sm text-muted-foreground">Matricule: {detail.adherent.matricule}</p>
                    )}
                  </div>
                  {detail.beneficiary && (
                    <div>
                      <p className="text-sm text-muted-foreground">Beneficiaire</p>
                      <p className="font-medium">{detail.beneficiary.name}</p>
                      <p className="text-sm text-muted-foreground">{detail.beneficiary.relationship}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-muted-foreground">Prestataire</p>
                    <p className="font-medium">{detail.providerName || '-'}</p>
                    <p className="text-sm text-muted-foreground">{detail.providerSpecialty || ''}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Type de soin</p>
                    <p className="font-medium">{careTypeLabels[detail.careType] || detail.careType}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Date bulletin</p>
                    <p className="font-medium">{formatDate(detail.bulletinDate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Statut</p>
                    {(() => {
                      const config = statusConfig[detail.status] || statusConfig.approved;
                      return (
                        <Badge variant={config.variant as 'default' | 'destructive' | 'secondary'} className="gap-1">
                          <config.icon className="h-3 w-3" />
                          {config.label}
                        </Badge>
                      );
                    })()}
                  </div>
                  {detail.validatedAt && (
                    <div>
                      <p className="text-sm text-muted-foreground">Date validation</p>
                      <p className="font-medium">{formatDate(detail.validatedAt)}</p>
                    </div>
                  )}
                  {detail.paymentDate && (
                    <div>
                      <p className="text-sm text-muted-foreground">Date paiement</p>
                      <p className="font-medium">{formatDate(detail.paymentDate)}</p>
                    </div>
                  )}
                </div>

                {detail.rejectionReason && (
                  <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3">
                    <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-red-800">Raison du rejet</p>
                      <p className="text-sm text-red-700">{detail.rejectionReason}</p>
                    </div>
                  </div>
                )}

                {detail.agentNotes && (
                  <div className="rounded-md border bg-muted/50 p-3">
                    <p className="text-sm font-medium">Notes agent</p>
                    <p className="text-sm text-muted-foreground">{detail.agentNotes}</p>
                  </div>
                )}

                {/* Plafond section */}
                {detail.adherent.plafondGlobal > 0 && (
                  <div className="rounded-md border p-4 space-y-2">
                    <p className="text-sm font-medium">Plafond adherent</p>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Global</p>
                        <p className="font-medium">{formatAmount(detail.adherent.plafondGlobal)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Consomme</p>
                        <p className="font-medium">{formatAmount(detail.adherent.plafondConsomme)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Restant</p>
                        <p className={`font-medium ${detail.adherent.plafondRestant <= 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatAmount(detail.adherent.plafondRestant)}
                        </p>
                      </div>
                    </div>
                    <Progress
                      value={detail.adherent.plafondGlobal > 0 ? Math.min(100, (detail.adherent.plafondConsomme / detail.adherent.plafondGlobal) * 100) : 0}
                      className="h-2"
                    />
                  </div>
                )}

                {/* Amounts summary */}
                <div className="grid grid-cols-2 gap-4 rounded-md border p-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Montant declare</p>
                    <p className="text-xl font-bold">{formatAmount(detail.totalAmount)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Montant rembourse</p>
                    <p className={`text-xl font-bold ${detail.reimbursedAmount && detail.reimbursedAmount > 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                      {formatAmount(detail.reimbursedAmount)}
                    </p>
                  </div>
                </div>
              </TabsContent>

              {/* Actes tab */}
              <TabsContent value="actes" className="mt-4">
                <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                        <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Code</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Libelle</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Montant</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Taux</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Rembourse</TableHead>
                        <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Plafond</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.actes.map((acte, index) => (
                        <TableRow key={acte.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-gray-50/50 transition-colors duration-150`}>
                          <TableCell className="py-4 font-mono">{acte.code || '-'}</TableCell>
                          <TableCell className="py-4">{acte.label}</TableCell>
                          <TableCell className="py-4 text-right">{formatAmount(acte.amount)}</TableCell>
                          <TableCell className="py-4 text-right">{acte.tauxRemboursement ? `${(acte.tauxRemboursement * 100).toFixed(0)}%` : '-'}</TableCell>
                          <TableCell className="py-4 text-right font-medium text-green-600">{formatAmount(acte.montantRembourse)}</TableCell>
                          <TableCell className="py-4 text-center">
                            {acte.plafondDepasse && (
                              <Badge variant="destructive" className="text-xs">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Depasse
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-gray-50/80 font-medium">
                        <TableCell colSpan={2} className="py-4">Total ({detail.totaux.nbActes} actes)</TableCell>
                        <TableCell className="py-4 text-right">{formatAmount(detail.totaux.totalDeclare)}</TableCell>
                        <TableCell className="py-4" />
                        <TableCell className="py-4 text-right text-green-600">{formatAmount(detail.totaux.totalRembourse)}</TableCell>
                        <TableCell className="py-4 text-center">
                          {detail.totaux.nbPlafondDepasse > 0 && (
                            <span className="text-xs text-red-600">{detail.totaux.nbPlafondDepasse} depasse(s)</span>
                          )}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              {/* Scan tab */}
              <TabsContent value="scan" className="mt-4">
                {detail.scanUrl ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      {detail.scanFilename?.match(/\.(jpg|jpeg|png)$/i) ? (
                        <Image className="h-5 w-5 text-blue-500" />
                      ) : (
                        <FileText className="h-5 w-5 text-red-500" />
                      )}
                      <div>
                        <p className="font-medium">{detail.scanFilename || 'Scan'}</p>
                        <p className="text-sm text-muted-foreground">Fichier attache au bulletin</p>
                      </div>
                    </div>
                    {detail.scanFilename?.match(/\.(jpg|jpeg|png)$/i) && scanBlobUrl && (
                      <div className="rounded-md border p-2">
                        <img
                          src={scanBlobUrl}
                          alt="Scan bulletin"
                          className="max-w-full max-h-96 mx-auto rounded"
                        />
                      </div>
                    )}
                    <Button
                      variant="outline"
                      disabled={!scanBlobUrl}
                      onClick={() => scanBlobUrl && window.open(scanBlobUrl, '_blank')}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Telecharger le scan
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Calendar className="h-12 w-12 mb-4 opacity-50" />
                    <p>Aucun scan attache</p>
                    <p className="text-sm">Ce bulletin n'a pas de document scanne</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
