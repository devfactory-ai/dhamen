/**
 * CardDetailsPage - Card Details Page
 *
 * Dedicated page for viewing virtual card details (replaces dialog)
 */
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, CreditCard, Calendar, Activity, History } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiClient } from '@/lib/api-client';

interface VirtualCard {
  id: string;
  adherentId: string;
  adherentName?: string;
  cardNumber: string;
  status: 'active' | 'suspended' | 'revoked' | 'expired';
  issuedAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  usageCount: number;
  suspensionReason?: string;
  revocationReason?: string;
  createdAt: string;
  updatedAt: string;
}

export function CardDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: card, isLoading } = useQuery({
    queryKey: ['cards', id],
    queryFn: async () => {
      const response = await apiClient.get<VirtualCard>(`/cards/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case 'suspended':
        return <Badge className="bg-yellow-100 text-yellow-800">Suspendue</Badge>;
      case 'revoked':
        return <Badge className="bg-red-100 text-red-800">Revoquee</Badge>;
      case 'expired':
        return <Badge className="bg-gray-100 text-gray-800">Expirée</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Carte non trouvée</p>
        <Button onClick={() => navigate('/cards')}>Retour aux cartes</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/cards" className="hover:text-gray-900 transition-colors">Cartes</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Détails</span>
      </nav>
      <div className="flex items-center justify-between">
        <PageHeader
          title={`Carte ${card.cardNumber}`}
          description={card.adherentName || `Adhérent ${card.adherentId.slice(0, 8)}...`}
        />
        {getStatusBadge(card.status)}
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Usage Stats */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-cyan-100">
                <Activity className="h-6 w-6 text-cyan-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{card.usageCount}</p>
                <p className="text-sm text-muted-foreground">Utilisations</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-100">
                <Calendar className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-lg font-semibold">{formatDate(card.issuedAt)}</p>
                <p className="text-sm text-muted-foreground">Date d'emission</p>
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
                <p className="text-lg font-semibold">{formatDate(card.expiresAt)}</p>
                <p className="text-sm text-muted-foreground">Date d'expiration</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Card Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Informations de la carte
            </CardTitle>
            <CardDescription>Details de la carte virtuelle</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Numéro de carte</p>
                <p className="font-mono font-semibold">{card.cardNumber}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Statut</p>
                <div className="mt-1">{getStatusBadge(card.status)}</div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">ID Adhérent</p>
                <p className="font-mono text-sm">{card.adherentId}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dernière utilisation</p>
                <p>{card.lastUsedAt ? formatDateTime(card.lastUsedAt) : 'Jamais utilisee'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Activité
            </CardTitle>
            <CardDescription>Historique et événements</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Date de création</p>
                <p>{formatDateTime(card.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dernière mise à jour</p>
                <p>{formatDateTime(card.updatedAt)}</p>
              </div>
            </div>

            {card.suspensionReason && (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm font-medium text-yellow-800">Raison de suspension</p>
                <p className="text-yellow-700 mt-1">{card.suspensionReason}</p>
              </div>
            )}

            {card.revocationReason && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm font-medium text-red-800">Raison de revocation</p>
                <p className="text-red-700 mt-1">{card.revocationReason}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Visual Card Representation */}
      <Card className="max-w-md">
        <CardContent className="pt-6">
          <div className="relative bg-gradient-to-br from-cyan-500 to-cyan-700 rounded-xl p-6 text-white shadow-lg aspect-[1.586/1]">
            <div className="absolute top-4 right-4">
              {card.status === 'active' ? (
                <div className="w-3 h-3 rounded-full bg-green-400 animate-pulse" />
              ) : (
                <div className="w-3 h-3 rounded-full bg-gray-400" />
              )}
            </div>
            <div className="flex flex-col justify-between h-full">
              <div>
                <p className="text-xs opacity-75">DHAMEN</p>
                <p className="text-sm font-medium">Carte Sante Virtuelle</p>
              </div>
              <div>
                <p className="font-mono text-xl tracking-widest">{card.cardNumber}</p>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-xs opacity-75">VALIDE JUSQU'AU</p>
                  <p className="font-mono">{formatDate(card.expiresAt)}</p>
                </div>
                <CreditCard className="h-8 w-8 opacity-50" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default CardDetailsPage;
