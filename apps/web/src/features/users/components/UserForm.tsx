import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VISIBLE_ROLE_LABELS, passwordSchema } from '@dhamen/shared';
import type { UserPublic } from '@dhamen/shared';

const PASSWORD_RULES = [
  { label: 'Au moins 8 caractères', test: (v: string) => v.length >= 8 },
  { label: 'Une lettre majuscule', test: (v: string) => /[A-Z]/.test(v) },
  { label: 'Une lettre minuscule', test: (v: string) => /[a-z]/.test(v) },
  { label: 'Un chiffre', test: (v: string) => /[0-9]/.test(v) },
  { label: 'Un caractère spécial', test: (v: string) => /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/`~]/.test(v) },
];

const userFormSchema = z.object({
  email: z.string().email('Email invalide'),
  password: passwordSchema.optional(),
  firstName: z.string().min(2, 'Minimum 2 caractères'),
  lastName: z.string().min(2, 'Minimum 2 caractères'),
  phone: z.string().optional(),
  role: z.string(),
});

type UserFormData = z.infer<typeof userFormSchema>;

interface UserFormProps {
  user?: UserPublic;
  onSubmit: (data: UserFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function UserForm({ user, onSubmit, onCancel, isLoading }: UserFormProps) {
  const isEditing = !!user;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      email: user?.email || '',
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      phone: user?.phone || '',
      role: user?.role || 'PHARMACIST',
    },
  });

  const selectedRole = watch('role');
  const passwordValue = watch('password') ?? '';

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">Prénom</Label>
          <Input id="firstName" {...register('firstName')} />
          {errors.firstName && (
            <p className='text-destructive text-sm'>{errors.firstName.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Nom</Label>
          <Input id="lastName" {...register('lastName')} />
          {errors.lastName && (
            <p className='text-destructive text-sm'>{errors.lastName.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register('email')} disabled={isEditing} />
        {errors.email && <p className='text-destructive text-sm'>{errors.email.message}</p>}
      </div>

      {!isEditing && (
        <div className="space-y-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input id="password" type="password" {...register('password')} />
          {errors.password && (
            <p className='text-destructive text-sm'>{errors.password.message}</p>
          )}
          {passwordValue && (
            <ul className="mt-2 space-y-1 text-sm">
              {PASSWORD_RULES.map((rule) => {
                const passed = rule.test(passwordValue);
                return (
                  <li key={rule.label} className={passed ? 'text-green-600' : 'text-muted-foreground'}>
                    {passed ? '\u2713' : '\u2022'} {rule.label}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="phone">Téléphone</Label>
        <Input id="phone" {...register('phone')} placeholder="+216..." />
      </div>

      <div className="space-y-2">
        <Label>Rôle</Label>
        <Select value={selectedRole} onValueChange={(value) => setValue('role', value)}>
          <SelectTrigger>
            <SelectValue placeholder="Sélectionner un rôle" />
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

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Enregistrement...' : isEditing ? 'Mettre à jour' : 'Créer'}
        </Button>
      </div>
    </form>
  );
}
