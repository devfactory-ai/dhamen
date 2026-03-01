/**
 * SanteContreVisiteDetailsPage - View and manage contre-visite details
 */
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Calendar, User, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { useState } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { SanteStatutContreVisite, SanteConclusionContreVisite, SanteImpactContreVisite } from '@dhamen/shared';

interface ContreVisiteDetails {
  id: string;
  demandeId: string;
  numéroContreVisite: string;
  praticienId: string | null;
  statut: SanteStatutContreVisite;
  motif: string;
  description: string | null;
  dateDemande: string;
  datePlanifiee: string | null;
  dateLimite: string | null;
  dateEffectuée: string | null;
  lieu: string | null;
  adresse: string | null;
  ville: string | null;
  rapport: string | null;
  conclusion: SanteConclusionContreVisite | null;
  impactMontant: number | null;
  impactDécision: SanteImpactContreVisite | null;
  notesInternes: string | null;
  createdAt: string;
  demande: {
    id: string;
    numéroDemande: string;
    typeSoin: string;
    montantDemande: number;
    montantRembourse: number | null;
    statut: string;
    dateSoin: string;
  };
  adhérent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
  };
  praticien: {
    id: string;
    nom: string;
    prénom: string;
    spécialité: string;
    téléphone: string | null;
    adresse: string | null;
    ville: string | null;
  } | null;
  demandeur: {
    firstName: string;
    lastName: string;
  } | null;
}

interface Praticien {
  id: string;
  nom: string;
  prénom: string;
  spécialité: string;
  ville: string | null;
}

const STATUT_LABELS: Record<SanteStatutContreVisite, string> = {
  demandee: 'Demandee',
  planifiée: 'Planifiee',
  en_attente: 'En attente',
  effectuée: 'Effectuée',
  rapport_soumis: 'Rapport soumis',
  validée: 'Validée',
  annulée: 'Annulée',
};

const STATUT_VARIANTS: Record<SanteStatutContreVisite, 'default' | 'secondary' | 'destructive' | 'outline' | 'success'> = {
  demandee: 'outline',
  planifiée: 'secondary',
  en_attente: 'default',
  effectuée: 'default',
  rapport_soumis: 'secondary',
  validée: 'success',
  annulée: 'destructive',
};

const CONCLUSION_LABELS: Record<SanteConclusionContreVisite, string> = {
  confirme: 'Confirme',
  partiellement_confirme: 'Partiellement confirme',
  non_confirme: 'Non confirme',
  examen_complementaire: 'Examen complementaire requis',
};

const IMPACT_LABELS: Record<SanteImpactContreVisite, string> = {
  maintenir: 'Maintenir la décision',
  reduire: 'Reduire le remboursement',
  rejeter: 'Rejeter la demande',
  approuver: 'Approuver la demande',
};

const TYPE_SOIN_LABELS: Record<string, string> = {
  pharmacie: 'Pharmacie',
  consultation: 'Consultation',
  hospitalisation: 'Hospitalisation',
  optique: 'Optique',
  dentaire: 'Dentaire',
  laboratoire: 'Laboratoire',
  kinesitherapie: 'Kinesitherapie',
  autre: 'Autre',
};

