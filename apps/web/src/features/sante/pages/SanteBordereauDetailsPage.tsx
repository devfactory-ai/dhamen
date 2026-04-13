/**
 * SanteBordereauDetailsPage - Bordereau Details Page
 */
import { useParams, Link } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, FileText, Calendar, CreditCard, Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  useBordereauById,
  useUpdateBordereauStatut,
  BORDEREAU_STATUTS_LABELS,
  BORDEREAU_STATUTS_COLORS,
  type BordereauStatut,
} from '../hooks/useBordereaux';
import { useToast } from '@/stores/toast';
import { apiClient } from '@/lib/api-client';

export function SanteBordereauDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: bordereau, isLoading } = useBordereauById(id ?? null);
  const updateMutation = useUpdateBordereauStatut();

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const getNextAction = (statut: BordereauStatut): BordereauStatut | null => {
    const transitions: Record<BordereauStatut, BordereauStatut | null> = {
      genere: 'valide',
      valide: 'envoye',
      envoye: 'paye',
      paye: null,
      annule: null,
    };
    return transitions[statut];
  };

  const getActionLabel = (statut: BordereauStatut): string => {
    const labels: Record<BordereauStatut, string> = {
      genere: 'Valider',
      valide: 'Marquer envoyé',
      envoye: 'Marquer payé',
      paye: '',
      annule: '',
    };
    return labels[statut];
  };

  const handleStatusUpdate = async (newStatut: BordereauStatut) => {
    if (!bordereau) return;
    try {
      await updateMutation.mutateAsync({ id: bordereau.id, data: { statut: newStatut } });
      toast({ title: `Bordereau ${BORDEREAU_STATUTS_LABELS[newStatut].toLowerCase()}`, variant: 'success' });
    } catch (error) {
      toast({
        title: 'Erreur lors de la mise à jour',
        description: error instanceof Error ? error.message : 'Erreur inconnue',
        variant: 'destructive',
      });
    }
  };

  const handleExport = (format: 'pdf' | 'csv') => {
    if (!bordereau) return;
    const token = localStorage.getItem('accessToken');
    const url = `${apiClient.getBaseUrl()}/sante/bordereaux/${bordereau.id}/export?format=${format}`;
    fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tenant-Code': 'BH',
      },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Export échoué');
        if (format === 'pdf') {
          const html = await res.text();
          const win = window.open('', '_blank');
          if (win) {
            win.document.write(html);
            win.document.close();
            win.onload = () => win.print();
          }
        } else {
          const blob = await res.blob();
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `bordereau-${bordereau.numeroBordereau}.csv`;
          a.click();
          URL.revokeObjectURL(a.href);
        }
      })
      .catch(() => {
        toast({ title: `Erreur lors de l'export ${format.toUpperCase()}`, variant: 'destructive' });
      });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!bordereau) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Bordereau non trouvé</p>
        <Button onClick={() => navigate('/sante/bordereaux')}>Retour aux bordereaux</Button>
      </div>
    );
  }

  const nextAction = getNextAction(bordereau.statut);

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/sante/bordereaux" className="hover:text-gray-900 transition-colors">
          Bordereaux
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">{bordereau.numeroBordereau}</span>
      </nav>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          
          <div>
            <h1 className="text-2xl font-bold">Bordereau {bordereau.numeroBordereau}</h1>
            <p className="text-sm text-muted-foreground">
              Période : {formatDate(bordereau.periodeDebut)} — {formatDate(bordereau.periodeFin)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm ${BORDEREAU_STATUTS_COLORS[bordereau.statut] ?? 'bg-gray-100 text-gray-800'}`}>
            {BORDEREAU_STATUTS_LABELS[bordereau.statut] ?? bordereau.statut}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{bordereau.nombreDemandes}</p>
                <p className="text-sm text-muted-foreground">Demandes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-100">
                <CreditCard className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatAmount(bordereau.montantTotal)}</p>
                <p className="text-sm text-muted-foreground">Montant total</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-semibold">{formatDate(bordereau.dateGeneration)}</p>
                <p className="text-sm text-muted-foreground">Date génération</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-orange-100">
                <Download className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Exporter</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleExport('csv')}>
                    CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => handleExport('pdf')}>
                    PDF
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Historique</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Généré le</p>
              <p className="font-medium">{formatDate(bordereau.dateGeneration)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Validé le</p>
              <p className="font-medium">{formatDate(bordereau.dateValidation)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Envoyé le</p>
              <p className="font-medium">{formatDate(bordereau.dateEnvoi)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Payé le</p>
              <p className="font-medium">{formatDate(bordereau.datePaiement)}</p>
            </div>
          </div>
          {bordereau.notes && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-muted-foreground">Notes</p>
              <p className="text-sm mt-1">{bordereau.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader>
          <CardTitle>Lignes ({bordereau.lignes?.length ?? 0})</CardTitle>
          <CardDescription>Détail des demandes incluses dans ce bordereau</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="p-3 text-left">Demande</th>
                  <th className="p-3 text-left">Adhérent</th>
                  <th className="p-3 text-left">Type</th>
                  <th className="p-3 text-left">Date</th>
                  <th className="p-3 text-right">Montant demandé</th>
                  <th className="p-3 text-right">Remboursé</th>
                </tr>
              </thead>
              <tbody>
                {bordereau.lignes?.map((ligne) => (
                  <tr key={ligne.id} className="border-t hover:bg-muted/50">
                    <td className="p-3 font-medium">{ligne.numeroDemande}</td>
                    <td className="p-3">{ligne.adherentNom}</td>
                    <td className="p-3">{ligne.typeSoin}</td>
                    <td className="p-3">{formatDate(ligne.dateSoin)}</td>
                    <td className="p-3 text-right font-mono">{formatAmount(ligne.montantDemande)}</td>
                    <td className="p-3 text-right text-green-600 font-medium font-mono">{formatAmount(ligne.montantRembourse)}</td>
                  </tr>
                ))}
                {(!bordereau.lignes || bordereau.lignes.length === 0) && (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-muted-foreground">
                      Aucune ligne dans ce bordereau
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      {nextAction && (
        <div className="flex justify-end gap-3">
          <Button
            onClick={() => handleStatusUpdate(nextAction)}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Mise à jour...' : getActionLabel(bordereau.statut)}
          </Button>
        </div>
      )}
    </div>
  );
}

export default SanteBordereauDetailsPage;
