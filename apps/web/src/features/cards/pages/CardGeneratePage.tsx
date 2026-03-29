/**
 * CardGeneratePage - Generate New Card Page
 *
 * Dedicated page for generating a new virtual card (replaces dialog)
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronRight, CreditCard, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useGenerateCard } from '../hooks/useCards';
import { Adherent, useSearchAdherent } from '@/features/adherents/hooks/useAdherents';
import { useToast } from '@/stores/toast';

export function CardGeneratePage() {
  const navigate = useNavigate();
  const [searchNationalId, setSearchNationalId] = useState('');
  const generateCard = useGenerateCard();
  const { toast } = useToast();

  const { data: adherent, isLoading: isSearching } = useSearchAdherent(searchNationalId);

  const handleGenerateCard = async () => {
    if (!adherent) {
      toast({
        title: 'Erreur',
        description: 'Veuillez rechercher et sélectionner un adhérent',
        variant: 'destructive',
      });
      return;
    }

    try {
      await generateCard.mutateAsync({ adherentId: adherent.id });
      toast({
        title: 'Succes',
        description: 'Carte virtuelle générée avec succès',
      });
      navigate('/cards');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erreur lors de la génération';
      toast({
        title: 'Erreur',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/cards" className="hover:text-gray-900 transition-colors">Cartes</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Générer</span>
      </nav>
      <PageHeader
        title="Générer une carte virtuelle"
        description="Créer une nouvelle carte virtuelle pour un adhérent"
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Nouvelle carte
          </CardTitle>
          <CardDescription>
            Rechercher l'adhérent par son CIN pour générer une carte virtuelle
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Adhérent Search */}
          <div className="space-y-2">
            <Label>Rechercher l'adhérent par CIN</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="N° CIN (ex: 12345678)"
                  value={searchNationalId}
                  onChange={(e) => setSearchNationalId(e.target.value)}
                  className="pl-10"
                />
              </div>
              {isSearching && (
                <div className="flex items-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              )}
            </div>
          </div>

          {/* Adhérent Result */}
          {adherent && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{adherent.firstName} {adherent.lastName}</p>
                    <p className="text-muted-foreground text-sm">N° {adherent.memberNumber}</p>
                    <p className="text-muted-foreground text-xs">CIN: {adherent.nationalId}</p>
                  </div>
                  <Badge variant={adherent.isActive ? 'success' : 'destructive'}>
                    {adherent.isActive ? 'Eligible' : 'Non eligible'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}

          {searchNationalId && !adherent && !isSearching && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="p-4 text-center text-muted-foreground">
                Aucun adhérent trouvé avec ce CIN
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={() => navigate('/cards')}>
              Annuler
            </Button>
            <Button
              onClick={handleGenerateCard}
              disabled={!adherent || !adherent.isActive || generateCard.isPending}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {generateCard.isPending ? 'Génération...' : 'Générer la carte'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default CardGeneratePage;
