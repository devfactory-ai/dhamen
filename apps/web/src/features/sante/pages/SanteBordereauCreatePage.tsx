/**
 * SanteBordereauCreatePage - Create Bordereau Page
 */
import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ChevronRight, FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateBordereau } from '../hooks/useBordereaux';
import { useToast } from '@/stores/toast';

export function SanteBordereauCreatePage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const createMutation = useCreateBordereau();

  const [createData, setCreateData] = useState({
    periodeDebut: '',
    periodeFin: '',
    notes: '',
  });

  const handleCreate = async () => {
    if (!createData.periodeDebut || !createData.periodeFin) {
      toast({ title: 'Veuillez remplir les dates', variant: 'destructive' });
      return;
    }

    try {
      await createMutation.mutateAsync({
        periodeDebut: createData.periodeDebut,
        periodeFin: createData.periodeFin,
        notes: createData.notes || undefined,
      });
      toast({ title: 'Bordereau créé avec succès', variant: 'success' });
      navigate('/sante/bordereaux');
    } catch (error) {
      toast({
        title: 'Erreur lors de la création',
        description: error instanceof Error ? error.message : 'Erreur inconnue',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/sante/bordereaux" className="hover:text-gray-900 transition-colors">
          Bordereaux
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Générer</span>
      </nav>

      <PageHeader
        title="Générer un bordereau"
        description="Regrouper les demandes approuvées de la période pour paiement"
      />

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Nouveau bordereau
          </CardTitle>
          <CardDescription>
            Sélectionnez la période pour générer un bordereau de remboursement
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="periodeDebut">Date début</Label>
              <Input
                id="periodeDebut"
                type="date"
                value={createData.periodeDebut}
                onChange={(e) => setCreateData({ ...createData, periodeDebut: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="periodeFin">Date fin</Label>
              <Input
                id="periodeFin"
                type="date"
                value={createData.periodeFin}
                onChange={(e) => setCreateData({ ...createData, periodeFin: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optionnel)</Label>
            <Textarea
              id="notes"
              value={createData.notes}
              onChange={(e) => setCreateData({ ...createData, notes: e.target.value })}
              placeholder="Notes internes..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => navigate('/sante/bordereaux')}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Génération...' : 'Générer le bordereau'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SanteBordereauCreatePage;
