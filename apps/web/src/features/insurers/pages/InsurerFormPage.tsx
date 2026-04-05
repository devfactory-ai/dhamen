/**
 * InsurerFormPage - Create/Edit Insurer Page
 *
 * Dedicated page for insurer creation and editing (replaces dialog)
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { useForm } from 'react-hook-form';
import { validerMatriculeFiscal } from '@dhamen/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ChevronRight } from 'lucide-react';
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

const TYPE_ASSUREUR_OPTIONS = [
  { value: 'cnam', label: 'CNAM' },
  { value: 'mutuelle', label: 'Mutuelle' },
  { value: 'compagnie', label: "Compagnie d'assurance" },
  { value: 'reassureur', label: 'Réassureur' },
  { value: 'autre', label: 'Autre' },
];

const insurerFormSchema = z.object({
  name: z.string().min(2, 'Minimum 2 caracteres'),
  code: z.string().min(2, 'Code requis (2-5 caracteres)').max(5),
  type: z.enum(['INSURANCE', 'MUTUAL']),
  registrationNumber: z.string().min(1, 'Numéro d\'enregistrement requis'),
  taxId: z.string().optional(),
  address: z.string().min(5, 'Adresse requise'),
  city: z.string().min(2, 'Ville requise'),
  postalCode: z.string().optional(),
  phone: z.string().min(8, 'Téléphone requis'),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  website: z.string().url('URL invalide').optional().or(z.literal('')),
  isActive: z.boolean().optional(),
  typeAssureur: z.string().optional(),
  matriculeFiscal: z.string().optional(),
  dateDebutConvention: z.string().optional(),
  dateFinConvention: z.string().optional(),
  tauxCouverture: z.string().optional(),
});

type InsurerFormData = z.infer<typeof insurerFormSchema>;

export function InsurerFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditing = !!id;
  const { hasPermission } = usePermissions();

  const { data: insurer, isLoading: isLoadingInsurer } = useInsurer(id || '');
  const createInsurer = useCreateInsurer();
  const updateInsurer = useUpdateInsurer();
  const [mfValidation, setMfValidation] = useState<{ valid?: boolean; message?: string } | null>(null);

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
      typeAssureur: 'autre',
      matriculeFiscal: '',
      dateDebutConvention: '',
      dateFinConvention: '',
      tauxCouverture: '',
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
        address: insurer.address || '',
        city: insurer.city || '',
        postalCode: insurer.postalCode || '',
        phone: insurer.phone || '',
        email: insurer.email || '',
        website: insurer.website || '',
        isActive: insurer.isActive,
        typeAssureur: insurer.typeAssureur || 'autre',
        matriculeFiscal: insurer.matriculeFiscal || '',
        dateDebutConvention: insurer.dateDebutConvention || '',
        dateFinConvention: insurer.dateFinConvention || '',
        tauxCouverture: insurer.tauxCouverture != null ? String(insurer.tauxCouverture) : '',
      });
    }
  }, [insurer, reset]);

  const selectedType = watch('type');
  const isActive = watch('isActive');

  const handleMfBlur = (value: string) => {
    if (!value) {
      setMfValidation(null);
      return;
    }
    const result = validerMatriculeFiscal(value);
    if (result.valid) {
      const details = result.parts
        ? `MF valide — ${result.parts.codeTva ? `TVA: ${result.parts.codeTva}` : 'Forme courte'}`
        : 'MF valide';
      setMfValidation({ valid: true, message: details });
    } else {
      setMfValidation({ valid: false, message: result.errors.join(', ') });
    }
  };

  const onSubmit = async (formData: InsurerFormData) => {
    try {
      const payload = {
        ...formData,
        tauxCouverture: formData.tauxCouverture ? Number(formData.tauxCouverture) : undefined,
      };
      if (isEditing && id) {
        await updateInsurer.mutateAsync({ id, data: payload as Parameters<typeof updateInsurer.mutateAsync>[0]['data'] });
        toast({ title: 'Compagnie modifiée avec succès', variant: 'success' });
      } else {
        await createInsurer.mutateAsync(payload as Parameters<typeof createInsurer.mutateAsync>[0]);
        toast({ title: 'Compagnie créée avec succès', variant: 'success' });
      }
      navigate('/insurers');
    } catch (err) {
      toast({
        title: 'Erreur',
        description: err instanceof Error ? err.message : 'Une erreur est survenue',
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

  if (!hasPermission('insurers', isEditing ? 'update' : 'create')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-semibold text-gray-900">Accès refusé</p>
        <p className="mt-1 text-sm text-gray-500">Vous n'avez pas la permission de {isEditing ? 'modifier' : 'créer'} une compagnie.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-blue-600 hover:underline">Retour</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/insurers" className="hover:text-gray-900 transition-colors">Compagnies Partenaires</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">{isEditing ? 'Modifier' : 'Nouvelle compagnie'}</span>
      </nav>
      <PageHeader
        title={isEditing ? 'Modifier la compagnie' : 'Nouvelle compagnie'}
        description={isEditing ? 'Modifier les informations de la compagnie' : 'Ajouter une nouvelle compagnie partenaire'}
      />

      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>{isEditing ? 'Informations de l\'assureur' : 'Informations du nouvel assureur'}</CardTitle>
          <CardDescription>
            {isEditing
              ? 'Modifiez les champs ci-dessous puis cliquez sur Enregistrer'
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
                  placeholder="BH"
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
              <Input id="name" {...register('name')} placeholder="BH Assurances" />
              {errors.name && (
                <p className="text-destructive text-sm">{errors.name.message}</p>
              )}
            </div>

            {/* Type Assureur */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Type de compagnie</Label>
                <Select
                  value={watch('typeAssureur') || 'autre'}
                  onValueChange={(v) => setValue('typeAssureur', v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un type" />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_ASSUREUR_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="registrationNumber">N° Enregistrement *</Label>
                <Input
                  id="registrationNumber"
                  {...register('registrationNumber')}
                  placeholder="AS-2024-001"
                />
                {errors.registrationNumber && (
                  <p className="text-destructive text-sm">{errors.registrationNumber.message}</p>
                )}
              </div>
            </div>

            {/* Matricule Fiscal with onBlur validation */}
            <div className="space-y-2">
              <Label htmlFor="matriculeFiscal">Matricule Fiscal</Label>
              <Input
                id="matriculeFiscal"
                {...register('matriculeFiscal')}
                placeholder="1234567/A/N/P/000"
                className="font-mono"
                onBlur={(e) => handleMfBlur(e.target.value)}
              />
              {mfValidation && (
                <p className={`text-sm ${mfValidation.valid ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {mfValidation.valid ? '✓' : '⚠'} {mfValidation.message}
                </p>
              )}
            </div>

            {/* Convention */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="dateDebutConvention">Début convention</Label>
                <Input id="dateDebutConvention" type="date" {...register('dateDebutConvention')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateFinConvention">Fin convention</Label>
                <Input id="dateFinConvention" type="date" {...register('dateFinConvention')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="tauxCouverture">Taux couverture (%)</Label>
                <Input
                  id="tauxCouverture"
                  type="number"
                  min="0"
                  max="100"
                  {...register('tauxCouverture')}
                  placeholder="80"
                />
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
            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => navigate('/insurers')}>
                Annuler
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Enregistrement...' : isEditing ? 'Enregistrer' : 'Créer l\'assureur'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default InsurerFormPage;
