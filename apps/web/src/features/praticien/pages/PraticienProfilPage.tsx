import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePraticienProfil } from '../hooks/usePraticien';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { usePermissions } from '@/hooks/usePermissions';

const TYPE_LABELS: Record<string, string> = {
  pharmacist: 'Pharmacie',
  pharmacy: 'Pharmacie',
  doctor: 'Cabinet médical',
  lab: "Laboratoire d'analyses",
  clinic: 'Clinique',
  hospital: 'Hôpital',
  dentist: 'Cabinet dentaire',
  optician: 'Opticien',
};

export function PraticienProfilPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission('providers', 'update');
  const { data: profil, isLoading, error } = usePraticienProfil();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ phone: '', address: '', city: '', email: '' });

  const updateMutation = useMutation({
    mutationFn: async (data: { phone: string; address: string; city: string; email: string }) => {
      const response = await apiClient.put('/praticien/profil', data);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['praticien-profil'] });
      setEditing(false);
      toast.success('Profil mis à jour');
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Erreur lors de la mise à jour');
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mon profil" description="Informations de votre établissement" />
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100" />
          ))}
        </div>
      </div>
    );
  }

  // Even with error (no provider), show a minimal profile from user info
  // The backend now auto-creates a provider on GET /praticien/profil
  if (!profil && error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mon profil" description="Informations de votre établissement" />
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            Impossible de charger le profil. Veuillez réessayer.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!profil) {
    return (
      <div className="space-y-6">
        <PageHeader title="Mon profil" description="Informations de votre établissement" />
        <Card>
          <CardContent className="p-6 text-center text-gray-500">
            Chargement du profil...
          </CardContent>
        </Card>
      </div>
    );
  }

  const startEditing = () => {
    setForm({
      phone: profil.phone || '',
      address: profil.address || '',
      city: profil.city || '',
      email: profil.email || '',
    });
    setEditing(true);
  };

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  /** Read-only info rows */
  const readOnlyRows = [
    { label: 'Nom / Raison sociale', value: profil.name },
    { label: 'Type', value: TYPE_LABELS[profil.type] || profil.type },
    { label: 'Spécialité', value: profil.speciality || '—' },
    { label: 'N° licence / Agrément', value: profil.license_no || '—' },
    { label: 'Matricule fiscal', value: profil.mf_number || '—' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Mon profil" description="Informations de votre établissement" />

      {/* Provider info — read only fields */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{profil.name}</CardTitle>
          <Badge variant={profil.is_active ? 'success' : 'destructive'}>
            {profil.is_active ? 'Actif' : 'Inactif'}
          </Badge>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-gray-100">
            {readOnlyRows.map(row => (
              <div key={row.label} className="flex justify-between py-3">
                <dt className="text-sm font-medium text-gray-500">{row.label}</dt>
                <dd className="text-sm text-gray-900">{row.value}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      {/* Editable contact fields */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Coordonnées</CardTitle>
          {!editing && canUpdate && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              Modifier
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-500">Téléphone</label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="Ex: +216 71 234 567"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Adresse</label>
                <Input
                  value={form.address}
                  onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="Ex: 12 Rue de la Liberté"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Ville / Gouvernorat</label>
                <Input
                  value={form.city}
                  onChange={(e) => setForm(f => ({ ...f, city: e.target.value }))}
                  placeholder="Ex: Tunis"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-500">Email professionnel</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
                  placeholder="Ex: contact@labo.tn"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button onClick={handleSave} disabled={updateMutation.isPending}>
                  {updateMutation.isPending ? 'Enregistrement...' : 'Enregistrer'}
                </Button>
                <Button variant="outline" onClick={() => setEditing(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <dl className="divide-y divide-gray-100">
              <div className="flex justify-between py-3">
                <dt className="text-sm font-medium text-gray-500">Téléphone</dt>
                <dd className="text-sm text-gray-900">{profil.phone || '—'}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-sm font-medium text-gray-500">Adresse</dt>
                <dd className="text-sm text-gray-900">{profil.address || '—'}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-sm font-medium text-gray-500">Ville / Gouvernorat</dt>
                <dd className="text-sm text-gray-900">{profil.city || '—'}</dd>
              </div>
              <div className="flex justify-between py-3">
                <dt className="text-sm font-medium text-gray-500">Email professionnel</dt>
                <dd className="text-sm text-gray-900">{profil.email || '—'}</dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {/* Account info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Informations du compte</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y divide-gray-100">
            <div className="flex justify-between py-3">
              <dt className="text-sm font-medium text-gray-500">Utilisateur</dt>
              <dd className="text-sm text-gray-900">{user?.firstName} {user?.lastName}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-sm font-medium text-gray-500">Email</dt>
              <dd className="text-sm text-gray-900">{user?.email}</dd>
            </div>
            <div className="flex justify-between py-3">
              <dt className="text-sm font-medium text-gray-500">Rôle</dt>
              <dd className="text-sm text-gray-900">{user?.role}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

export default PraticienProfilPage;
