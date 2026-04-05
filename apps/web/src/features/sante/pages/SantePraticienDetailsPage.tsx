/**
 * SantePraticienDetailsPage - Practitioner Details Page
 *
 * Dedicated page for viewing practitioner details
 */
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ChevronRight, MapPin, Phone, Mail, Clock, Building, Activity } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  usePraticienById,
  CONVENTIONNEMENT_LABELS,
  CONVENTIONNEMENT_COLORS,
} from '../hooks/usePraticiens';

export function SantePraticienDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: praticien, isLoading, isError } = usePraticienById(id ?? null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isError || !praticien) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Praticien non trouvé</p>
        <Button onClick={() => navigate('/sante/praticiens')}>Retour aux praticiens</Button>
      </div>
    );
  }

  const fullName = praticien.prenom ? `${praticien.prenom} ${praticien.nom}` : praticien.nom;

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/sante/praticiens" className="hover:text-gray-900 transition-colors">Praticiens</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">Détails</span>
      </nav>
      <div className="flex items-center justify-between">
        <PageHeader
          title={fullName}
          description={praticien.spécialité}
        />
        <div className="flex items-center gap-3">
          <Badge className={CONVENTIONNEMENT_COLORS[praticien.conventionnement]}>
            {CONVENTIONNEMENT_LABELS[praticien.conventionnement]}
          </Badge>
          <Badge variant={praticien.estActif ? 'success' : 'secondary'}>
            {praticien.estActif ? 'Actif' : 'Inactif'}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Info Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Informations praticien
            </CardTitle>
            <CardDescription>Details professionnels</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Nom complet</p>
                <p className="font-medium">{fullName}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Spécialité</p>
                <p className="font-medium">{praticien.spécialité}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Conventionnement</p>
                <Badge className={`mt-1 ${CONVENTIONNEMENT_COLORS[praticien.conventionnement]}`}>
                  {CONVENTIONNEMENT_LABELS[praticien.conventionnement]}
                </Badge>
              </div>
              {praticien.tauxRemboursement && (
                <div>
                  <p className="text-sm text-muted-foreground">Taux de remboursement</p>
                  <p className="font-bold text-xl text-primary">{praticien.tauxRemboursement}%</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Statut
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-full ${praticien.estActif ? 'bg-green-100' : 'bg-gray-100'}`}>
                <Activity className={`h-5 w-5 ${praticien.estActif ? 'text-green-600' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="font-medium">{praticien.estActif ? 'Actif' : 'Inactif'}</p>
                <p className="text-sm text-muted-foreground">Statut du praticien</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact Card */}
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
            <CardDescription>Coordonnées du praticien</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {praticien.adresse && (
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p>{praticien.adresse}</p>
                  {praticien.codePostal && praticien.ville && (
                    <p className="text-muted-foreground">
                      {praticien.codePostal} {praticien.ville}
                    </p>
                  )}
                  {!praticien.codePostal && praticien.ville && (
                    <p className="text-muted-foreground">{praticien.ville}</p>
                  )}
                </div>
              </div>
            )}

            {!praticien.adresse && praticien.ville && (
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground" />
                <p>{praticien.ville}</p>
              </div>
            )}

            {praticien.téléphone && (
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <a href={`tel:${praticien.téléphone}`} className="text-primary hover:underline">
                  {praticien.téléphone}
                </a>
              </div>
            )}

            {praticien.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <a href={`mailto:${praticien.email}`} className="text-primary hover:underline">
                  {praticien.email}
                </a>
              </div>
            )}

            {!praticien.adresse && !praticien.ville && !praticien.téléphone && !praticien.email && (
              <p className="text-muted-foreground">Aucune information de contact disponible</p>
            )}
          </CardContent>
        </Card>

        {/* Schedule Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Horaires
            </CardTitle>
            <CardDescription>Heures de consultation</CardDescription>
          </CardHeader>
          <CardContent>
            {praticien.horaires ? (
              <p className="whitespace-pre-line">{praticien.horaires}</p>
            ) : (
              <p className="text-muted-foreground">Horaires non renseignes</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default SantePraticienDetailsPage;
