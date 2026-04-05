import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronRight, Loader2, Download, FileText, Image, Calendar, AlertCircle, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiClient } from '@/lib/api-client';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  submitted: { label: 'Soumis', color: 'bg-blue-100 text-blue-700' },
  scan_uploaded: { label: 'Scanné', color: 'bg-blue-100 text-blue-700' },
  paper_received: { label: 'Reçu', color: 'bg-blue-100 text-blue-700' },
  paper_incomplete: { label: 'Incomplet', color: 'bg-amber-100 text-amber-700' },
  paper_complete: { label: 'Complet', color: 'bg-amber-100 text-amber-700' },
  processing: { label: 'En traitement', color: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approuvé', color: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejeté', color: 'bg-red-100 text-red-700' },
  reimbursed: { label: 'Remboursé', color: 'bg-purple-100 text-purple-700' },
  pending_payment: { label: 'En paiement', color: 'bg-orange-100 text-orange-700' },
  in_batch: { label: 'Dans un lot', color: 'bg-indigo-100 text-indigo-700' },
};

const CARE_TYPE_LABELS: Record<string, string> = {
  consultation: 'Consultation',
  pharmacy: 'Pharmacie',
  lab: 'Laboratoire',
  optical: 'Optique',
  dental: 'Dentaire',
  hospitalization: 'Hospitalisation',
  radiology: 'Radiologie',
  physiotherapy: 'Kinésithérapie',
};

interface Acte {
  id: string;
  code: string | null;
  label: string;
  amount: number;
  tauxRemboursement: number | null;
  montantRembourse: number | null;
  plafondDepasse: boolean;
}

interface BulletinDetail {
  id: string;
  bulletinNumber: string;
  bulletinDate: string;
  status: string;
  careType: string;
  careDescription: string | null;
  providerName: string | null;
  providerSpecialty: string | null;
  totalAmount: number;
  reimbursedAmount: number | null;
  rejectionReason: string | null;
  scanUrl: string | null;
  scanFilename: string | null;
  validatedAt: string | null;
  approvedDate: string | null;
  paymentDate: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  agentNotes: string | null;
  createdAt: string;
  adherent: {
    id: string | null;
    firstName: string | null;
    lastName: string | null;
    matricule: string | null;
    email: string | null;
    plafondGlobal: number;
    plafondConsomme: number;
    plafondRestant: number;
  };
  beneficiary: { name: string; relationship: string | null } | null;
  actes: Acte[];
  totaux: {
    totalDeclare: number;
    totalRembourse: number;
    nbActes: number;
    nbPlafondDepasse: number;
  };
}

function formatAmount(amount: number | null | undefined): string {
  if (amount == null) return '0.000 TND';
  return `${amount.toFixed(3)} TND`;
}

function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleDateString('fr-TN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return date;
  }
}

