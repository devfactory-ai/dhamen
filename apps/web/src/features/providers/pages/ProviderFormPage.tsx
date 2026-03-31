/**
 * ProviderFormPage - Create/Edit Provider Page
 *
 * Aligned with SPROLS/BH Assurance contract provider categories
 */

import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useProvider, useCreateProvider, useUpdateProvider } from '../hooks/useProviders';
import { useToast } from '@/stores/toast';

/** Frontend type → backend type mapping */
const FRONTEND_TO_BACKEND_TYPE: Record<string, string> = {
  PHARMACY: 'pharmacist',
  DOCTOR: 'doctor',
  LAB: 'lab',
  CLINIC: 'clinic',
  HOSPITAL: 'hospital',
  DENTIST: 'dentist',
  OPTICIAN: 'optician',
  KINESITHERAPEUTE: 'kinesitherapeute',
};

/** Backend type → frontend type mapping */
const BACKEND_TO_FRONTEND_TYPE: Record<string, string> = {
  pharmacist: 'PHARMACY',
  doctor: 'DOCTOR',
  lab: 'LAB',
  clinic: 'CLINIC',
  hospital: 'HOSPITAL',
  dentist: 'DENTIST',
  optician: 'OPTICIAN',
  kinesitherapeute: 'KINESITHERAPEUTE',
};

const PROVIDER_TYPES = {
  PHARMACY: 'Pharmacie',
  DOCTOR: 'Medecin',
  LAB: 'Laboratoire',
  CLINIC: 'Clinique',
  HOSPITAL: 'Hopital',
  DENTIST: 'Dentiste',
  OPTICIAN: 'Opticien',
  KINESITHERAPEUTE: 'Kinesitherapeute',
};

/** Specialities per provider type (from contract) */
const SPECIALITIES: Record<string, { value: string; label: string }[]> = {
  DOCTOR: [
    { value: 'generaliste', label: 'Medecin Generaliste (C1)' },
    { value: 'specialiste', label: 'Medecin Specialiste (C2)' },
    { value: 'professeur', label: 'Professeur Agrege (C3)' },
    { value: 'chirurgien', label: 'Chirurgien (KC)' },
  ],
  DENTIST: [
    { value: 'dentiste', label: 'Chirurgien Dentiste' },
    { value: 'orthodontiste', label: 'Orthodontiste' },
  ],
};

