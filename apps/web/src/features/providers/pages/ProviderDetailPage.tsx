import { useNavigate, useParams } from 'react-router-dom';
import { MapPin, Phone, Mail, Pencil, Stethoscope } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useProvider } from '../hooks/useProviders';
import { usePermissions } from '@/hooks/usePermissions';

const PROVIDER_TYPES: Record<string, { label: string; color: string }> = {
  PHARMACY: { label: 'Pharmacie', color: 'bg-emerald-100 text-emerald-800' },
  DOCTOR: { label: 'Médecin', color: 'bg-blue-100 text-blue-800' },
  LAB: { label: 'Laboratoire', color: 'bg-purple-100 text-purple-800' },
  CLINIC: { label: 'Clinique', color: 'bg-orange-100 text-orange-800' },
  HOSPITAL: { label: 'Hôpital', color: 'bg-red-100 text-red-800' },
  DENTIST: { label: 'Dentiste', color: 'bg-pink-100 text-pink-800' },
  OPTICIAN: { label: 'Opticien', color: 'bg-cyan-100 text-cyan-800' },
  KINESITHERAPEUTE: { label: 'Kinésithérapeute', color: 'bg-amber-100 text-amber-800' },
};

export default function ProviderDetailPage() {
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission('providers', 'update');

  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: provider, isLoading, isError } = useProvider(id || '');

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (isError || !provider) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-muted-foreground">Praticien non trouvé</p>
        <Button onClick={() => navigate('/providers')}>Retour aux praticiens</Button>
      </div>
    );
  }

  const typeInfo = PROVIDER_TYPES[provider.type] || { label: provider.type, color: 'bg-gray-100 text-gray-800' };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title={provider.name}
          description={provider.speciality || typeInfo.label}
          breadcrumb={[
            { label: 'Praticiens', href: '/providers' },
            { label: provider.name },
          ]}
        />
        <div className="flex items-center gap-3">
          {canUpdate && (
            <Button
              variant="outline"
              onClick={() => navigate(`/providers/${id}/edit`)}
            >
              <Pencil className="h-4 w-4 mr-2" />
              Modifier
            </Button>
          )}
          <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
          <Badge variant={provider.isActive ? 'default' : 'destructive'} className={provider.isActive ? 'bg-green-100 text-green-800' : ''}>
            {provider.isActive ? 'Actif' : 'Inactif'}
          </Badge>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Main Info */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              Informations praticien
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Nom</p>
                <p className="font-medium">{provider.name}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Type</p>
                <Badge className={typeInfo.color}>{typeInfo.label}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">N° Licence / MF</p>
                <p className="font-medium font-mono">{provider.licenseNo || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Matricule Fiscal</p>
                <p className="font-medium font-mono">{provider.mfNumber || '—'}</p>
              </div>
              {provider.speciality && (
                <div>
                  <p className="text-sm text-muted-foreground">Spécialité</p>
                  <p className="font-medium">{provider.speciality}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">Statut</p>
                <p className="font-medium">{provider.isActive ? 'Actif' : 'Inactif'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(provider.address || provider.city) && (
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  {provider.address && <p>{provider.address}</p>}
                  {provider.city && <p className="text-muted-foreground">{provider.city}</p>}
                </div>
              </div>
            )}

            {provider.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <a href={`tel:${provider.phone}`} className="text-primary hover:underline">
                  {provider.phone}
                </a>
              </div>
            )}

            {provider.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <a href={`mailto:${provider.email}`} className="text-primary hover:underline">
                  {provider.email}
                </a>
              </div>
            )}

            {!provider.address && !provider.city && !provider.phone && !provider.email && (
              <p className="text-muted-foreground">Aucune information de contact</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
