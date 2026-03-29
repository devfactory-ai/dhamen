/**
 * AdherentFormPage - Create/Edit Adhérent Page
 *
 * Dedicated page for adhérent creation and editing (replaces dialog)
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
import { useAdherent, useCreateAdherent, useUpdateAdherent } from '../hooks/useAdherents';
import { useInsurers } from '@/features/insurers/hooks/useInsurers';
import { useToast } from '@/stores/toast';

const RELATIONSHIP_LABELS = {
  PRIMARY: 'Titulaire',
  SPOUSE: 'Conjoint(e)',
  CHILD: 'Enfant',
  PARENT: 'Parent',
};

const adherentFormSchema = z.object({
  insurerId: z.string().min(1, 'Assureur requis'),
  nationalId: z.string().min(8, 'CIN invalide'),
  firstName: z.string().min(2, 'Minimum 2 caracteres'),
  lastName: z.string().min(2, 'Minimum 2 caracteres'),
  dateOfBirth: z.string().min(1, 'Date de naissance requise'),
  gender: z.enum(['M', 'F']),
  phone: z.string().optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  relationship: z.enum(['PRIMARY', 'SPOUSE', 'CHILD', 'PARENT']),
  isActive: z.boolean().optional(),
});

type AdherentFormData = z.infer<typeof adherentFormSchema>;

export function AdherentFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditing = !!id;

  const { data: adhérent, isLoading: isLoadingAdherent } = useAdherent(id || '');
  const { data: insurersData } = useInsurers(1, 100);
  const createAdherent = useCreateAdherent();
  const updateAdherent = useUpdateAdherent();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<AdherentFormData>({
    resolver: zodResolver(adherentFormSchema),
    defaultValues: {
      insurerId: '',
      nationalId: '',
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      gender: 'M',
      phone: '',
      email: '',
      address: '',
      city: '',
      relationship: 'PRIMARY',
      isActive: true,
    },
  });

  // Populate form when adhérent data is loaded
  useEffect(() => {
    if (adhérent) {
      reset({
        insurerId: adherent.insurerId,
        nationalId: adherent.nationalId,
        firstName: adherent.firstName,
        lastName: adherent.lastName,
        dateOfBirth: adherent.dateOfBirth.split('T')[0],
        gender: adherent.gender,
        phone: adherent.phone || '',
        email: adherent.email || '',
        address: adherent.address || '',
        city: adherent.city || '',
        relationship: adherent.relationship,
        isActive: adherent.isActive,
      });
    }
  }, [adhérent, reset]);

  const selectedGender = watch('gender');
  const selectedRelationship = watch('relationship');
  const selectedInsurerId = watch('insurerId');
  const isActive = watch('isActive');

  const onSubmit = async (data: AdherentFormData) => {
    try {
      if (isEditing && id) {
        await updateAdherent.mutateAsync({ id, data });
        toast({ title: 'Adhérent modifié avec succès', variant: 'success' });
      } else {
        await createAdherent.mutateAsync(data as Parameters<typeof createAdherent.mutateAsync>[0]);
        toast({ title: 'Adhérent créé avec succès', variant: 'success' });
      }
      navigate('/adhérents');
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue lors de l\'enregistrément',
        variant: 'destructive',
      });
    }
  };

  const isLoading = createAdherent.isPending || updateAdherent.isPending;

  if (isEditing && isLoadingAdherent) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/adhérents')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title={isEditing ? 'Modifier l\'adhérent' : 'Nouvel adhérent'}
          description={isEditing ? 'Modifier les informations de l\'adhérent' : 'Ajouter un nouvel adhérent'}
        />
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{isEditing ? 'Informations de l\'adhérent' : 'Informations du nouvel adhérent'}</CardTitle>
          <CardDescription>
            {isEditing
              ? 'Modifiez les champs ci-dessous puis cliquez sur Enregistrér'
              : 'Remplissez les informations du nouvel adhérent'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Insurer selection */}
            <div className="space-y-2">
              <Label>Assureur *</Label>
              <Select value={selectedInsurerId} onValueChange={(v) => setValue('insurerId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un assureur" />
                </SelectTrigger>
                <SelectContent>
                  {insurersData?.insurers.map((insurer) => (
                    <SelectItem key={insurer.id} value={insurer.id}>
                      {insurer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.insurerId && (
                <p className="text-destructive text-sm">{errors.insurerId.message}</p>
              )}
            </div>

            {/* Name fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">Prénom *</Label>
                <Input id="firstName" {...register('firstName')} placeholder="Jean" />
                {errors.firstName && (
                  <p className="text-destructive text-sm">{errors.firstName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nom *</Label>
                <Input id="lastName" {...register('lastName')} placeholder="Dupont" />
                {errors.lastName && (
                  <p className="text-destructive text-sm">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            {/* National ID */}
            <div className="space-y-2">
              <Label htmlFor="nationalId">N° CIN *</Label>
              <Input
                id="nationalId"
                {...register('nationalId')}
                placeholder="12345678"
                disabled={isEditing}
              />
              {errors.nationalId && <p className="text-destructive text-sm">{errors.nationalId.message}</p>}
              {isEditing && (
                <p className="text-muted-foreground text-xs">Le CIN ne peut pas être modifié</p>
              )}
            </div>

            {/* Date of birth, Gender, Relationship */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="dateOfBirth">Date de naissance *</Label>
                <Input id="dateOfBirth" type="date" max={new Date().toISOString().split('T')[0]} {...register('dateOfBirth')} />
                {errors.dateOfBirth && (
                  <p className="text-destructive text-sm">{errors.dateOfBirth.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Genre *</Label>
                <Select value={selectedGender} onValueChange={(v) => setValue('gender', v as 'M' | 'F')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Masculin</SelectItem>
                    <SelectItem value="F">Feminin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Lien de parente *</Label>
                <Select
                  value={selectedRelationship}
                  onValueChange={(v) => setValue('relationship', v as 'PRIMARY' | 'SPOUSE' | 'CHILD' | 'PARENT')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RELATIONSHIP_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Contact info */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" {...register('phone')} placeholder="+216 XX XXX XXX" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} placeholder="jean.dupont@example.com" />
                {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
              </div>
            </div>

            {/* Address */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="address">Adresse</Label>
                <Input id="address" {...register('address')} placeholder="123 Rue Principale" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">Ville</Label>
                <Input id="city" {...register('city')} placeholder="Tunis" />
              </div>
            </div>

            {/* Active status - only for editing */}
            {isEditing && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Adhérent actif</Label>
                  <p className="text-muted-foreground text-sm">
                    Désactiver l'adhérent suspendra sa couverture
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
              <Button type="button" variant="outline" onClick={() => navigate('/adhérents')}>
                Annuler
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Enregistrément...' : isEditing ? 'Enregistrér' : 'Créer l\'adhérent'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default AdherentFormPage;
