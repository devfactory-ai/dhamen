import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/stores/toast';
import { InfoTooltip } from '@/components/ui/info-tooltip';

const SECTORS: Record<string, string> = {
  IT: 'Informatique',
  BANKING: 'Banque',
  HEALTHCARE: 'Sante',
  MANUFACTURING: 'Industrie',
  RETAIL: 'Commerce',
  SERVICES: 'Services',
  OTHER: 'Autre',
};

const companyFormSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  code: z.string().optional(),
  matriculeFiscal: z.string().optional(),
  contractNumber: z.string().optional(),
  dateOuverture: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email invalide').optional().or(z.literal('')),
  sector: z.string().optional(),
  employeeCount: z.number().int().positive().optional().or(z.literal(0)),
});

type CompanyFormData = z.infer<typeof companyFormSchema>;

interface Company {
  id: string;
  name: string;
  code: string | null;
  matricule_fiscal: string | null;
  contract_number: string | null;
  date_ouverture: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  sector: string | null;
  employee_count: number | null;
  insurer_id: string | null;
  is_active: number;
}

export function CompanyFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!id;
  const { hasPermission } = usePermissions();

  const { data: company, isLoading } = useQuery({
    queryKey: ['company', id],
    queryFn: async () => {
      const response = await apiClient.get<Company>(`/companies/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: isEditing,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CompanyFormData>({
    resolver: zodResolver(companyFormSchema),
    defaultValues: {
      name: '',
      code: '',
      matriculeFiscal: '',
      contractNumber: '',
      dateOuverture: '',
      address: '',
      city: '',
      phone: '',
      email: '',
      sector: '',
      employeeCount: 0,
    },
  });

  useEffect(() => {
    if (company) {
      reset({
        name: company.name || '',
        code: company.code || '',
        matriculeFiscal: company.matricule_fiscal || '',
        contractNumber: company.contract_number || '',
        dateOuverture: company.date_ouverture || '',
        address: company.address || '',
        city: company.city || '',
        phone: company.phone || '',
        email: company.email || '',
        sector: company.sector || '',
        employeeCount: company.employee_count || 0,
      });
    }
  }, [company, reset]);

  const mutation = useMutation({
    mutationFn: async (data: CompanyFormData) => {
      if (isEditing) {
        return apiClient.put(`/companies/${id}`, data);
      }
      return apiClient.post('/companies', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      queryClient.invalidateQueries({ queryKey: ['company', id] });
      toast({ title: isEditing ? 'Entreprise modifiée' : 'Entreprise créée', variant: 'success' });
      navigate('/companies');
    },
    onError: (err: Error) => {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    },
  });

  const onSubmit = (data: CompanyFormData) => {
    mutation.mutate(data);
  };

  if (isEditing && isLoading) {
    return <div className="flex items-center justify-center p-8">Chargement...</div>;
  }

  if (!hasPermission('companies', isEditing ? 'update' : 'create')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-semibold text-gray-900">Accès refusé</p>
        <p className="mt-1 text-sm text-gray-500">Vous n'avez pas la permission de {isEditing ? 'modifier' : 'créer'} une entreprise.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-blue-600 hover:underline">Retour</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <PageHeader
          title={isEditing ? 'Modifier l\'entreprise' : 'Nouvelle entreprise'}
          description={isEditing ? `Modifier ${company?.name || ''}` : 'Ajouter une nouvelle entreprise cliente'}
          breadcrumb={[
            { label: 'Entreprises', href: '/companies' },
            { label: isEditing ? (company?.name || 'Modifier') : 'Nouvelle' },
          ]}
        />
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Informations de l'entreprise</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="code">Code société</Label>
                <Input id="code" {...register('code')} placeholder="Ex: BIAT, TT" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">Raison sociale *</Label>
                <Input id="name" {...register('name')} placeholder="Nom de l'entreprise" />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="matriculeFiscal">Matricule fiscale<InfoTooltip text="Identifiant fiscal unique delivre par l'administration fiscale tunisienne. Format : chiffres + lettre cle (ex: 123456ABC). Obligatoire pour la facturation." /></Label>
                <Input id="matriculeFiscal" {...register('matriculeFiscal')} placeholder="Ex: 123456ABC" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contractNumber">Numéro de contrat</Label>
                <Input id="contractNumber" {...register('contractNumber')} placeholder="Ex: CTR-2024-001" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="dateOuverture">Date d'ouverture</Label>
                <Input id="dateOuverture" type="date" max={new Date().toISOString().split('T')[0]} {...register('dateOuverture')} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sector">Secteur</Label>
                <Select
                  key={watch('sector') || 'no-sector'}
                  value={watch('sector') || undefined}
                  onValueChange={(val) => setValue('sector', val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un secteur" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SECTORS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="employeeCount">Effectif</Label>
                <Input
                  id="employeeCount"
                  type="number"
                  {...register('employeeCount', { valueAsNumber: true })}
                  placeholder="Nombre d'employes"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Adresse</Label>
              <Input id="address" {...register('address')} placeholder="Adresse complete" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="city">Ville</Label>
                <Input id="city" {...register('city')} placeholder="Ville" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telephone</Label>
                <Input id="phone" {...register('phone')} placeholder="+216 71 123 456" />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} placeholder="contact@entreprise.tn" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => navigate('/companies')}>
                Annuler
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Enregistrement...' : isEditing ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}

export default CompanyFormPage;
