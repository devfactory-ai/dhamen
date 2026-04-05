/**
 * SanteDemandeDetailsPage - Health claim details page
 *
 * Dedicated page for viewing health claim details (replaces dialog)
 */
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileText, User, Calendar, CreditCard, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import {
  SANTE_TYPE_SOINS_LABELS,
  SANTE_STATUTS_LABELS,
  SANTE_STATUTS_COLORS,
  type SanteDemande,
} from '../hooks/useSante';

export function SanteDemandeDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: demande, isLoading } = useQuery({
    queryKey: ['sante-demandes', id],
    queryFn: async () => {
      const response = await apiClient.get<SanteDemande>(`/sante/demandes/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
  });

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const canProcess = (d: SanteDemande) => {
    return ['soumise', 'en_examen', 'info_requise'].includes(d.statut);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!demande) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Demande non trouvée</p>
        <Button onClick={() => navigate('/sante/demandes')}>Retour aux demandes</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/sante/demandes" className="hover:text-gray-900 transition-colors">Demandes</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Détails</span>
      </nav>
      <div className="flex items-center justify-between">
        <PageHeader
          title={`Demande ${demande.numéroDemande}`}
          description={`${SANTE_TYPE_SOINS_LABELS[demande.typeSoin]} - ${formatDate(demande.dateSoin)}`}
        />
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm ${SANTE_STATUTS_COLORS[demande.statut]}`}>
            {SANTE_STATUTS_LABELS[demande.statut]}
          </span>
          {canProcess(demande) && (
            <Button onClick={() => navigate(`/sante/demandes/${demande.id}/process`)}>
              Traiter
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        {/* Amount Cards */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatAmount(demande.montantDemande)}</p>
                <p className="text-sm text-muted-foreground">Montant demande</p>
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
                <p className="text-2xl font-bold text-green-600">
                  {demande.montantRembourse ? formatAmount(demande.montantRembourse) : '-'}
                </p>
                <p className="text-sm text-muted-foreground">Montant rembourse</p>
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
                <p className="text-lg font-semibold">{formatDate(demande.dateSoin)}</p>
                <p className="text-sm text-muted-foreground">Date du soin</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-full ${
                demande.scoreFraude && demande.scoreFraude > 70
                  ? 'bg-red-100'
                  : demande.scoreFraude && demande.scoreFraude > 40
                    ? 'bg-yellow-100'
                    : 'bg-green-100'
              }`}>
                <AlertTriangle className={`h-6 w-6 ${
                  demande.scoreFraude && demande.scoreFraude > 70
                    ? 'text-red-600'
                    : demande.scoreFraude && demande.scoreFraude > 40
                      ? 'text-yellow-600'
                      : 'text-green-600'
                }`} />
              </div>
              <div>
                <p className={`text-2xl font-bold ${
                  demande.scoreFraude && demande.scoreFraude > 70
                    ? 'text-red-600'
                    : demande.scoreFraude && demande.scoreFraude > 40
                      ? 'text-yellow-600'
                      : 'text-green-600'
                }`}>
                  {demande.scoreFraude ?? 'N/A'}
                </p>
                <p className="text-sm text-muted-foreground">Score fraude</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Adhérent Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Informations adhérent
            </CardTitle>
            <CardDescription>Details de l'assure</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">ID Adhérent</p>
                <p className="font-medium">{demande.adhérentId}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Source</p>
                <p className="font-medium">
                  {demande.source === 'adhérent' ? 'Bulletin de soin' : 'Praticien'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Claim Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Details de la demande
            </CardTitle>
            <CardDescription>Informations de la demande de remboursement</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Type de soin</p>
                <span className="inline-block mt-1 rounded-full bg-blue-100 px-2 py-1 text-blue-800 text-xs">
                  {SANTE_TYPE_SOINS_LABELS[demande.typeSoin]}
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Praticien</p>
                <p className="font-medium">{demande.praticienId || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date de création</p>
                <p className="font-medium">{formatDate(demande.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dernière mise à jour</p>
                <p className="font-medium">{formatDate(demande.updatedAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rejection Reason if rejected */}
        {demande.motifRejet && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle className="text-destructive">Motif de rejet</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-destructive">{demande.motifRejet}</p>
            </CardContent>
          </Card>
        )}

        {/* Notes */}
        {demande.notesInternes && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Notes internes</CardTitle>
            </CardHeader>
            <CardContent>
              <p>{demande.notesInternes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export default SanteDemandeDetailsPage;
