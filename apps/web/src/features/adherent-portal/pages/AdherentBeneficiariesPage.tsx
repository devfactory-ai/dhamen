import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { Users, User, Baby, Heart, Calendar, UserCircle } from 'lucide-react';

interface AyantDroit {
  nom: string;
  prénom: string;
  lien: 'CONJOINT' | 'ENFANT' | 'PARENT' | 'AUTRE';
  dateNaissance: string;
  sexe: 'M' | 'F';
}

interface BeneficiariesResponse {
  principal: {
    id: string;
    nom: string;
    prénom: string;
  };
  ayantsDroit: AyantDroit[];
  total: number;
}

const lienLabels: Record<string, string> = {
  CONJOINT: 'Conjoint(e)',
  ENFANT: 'Enfant',
  PARENT: 'Parent',
  AUTRE: 'Autre',
};

const lienIcons: Record<string, React.ReactNode> = {
  CONJOINT: <Heart className="h-5 w-5 text-pink-500" />,
  ENFANT: <Baby className="h-5 w-5 text-blue-500" />,
  PARENT: <UserCircle className="h-5 w-5 text-gray-500" />,
  AUTRE: <User className="h-5 w-5 text-gray-500" />,
};

export function AdhérentBeneficiariesPage() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['adhérent-beneficiaries', user?.id],
    queryFn: async () => {
      const response = await apiClient.get<BeneficiariesResponse>('/adherents/me/ayants-droit');
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: !!user?.id,
  });

  const calculateAge = (dateNaissance: string) => {
    const today = new Date();
    const birthDate = new Date(dateNaissance);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mes ayants droit" description="Chargement..." />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
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

  const ayantsDroit = data?.ayantsDroit || [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes ayants droit"
        description="Personnes couvertes par votre contrat d'assurance sante"
      />

      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Résumé de la couverture
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg bg-primary/10 p-4 text-center">
              <p className="text-3xl font-bold text-primary">{ayantsDroit.length + 1}</p>
              <p className="text-sm text-muted-foreground">Personnes couvertes</p>
            </div>
            <div className="rounded-lg bg-pink-100 p-4 text-center dark:bg-pink-900/20">
              <p className="text-3xl font-bold text-pink-600">
                {ayantsDroit.filter((a) => a.lien === 'CONJOINT').length}
              </p>
              <p className="text-sm text-muted-foreground">Conjoint(e)</p>
            </div>
            <div className="rounded-lg bg-blue-100 p-4 text-center dark:bg-blue-900/20">
              <p className="text-3xl font-bold text-blue-600">
                {ayantsDroit.filter((a) => a.lien === 'ENFANT').length}
              </p>
              <p className="text-sm text-muted-foreground">Enfant(s)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Principal (Titular) */}
      {data?.principal && (
        <Card className="border-primary">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Assure principal
              </div>
              <Badge variant="default">Titulaire</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-xl font-semibold">
              {data.principal.prenom} {data.principal.nom}
            </p>
            <p className="text-sm text-muted-foreground">Vous</p>
          </CardContent>
        </Card>
      )}

      {/* Ayants Droit List */}
      {ayantsDroit.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Aucun ayant droit</h3>
            <p className="mt-2 text-muted-foreground">
              Vous n'avez pas d'ayants droit enregistrés sur votre contrat.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {ayantsDroit.map((ayant, index) => (
            <Card key={index} className="overflow-hidden">
              <CardHeader className="bg-muted/50 pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <div className="flex items-center gap-2">
                    {lienIcons[ayant.lien] || <User className="h-5 w-5" />}
                    <span>{lienLabels[ayant.lien] || ayant.lien}</span>
                  </div>
                  <Badge variant={ayant.sexe === 'F' ? 'secondary' : 'outline'}>
                    {ayant.sexe === 'F' ? 'Femme' : 'Homme'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <p className="text-lg font-semibold">
                  {ayant.prenom} {ayant.nom}
                </p>
                <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    <span>Ne(e) le {formatDate(ayant.dateNaissance)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4" />
                    <span>{calculateAge(ayant.dateNaissance)} ans</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default AdhérentBeneficiariesPage;
