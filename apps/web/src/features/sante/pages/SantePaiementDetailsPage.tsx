/**
 * SantePaiementDetailsPage - Payment Details Page
 *
 * Dedicated page for viewing payment details
 */
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, CreditCard, User, Calendar, FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import {
  PAIEMENT_STATUTS_LABELS,
  PAIEMENT_STATUTS_COLORS,
  PAIEMENT_METHODES_LABELS,
  type Paiement,
} from '../hooks/usePaiements';

export function SantePaiementDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: paiement, isLoading } = useQuery({
    queryKey: ['sante-paiements', id],
    queryFn: async () => {
      const response = await apiClient.get<Paiement>(`/sante/paiements/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
  });

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
    }).format(amount / 1000);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!paiement) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Paiement non trouvé</p>
        <Button onClick={() => navigate('/sante/paiements')}>Retour aux paiements</Button>
      </div>
    );
  }

  const canPay = paiement.statut === 'valide';

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/sante/paiements" className="hover:text-gray-900 transition-colors">Paiements</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Détails</span>
      </nav>
      <div className="flex items-center justify-between">
        <PageHeader
          title={`Paiement ${paiement.numéroPaiement}`}
          description={`Créé le ${formatDate(paiement.createdAt)}`}
        />
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-sm ${PAIEMENT_STATUTS_COLORS[paiement.statut]}`}>
            {PAIEMENT_STATUTS_LABELS[paiement.statut]}
          </span>
          {canPay && (
            <Button onClick={() => navigate(`/sante/paiements/${paiement.id}/process`)}>
              Effectuér paiement
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatAmount(paiement.montant)}</p>
                <p className="text-sm text-muted-foreground">Montant</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-semibold">{paiement.bénéficiaireId}</p>
                <p className="text-sm text-muted-foreground">
                  {paiement.bénéficiaireType === 'adhérent' ? 'Adhérent' : 'Praticien'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-100">
                <FileText className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-lg font-semibold">
                  {paiement.méthode ? PAIEMENT_METHODES_LABELS[paiement.méthode] : '-'}
                </p>
                <p className="text-sm text-muted-foreground">Méthode</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-orange-100">
                <Calendar className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-lg font-semibold">
                  {paiement.datePaiement ? formatDate(paiement.datePaiement) : '-'}
                </p>
                <p className="text-sm text-muted-foreground">Date paiement</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Informations du paiement</CardTitle>
            <CardDescription>Details du paiement</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Numéro</p>
                <p className="font-medium">{paiement.numéroPaiement}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Bordereau</p>
                <p className="font-medium">{paiement.bordereauId || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Référence</p>
                <p className="font-medium">{paiement.référence || '-'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Statut</p>
                <span className={`inline-block rounded-full px-2 py-1 text-xs ${PAIEMENT_STATUTS_COLORS[paiement.statut]}`}>
                  {PAIEMENT_STATUTS_LABELS[paiement.statut]}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bénéficiaire</CardTitle>
            <CardDescription>Informations du destinataire</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">ID</p>
                <p className="font-medium">{paiement.bénéficiaireId}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Type</p>
                <p className="font-medium">
                  {paiement.bénéficiaireType === 'adhérent' ? 'Adhérent' : 'Praticien'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default SantePaiementDetailsPage;
