/**
 * ClaimDetailsPage - PEC Details Page
 */
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ChevronRight, FileText, User, Calendar, CreditCard, AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useClaim } from '../hooks/useClaims';

const CLAIM_TYPES: Record<string, { label: string; color: string }> = {
  pharmacie: { label: 'Pharmacie', color: 'bg-green-100 text-green-800' },
  consultation: { label: 'Consultation', color: 'bg-blue-100 text-blue-800' },
  laboratoire: { label: 'Laboratoire', color: 'bg-purple-100 text-purple-800' },
  hospitalisation: { label: 'Hospitalisation', color: 'bg-orange-100 text-orange-800' },
  dentaire: { label: 'Dentaire', color: 'bg-pink-100 text-pink-800' },
  optique: { label: 'Optique', color: 'bg-cyan-100 text-cyan-800' },
  kinesitherapie: { label: 'Kinésithérapie', color: 'bg-teal-100 text-teal-800' },
  autre: { label: 'Autre', color: 'bg-gray-100 text-gray-800' },
};

const CLAIM_STATUS: Record<string, { label: string; variant: 'warning' | 'success' | 'destructive' | 'info' | 'default' }> = {
  soumise: { label: 'Soumise', variant: 'warning' },
  en_examen: { label: 'En examen', variant: 'info' },
  info_requise: { label: 'Info requise', variant: 'default' },
  approuvee: { label: 'Approuvée', variant: 'success' },
  en_paiement: { label: 'En paiement', variant: 'info' },
  payee: { label: 'Payée', variant: 'success' },
  rejetee: { label: 'Rejetée', variant: 'destructive' },
};

export function ClaimDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: claim, isLoading } = useClaim(id!);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatAmount = (amount: number) => {
    return (amount / 1000).toFixed(3) + ' TND';
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
        <Button onClick={() => navigate('/claims/manage')}>Retour aux PEC</Button>
      </div>
    );
  }

  const typeInfo = CLAIM_TYPES[claim.typeSoin] ?? { label: claim.typeSoin, color: 'bg-gray-100 text-gray-800' };
  const statusInfo = CLAIM_STATUS[claim.statut] ?? { label: claim.statut, variant: 'default' as const };

  const getFraudScoreColor = (score: number | null) => {
    if (score === null) return 'text-muted-foreground';
    if (score > 70) return 'text-destructive';
    if (score > 40) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/claims/manage" className="hover:text-gray-900 transition-colors">Gestion PEC</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">{claim.numeroDemande}</span>
      </nav>

      <div className="flex items-center justify-between">
        <PageHeader
          title={`PEC ${claim.numeroDemande}`}
          description={`${typeInfo.label} — ${formatDate(claim.dateSoin)}`}
        />
        <Badge variant={statusInfo.variant} className="text-sm px-3 py-1">
          {statusInfo.label}
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-primary/10">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatAmount(claim.montantDemande)}</p>
                <p className="text-sm text-muted-foreground">Montant demandé</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-100">
                <CreditCard className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">
                  {claim.montantRembourse != null ? formatAmount(claim.montantRembourse) : '—'}
                </p>
                <p className="text-sm text-muted-foreground">Montant remboursé</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-orange-100">
                <CreditCard className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-orange-600">
                  {claim.montantResteCharge != null ? formatAmount(claim.montantResteCharge) : '—'}
                </p>
                <p className="text-sm text-muted-foreground">Reste à charge</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-lg font-semibold">{formatDate(claim.dateSoin)}</p>
                <p className="text-sm text-muted-foreground">Date du soin</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Adhérent */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Adhérent
            </CardTitle>
            <CardDescription>Informations de l'assuré</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Nom complet</p>
                <p className="font-medium">
                  {claim.adherent
                    ? `${claim.adherent.firstName} ${claim.adherent.lastName}`
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tiers payant</p>
                <p className="font-medium">{claim.estTiersPayant ? 'Oui' : 'Non'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Détails PEC */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Détails de la PEC
            </CardTitle>
            <CardDescription>Informations de la prise en charge</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Type de soin</p>
                <span className={`inline-block mt-1 rounded-full px-2 py-1 font-medium text-xs ${typeInfo.color}`}>
                  {typeInfo.label}
                </span>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Praticien</p>
                <p className="font-medium">{claim.praticien?.nom ?? '—'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date de création</p>
                <p className="font-medium">{formatDate(claim.createdAt)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Dernière mise à jour</p>
                <p className="font-medium">{formatDate(claim.updatedAt)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notes & Motif de rejet */}
        {(claim.notesInternes || claim.motifRejet) && (
          <Card>
            <CardHeader>
              <CardTitle>Notes & Observations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {claim.notesInternes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notes internes</p>
                  <p className="font-medium">{claim.notesInternes}</p>
                </div>
              )}
              {claim.motifRejet && (
                <div className="p-4 bg-destructive/10 rounded-lg">
                  <p className="text-sm font-medium text-destructive">Motif de rejet</p>
                  <p className="text-destructive mt-1">{claim.motifRejet}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Score anti-fraude */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Analyse & Statut
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {claim.scoreFraude !== null && (
              <div>
                <p className="text-sm text-muted-foreground">Score anti-fraude</p>
                <div className="flex items-center gap-3 mt-1">
                  <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        claim.scoreFraude > 70 ? 'bg-destructive' : claim.scoreFraude > 40 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${claim.scoreFraude}%` }}
                    />
                  </div>
                  <span className={`font-bold ${getFraudScoreColor(claim.scoreFraude)}`}>
                    {claim.scoreFraude}/100
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {claim.scoreFraude > 70 ? 'Risque élevé — Vérification manuelle requise' :
                   claim.scoreFraude > 40 ? 'Risque modéré — Attention recommandée' :
                   'Risque faible — Transaction normale'}
                </p>
              </div>
            )}
            {claim.scoreFraude === null && (
              <p className="text-sm text-muted-foreground">Aucun score de fraude calculé</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigate('/claims/manage')}>
          Retour
        </Button>
        {['soumise', 'en_examen'].includes(claim.statut) && (
          <Button onClick={() => navigate(`/claims/manage/${claim.id}/process`)}>
            Traiter cette PEC
          </Button>
        )}
      </div>
    </div>
  );
}

export default ClaimDetailsPage;
