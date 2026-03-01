/**
 * ProviderFormPage - Create/Edit Provider Page
 *
 * Dedicated page for provider creation and editing (replaces dialog)
 */
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useProvider, useCreateProvider, useUpdateProvider } from '../hooks/useProviders';
import { useToast } from '@/stores/toast';

const PROVIDER_TYPES = {
  PHARMACY: 'Pharmacie',
  DOCTOR: 'Cabinet Medical',
  LAB: 'Laboratoire',
  CLINIC: 'Clinique',
};

const providerFormSchema = z.object({
  name: z.string().min(2, 'Minimum 2 caracteres'),
  type: z.enum(['PHARMACY', 'DOCTOR', 'LAB', 'CLINIC']),
  registrationNumber: z.string().min(1, 'Numéro d\'enregistrément requis'),
  taxId: z.string().optional(),
  address: z.string().min(5, 'Adresse requise'),
  city: z.string().min(2, 'Ville requise'),
  postalCode: z.string().optional(),
  phone: z.string().min(8, 'Téléphone requis'),
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

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProviderFormData>({
    resolver: zodResolver(providerFormSchema),
    defaultValues: {
      name: '',
      type: 'PHARMACY',
      registrationNumber: '',
      taxId: '',
      address: '',
      city: '',
      postalCode: '',
      phone: '',
      email: '',
      isActive: true,
    },
  });

  // Populate form when provider data is loaded
  useEffect(() => {
    if (provider) {
      reset({
        name: provider.name,
        type: provider.type,
        registrationNumber: provider.registrationNumber,
        taxId: provider.taxId || '',
        address: provider.address,
        city: provider.city,
        postalCode: provider.postalCode || '',
        phone: provider.phone,
        email: provider.email || '',
        isActive: provider.isActive,
      });
    }
  }, [provider, reset]);

  const selectedType = watch('type');
  const isActive = watch('isActive');

  const onSubmit = async (data: ProviderFormData) => {
    try {
      if (isEditing && id) {
        await updateProvider.mutateAsync({ id, data });
        toast({ title: 'Prestataire modifié avec succès', variant: 'success' });
      } else {
        await createProvider.mutateAsync(data as Parameters<typeof createProvider.mutateAsync>[0]);
        toast({ title: 'Prestataire créé avec succès', variant: 'success' });
      }
      navigate('/providers');
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue lors de l\'enregistrément',
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
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/providers')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title={isEditing ? 'Modifier le prestataire' : 'Nouveau prestataire'}
          description={isEditing ? 'Modifier les informations du prestataire' : 'Ajouter un nouveau prestataire de santé'}
        />
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{isEditing ? 'Informations du prestataire' : 'Informations du nouveau prestataire'}</CardTitle>
          <CardDescription>
            {isEditing
              ? 'Modifiez les champs ci-dessous puis cliquez sur Enregistrér'
              : 'Remplissez les informations du nouveau prestataire'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Type selection */}
            <div className="space-y-2">
              <Label>Type de prestataire *</Label>
              <Select
                value={selectedType}
                onValueChange={(v) => setValue('type', v as ProviderFormData['type'])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un type" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROVIDER_TYPES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nom *</Label>
              <Input id="name" {...register('name')} placeholder="Pharmacie Centrale" />
              {errors.name && (
                <p className="text-destructive text-sm">{errors.name.message}</p>
              )}
            </div>

            {/* Registration and Tax ID */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="registrationNumber">N° Enregistrément *</Label>
                <Input
                  id="registrationNumber"
                  {...register('registrationNumber')}
                  placeholder="PH-2024-001"
                  disabled={isEditing}
                />
                {errors.registrationNumber && (
                  <p className="text-destructive text-sm">{errors.registrationNumber.message}</p>
                )}
                {isEditing && (
                  <p className="text-muted-foreground text-xs">Le numéro ne peut pas être modifié</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="taxId">Matricule Fiscal</Label>
                <Input id="taxId" {...register('taxId')} placeholder="1234567ABC" />
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

            {/* City and Postal Code */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="city">Ville *</Label>
                <Input id="city" {...register('city')} placeholder="Tunis" />
                {errors.city && (
                  <p className="text-destructive text-sm">{errors.city.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="postalCode">Code Postal</Label>
                <Input id="postalCode" {...register('postalCode')} placeholder="1000" />
              </div>
            </div>

            {/* Contact info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone *</Label>
                <Input id="phone" {...register('phone')} placeholder="+216 71 XXX XXX" />
                {errors.phone && (
                  <p className="text-destructive text-sm">{errors.phone.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} placeholder="contact@pharmacie.tn" />
                {errors.email && (
                  <p className="text-destructive text-sm">{errors.email.message}</p>
                )}
              </div>
            </div>

            {/* Active status - only for editing */}
            {isEditing && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Prestataire actif</Label>
                  <p className="text-muted-foreground text-sm">
                    Désactiver le prestataire suspendra son accès à la plateforme
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
                {isLoading ? 'Enregistrément...' : isEditing ? 'Enregistrér' : 'Créer le prestataire'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default ProviderFormPage;
