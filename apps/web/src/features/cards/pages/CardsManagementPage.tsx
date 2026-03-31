/**
 * Cards Management Page
 *
 * Page for insurers to manage adhérent virtual cards
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  Search,
  Plus,
  MoreHorizontal,
  CheckCircle,
  XCircle,
  PauseCircle,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Input } from '../../../components/ui/input';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { PageHeader } from '../../../components/ui/page-header';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../../components/ui/select';
import {
  useCards,
  useSuspendCard,
  useReactivateCard,
  useRevokeCard,
  useRenewCard,
  type VirtualCard,
} from '../hooks/useCards';
import { useToast } from '../../../stores/toast';

type ConfirmAction = 'suspend' | 'revoke' | null;

export default function CardsManagementPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [selectedCard, setSelectedCard] = useState<VirtualCard | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const { data, isLoading } = useCards({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    page,
    limit: 20,
  });

  const suspendCard = useSuspendCard();
  const reactivateCard = useReactivateCard();
  const revokeCard = useRevokeCard();
  const renewCard = useRenewCard();
  const { toast } = useToast();

  const cards = data?.data || [];
  const total = data?.meta?.total || 0;
  const totalPages = data?.meta?.totalPages || 1;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case 'suspended':
        return <Badge className="bg-yellow-100 text-yellow-800">Suspendue</Badge>;
      case 'revoked':
        return <Badge className="bg-red-100 text-red-800">Révoquée</Badge>;
      case 'expired':
        return <Badge className="bg-gray-100 text-gray-800">Expirée</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const handleSuspendCard = async () => {
    if (!selectedCard) return;

    try {
      await suspendCard.mutateAsync({ cardId: selectedCard.id, reason: 'Suspension administrative' });
      toast({
        title: 'Succes',
        description: 'Carte suspendue avec succès',
      });
      setConfirmAction(null);
      setSelectedCard(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la suspension';
      toast({
        title: 'Erreur',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleReactivateCard = async (card: VirtualCard) => {
    try {
      await reactivateCard.mutateAsync({ cardId: card.id });
      toast({
        title: 'Succès',
        description: 'Carte réactivée avec succès',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la réactivation';
      toast({
        title: 'Erreur',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleRevokeCard = async () => {
    if (!selectedCard) return;

    try {
      await revokeCard.mutateAsync({ cardId: selectedCard.id, reason: 'Revocation administrative' });
      toast({
        title: 'Succes',
        description: 'Carte révoquée avec succès',
      });
      setConfirmAction(null);
      setSelectedCard(null);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la revocation';
      toast({
        title: 'Erreur',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleRenewCard = async (card: VirtualCard) => {
    try {
      await renewCard.mutateAsync({ cardId: card.id });
      toast({
        title: 'Succès',
        description: 'Carte renouvelée avec succès',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors du renouvellement';
      toast({
        title: 'Erreur',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const statsCards = [
    {
      title: 'Cartes actives',
      value: cards.filter((c: VirtualCard) => c.status === 'active').length,
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      title: 'Cartes suspendues',
      value: cards.filter((c: VirtualCard) => c.status === 'suspended').length,
      icon: PauseCircle,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
    },
    {
      title: 'Cartes révoquées',
      value: cards.filter((c: VirtualCard) => c.status === 'revoked').length,
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      title: 'Total',
      value: total,
      icon: CreditCard,
      color: 'text-cyan-600',
      bg: 'bg-cyan-50',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion des cartes virtuelles"
        description="Gerez les cartes virtuelles des adhérents"
      >
        <Button
          className="gap-2 bg-slate-900 hover:bg-[#19355d]"
          onClick={() => navigate('/cards/generate')}
        >
          <Plus className="w-4 h-4" /> Générer une carte
        </Button>
      </PageHeader>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statsCards.map((stat) => (
          <Card key={stat.title}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-full ${stat.bg}`}>
                  <stat.icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtres</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par numéro de carte..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspendue</SelectItem>
                <SelectItem value="revoked">Révoquée</SelectItem>
                <SelectItem value="expired">Expirée</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° Carte</TableHead>
                <TableHead>Adhérent</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead>Émise le</TableHead>
                <TableHead>Expiré le</TableHead>
                <TableHead className="text-center">Utilisations</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    Chargement...
                  </TableCell>
                </TableRow>
              ) : cards.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    Aucune carte trouvée
                  </TableCell>
                </TableRow>
              ) : (
                cards.map((card: VirtualCard) => (
                  <TableRow key={card.id}>
                    <TableCell className="font-mono">{card.cardNumber}</TableCell>
                    <TableCell>{card.adherentId.slice(0, 8)}...</TableCell>
                    <TableCell>{getStatusBadge(card.status)}</TableCell>
                    <TableCell>{formatDate(card.issuedAt)}</TableCell>
                    <TableCell>{formatDate(card.expiresAt)}</TableCell>
                    <TableCell className="text-center">{card.usageCount}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => navigate(`/cards/${card.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Voir details
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {card.status === 'active' && (
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedCard(card);
                                setConfirmAction('suspend');
                              }}
                            >
                              <PauseCircle className="mr-2 h-4 w-4" />
                              Suspendre
                            </DropdownMenuItem>
                          )}
                          {card.status === 'suspended' && (
                            <DropdownMenuItem onClick={() => handleReactivateCard(card)}>
                              <CheckCircle className="mr-2 h-4 w-4" />
                              Réactiver
                            </DropdownMenuItem>
                          )}
                          {card.status === 'active' && (
                            <DropdownMenuItem onClick={() => handleRenewCard(card)}>
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Renouveler
                            </DropdownMenuItem>
                          )}
                          {card.status !== 'revoked' && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  setSelectedCard(card);
                                  setConfirmAction('revoke');
                                }}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Revoquer
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Précédent
          </Button>
          <span className="flex items-center px-4">
            Page {page} sur {totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Suivant
          </Button>
        </div>
      )}

      {/* Suspend Card Confirmation */}
      <AlertDialog open={confirmAction === 'suspend'} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspendre la carte</AlertDialogTitle>
            <AlertDialogDescription>
              La carte <strong>{selectedCard?.cardNumber}</strong> sera temporairement désactivée.
              Elle pourra etre réactivée ulterieurement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSuspendCard}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              {suspendCard.isPending ? 'Suspension...' : 'Suspendre'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Revoke Card Confirmation */}
      <AlertDialog open={confirmAction === 'revoke'} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoquer la carte</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. La carte <strong>{selectedCard?.cardNumber}</strong> sera
              définitivement désactivée et ne pourra plus être utilisée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevokeCard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {revokeCard.isPending ? 'Revocation...' : 'Revoquer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
