/**
 * UserFormPage - Create/Edit User Page
 *
 * Dedicated page for user creation and editing (replaces dialog)
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
import { ROLE_LABELS } from '@dhamen/shared';
import { useUser, useCreateUser, useUpdateUser } from '../hooks/useUsers';
import { useToast } from '@/stores/toast';

const userFormSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Minimum 8 caracteres').optional(),
  firstName: z.string().min(2, 'Minimum 2 caracteres'),
  lastName: z.string().min(2, 'Minimum 2 caracteres'),
  phone: z.string().optional(),
  role: z.string(),
  isActive: z.boolean().optional(),
});

type UserFormData = z.infer<typeof userFormSchema>;

export function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isEditing = !!id;

  const { data: user, isLoading: isLoadingUser } = useUser(id || '');
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      phone: '',
      role: 'PHARMACIST',
      isActive: true,
    },
  });

  // Populate form when user data is loaded
  useEffect(() => {
    if (user) {
      reset({
        email: user.email,
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        role: user.role,
        isActive: user.isActive,
      });
    }
  }, [user, reset]);

  const selectedRole = watch('role');
  const isActive = watch('isActive');

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
        description: 'Une erreur est survenue lors de l\'enregistrément',
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/users')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <PageHeader
          title={isEditing ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
          description={isEditing ? 'Modifier les informations de l\'utilisateur' : 'Créer un nouveau compte utilisateur'}
        />
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{isEditing ? 'Informations de l\'utilisateur' : 'Informations du nouvel utilisateur'}</CardTitle>
          <CardDescription>
            {isEditing
              ? 'Modifiez les champs ci-dessous puis cliquez sur Enregistrér'
              : 'Remplissez les informations du nouvel utilisateur'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                {...register('email')}
                placeholder="jean.dupont@example.com"
                disabled={isEditing}
              />
              {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
              {isEditing && (
                <p className="text-muted-foreground text-xs">L'email ne peut pas être modifié</p>
              )}
            </div>

            {/* Password - only for new users */}
            {!isEditing && (
              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe *</Label>
                <Input
                  id="password"
                  type="password"
                  {...register('password')}
                  placeholder="Minimum 8 caracteres"
                />
                {errors.password && (
                  <p className="text-destructive text-sm">{errors.password.message}</p>
                )}
              </div>
            )}

            {/* Phone */}
            <div className="space-y-2">
              <Label htmlFor="phone">Téléphone</Label>
              <Input id="phone" {...register('phone')} placeholder="+216 XX XXX XXX" />
            </div>

            {/* Role */}
            <div className="space-y-2">
              <Label>Role *</Label>
              <Select value={selectedRole} onValueChange={(value) => setValue('role', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un role" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
                  onCheckedChange={(checked) => setValue('isActive', checked)}
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={() => navigate('/users')}>
                Annuler
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? 'Enregistrément...' : isEditing ? 'Enregistrér' : 'Créer l\'utilisateur'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default UserFormPage;
