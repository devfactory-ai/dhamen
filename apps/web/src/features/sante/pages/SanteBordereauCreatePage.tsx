/**
 * SanteBordereauCreatePage - Create Bordereau Page
 *
 * Dedicated page for creating a new bordereau (replaces dialog)
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';
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
    périodeDebut: '',
    périodeFin: '',
    notes: '',
  });

  const handleCreate = async () => {
    if (!createData.périodeDebut || !createData.périodeFin) {
      toast({ title: 'Veuillez remplir les dates', variant: 'destructive' });
      return;
    }

    try {
      await createMutation.mutateAsync({
        périodeDebut: createData.périodeDebut,
        périodeFin: createData.périodeFin,
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/sante/bordereaux')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title="Générer un bordereau"
          description="Regrouper les demandes approuvees de la période pour paiement"
        />
      </div>

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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="périodeDebut">Date debut</Label>
              <Input
                id="périodeDebut"
                type="date"
                value={createData.périodeDebut}
                onChange={(e) => setCreateData({ ...createData, périodeDebut: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="périodeFin">Date fin</Label>
              <Input
                id="périodeFin"
                type="date"
                value={createData.périodeFin}
                onChange={(e) => setCreateData({ ...createData, périodeFin: e.target.value })}
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
