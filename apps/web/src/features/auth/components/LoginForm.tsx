import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, type LoginRequest } from '@dhamen/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '../hooks/useAuth';

const DEMO_ACCOUNTS = [
  { email: 'admin@dhamen.tn', password: 'dhamen123', role: 'Admin Plateforme', icon: '👑' },
  { email: 'admin@star.com.tn', password: 'dhamen123', role: 'Admin STAR', icon: '🏢' },
  { email: 'pharma.centrale@email.tn', password: 'dhamen123', role: 'Pharmacien', icon: '💊' },
  { email: 'dr.benali@email.tn', password: 'dhamen123', role: 'Médecin', icon: '🩺' },
  { email: 'labo.central@email.tn', password: 'dhamen123', role: 'Laboratoire', icon: '🔬' },
  { email: 'clinique.oliviers@email.tn', password: 'dhamen123', role: 'Clinique', icon: '🏥' },
];

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

  const fillDemoAccount = (email: string, password: string) => {
    setValue('email', email);
    setValue('password', password);
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
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
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
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? 'Masquer' : 'Afficher'}
          </button>
        </div>
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? 'Connexion...' : 'Se connecter'}
      </Button>

      {/* Demo accounts section */}
      <div className="border-t pt-4">
        <p className="mb-3 text-center text-sm font-medium text-muted-foreground">
          Comptes de démonstration
        </p>
        <div className="grid grid-cols-2 gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => fillDemoAccount(account.email, account.password)}
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
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Mot de passe: <code className="rounded bg-muted px-1">dhamen123</code>
        </p>
      </div>
    </form>
  );
}
