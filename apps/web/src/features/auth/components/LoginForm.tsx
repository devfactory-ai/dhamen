import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema, type LoginRequest } from '@dhamen/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '../hooks/useAuth';

// Demo accounts - always visible for demo purposes
const DEMO_ACCOUNTS = [
  { email: 'admin@e-sante.tn', role: 'Admin Plateforme', icon: '👑', color: 'from-purple-500 to-purple-600', category: 'admin' },
  { email: 'admin@star.com.tn', role: 'Assureur STAR', icon: '🏢', color: 'from-blue-500 to-blue-600', category: 'insurer' },
  { email: 'admin@gat.com.tn', role: 'Assureur GAT', icon: '🏛️', color: 'from-indigo-500 to-indigo-600', category: 'insurer' },
  { email: 'admin@ami.com.tn', role: 'Assureur AMI', icon: '🛡️', color: 'from-rose-500 to-rose-600', category: 'insurer' },
  { email: 'pharma.centrale@email.tn', role: 'Pharmacien', icon: '💊', color: 'from-green-500 to-green-600', category: 'provider' },
  { email: 'dr.benali@email.tn', role: 'Médecin', icon: '🩺', color: 'from-teal-500 to-teal-600', category: 'provider' },
  { email: 'labo.central@email.tn', role: 'Laboratoire', icon: '🔬', color: 'from-orange-500 to-orange-600', category: 'provider' },
];

// Demo insurance agent accounts - sub-contractors who process claims
const DEMO_AGENT_ACCOUNTS = [
  { email: 'agent.star@email.tn', insurer: 'STAR', name: 'Sami Khlifi', icon: '📋', color: 'from-blue-400 to-blue-500' },
  { email: 'agent.gat@email.tn', insurer: 'GAT', name: 'Ines Mejri', icon: '📝', color: 'from-indigo-400 to-indigo-500' },
  { email: 'agent.comar@email.tn', insurer: 'COMAR', name: 'Karim Dridi', icon: '✅', color: 'from-slate-500 to-slate-600' },
  { email: 'agent.ami@email.tn', insurer: 'AMI', name: 'Nadia Bouzid', icon: '🛡️', color: 'from-rose-400 to-rose-500' },
];

// Demo HR accounts - different client companies
const DEMO_HR_ACCOUNTS = [
  { email: 'rh@tunisietelecom.tn', company: 'Tunisie Telecom', icon: '📱', color: 'from-sky-500 to-sky-600' },
  { email: 'rh@poulina.tn', company: 'Groupe Poulina', icon: '🏭', color: 'from-emerald-500 to-emerald-600' },
  { email: 'rh@biat.com.tn', company: 'BIAT Banque', icon: '🏦', color: 'from-violet-500 to-violet-600' },
];

// Demo adhérent accounts
const DEMO_ADHERENT_ACCOUNTS = [
  { email: 'mohamed.bensalah@email.tn', name: 'Mohamed Ben Salah', icon: '👤', color: 'from-cyan-500 to-cyan-600' },
  { email: 'fatma.trabelsi@email.tn', name: 'Fatma Trabelsi', icon: '👩', color: 'from-pink-500 to-pink-600' },
  { email: 'ahmed.bouazizi@email.tn', name: 'Ahmed Bouazizi', icon: '👨', color: 'from-amber-500 to-amber-600' },
];

const DEMO_PASSWORD = 'Password123!';

