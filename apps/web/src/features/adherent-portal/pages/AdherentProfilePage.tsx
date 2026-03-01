import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { User, Phone, Mail, Calendar, Shield, MapPin } from 'lucide-react';

interface AdhérentProfile {
  id: string;
  nationalId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  postalCode: string | null;
  contractId: string;
  contractNumber: string;
  insurerName: string;
  relationship: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export function AdhérentProfilePage() {
  const { user } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['adherent-profile', user?.id],
    queryFn: async () => {
      const response = await apiClient.get<{ adherent: AdhérentProfile }>('/adherents/me');
      if (!response.success) throw new Error(response.error?.message);
      return response.data?.adherent;
    },
    enabled: !!user?.id,
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  const calculateAge = (dateOfBirth: string) => {
    const today = new Date();
    const birth = new Date(dateOfBirth);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mon profil" description="Chargement..." />
        <div className="grid gap-6 md:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-32 animate-pulse rounded bg-muted" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mon profil" description="Informations personnelles" />
        <Card>
          <CardContent className="p-12 text-center">
            <User className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Profil non trouvé</h3>
            <p className="mt-2 text-muted-foreground">
              Aucune information d'adhérent n'est associee a votre compte.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mon profil"
        description="Consultez vos informations personnelles et votre couverture"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Personal Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Informations personnelles
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Nom complet</span>
              <span className="font-medium">{profile.firstName} {profile.lastName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">N CIN/Passeport</span>
              <span className="font-mono">{profile.nationalId}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Date de naissance</span>
              <span>{formatDate(profile.dateOfBirth)} ({calculateAge(profile.dateOfBirth)} ans)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Genre</span>
              <span>{profile.gender === 'M' ? 'Homme' : 'Femme'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Lien familial</span>
              <Badge variant="outline">
                {profile.relationship === 'PRINCIPAL' ? 'Titulaire' :
                 profile.relationship === 'SPOUSE' ? 'Conjoint(e)' :
                 profile.relationship === 'CHILD' ? 'Enfant' : profile.relationship}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              Coordonnées
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{profile.phone}</span>
            </div>
            {profile.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{profile.email}</span>
              </div>
            )}
            {profile.address && (
              <div className="flex items-start gap-3">
                <MapPin className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p>{profile.address}</p>
                  {profile.city && <p>{profile.postalCode} {profile.city}</p>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Insurance Coverage */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Ma couverture sante
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Assureur</p>
                <p className="text-lg font-semibold">{profile.insurerName}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">N Contrat</p>
                <p className="font-mono">{profile.contractNumber}</p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Statut</p>
                <Badge variant={profile.isActive ? 'success' : 'destructive'}>
                  {profile.isActive ? 'Actif' : 'Inactif'}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Date de debut</p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{formatDate(profile.startDate)}</span>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Date de fin</p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>{formatDate(profile.endDate)}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default AdhérentProfilePage;