const providerFormSchema = z.object({
  name: z.string().min(2, 'Minimum 2 caracteres'),
  type: z.enum(['PHARMACY', 'DOCTOR', 'LAB', 'CLINIC', 'HOSPITAL', 'DENTIST', 'OPTICIAN', 'KINESITHERAPEUTE']),
  licenseNo: z.string().min(1, 'Numero de licence requis'),
  speciality: z.string().optional(),
  mfNumber: z.string().optional(),
  address: z.string().min(5, 'Adresse requise'),
  city: z.string().min(2, 'Ville requise'),
  phone: z.string().min(8, 'Telephone requis'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  isActive: z.boolean().optional(),
});

type ProviderFormData = z.infer<typeof providerFormSchema>;

export function ProviderFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditing = !!id;

  const { data: provider, isLoading: isLoadingProvider } = useProvider(id || '');
  const createProvider = useCreateProvider();
  const updateProvider = useUpdateProvider();

  const providerDefaults = provider
    ? {
        name: provider.name,
        type: (BACKEND_TO_FRONTEND_TYPE[provider.type] || provider.type) as ProviderFormData['type'],
        licenseNo: provider.licenseNo || '',
        speciality: provider.speciality || '',
        mfNumber: provider.mfNumber || '',
        address: provider.address,
        city: provider.city,
        phone: provider.phone || '',
        email: provider.email || '',
        isActive: provider.isActive,
      }
    : {
        name: '',
        type: 'PHARMACY' as const,
        licenseNo: '',
        speciality: '',
        mfNumber: '',
        address: '',
        city: '',
        phone: '',
        email: '',
        isActive: true,
      };

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ProviderFormData>({
    resolver: zodResolver(providerFormSchema),
    defaultValues: providerDefaults,
    values: isEditing && provider ? providerDefaults : undefined,
  });

  const selectedType = watch('type');
  const isActive = watch('isActive');
  const specialities = SPECIALITIES[selectedType];

  const onSubmit = async (data: ProviderFormData) => {
    try {
      // Convert frontend type to backend type
      const apiData = {
        ...data,
        type: FRONTEND_TO_BACKEND_TYPE[data.type] || data.type,
        email: data.email || undefined,
        speciality: data.speciality || undefined,
        mfNumber: data.mfNumber || undefined,
      };

      if (isEditing && id) {
        await updateProvider.mutateAsync({ id, data: apiData });
        toast({ title: 'Praticien modifié avec succès', variant: 'success' });
      } else {
        await createProvider.mutateAsync(apiData);
        toast({ title: 'Praticien créé avec succès', variant: 'success' });
      }
      navigate('/providers');
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue lors de l\'enregistrement',
        variant: 'destructive',
      });
    }
  };

  const isLoading = createProvider.isPending || updateProvider.isPending;

  if (isEditing && isLoadingProvider) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEditing ? 'Modifier le praticien' : 'Nouveau praticien'}
        description={isEditing ? 'Modifier les informations du praticien' : 'Ajouter un nouveau praticien de santé'}
        breadcrumb={[
          { label: 'Praticiens', href: '/providers' },
          ...(isEditing && provider ? [{ label: provider.name, href: `/providers/${id}` }] : []),
          { label: isEditing ? 'Modifier' : 'Nouveau' },
        ]}
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{isEditing ? 'Informations du praticien' : 'Informations du nouveau praticien'}</CardTitle>
          <CardDescription>
            {isEditing
              ? 'Modifiez les champs ci-dessous puis cliquez sur Enregistrer'
              : 'Remplissez les informations du nouveau praticien'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Type selection */}
            <div className="space-y-2">
              <Label>Type de praticien *</Label>
              <Select
                value={selectedType}
                onValueChange={(v) => {
                  setValue('type', v as ProviderFormData['type']);
                  // Reset speciality when type changes
                  setValue('speciality', '');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selectionner un type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROVIDER_TYPES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Speciality */}
            <div className="space-y-2">
              <Label>Spécialité</Label>
              {specialities ? (() => {
                const currentVal = watch('speciality') || '';
                const isKnown = specialities.some((s) => s.value === currentVal);
                return (
                  <Select
                    value={currentVal}
                    onValueChange={(v) => setValue('speciality', v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sélectionner une spécialité" />
                    </SelectTrigger>
                    <SelectContent>
                      {currentVal && !isKnown && (
                        <SelectItem value={currentVal}>{currentVal}</SelectItem>
                      )}
                      {specialities.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                );
              })() : (
                <Input
                  value={watch('speciality') || ''}
                  onChange={(e) => setValue('speciality', e.target.value)}
                  placeholder="Ex: Médecine générale, Cardiologie..."
                />
              )}
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nom / Raison sociale *</Label>
              <Input id="name" {...register('name')} placeholder="Pharmacie Centrale / Dr. Ben Ali" />
              {errors.name && (
                <p className="text-destructive text-sm">{errors.name.message}</p>
              )}
            </div>

            {/* License No and MF Number */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="licenseNo">N° Licence / Enregistrement *</Label>
                <Input
                  id="licenseNo"
                  {...register('licenseNo')}
                  placeholder="PH-2024-001"
                  disabled={isEditing}
                />
                {errors.licenseNo && (
                  <p className="text-destructive text-sm">{errors.licenseNo.message}</p>
                )}
                {isEditing && (
                  <p className="text-muted-foreground text-xs">Le numero ne peut pas etre modifie</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="mfNumber">Matricule Fiscal (MF)</Label>
                <Input id="mfNumber" {...register('mfNumber')} placeholder="1234567/A/B/C/000" />
              </div>
            </div>

            {/* Address */}
            <div className="space-y-2">
              <Label htmlFor="address">Adresse *</Label>
              <Input id="address" {...register('address')} placeholder="123 Avenue Habib Bourguiba" />
              {errors.address && (
                <p className="text-destructive text-sm">{errors.address.message}</p>
              )}
            </div>

            {/* City */}
            <div className="space-y-2">
              <Label htmlFor="city">Ville *</Label>
              <Input id="city" {...register('city')} placeholder="Tunis" />
              {errors.city && (
                <p className="text-destructive text-sm">{errors.city.message}</p>
              )}
            </div>

            {/* Contact info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Telephone *</Label>
                <Input id="phone" {...register('phone')} placeholder="+216 71 XXX XXX" />
                {errors.phone && (
                  <p className="text-destructive text-sm">{errors.phone.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} placeholder="contact@praticien.tn" />
                {errors.email && (
                  <p className="text-destructive text-sm">{errors.email.message}</p>
                )}
              </div>
            </div>

            {/* Active status - only for editing */}
            {isEditing && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Praticien actif</Label>
                  <p className="text-muted-foreground text-sm">
                    Désactiver le praticien suspendra son accès à la plateforme
                  </p>
                </div>
                <Switch
                  checked={isActive}
                  onCheckedChange={(checked) => setValue('isActive', checked)}
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => navigate('/providers')}>
                Annuler
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Enregistrement...' : isEditing ? 'Enregistrer' : 'Créer le praticien'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default ProviderFormPage;
