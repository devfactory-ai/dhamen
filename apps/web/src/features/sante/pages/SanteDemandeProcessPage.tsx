/**
 * SanteDemandeProcessPage - Process a health claim request
 *
 * Dedicated page for processing (approve/reject) a health claim (replaces dialog)
 */
import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileText, CheckCircle, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api-client';
import {
  useUpdateSanteDemandeStatut,
  SANTE_TYPE_SOINS_LABELS,
  SANTE_STATUTS_LABELS,
  SANTE_STATUTS_COLORS,
  type SanteDemande,
} from '../hooks/useSante';
import { useToast } from '@/stores/toast';

export function SanteDemandeProcessPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const updateStatut = useUpdateSanteDemandeStatut();

  const [processingData, setProcessingData] = useState({
    action: 'approuver' as 'approuver' | 'rejeter',
    montantRembourse: '',
    motifRejet: '',
    notesInternes: '',
  });

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

  const handleProcess = async () => {
    if (!demande) return;

    try {
      await updateStatut.mutateAsync({
        id: demande.id,
        data: {
          statut: processingData.action === 'approuver' ? 'approuvee' : 'rejetée',
          montantRembourse: processingData.action === 'approuver'
            ? Number.parseFloat(processingData.montantRembourse) || undefined
            : undefined,
          motifRejet: processingData.action === 'rejeter' ? processingData.motifRejet : undefined,
          notesInternes: processingData.notesInternes || undefined,
        },
      });

      toast({
        title: processingData.action === 'approuver' ? 'Demande approuvee' : 'Demande rejetée',
        variant: processingData.action === 'approuver' ? 'success' : 'destructive',
      });

      navigate('/sante/demandes');
    } catch {
      toast({
        title: 'Erreur lors du traitement',
        description: 'Veuillez réessayer',
        variant: 'destructive',
      });
    }
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

  // Set initial reimbursement amount if not set
  if (!processingData.montantRembourse && demande.montantDemande) {
    setProcessingData(prev => ({
      ...prev,
      montantRembourse: demande.montantDemande.toString(),
    }));
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/sante/demandes" className="hover:text-gray-900 transition-colors">Demandes</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Traitement</span>
      </nav>
      <PageHeader
        title={`Traiter la demande ${demande.numéroDemande}`}
        description="Approuver ou rejeter cette demande de remboursement"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Demande Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Informations de la demande
            </CardTitle>
            <CardDescription>Details de la demande de remboursement</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg bg-muted p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Type de soin</p>
                  <p className="font-medium">{SANTE_TYPE_SOINS_LABELS[demande.typeSoin]}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Montant demande</p>
                  <p className="font-medium">{formatAmount(demande.montantDemande)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date du soin</p>
                  <p className="font-medium">{formatDate(demande.dateSoin)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Score fraude</p>
                  <p
                    className={`font-medium ${
                      demande.scoreFraude && demande.scoreFraude > 70
                        ? 'text-destructive'
                        : demande.scoreFraude && demande.scoreFraude > 40
                          ? 'text-yellow-600'
                          : 'text-green-600'
                    }`}
                  >
                    {demande.scoreFraude ?? 'N/A'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Adhérent</p>
                  <p className="font-medium">{demande.adhérentId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Statut actuel</p>
                  <span className={`rounded-full px-2 py-1 text-xs ${SANTE_STATUTS_COLORS[demande.statut]}`}>
                    {SANTE_STATUTS_LABELS[demande.statut]}
                  </span>
                </div>
                <div>
                  <p className="text-muted-foreground">Source</p>
                  <p className="font-medium">{demande.source === 'adhérent' ? 'Bulletin' : 'Praticien'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Date de création</p>
                  <p className="font-medium">{formatDate(demande.createdAt)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Processing Form Card */}
        <Card>
          <CardHeader>
            <CardTitle>Décision</CardTitle>
            <CardDescription>Choisissez l'action a effectuér</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Décision Buttons */}
            <div className="space-y-2">
              <Label>Action</Label>
              <div className="flex gap-2">
                <Button
                  variant={processingData.action === 'approuver' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setProcessingData({ ...processingData, action: 'approuver' })}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approuver
                </Button>
                <Button
                  variant={processingData.action === 'rejeter' ? 'destructive' : 'outline'}
                  className="flex-1"
                  onClick={() => setProcessingData({ ...processingData, action: 'rejeter' })}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Rejeter
                </Button>
              </div>
            </div>

            {processingData.action === 'approuver' && (
              <div className="space-y-2">
                <Label htmlFor="montantRembourse">Montant rembourse (TND)</Label>
                <Input
                  id="montantRembourse"
                  type="number"
                  step="0.001"
                  value={processingData.montantRembourse}
                  onChange={(e) =>
                    setProcessingData({ ...processingData, montantRembourse: e.target.value })
                  }
                />
              </div>
            )}

            {processingData.action === 'rejeter' && (
              <div className="space-y-2">
                <Label htmlFor="motifRejet">Motif du rejet</Label>
                <Textarea
                  id="motifRejet"
                  value={processingData.motifRejet}
                  onChange={(e) =>
                    setProcessingData({ ...processingData, motifRejet: e.target.value })
                  }
                  placeholder="Indiquer le motif du rejet..."
                  rows={3}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Notes internes (optionnel)</Label>
              <Textarea
                id="notes"
                value={processingData.notesInternes}
                onChange={(e) =>
                  setProcessingData({ ...processingData, notesInternes: e.target.value })
                }
                rows={2}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => navigate('/sante/demandes')}>
                Annuler
              </Button>
              <Button
                onClick={handleProcess}
                disabled={updateStatut.isPending}
                variant={processingData.action === 'rejeter' ? 'destructive' : 'default'}
              >
                {updateStatut.isPending
                  ? 'Traitement...'
                  : processingData.action === 'approuver'
                    ? 'Approuver la demande'
                    : 'Rejeter la demande'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default SanteDemandeProcessPage;