export function LoginForm() {
  const { login, isLoading, error } = useAuth();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);

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
    const result = await login(data);
    if (result.redirectTo) {
      navigate(result.redirectTo);
    }
  };

  const fillDemoAccount = (email: string) => {
    setSelectedAccount(email);
    setValue('email', email);
    setValue('password', DEMO_PASSWORD);
  };

  return (
    <div className="space-y-6">
      {/* Demo Accounts Section */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-gray-200" />
          <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Comptes Démo</span>
          <div className="h-px flex-1 bg-gray-200" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => fillDemoAccount(account.email)}
              className={`
                group relative flex items-center gap-2.5 rounded-xl p-3 text-left transition-all duration-200
                ${selectedAccount === account.email
                  ? 'bg-gradient-to-r ' + account.color + ' text-white shadow-lg scale-[1.02]'
                  : 'bg-gray-50 hover:bg-gray-100 border border-gray-100 hover:border-gray-200'
                }
              `}
            >
              <span className={`text-xl ${selectedAccount === account.email ? 'grayscale-0' : ''}`}>
                {account.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-semibold truncate ${selectedAccount === account.email ? 'text-white' : 'text-gray-900'}`}>
                  {account.role}
                </p>
                <p className={`text-[10px] truncate ${selectedAccount === account.email ? 'text-white/80' : 'text-gray-500'}`}>
                  {account.email.split('@')[0]}
                </p>
              </div>
              {selectedAccount === account.email && (
                <svg className="w-4 h-4 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>

        <p className="text-center text-[11px] text-gray-400">
          Mot de passe : <code className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-mono">{DEMO_PASSWORD}</code>
        </p>

        {/* HR Demo Accounts */}
        <div className="pt-3 border-t border-gray-100">
          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2 text-center">Comptes RH Entreprises</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {DEMO_HR_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => fillDemoAccount(account.email)}
                className={`
                  group relative flex flex-col items-center gap-1 rounded-xl p-2 text-center transition-all duration-200
                  ${selectedAccount === account.email
                    ? 'bg-gradient-to-r ' + account.color + ' text-white shadow-lg scale-[1.02]'
                    : 'bg-gray-50 hover:bg-gray-100 border border-gray-100 hover:border-gray-200'
                  }
                `}
              >
                <span className="text-lg">{account.icon}</span>
                <p className={`text-[10px] font-medium truncate w-full ${selectedAccount === account.email ? 'text-white' : 'text-gray-700'}`}>
                  {account.company.split(' ')[0]}
                </p>
                {selectedAccount === account.email && (
                  <svg className="absolute top-1 right-1 w-3 h-3 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Insurance Agent Demo Accounts */}
        <div className="pt-3 border-t border-gray-100">
          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2 text-center">Agents Assurance</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DEMO_AGENT_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => fillDemoAccount(account.email)}
                className={`
                  group relative flex flex-col items-center gap-1 rounded-xl p-2 text-center transition-all duration-200
                  ${selectedAccount === account.email
                    ? 'bg-gradient-to-r ' + account.color + ' text-white shadow-lg scale-[1.02]'
                    : 'bg-gray-50 hover:bg-gray-100 border border-gray-100 hover:border-gray-200'
                  }
                `}
              >
                <span className="text-lg">{account.icon}</span>
                <p className={`text-[10px] font-medium truncate w-full ${selectedAccount === account.email ? 'text-white' : 'text-gray-700'}`}>
                  {account.insurer}
                </p>
                <p className={`text-[8px] truncate w-full ${selectedAccount === account.email ? 'text-white/70' : 'text-gray-400'}`}>
                  {account.name.split(' ')[0]}
                </p>
                {selectedAccount === account.email && (
                  <svg className="absolute top-1 right-1 w-3 h-3 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Adhérent Demo Accounts */}
        <div className="pt-3 border-t border-gray-100">
          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2 text-center">Comptes Adhérents</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {DEMO_ADHERENT_ACCOUNTS.map((account) => (
              <button
                key={account.email}
                type="button"
                onClick={() => fillDemoAccount(account.email)}
                className={`
                  group relative flex flex-col items-center gap-1 rounded-xl p-2 text-center transition-all duration-200
                  ${selectedAccount === account.email
                    ? 'bg-gradient-to-r ' + account.color + ' text-white shadow-lg scale-[1.02]'
                    : 'bg-gray-50 hover:bg-gray-100 border border-gray-100 hover:border-gray-200'
                  }
                `}
              >
                <span className="text-lg">{account.icon}</span>
                <p className={`text-[10px] font-medium truncate w-full ${selectedAccount === account.email ? 'text-white' : 'text-gray-700'}`}>
                  {account.name.split(' ')[0]}
                </p>
                {selectedAccount === account.email && (
                  <svg className="absolute top-1 right-1 w-3 h-3 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            ))}
          </div>
          <p className="text-center text-[10px] text-gray-400 mt-2">
            Mot de passe : <code className="px-1 py-0.5 bg-gray-100 rounded text-gray-600 font-mono">{DEMO_PASSWORD}</code>
          </p>
        </div>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">ou</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      {/* Login Form */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email</Label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <Input
              id="email"
              type="email"
              placeholder="votre@email.tn"
              autoComplete="email"
              className="pl-10 h-11 bg-gray-50 border-gray-200 focus:bg-white transition-colors"
              {...register('email')}
            />
          </div>
          {errors.email && <p className="text-red-500 text-xs">{errors.email.message}</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium text-gray-700">Mot de passe</Label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              autoComplete="current-password"
              className="pl-10 pr-20 h-11 bg-gray-50 border-gray-200 focus:bg-white transition-colors"
              {...register('password')}
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                  Masquer
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Afficher
                </span>
              )}
            </button>
          </div>
          {errors.password && <p className="text-red-500 text-xs">{errors.password.message}</p>}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          className="w-full h-11 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium shadow-lg shadow-blue-600/25 transition-all duration-200"
          disabled={isLoading}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circlé className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Connexion en cours...
            </span>
          ) : (
            'Se connecter'
          )}
        </Button>
      </form>
    </div>
  );
}
