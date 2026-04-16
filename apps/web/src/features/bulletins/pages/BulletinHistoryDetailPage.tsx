import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  CheckCircle,
  XCircle,
  CreditCard,
  Loader2,
  Download,
  FileText,
  Image,
  AlertCircle,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import { useHistoryDetail } from '@/hooks/use-bulletin-history';
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
  approved: { label: 'Approuvé', variant: 'default', icon: CheckCircle },
  reimbursed: { label: 'Remboursé', variant: 'success', icon: CreditCard },
  rejected: { label: 'Rejeté', variant: 'destructive', icon: XCircle },
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

function SubItemsCollapsible({ items }: { items: Array<{ id: string; label: string; code: string | null; amount: number }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1 pl-2 border-l-2 border-muted">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? '' : '-rotate-90'}`} />
        {items.length} element{items.length > 1 ? 's' : ''}
      </button>
      {open && (
        <div className="space-y-0.5 mt-1">
          {items.map((si, siIdx) => (
            <div key={si.id || siIdx} className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{siIdx + 1}. {si.label}{si.code ? ` (${si.code})` : ''}</span>
              <span className="tabular-nums ml-2">{formatAmount(si.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BulletinHistoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: detail, isLoading } = useHistoryDetail(id || null);
  const [scanBlobUrl, setScanBlobUrl] = useState<string | null>(null);

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

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Bulletin non trouve</p>
        <Button onClick={() => navigate('/bulletins/history')}>Retour a l'historique</Button>
      </div>
    );
  }

  const statusCfg = statusConfig[detail.status] || statusConfig.approved;
  const StatusIcon = statusCfg?.icon || CheckCircle;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={`Bulletin ${detail.bulletinNumber}`}
          description={`${careTypeLabels[detail.careType] || detail.careType} — ${formatDate(detail.bulletinDate)}`}
          breadcrumb={[
            { label: "Historique", href: "/bulletins/history" },
            { label: detail.bulletinNumber },
          ]}
        />
        <Badge
          variant={
            statusCfg?.variant as "default" | "destructive" | "secondary"
          }
          className="gap-1 text-sm px-3 py-1"
        >
          <StatusIcon className="h-4 w-4" />
          {statusCfg?.label}
        </Badge>
      </div>

      {/* Amounts summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Montant déclaré
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{detail.totalAmount} TND</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Montant Remboursé
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p
              className={`text-2xl font-bold ${detail.reimbursedAmount && detail.reimbursedAmount > 0 ? "text-green-600" : "text-muted-foreground"}`}
            >
              {detail.reimbursedAmount} TND
            </p>
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
                <p className="text-sm text-muted-foreground">Adherent</p>
                <p className="font-medium">
                  {detail.adherent.firstName} {detail.adherent.lastName}
                </p>
                {detail.adherent.matricule && (
                  <p className="text-sm text-muted-foreground">
                    Matricule: {detail.adherent.matricule}
                  </p>
                )}
              </div>
              {detail.beneficiary && (
                <div>
                  <p className="text-sm text-muted-foreground">Beneficiaire</p>
                  <p className="font-medium">{detail.beneficiary.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {detail.beneficiary.relationship}
                  </p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Praticien</p>
                <p className="font-medium">{detail.providerName || "-"}</p>
                <p className="text-sm text-muted-foreground">
                  {detail.providerSpecialty || ""}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Type de soin</p>
                <p className="font-medium">
                  {careTypeLabels[detail.careType] || detail.careType}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date bulletin</p>
                <p className="font-medium">{formatDate(detail.bulletinDate)}</p>
              </div>
              {detail.validatedAt && (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Date validation
                  </p>
                  <p className="font-medium">
                    {formatDate(detail.validatedAt)}
                  </p>
                </div>
              )}
              {detail.paymentDate && (
                <div>
                  <p className="text-sm text-muted-foreground">Date paiement</p>
                  <p className="font-medium">
                    {formatDate(detail.paymentDate)}
                  </p>
                </div>
              )}
              {detail.paymentMethod && (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Mode de paiement
                  </p>
                  <p className="font-medium">{detail.paymentMethod}</p>
                </div>
              )}
              {detail.paymentReference && (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Reference paiement
                  </p>
                  <p className="font-medium font-mono">
                    {detail.paymentReference}
                  </p>
                </div>
              )}
            </div>

            {detail.rejectionReason && (
              <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 mt-4">
                <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-red-800">
                    Raison du rejet
                  </p>
                  <p className="text-sm text-red-700">
                    {detail.rejectionReason}
                  </p>
                </div>
              </div>
            )}

            {detail.agentNotes && (
              <div className="rounded-md border bg-muted/50 p-3 mt-4">
                <p className="text-sm font-medium">Notes agent</p>
                <p className="text-sm text-muted-foreground">
                  {detail.agentNotes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Plafond + Scan */}
        <div className="space-y-6">
          {detail.adherent.plafondGlobal > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">
                  Plafond adherent
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Global</span>
                    <span className="font-medium">
                      {formatAmount(detail.adherent.plafondGlobal)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Consomme</span>
                    <span className="font-medium">
                      {formatAmount(detail.adherent.plafondConsomme)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Restant</span>
                    <span
                      className={`font-medium ${detail.adherent.plafondRestant <= 0 ? "text-red-600" : "text-green-600"}`}
                    >
                      {formatAmount(detail.adherent.plafondRestant)}
                    </span>
                  </div>
                </div>
                <Progress
                  value={
                    detail.adherent.plafondGlobal > 0
                      ? Math.min(
                          100,
                          (detail.adherent.plafondConsomme /
                            detail.adherent.plafondGlobal) *
                            100,
                        )
                      : 0
                  }
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
                    <p className="text-sm font-medium truncate">
                      {detail.scanFilename || "Scan"}
                    </p>
                  </div>
                  {detail.scanFilename?.match(/\.(jpg|jpeg|png)$/i) &&
                    scanBlobUrl && (
                      <div className="rounded-md border p-2">
                        <img
                          src={scanBlobUrl}
                          alt="Scan bulletin"
                          className="max-w-full max-h-64 mx-auto rounded"
                        />
                      </div>
                    )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={!scanBlobUrl}
                    onClick={() =>
                      scanBlobUrl && window.open(scanBlobUrl, "_blank")
                    }
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Télécharger
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                  <Calendar className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Aucun scan attache</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Actes table */}
      <Card>
        <CardHeader>
          <CardTitle>Actes ({detail.totaux.nbActes})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
                  <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Code
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Libelle
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Praticien
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">
                    Montant
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">
                    Taux
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">
                    Remboursé
                  </TableHead>
                  <TableHead className="text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">
                    Plafond
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.actes.map((acte, index) => (
                  <TableRow
                    key={acte.id}
                    className={`${index % 2 === 0 ? "bg-white" : "bg-gray-50/30"} hover:bg-gray-50/50 transition-colors duration-150`}
                  >
                    <TableCell className="py-4 font-mono">
                      {acte.code || "-"}
                      {acte.acteRefLabel &&
                        acte.acteRefLabel !== acte.label && (
                          <p className="text-[10px] text-muted-foreground">
                            {acte.acteRefLabel}
                          </p>
                        )}
                    </TableCell>
                    <TableCell className="py-4">
                      <div>{acte.label}</div>
                      {acte.medicationName && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {acte.medicationName}
                          {acte.medicationDci &&
                            acte.medicationDci !== acte.medicationName && (
                              <span className="italic ml-1">
                                ({acte.medicationDci})
                              </span>
                            )}
                          {acte.medicationFamilyName && (
                            <span className="ml-1 text-[10px] bg-muted px-1 rounded">
                              {acte.medicationFamilyName}
                            </span>
                          )}
                        </p>
                      )}
                      {acte.subItems && acte.subItems.length > 0 && (
                        <SubItemsCollapsible items={acte.subItems} />
                      )}
                    </TableCell>
                    <TableCell className="py-4 text-xs">
                      {(acte.providerNameResolved || acte.nomProfSant) && (
                        <div>
                          <p>{acte.providerNameResolved || acte.nomProfSant}</p>
                          {acte.refProfSant && (
                            <p className="font-mono text-[10px] text-muted-foreground">
                              MF {acte.refProfSant}
                            </p>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="py-4 text-right">
                      {(acte.amount)} TND
                    </TableCell>
                    <TableCell className="py-4 text-right">
                      {acte.tauxRemboursement
                        ? `${(acte.tauxRemboursement).toFixed(0)}%`
                        : "-"}
                    </TableCell>
                    <TableCell className="py-4 text-right font-medium text-green-600">
                      {(acte.montantRembourse)} TND
                    </TableCell>
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
                  <TableCell colSpan={3} className="py-4">
                    Total ({detail.totaux.nbActes} actes)
                  </TableCell>
                  <TableCell className="py-4 text-right">
                    {(detail.totaux.totalDeclare)} TND
                  </TableCell>
                  <TableCell className="py-4" />
                  <TableCell className="py-4 text-right text-green-600">
                    {(detail.totaux.totalRembourse)} TND
                  </TableCell>
                  <TableCell className="py-4 text-center">
                    {detail.totaux.nbPlafondDepasse > 0 && (
                      <span className="text-xs text-red-600">
                        {detail.totaux.nbPlafondDepasse} depasse(s)
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