export default function AdminBulletinDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<BulletinDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanBlobUrl, setScanBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    apiClient.get<BulletinDetail>(`/bulletins-soins/history/${id}`).then((res) => {
      if (res.success && res.data) {
        setDetail(res.data);
      } else {
        setError(res.error?.message || 'Bulletin non trouvé');
      }
      setIsLoading(false);
    });
  }, [id]);

  useEffect(() => {
    if (!detail?.scanUrl || !id) {
      setScanBlobUrl(null);
      return;
    }
    let revoked = false;
    apiClient.get<Blob>(`/bulletins-soins/manage/${id}/scan`, { responseType: 'blob' }).then((res) => {
      if (!revoked && res.success && res.data) {
        setScanBlobUrl(URL.createObjectURL(res.data));
      }
    });
    return () => {
      revoked = true;
      setScanBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    };
  }, [detail?.scanUrl, id]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="space-y-6">
        <nav className="flex items-center gap-1.5 text-sm text-gray-500">
          <Link to="/admin/bulletins" className="hover:text-gray-900 transition-colors">Tous les bulletins</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-gray-900 font-medium">Détail</span>
        </nav>
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
          <p className="text-muted-foreground">{error || 'Bulletin non trouvé'}</p>
          <Link to="/admin/bulletins">
            <Button variant="outline">Retour à la liste</Button>
          </Link>
        </div>
      </div>
    );
  }

  const statusCfg = STATUS_LABELS[detail.status] || { label: detail.status, color: 'bg-gray-100 text-gray-700' };

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/admin/bulletins" className="hover:text-gray-900 transition-colors">Tous les bulletins</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">{detail.bulletinNumber}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <PageHeader
          title={`Bulletin ${detail.bulletinNumber}`}
          description={`${CARE_TYPE_LABELS[detail.careType] || detail.careType} — ${formatDate(detail.bulletinDate)}`}
        />
        <Badge className={`${statusCfg.color} text-sm px-3 py-1`}>
          {statusCfg.label}
        </Badge>
      </div>

      {/* Amounts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Montant déclaré</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatAmount(detail.totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Montant remboursé</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${detail.reimbursedAmount ? 'text-green-600' : 'text-muted-foreground'}`}>
              {formatAmount(detail.reimbursedAmount)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Date de saisie</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{formatDate(detail.createdAt)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Informations */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Informations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Adhérent</p>
                <p className="font-medium">{detail.adherent.firstName} {detail.adherent.lastName}</p>
                {detail.adherent.matricule && (
                  <p className="text-sm text-muted-foreground">Matricule : {detail.adherent.matricule}</p>
                )}
              </div>
              {detail.beneficiary && (
                <div>
                  <p className="text-sm text-muted-foreground">Bénéficiaire</p>
                  <p className="font-medium">{detail.beneficiary.name}</p>
                  <p className="text-sm text-muted-foreground">{detail.beneficiary.relationship}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Praticien</p>
                <p className="font-medium">{detail.providerName || '—'}</p>
                {detail.providerSpecialty && <p className="text-sm text-muted-foreground">{detail.providerSpecialty}</p>}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Type de soin</p>
                <p className="font-medium">{CARE_TYPE_LABELS[detail.careType] || detail.careType}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date bulletin</p>
                <p className="font-medium">{formatDate(detail.bulletinDate)}</p>
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
              {detail.paymentMethod && (
                <div>
                  <p className="text-sm text-muted-foreground">Mode de paiement</p>
                  <p className="font-medium">{detail.paymentMethod}</p>
                </div>
              )}
            </div>

            {detail.rejectionReason && (
              <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 mt-4">
                <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Raison du rejet</p>
                  <p className="text-sm text-red-700">{detail.rejectionReason}</p>
                </div>
              </div>
            )}

            {detail.agentNotes && (
              <div className="rounded-md border bg-muted/50 p-3 mt-4">
                <p className="text-sm font-medium">Notes agent</p>
                <p className="text-sm text-muted-foreground">{detail.agentNotes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sidebar: Plafond + Scan */}
        <div className="space-y-6">
          {detail.adherent.plafondGlobal > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">Plafond adhérent</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Global</span>
                    <span className="font-medium">{formatAmount(detail.adherent.plafondGlobal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Consommé</span>
                    <span className="font-medium">{formatAmount(detail.adherent.plafondConsomme)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Restant</span>
                    <span className={`font-medium ${detail.adherent.plafondRestant <= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatAmount(detail.adherent.plafondRestant)}
                    </span>
                  </div>
                </div>
                <Progress
                  value={detail.adherent.plafondGlobal > 0 ? Math.min(100, (detail.adherent.plafondConsomme / detail.adherent.plafondGlobal) * 100) : 0}
                  className="h-2"
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Scan</CardTitle>
            </CardHeader>
            <CardContent>
              {detail.scanUrl ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    {detail.scanFilename?.match(/\.(jpg|jpeg|png)$/i) ? (
                      <Image className="h-5 w-5 text-blue-500" />
                    ) : (
                      <FileText className="h-5 w-5 text-red-500" />
                    )}
                    <p className="text-sm font-medium truncate">{detail.scanFilename || 'Scan'}</p>
                  </div>
                  {detail.scanFilename?.match(/\.(jpg|jpeg|png)$/i) && scanBlobUrl && (
                    <div className="rounded-md border p-2">
                      <img src={scanBlobUrl} alt="Scan bulletin" className="max-w-full max-h-64 mx-auto rounded" />
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={!scanBlobUrl}
                    onClick={() => scanBlobUrl && window.open(scanBlobUrl, '_blank')}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Télécharger
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                  <Calendar className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Aucun scan attaché</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Actes table */}
      {detail.actes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Actes ({detail.totaux.nbActes})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                    <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Code</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Libellé</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Montant</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Taux</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Remboursé</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Plafond</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.actes.map((acte, index) => (
                    <TableRow key={acte.id} className={`${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'} hover:bg-gray-50/50 transition-colors duration-150`}>
                      <TableCell className="py-4 font-mono">{acte.code || '—'}</TableCell>
                      <TableCell className="py-4">{acte.label}</TableCell>
                      <TableCell className="py-4 text-right">{formatAmount(acte.amount)}</TableCell>
                      <TableCell className="py-4 text-right">{acte.tauxRemboursement ? `${(acte.tauxRemboursement * 100).toFixed(0)}%` : '—'}</TableCell>
                      <TableCell className="py-4 text-right font-medium text-green-600">{formatAmount(acte.montantRembourse)}</TableCell>
                      <TableCell className="py-4 text-center">
                        {acte.plafondDepasse && (
                          <Badge variant="destructive" className="text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Dépassé
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
                        <span className="text-xs text-red-600">{detail.totaux.nbPlafondDepasse} dépassé(s)</span>
                      )}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
