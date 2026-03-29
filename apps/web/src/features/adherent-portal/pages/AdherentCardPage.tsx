import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { CreditCard, Download, QrCode, Shield, Calendar, User } from 'lucide-react';

interface VirtualCard {
  id: string;
  cardNumber: string;
  holderName: string;
  insurerName: string;
  contractNumber: string;
  expiryDate: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'EXPIRED';
  qrCode: string;
  createdAt: string;
}

export function AdhérentCardPage() {
  const { user } = useAuth();

  const { data: card, isLoading } = useQuery({
    queryKey: ['adhérent-card', user?.id],
    queryFn: async () => {
      const response = await apiClient.get<{ card: VirtualCard }>('/adherents/me/card');
      if (!response.success) throw new Error(response.error?.message);
      return response.data?.card;
    },
    enabled: !!user?.id,
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      month: '2-digit',
      year: '2-digit',
    });
  };

  const handleDownloadCard = () => {
    // TODO: Implement card download as PDF/image
    console.log('Download card');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ma carte virtuelle" description="Chargement..." />
        <Card>
          <CardContent className="p-6">
            <div className="h-64 animate-pulse rounded-xl bg-muted" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="space-y-6">
        <PageHeader title="Ma carte virtuelle" description="Carte d'assurance sante numerique" />
        <Card>
          <CardContent className="p-12 text-center">
            <CreditCard className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Aucune carte disponible</h3>
            <p className="mt-2 text-muted-foreground">
              Votre carte virtuelle n'a pas encore ete générée.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ma carte virtuelle"
        description="Presentez cette carte chez vos praticiens de santé"
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Virtual Card */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="relative aspect-[1.6/1] bg-gradient-to-br from-blue-600 via-blue-700 to-blue-900 p-6 text-white">
              {/* Card chip design */}
              <div className="absolute left-6 top-6 h-10 w-14 rounded-md bg-yellow-400/80" />

              {/* Logo */}
              <div className="absolute right-6 top-6 flex items-center gap-2">
                <Shield className="h-8 w-8" />
                <span className="text-xl font-bold">Dhamen</span>
              </div>

              {/* Card number */}
              <div className="absolute bottom-20 left-6">
                <p className="text-sm opacity-70">N Carte</p>
                <p className="font-mono text-xl tracking-wider">{card.cardNumber}</p>
              </div>

              {/* Holder name and expiry */}
              <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between">
                <div>
                  <p className="text-xs opacity-70">Titulaire</p>
                  <p className="font-semibold uppercase">{card.holderName}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs opacity-70">Expiré</p>
                  <p className="font-mono">{formatDate(card.expiryDate)}</p>
                </div>
              </div>

              {/* Status badge */}
              <Badge
                variant={card.status === 'ACTIVE' ? 'success' : 'destructive'}
                className="absolute right-6 bottom-6"
              >
                {card.status === 'ACTIVE' ? 'Active' : card.status === 'SUSPENDED' ? 'Suspendue' : 'Expirée'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* QR Code and Actions */}
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <h3 className="mb-4 flex items-center gap-2 font-semibold">
                <QrCode className="h-5 w-5 text-primary" />
                Code QR de verification
              </h3>
              <div className="flex justify-center rounded-lg bg-white p-4">
                {card.qrCode ? (
                  <img
                    src={card.qrCode}
                    alt="QR Code"
                    className="h-48 w-48"
                  />
                ) : (
                  <div className="flex h-48 w-48 items-center justify-center bg-muted">
                    <QrCode className="h-16 w-16 text-muted-foreground" />
                  </div>
                )}
              </div>
              <p className="mt-4 text-center text-sm text-muted-foreground">
                Presentez ce QR code au praticien pour une vérification rapide
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="font-semibold">Informations</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Assureur:</span>
                  <span className="font-medium">{card.insurerName}</span>
                </div>
                <div className="flex items-center gap-3">
                  <CreditCard className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Contrat:</span>
                  <span className="font-mono">{card.contractNumber}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Emise le:</span>
                  <span>{new Date(card.createdAt).toLocaleDateString('fr-TN')}</span>
                </div>
              </div>

              <Button className="w-full" onClick={handleDownloadCard}>
                <Download className="mr-2 h-4 w-4" />
                Télécharger la carte
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default AdhérentCardPage;
