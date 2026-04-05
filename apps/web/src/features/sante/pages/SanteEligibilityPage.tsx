/**
 * SoinFlow Eligibility Check Page
 *
 * Allows practitioners and pharmacists to verify adhérent coverage
 */
import { useState } from 'react';
import { Search, CheckCircle, XCircle, AlertCircle, User, CreditCard, Shield } from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useCheckEligibility,
  formatAmount,
  getPlafondColor,
  getPlafondBgColor,
  TYPE_SOIN_LABELS,
  type EligibilityCheckResult,
} from '../hooks/useEligibility';

export default function SanteEligibilityPage() {
  const [searchValue, setSearchValue] = useState('');
  const [searchType, setSearchType] = useState<'matricule' | 'nationalId'>('matricule');
  const [result, setResult] = useState<EligibilityCheckResult | null>(null);

  const checkEligibility = useCheckEligibility();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchValue.trim()) return;

    const params = searchType === 'matricule'
      ? { matricule: searchValue }
      : { nationalId: searchValue };

    const data = await checkEligibility.mutateAsync(params);
    setResult(data || null);
  };

  const handleClear = () => {
    setSearchValue('');
    setResult(null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vérification Éligibilité"
        description="Vérifier les droits et plafonds d'un adhérent"
      />

      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Rechercher un adhérent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="space-y-4">
            {/* Search type toggle */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={searchType === 'matricule' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSearchType('matricule')}
              >
                Matricule
              </Button>
              <Button
                type="button"
                variant={searchType === 'nationalId' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSearchType('nationalId')}
              >
                CIN
              </Button>
            </div>

            {/* Search input */}
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder={searchType === 'matricule' ? 'Entrez le matricule...' : 'Entrez le numéro CIN...'}
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="flex-1"
              />
              <Button type="submit" disabled={checkEligibility.isPending}>
                {checkEligibility.isPending ? 'Recherche...' : 'Vérifier'}
              </Button>
              {result && (
                <Button type="button" variant="outline" onClick={handleClear}>
                  Effacer
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Error */}
      {checkEligibility.isError && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-700">
              <XCircle className="h-5 w-5" />
              <span>
                {checkEligibility.error instanceof Error
                  ? checkEligibility.error.message
                  : 'Erreur lors de la verification'}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {result && (
        <div className="space-y-6">
          {/* Eligibility Status */}
          <Card className={result.eligible ? 'border-green-200' : 'border-red-200'}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {result.eligible ? (
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  ) : (
                    <XCircle className="h-8 w-8 text-red-600" />
                  )}
                  <div>
                    <h3 className="text-lg font-semibold">
                      {result.eligible ? 'Adhérent Eligible' : 'Non Eligible'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {result.eligible
                        ? 'Couverture active avec droits disponibles'
                        : 'Veuillez vérifiér les details ci-dessous'}
                    </p>
                  </div>
                </div>
                <Badge variant={result.eligible ? 'success' : 'destructive'}>
                  {result.adherent.estActif ? 'Actif' : 'Inactif'}
                </Badge>
              </div>

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="mt-4 space-y-2">
                  {result.warnings.map((warning, i) => (
                    <div key={i} className="flex items-center gap-2 text-orange-600 text-sm">
                      <AlertCircle className="h-4 w-4" />
                      {warning}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Adhérent Info */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-4 w-4" />
                  Informations Adhérent
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nom</span>
                  <span className="font-medium">
                    {result.adherent.prenom} {result.adherent.nom}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Matricule</span>
                  <span className="font-medium font-mono">{result.adherent.matricule}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date de naissance</span>
                  <span className="font-medium">
                    {new Date(result.adherent.dateNaissance).toLocaleDateString('fr-TN')}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Formule */}
            {result.formule && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CreditCard className="h-4 w-4" />
                    Formule de Garantie
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Formule</span>
                    <span className="font-medium">{result.formule.nom}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Code</span>
                    <span className="font-medium font-mono">{result.formule.code}</span>
                  </div>
                  {result.formule.plafondGlobal && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plafond Global</span>
                      <span className="font-medium">{formatAmount(result.formule.plafondGlobal)}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Plafonds */}
          {result.plafonds.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Plafonds et Consommation</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {result.plafonds.map((plafond) => (
                    <div key={plafond.typeSoin} className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">
                          {TYPE_SOIN_LABELS[plafond.typeSoin] || plafond.typeSoin}
                        </span>
                        <span className={getPlafondColor(plafond.pourcentageUtilise)}>
                          {formatAmount(plafond.montantRestant)} restants
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-200">
                        <div
                          className={`h-full rounded-full ${getPlafondBgColor(plafond.pourcentageUtilise)}`}
                          style={{ width: `${Math.min(plafond.pourcentageUtilise, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Consommé: {formatAmount(plafond.montantConsomme)}</span>
                        <span>Plafond: {formatAmount(plafond.montantPlafond)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Contract Info */}
          {result.contrat && (
            <Card>
              <CardHeader>
                <CardTitle>Contrat</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div>
                  <span className="text-sm text-muted-foreground">Numéro</span>
                  <p className="font-medium font-mono">{result.contrat.numéro}</p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Debut</span>
                  <p className="font-medium">
                    {new Date(result.contrat.dateDebut).toLocaleDateString('fr-TN')}
                  </p>
                </div>
                <div>
                  <span className="text-sm text-muted-foreground">Fin</span>
                  <p className="font-medium">
                    {new Date(result.contrat.dateFin).toLocaleDateString('fr-TN')}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Empty state */}
      {!result && !checkEligibility.isPending && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <Search className="mx-auto h-12 w-12 opacity-20" />
              <p className="mt-4">
                Entrez un matricule ou numéro CIN pour vérifiér l'éligibilité
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <FloatingHelp
        title="Aide - Eligibilite"
        subtitle="Verification des droits et plafonds"
        tips={[
          {
            icon: <Search className="h-4 w-4 text-blue-500" />,
            title: "Rechercher un adherent",
            desc: "Entrez le matricule ou le numero CIN pour verifier l'eligibilite.",
          },
          {
            icon: <CheckCircle className="h-4 w-4 text-green-500" />,
            title: "Statut d'eligibilite",
            desc: "Le resultat indique si l'adherent est eligible avec sa couverture active.",
          },
          {
            icon: <Shield className="h-4 w-4 text-purple-500" />,
            title: "Plafonds et consommation",
            desc: "Consultez les plafonds restants par type de soin et le taux d'utilisation.",
          },
          {
            icon: <AlertCircle className="h-4 w-4 text-orange-500" />,
            title: "Avertissements",
            desc: "Les avertissements en orange signalent des situations a verifier (plafond proche, etc.).",
          },
        ]}
      />
    </div>
  );
}