export function SanteContreVisiteDetailsPage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Planning form state
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [selectedPraticien, setSelectedPraticien] = useState('');
  const [datePlanifiee, setDatePlanifiee] = useState('');
  const [lieu, setLieu] = useState('');

  // Rapport form state
  const [showRapportForm, setShowRapportForm] = useState(false);
  const [rapport, setRapport] = useState('');
  const [conclusion, setConclusion] = useState<SanteConclusionContreVisite | ''>('');
  const [impactDécision, setImpactDécision] = useState<SanteImpactContreVisite | ''>('');
  const [impactMontant, setImpactMontant] = useState('');

  const { data: cv, isLoading } = useQuery({
    queryKey: ['sante-contre-visite', id],
    queryFn: async () => {
      const response = await apiClient.get<ContreVisiteDetails>(`/sante/contre-visites/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!id,
  });

  const { data: praticiens } = useQuery({
    queryKey: ['sante-praticiens-list'],
    queryFn: async () => {
      const response = await apiClient.get<{ data: Praticien[] }>('/sante/praticiens?limit=100');
      if (!response.success) throw new Error(response.error?.message);
      return response.data?.data ?? [];
    },
    enabled: showPlanForm,
  });

  const planifierMutation = useMutation({
    mutationFn: async (data: { praticienId: string; datePlanifiee: string; lieu?: string }) => {
      const response = await apiClient.patch(`/sante/contre-visites/${id}/planifier`, data);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-contre-visite', id] });
      setShowPlanForm(false);
      toast.success('Contre-visite planifiée avec succès');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la planification');
    },
  });

  const rapportMutation = useMutation({
    mutationFn: async (data: {
      rapport: string;
      conclusion: SanteConclusionContreVisite;
      impactDécision?: SanteImpactContreVisite;
      impactMontant?: number;
    }) => {
      const response = await apiClient.patch(`/sante/contre-visites/${id}/rapport`, data);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-contre-visite', id] });
      setShowRapportForm(false);
      toast.success('Rapport soumis avec succès');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la soumission du rapport');
    },
  });

  const validerMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.patch(`/sante/contre-visites/${id}/valider`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sante-contre-visite', id] });
      toast.success('Contre-visite validée avec succès');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la validation');
    },
  });

  const annulerMutation = useMutation({
    mutationFn: async () => {
      const response = await apiClient.delete(`/sante/contre-visites/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      toast.success('Contre-visite annulée');
      navigate('/sante/contre-visites');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de l\'annulation');
    },
  });

  const handlePlanifier = () => {
    if (!selectedPraticien || !datePlanifiee) {
      toast.error('Veuillez sélectionner un praticien et une date');
      return;
    }
    planifierMutation.mutate({
      praticienId: selectedPraticien,
      datePlanifiee,
      lieu: lieu || undefined,
    });
  };

  const handleRapport = () => {
    if (!rapport || rapport.length < 20) {
      toast.error('Le rapport doit contenir au moins 20 caracteres');
      return;
    }
    if (!conclusion) {
      toast.error('Veuillez sélectionner une conclusion');
      return;
    }
    rapportMutation.mutate({
      rapport,
      conclusion,
      impactDécision: impactDécision || undefined,
      impactMontant: impactMontant ? Number.parseInt(impactMontant) * 1000 : undefined,
    });
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      style: 'currency',
      currency: 'TND',
      minimumFractionDigits: 3,
    }).format(amount / 1000);
  };

  const canPlanifier = cv && cv.statut === 'demandee';
  const canRapport = cv && ['planifiée', 'en_attente', 'effectuée'].includes(cv.statut);
  const canValider = cv && cv.statut === 'rapport_soumis' && ['ADMIN', 'INSURER_ADMIN', 'SOIN_GESTIONNAIRE'].includes(user?.role || '');
  const canAnnuler = cv && !['validée', 'effectuée', 'rapport_soumis'].includes(cv.statut);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!cv) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Contre-visite non trouvée</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/sante/contre-visites')}>
          Retour a la liste
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/sante/contre-visites')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <PageHeader
            title={`Contre-visite ${cv.numéroContreVisite}`}
            description={`Demande ${cv.demande.numéroDemande}`}
          />
        </div>
        <Badge variant={STATUT_VARIANTS[cv.statut]} className="text-base px-3 py-1">
          {STATUT_LABELS[cv.statut]}
        </Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Informations de la demande */}
        <Card>
          <CardHeader>
            <CardTitle>Demande de remboursement</CardTitle>
            <CardDescription>Details de la demande originale</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Numéro</p>
                <p className="font-mono font-medium">{cv.demande.numéroDemande}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Type de soin</p>
                <p className="font-medium">{TYPE_SOIN_LABELS[cv.demande.typeSoin]}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Montant demande</p>
                <p className="font-medium">{formatAmount(cv.demande.montantDemande)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date du soin</p>
                <p className="font-medium">{formatDate(cv.demande.dateSoin)}</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/sante/demandes/${cv.demandeId}`)}
            >
              Voir la demande complète
            </Button>
          </CardContent>
        </Card>

        {/* Informations de l'adhérent */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Adhérent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">Nom complet</p>
              <p className="font-medium">{cv.adherent.firstName} {cv.adherent.lastName}</p>
            </div>
            {cv.adherent.email && (
              <div>
                <p className="text-sm text-muted-foreground">Email</p>
                <p className="font-medium">{cv.adherent.email}</p>
              </div>
            )}
            {cv.adherent.phone && (
              <div>
                <p className="text-sm text-muted-foreground">Téléphone</p>
                <p className="font-medium">{cv.adherent.phone}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Motif de la contre-visite */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Motif de la contre-visite
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{cv.motif}</p>
            {cv.description && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Description</p>
                <p className="text-sm">{cv.description}</p>
              </div>
            )}
            {cv.demandeur && (
              <div>
                <p className="text-sm text-muted-foreground">Demande par</p>
                <p className="text-sm">{cv.demandeur.firstName} {cv.demandeur.lastName}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Praticien et planification */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Planification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cv.praticien ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-muted-foreground">Praticien</p>
                  <p className="font-medium">{cv.praticien.prenom} {cv.praticien.nom}</p>
                  <p className="text-sm text-muted-foreground">{cv.praticien.spécialité}</p>
                </div>
                {cv.praticien.téléphone && (
                  <div>
                    <p className="text-sm text-muted-foreground">Téléphone</p>
                    <p className="text-sm">{cv.praticien.téléphone}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">Aucun praticien assigne</p>
            )}

            <div className="grid grid-cols-2 gap-4 pt-2 border-t">
              <div>
                <p className="text-sm text-muted-foreground">Date planifiée</p>
                <p className="font-medium">{formatDate(cv.datePlanifiee)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date limite</p>
                <p className="font-medium text-amber-600">{formatDate(cv.dateLimite)}</p>
              </div>
              {cv.lieu && (
                <div className="col-span-2">
                  <p className="text-sm text-muted-foreground">Lieu</p>
                  <p className="text-sm">{cv.lieu}</p>
                </div>
              )}
            </div>

            {canPlanifier && !showPlanForm && (
              <Button onClick={() => setShowPlanForm(true)}>
                Planifier la contre-visite
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Rapport */}
        {(cv.rapport || canRapport) && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Rapport d'examen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cv.rapport ? (
                <>
                  <div className="p-4 bg-muted rounded-lg">
                    <p className="whitespace-pre-wrap">{cv.rapport}</p>
                  </div>
                  {cv.conclusion && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Conclusion</p>
                        <Badge variant={cv.conclusion === 'confirme' ? 'success' : cv.conclusion === 'non_confirme' ? 'destructive' : 'secondary'}>
                          {CONCLUSION_LABELS[cv.conclusion]}
                        </Badge>
                      </div>
                      {cv.impactDécision && (
                        <div>
                          <p className="text-sm text-muted-foreground">Impact sur la demande</p>
                          <p className="font-medium">{IMPACT_LABELS[cv.impactDécision]}</p>
                        </div>
                      )}
                      {cv.impactMontant && (
                        <div>
                          <p className="text-sm text-muted-foreground">Nouveau montant</p>
                          <p className="font-medium">{formatAmount(cv.impactMontant)}</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground">Aucun rapport soumis</p>
              )}

              {canRapport && !showRapportForm && !cv.rapport && (
                <Button onClick={() => setShowRapportForm(true)}>
                  Soumettre le rapport
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Planning Form Modal */}
      {showPlanForm && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Planifier la contre-visite</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="praticien">Praticien</Label>
                <Select value={selectedPraticien} onValueChange={setSelectedPraticien}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un praticien" />
                  </SelectTrigger>
                  <SelectContent>
                    {praticiens?.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.prenom} {p.nom} - {p.spécialité}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={datePlanifiee}
                  onChange={(e) => setDatePlanifiee(e.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="lieu">Lieu (optionnel)</Label>
                <Input
                  id="lieu"
                  value={lieu}
                  onChange={(e) => setLieu(e.target.value)}
                  placeholder="Adresse ou nom du cabinet"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowPlanForm(false)}>
                Annuler
              </Button>
              <Button onClick={handlePlanifier} disabled={planifierMutation.isPending}>
                {planifierMutation.isPending ? 'Planification...' : 'Planifier'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rapport Form Modal */}
      {showRapportForm && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>Soumettre le rapport</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rapport">Rapport d'examen</Label>
              <Textarea
                id="rapport"
                value={rapport}
                onChange={(e) => setRapport(e.target.value)}
                placeholder="Decrivez les observations et conclusions de l'examen..."
                rows={6}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="conclusion">Conclusion</Label>
                <Select value={conclusion} onValueChange={(v) => setConclusion(v as SanteConclusionContreVisite)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une conclusion" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confirme">Confirme</SelectItem>
                    <SelectItem value="partiellement_confirme">Partiellement confirme</SelectItem>
                    <SelectItem value="non_confirme">Non confirme</SelectItem>
                    <SelectItem value="examen_complementaire">Examen complementaire requis</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="impact">Impact sur la demande</Label>
                <Select value={impactDécision} onValueChange={(v) => setImpactDécision(v as SanteImpactContreVisite)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner l'impact" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="maintenir">Maintenir la décision</SelectItem>
                    <SelectItem value="reduire">Reduire le remboursement</SelectItem>
                    <SelectItem value="rejeter">Rejeter la demande</SelectItem>
                    <SelectItem value="approuver">Approuver la demande</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {impactDécision === 'reduire' && (
                <div className="space-y-2">
                  <Label htmlFor="montant">Nouveau montant (TND)</Label>
                  <Input
                    id="montant"
                    type="number"
                    step="0.001"
                    value={impactMontant}
                    onChange={(e) => setImpactMontant(e.target.value)}
                    placeholder="0.000"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowRapportForm(false)}>
                Annuler
              </Button>
              <Button onClick={handleRapport} disabled={rapportMutation.isPending}>
                {rapportMutation.isPending ? 'Soumission...' : 'Soumettre le rapport'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 justify-end">
        {canAnnuler && (
          <Button
            variant="destructive"
            onClick={() => annulerMutation.mutate()}
            disabled={annulerMutation.isPending}
          >
            {annulerMutation.isPending ? 'Annulation...' : 'Annuler la contre-visite'}
          </Button>
        )}
        {canValider && (
          <Button
            onClick={() => validerMutation.mutate()}
            disabled={validerMutation.isPending}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {validerMutation.isPending ? 'Validation...' : 'Valider et appliquer'}
          </Button>
        )}
      </div>
    </div>
  );
}

export default SanteContreVisiteDetailsPage;
