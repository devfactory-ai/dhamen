/**
 * ClaimProcessPage - Process Claim Page
 *
 * Dedicated page for processing (approving/rejecting) a claim
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiClient } from '@/lib/api-client';
import { useProcessClaim, type Claim } from '../hooks/useClaims';
import { useToast } from '@/stores/toast';

const CLAIM_TYPES: Record<string, { label: string; color: string }> = {
  pharmacie: { label: 'Pharmacie', color: 'bg-green-100 text-green-800' },
  consultation: { label: 'Consultation', color: 'bg-blue-100 text-blue-800' },
  laboratoire: { label: 'Laboratoire', color: 'bg-purple-100 text-purple-800' },
  hospitalisation: { label: 'Hospitalisation', color: 'bg-orange-100 text-orange-800' },
  dentaire: { label: 'Dentaire', color: 'bg-pink-100 text-pink-800' },
  optique: { label: 'Optique', color: 'bg-cyan-100 text-cyan-800' },
};

export function ClaimProcessPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const processClaim = useProcessClaim();

  const [processingData, setProcessingData] = useState<{
    statut: 'approuvee' | 'rejetee';
    montantRembourse: string;
    motifRejet: string;
    notesInternes: string;
  }>({
    statut: 'approuvee',
    montantRembourse: '',
    motifRejet: '',
    notesInternes: '',
  });

  const { data: claim, isLoading } = useQuery({
    queryKey: ['sante-demandes', id],
    queryFn: async () => {
      const response = await apiClient.get<Claim>(`/sante/demandes/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
  });

  // Initialize covered amount when claim loads
  useState(() => {
    if (claim) {
      setProcessingData((prev) => ({
        ...prev,
        montantRembourse: (claim.montantDemande / 1000).toString(),
      }));
    }
  });

  const formatAmount = (amount: number) => {
    return (amount / 1000).toFixed(3) + ' TND';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const handleProcess = async () => {
    if (!claim) return;

    try {
      await processClaim.mutateAsync({
        id: claim.id,
        data: {
          statut: processingData.statut,
          montantRembourse: processingData.statut === 'approuvee' ? Number.parseFloat(processingData.montantRembourse) * 1000 : undefined,
          motifRejet: processingData.statut === 'rejetee' ? processingData.motifRejet : undefined,
          notesInternes: processingData.notesInternes || undefined,
        },
      });
      toast({
        title: processingData.statut === 'approuvee' ? 'PEC approuvée' : 'PEC rejetée',
        variant: processingData.statut === 'approuvee' ? 'success' : 'destructive',
      });
      navigate('/claims');
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

  if (!claim) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">PEC non trouvée</p>
        <Button onClick={() => navigate('/claims')}>Retour aux PEC</Button>
      </div>
    );
  }

  if (!['soumise', 'en_examen'].includes(claim.statut)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Cette PEC a déjà été traitée</p>
        <Button onClick={() => navigate('/claims')}>Retour aux PEC</Button>
      </div>
    );
  }

  const typeInfo = CLAIM_TYPES[claim.typeSoin];
  const adherentName = claim.adherent
    ? `${claim.adherent.firstName} ${claim.adherent.lastName}`
    : '-';
  const praticienName = claim.praticien?.nom ?? '-';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/claims')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title={`Traiter PEC ${claim.numeroDemande}`}
          description="Valider ou rejeter cette demande de prise en charge"
        />
      </div>

      {/* Claim Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Résumé de la PEC</CardTitle>
          <CardDescription>Informations sur la demande de prise en charge</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Adhérent</p>
              <p className="font-medium">{adherentName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Praticien</p>
              <p className="font-medium">{praticienName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Type</p>
              {typeInfo && (
                <span className={`inline-block mt-1 rounded-full px-2 py-1 font-medium text-xs ${typeInfo.color}`}>
                  {typeInfo.label}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Date</p>
              <p className="font-medium">{formatDate(claim.createdAt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Amount Info */}
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">Montant demandé</p>
              <p className="text-3xl font-bold text-primary">{formatAmount(claim.montantDemande)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Fraud Score */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-center gap-4">
              <div className={`p-3 rounded-full ${
                claim.scoreFraude && claim.scoreFraude > 70
                  ? 'bg-red-100'
                  : claim.scoreFraude && claim.scoreFraude > 40
                    ? 'bg-yellow-100'
                    : 'bg-green-100'
              }`}>
                <AlertTriangle className={`h-6 w-6 ${
                  claim.scoreFraude && claim.scoreFraude > 70
                    ? 'text-red-600'
                    : claim.scoreFraude && claim.scoreFraude > 40
                      ? 'text-yellow-600'
                      : 'text-green-600'
                }`} />
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Score anti-fraude</p>
                <p className={`text-2xl font-bold ${
                  claim.scoreFraude && claim.scoreFraude > 70
                    ? 'text-red-600'
                    : claim.scoreFraude && claim.scoreFraude > 40
                      ? 'text-yellow-600'
                      : 'text-green-600'
                }`}>
                  {claim.scoreFraude ?? 'N/A'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Décision Form */}
      <Card>
        <CardHeader>
          <CardTitle>Décision</CardTitle>
          <CardDescription>Choisissez d'approuver ou rejeter cette PEC</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Décision Buttons */}
          <div className="flex gap-4">
            <Button
              variant={processingData.statut === 'approuvee' ? 'default' : 'outline'}
              className="flex-1 h-20"
              onClick={() => setProcessingData({ ...processingData, statut: 'approuvee' })}
            >
              <div className="flex flex-col items-center gap-2">
                <CheckCircle className="h-6 w-6" />
                <span>Approuver</span>
              </div>
            </Button>
            <Button
              variant={processingData.statut === 'rejetee' ? 'destructive' : 'outline'}
              className="flex-1 h-20"
              onClick={() => setProcessingData({ ...processingData, statut: 'rejetee' })}
            >
              <div className="flex flex-col items-center gap-2">
                <XCircle className="h-6 w-6" />
                <span>Rejeter</span>
              </div>
            </Button>
          </div>

          {processingData.statut === 'approuvee' && (
            <div className="space-y-2">
              <Label htmlFor="montantRembourse">Montant remboursé (TND)</Label>
              <Input
                id="montantRembourse"
                type="number"
                step="0.001"
                value={processingData.montantRembourse}
                onChange={(e) => setProcessingData({ ...processingData, montantRembourse: e.target.value })}
              />
            </div>
          )}

          {processingData.statut === 'rejetee' && (
            <div className="space-y-2">
              <Label htmlFor="motifRejet">Motif du rejet *</Label>
              <Textarea
                id="motifRejet"
                value={processingData.motifRejet}
                onChange={(e) => setProcessingData({ ...processingData, motifRejet: e.target.value })}
                placeholder="Indiquer le motif du rejet..."
                rows={3}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notesInternes">Notes (optionnel)</Label>
            <Textarea
              id="notesInternes"
              value={processingData.notesInternes}
              onChange={(e) => setProcessingData({ ...processingData, notesInternes: e.target.value })}
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => navigate('/claims')}>
              Annuler
            </Button>
            <Button
              onClick={handleProcess}
              disabled={processClaim.isPending || (processingData.statut === 'rejetee' && !processingData.motifRejet)}
              variant={processingData.statut === 'rejetee' ? 'destructive' : 'default'}
            >
              {processClaim.isPending ? 'Traitement...' : processingData.statut === 'approuvee' ? 'Approuver la PEC' : 'Rejeter la PEC'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default ClaimProcessPage;
