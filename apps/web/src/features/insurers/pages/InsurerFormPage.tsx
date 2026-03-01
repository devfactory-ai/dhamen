/**
 * InsurerFormPage - Create/Edit Insurer Page
 *
 * Dedicated page for insurer creation and editing (replaces dialog)
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
import { useInsurer, useCreateInsurer, useUpdateInsurer } from '../hooks/useInsurers';
import { useToast } from '@/stores/toast';

const INSURER_TYPES = {
  INSURANCE: 'Assurance',
  MUTUAL: 'Mutuelle',
};

const insurerFormSchema = z.object({
  name: z.string().min(2, 'Minimum 2 caracteres'),
  code: z.string().min(2, 'Code requis (2-5 caracteres)').max(5),
  type: z.enum(['INSURANCE', 'MUTUAL']),
  registrationNumber: z.string().min(1, 'Numéro d\'enregistrément requis'),
  taxId: z.string().optional(),
  address: z.string().min(5, 'Adresse requise'),
  city: z.string().min(2, 'Ville requise'),
  postalCode: z.string().optional(),
  phone: z.string().min(8, 'Téléphone requis'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  website: z.string().url('URL invalide').optional().or(z.literal('')),
  isActive: z.boolean().optional(),
});

type InsurerFormData = z.infer<typeof insurerFormSchema>;

export function InsurerFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditing = !!id;

  const { data: insurer, isLoading: isLoadingInsurer } = useInsurer(id || '');
  const createInsurer = useCreateInsurer();
  const updateInsurer = useUpdateInsurer();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<InsurerFormData>({
    resolver: zodResolver(insurerFormSchema),
    defaultValues: {
      name: '',
      code: '',
      type: 'INSURANCE',
      registrationNumber: '',
      taxId: '',
      address: '',
      city: '',
      postalCode: '',
      phone: '',
      email: '',
      website: '',
      isActive: true,
    },
  });

  // Populate form when insurer data is loaded
  useEffect(() => {
    if (insurer) {
      reset({
        name: insurer.name,
        code: insurer.code,
        type: insurer.type,
        registrationNumber: insurer.registrationNumber,
        taxId: insurer.taxId || '',
        address: insurer.address,
        city: insurer.city,
        postalCode: insurer.postalCode || '',
        phone: insurer.phone,
        email: insurer.email || '',
        website: insurer.website || '',
        isActive: insurer.isActive,
      });
    }
  }, [insurer, reset]);

  const selectedType = watch('type');
  const isActive = watch('isActive');

  const onSubmit = async (data: InsurerFormData) => {
    try {
      if (isEditing && id) {
        await updateInsurer.mutateAsync({ id, data });
        toast({ title: 'Assureur modifié avec succès', variant: 'success' });
      } else {
        await createInsurer.mutateAsync(data as Parameters<typeof createInsurer.mutateAsync>[0]);
        toast({ title: 'Assureur créé avec succès', variant: 'success' });
      }
      navigate('/insurers');
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue lors de l\'enregistrément',
        variant: 'destructive',
      });
    }
  };

  const isLoading = createInsurer.isPending || updateInsurer.isPending;

  if (isEditing && isLoadingInsurer) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/insurers')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title={isEditing ? 'Modifier l\'assureur' : 'Nouvel assureur'}
          description={isEditing ? 'Modifier les informations de l\'assureur' : 'Ajouter un nouvel assureur ou mutuelle'}
        />
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{isEditing ? 'Informations de l\'assureur' : 'Informations du nouvel assureur'}</CardTitle>
          <CardDescription>
            {isEditing
              ? 'Modifiez les champs ci-dessous puis cliquez sur Enregistrér'
              : 'Remplissez les informations du nouvel assureur'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Type and Code */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select
                  value={selectedType}
                  onValueChange={(v) => setValue('type', v as InsurerFormData['type'])}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un type" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(INSURER_TYPES).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  {...register('code')}
                  placeholder="STAR"
                  disabled={isEditing}
                  className="uppercase"
                />
                {errors.code && (
                  <p className="text-destructive text-sm">{errors.code.message}</p>
                )}
                {isEditing && (
                  <p className="text-muted-foreground text-xs">Le code ne peut pas être modifié</p>
                )}
              </div>
            </div>

            {/* Name */}
            <div className="space-y-2">
              <Label htmlFor="name">Nom *</Label>
              <Input id="name" {...register('name')} placeholder="STAR Assurances" />
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
                  placeholder="AS-2024-001"
                />
                {errors.registrationNumber && (
                  <p className="text-destructive text-sm">{errors.registrationNumber.message}</p>
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
                <Input id="email" type="email" {...register('email')} placeholder="contact@assurance.tn" />
                {errors.email && (
                  <p className="text-destructive text-sm">{errors.email.message}</p>
                )}
              </div>
            </div>

            {/* Website */}
            <div className="space-y-2">
              <Label htmlFor="website">Site Web</Label>
              <Input id="website" {...register('website')} placeholder="https://www.assurance.tn" />
              {errors.website && (
                <p className="text-destructive text-sm">{errors.website.message}</p>
              )}
            </div>

            {/* Active status - only for editing */}
            {isEditing && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Assureur actif</Label>
                  <p className="text-muted-foreground text-sm">
                    Désactiver l'assureur suspendra tous les contrats associés
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
              <Button type="button" variant="outline" onClick={() => navigate('/insurers')}>
                Annuler
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Enregistrément...' : isEditing ? 'Enregistrér' : 'Créer l\'assureur'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default InsurerFormPage;
