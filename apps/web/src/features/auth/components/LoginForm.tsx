import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, type LoginRequest } from '@dhamen/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '../hooks/useAuth';

// Demo accounts - only shown in development mode
const DEMO_ACCOUNTS = import.meta.env.DEV ? [
  { email: 'admin@dhamen.tn', role: 'Admin Plateforme', icon: '👑' },
  { email: 'admin@star.com.tn', role: 'Admin STAR', icon: '🏢' },
  { email: 'pharma.centrale@email.tn', role: 'Pharmacien', icon: '💊' },
  { email: 'dr.benali@email.tn', role: 'Médecin', icon: '🩺' },
  { email: 'labo.central@email.tn', role: 'Laboratoire', icon: '🔬' },
  { email: 'clinique.oliviers@email.tn', role: 'Clinique', icon: '🏥' },
] : [];

const DEMO_PASSWORD = 'dhamen123';

export function LoginForm() {
  const { login, isLoading, error } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginRequest) => {
    await login(data);
  };

  const fillDemoAccount = (email: string) => {
    setValue('email', email);
    setValue('password', DEMO_PASSWORD);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="votre@email.tn"
          autoComplete="email"
          {...register('email')}
        />
        {errors.email && <p className='text-destructive text-sm'>{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Mot de passe</Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? 'text' : 'password'}
            placeholder="********"
            autoComplete="current-password"
            {...register('password')}
          />
          <button
            type="button"
            className='-translate-y-1/2 absolute top-1/2 right-3 text-muted-foreground hover:text-foreground'
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? 'Masquer' : 'Afficher'}
          </button>
        </div>
        {errors.password && <p className='text-destructive text-sm'>{errors.password.message}</p>}
      </div>

      {error && (
        <div className='rounded-md bg-destructive/10 p-3 text-destructive text-sm'>{error}</div>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Connexion...' : 'Se connecter'}
      </Button>

      {/* Demo accounts section - only visible in development */}
      {DEMO_ACCOUNTS.length > 0 && (
        <div className="border-t pt-4">
          <p className='mb-3 text-center font-medium text-muted-foreground text-sm'>
            Comptes de demonstration (dev only)
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => fillDemoAccount(account.email)}
                className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2 text-left text-xs transition-colors hover:bg-muted"
              >
                <span className="text-base">{account.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{account.role}</p>
                  <p className="truncate text-muted-foreground">{account.email.split('@')[0]}</p>
                </div>
              </button>
            ))}
          </div>
          <p className='mt-2 text-center text-muted-foreground text-xs'>
            Mot de passe: <code className="rounded bg-muted px-1">{DEMO_PASSWORD}</code>
          </p>
        </div>
      )}
    </form>
  );
}
