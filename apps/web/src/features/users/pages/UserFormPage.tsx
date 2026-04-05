/**
 * UserFormPage - Create/Edit User Page
 *
 * Dedicated page for user creation and editing (replaces dialog)
 */
import { useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { usePermissions } from '@/hooks/usePermissions';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
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
import { VISIBLE_ROLE_LABELS } from '@dhamen/shared';
import { useUser, useCreateUser, useUpdateUser } from '../hooks/useUsers';
import { useToast } from '@/stores/toast';
import { apiClient } from '@/lib/api-client';

interface Company {
  id: string;
  name: string;
}

const userFormSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Minimum 8 caracteres').optional(),
  firstName: z.string().min(2, 'Minimum 2 caracteres'),
  lastName: z.string().min(2, 'Minimum 2 caracteres'),
  phone: z.string().optional(),
  role: z.string(),
  companyId: z.string().optional(),
  isActive: z.boolean().optional(),
  mfaEnabled: z.boolean().optional(),
});

type UserFormData = z.infer<typeof userFormSchema>;

export function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditing = !!id;
  const { hasPermission } = usePermissions();

  const { data: user, isLoading: isLoadingUser } = useUser(id || '');
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const formValues = isEditing && user ? {
    email: user.email || "",
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    phone: user.phone || "",
    role: user.role || "PHARMACIST",
    companyId: user.companyId || "",
    isActive: user.isActive ?? true,
    mfaEnabled: user.mfaEnabled ?? true,
    
  } : undefined;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      email: "",
      firstName: "",
      lastName: "",
      phone: "",
      role: "PHARMACIST",
      companyId: "",
      isActive: true,
      mfaEnabled: true,
    },
    values: formValues,
  });

  const selectedRole = watch('role');
  const isActive = watch('isActive');
  const mfaEnabled = watch('mfaEnabled');
  const isHrRole = selectedRole === 'HR';
  // MFA activé par défaut pour les rôles non-admin
  const isAdminRole = selectedRole === 'ADMIN';

  const { data: companies } = useQuery({
    queryKey: ['companies-list'],
    queryFn: async () => {
      const response = await apiClient.get<Company[]>('/companies', { params: { limit: 100 } });
      if (!response.success) return [];
      return (response.data as unknown as Company[]) || [];
    },
    enabled: isHrRole,
  });

  useEffect(() => {
    if (!isEditing) {
      setValue('mfaEnabled', !isAdminRole);
    }
  }, [isAdminRole, isEditing, setValue]);

  const onSubmit = async (data: UserFormData) => {
    try {
      if (isEditing && id) {
        await updateUser.mutateAsync({ id, data });
        toast({ title: 'Utilisateur modifié avec succès', variant: 'success' });
      } else {
        await createUser.mutateAsync(data as Parameters<typeof createUser.mutateAsync>[0]);
        toast({ title: 'Utilisateur créé avec succès', variant: 'success' });
      }
      navigate('/users');
    } catch {
      toast({
        title: 'Erreur',
        description: 'Une erreur est survenue lors de l\'enregistrement',
        variant: 'destructive',
      });
    }
  };

  const isLoading = createUser.isPending || updateUser.isPending;

  if (isEditing && isLoadingUser) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!hasPermission('users', isEditing ? 'update' : 'create')) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-semibold text-gray-900">Accès refusé</p>
        <p className="mt-1 text-sm text-gray-500">Vous n'avez pas la permission de {isEditing ? 'modifier' : 'créer'} un utilisateur.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-blue-600 hover:underline">Retour</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/users" className="hover:text-gray-900 transition-colors">
          Utilisateurs
        </Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">
          {isEditing ? "Modifier" : "Nouvel Utilisateur"}
        </span>
      </nav>
      <PageHeader
        title={isEditing ? "Modifier l'utilisateur" : "Nouvel utilisateur"}
        description={
          isEditing
            ? "Modifier les informations de l'utilisateur"
            : "Créer un nouveau compte utilisateur"
        }
      />

      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle>
            {isEditing
              ? "Informations de l'utilisateur"
              : "Informations du nouvel utilisateur"}
          </CardTitle>
          <CardDescription>
            {isEditing
              ? "Modifiez les champs ci-dessous puis cliquez sur Enregistrer"
              : "Remplissez les informations du nouvel utilisateur"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Name fields */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="firstName">Prénom *</Label>
                <Input
                  id="firstName"
                  {...register("firstName")}
                  placeholder="Jean"
                />
                {errors.firstName && (
                  <p className="text-destructive text-sm">
                    {errors.firstName.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nom *</Label>
                <Input
                  id="lastName"
                  {...register("lastName")}
                  placeholder="Dupont"
                />
                {errors.lastName && (
                  <p className="text-destructive text-sm">
                    {errors.lastName.message}
                  </p>
                )}
              </div>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                {...register("email")}
                placeholder="jean.dupont@example.com"
                disabled={isEditing}
              />
              {errors.email && (
                <p className="text-destructive text-sm">
                  {errors.email.message}
                </p>
              )}
              {isEditing && (
                <p className="text-muted-foreground text-xs">
                  L'email ne peut pas être modifié
                </p>
              )}
            </div>

            {/* Password - only for new users */}
            {!isEditing && (
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe *</Label>
                <Input
                  id="password"
                  type="password"
                  {...register("password")}
                  placeholder="Minimum 8 caracteres"
                />
                {errors.password && (
                  <p className="text-destructive text-sm">
                    {errors.password.message}
                  </p>
                )}
              </div>
            )}

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone</Label>
              <Input
                id="phone"
                {...register("phone")}
                placeholder="+216 XX XXX XXX"
              />
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select
                key={`role-${selectedRole}`}
                value={selectedRole}
                onValueChange={(value) => setValue("role", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un role" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(VISIBLE_ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Company - only for HR role */}
            {isHrRole && (
              <div className="space-y-2">
                <Label>Entreprise *</Label>
                <Select
                  key={`company-${watch("companyId")}`}
                  value={watch("companyId") || ""}
                  onValueChange={(value) => setValue("companyId", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner une entreprise" />
                  </SelectTrigger>
                  <SelectContent>
                    {(companies || []).map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Les utilisateurs RH doivent être associés à une entreprise
                </p>
              </div>
            )}

            {/* Active status - only for editing */}
            {isEditing && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="space-y-0.5">
                  <Label>Compte actif</Label>
                  <p className="text-muted-foreground text-sm">
                    Désactiver le compte empechera l'utilisateur de se connecter
                  </p>
                </div>
                <Switch
                  checked={isActive}
                  onCheckedChange={(checked) => setValue("isActive", checked)}
                />
              </div>
            )}

            {/* MFA */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label>Double authentification (MFA)</Label>
                <p className="text-muted-foreground text-sm">
                  {isAdminRole
                    ? "Optionnel pour les administrateurs"
                    : "Activé par défaut pour les utilisateurs non-admin"}
                </p>
              </div>
              <Switch
                checked={mfaEnabled}
                onCheckedChange={(checked) => setValue("mfaEnabled", checked)}
              />
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/users")}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading
                  ? "Enregistrement..."
                  : isEditing
                    ? "Enregistrer"
                    : "Créer l'utilisateur"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default UserFormPage;
