import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { loginRequestSchema } from '@dhamen/shared';
import { isAuthenticated } from '@/lib/auth';
import { setTenant, type TenantCode } from '@/lib/tenant';
import { useAuth } from '../hooks/useAuth';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';

/** Extended schema with persist session */
const loginFormSchema = loginRequestSchema.extend({
  persistSession: z.boolean().optional().default(false),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

/** Organization pills for the tenant selector */
const ORGANIZATIONS: {
  code: TenantCode;
  name: string;
  bgColor: string;
  textColor: string;
}[] = [
  { code: 'BH', name: 'BH Assurance', bgColor: 'bg-blue-50', textColor: 'text-blue-600' },
];

/** Demo accounts by category */
const DEMO_CATEGORIES = [
  {
    label: 'Super Admins',
    key: 'superadmins',
    accounts: [
      { email: 'admin@yopmail.com', role: 'Admin Principal', color: 'bg-purple-500', icon: '👑' },
      { email: 'admin1@yopmail.com', role: 'Admin Secondaire', color: 'bg-purple-400', icon: '👑' },
    ],
  },
  // {
  //   label: 'Admins Assureur',
  //   key: 'adminassureur',
  //   accounts: [
  //     { email: 'adminassureur@yopmail.com', role: 'Admin Assureur', color: 'bg-blue-500', icon: '🏢' },
  //     { email: 'adminassureur1@yopmail.com', role: 'Admin Assureur 2', color: 'bg-blue-400', icon: '🏢' },
  //   ],
  // },
  {
    label: 'Agents',
    key: 'agents',
    accounts: [
      { email: 'testagent@yopmail.com', role: 'Test Agent', color: 'bg-emerald-500', icon: '📋' },
      { email: 'sirine@yopmail.com', role: 'Sirine Agent', color: 'bg-emerald-400', icon: '📋' },
    ],
  },
  // {
  //   label: 'Prestataires',
  //   key: 'prestataires',
  //   accounts: [
  //     { email: 'pharmacien@yopmail.com', role: 'Pharmacie Centrale', color: 'bg-teal-500', icon: '💊' },
  //     { email: 'medecin@yopmail.com', role: 'Dr. Ben Ali', color: 'bg-red-500', icon: '🩺' },
  //     { email: 'labo@yopmail.com', role: 'Labo Central', color: 'bg-amber-500', icon: '🔬' },
  //     { email: 'clinique@yopmail.com', role: 'Clinique Les Oliviers', color: 'bg-cyan-500', icon: '🏥' },
  //   ],
  // },
];
const DEMO_PASSWORD = 'Password123!';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error } = useAuth();
  const [selectedOrg, setSelectedOrg] = useState<TenantCode | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [demoTab, setDemoTab] = useState('superadmins');
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  useEffect(() => {
    if (isAuthenticated()) {
      navigate('/dashboard');
    }
  }, [navigate]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
      persistSession: false,
    },
  });

  const handleSelectOrg = (code: TenantCode) => {
    setSelectedOrg(code);
    setTenant(code);
  };

  const fillDemoAccount = (email: string) => {
    setSelectedDemo(email);
    setValue('email', email);
    setValue('password', DEMO_PASSWORD);
  };

  const onSubmit = async (data: LoginFormValues) => {
    const result = await login({
      email: data.email,
      password: data.password,
      turnstileToken,
    } as Parameters<typeof login>[0]);

    if (result.requiresMfa && result.mfaToken) {
      navigate(`/mfa/verify?token=${result.mfaToken}&methods=email,totp`);
    }
    // On success without MFA, useAuth navigates automatically
    // Reset Turnstile on failure
    if (!result.success) {
      turnstileRef.current?.reset();
      setTurnstileToken(undefined);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="flex flex-1">
        {/* ==================== LEFT PANEL ==================== */}
        <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col justify-between bg-[#0A1628] p-10 text-white relative overflow-hidden">
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none" />

          <div className="relative z-10 flex flex-col justify-between h-full">
            {/* Logo */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm0 2.18l7 3.82v5c0 4.52-3.13 8.69-7 9.93C8.13 21.69 5 17.52 5 13V8l7-3.82z" />
                    <path d="M12 7l-4 2.18v3.64c0 2.6 1.8 5 4 5.72 2.2-.72 4-3.12 4-5.72V9.18L12 7z" />
                  </svg>
                </div>
                <span className="text-2xl font-bold tracking-tight">E-Santé</span>
              </div>
              <p className="text-sm text-blue-200/70 max-w-xs mt-1">
                Plateforme de gestion d'assurance propulsee par l'intelligence artificielle
              </p>
            </div>

            {/* Feature bullets */}
            <div className="space-y-6 my-auto py-12">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 border border-blue-400/20">
                  <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">Intégration de l'Écosystème Numérique</h3>
                  <p className="text-xs text-blue-200/50 leading-relaxed">
                    Connectez pharmacies, cliniques et laboratoires en temps reel
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 border border-emerald-400/20">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">Intégration de l'Écosystème Numérique</h3>
                  <p className="text-xs text-blue-200/50 leading-relaxed">
                    Automatisez la verification d'eligibilite et la tarification
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 border border-amber-400/20">
                  <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">Sécurité de Grade Institutionnel</h3>
                  <p className="text-xs text-blue-200/50 leading-relaxed">
                    Chiffrement AES-256, audit trail complet, detection de fraude IA
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <p className="text-[10px] text-blue-200/30 uppercase tracking-widest">
              &copy; 2024 E-SANTE SENTINEL &bull; VERSION 4.0.2
            </p>
          </div>
        </div>

        {/* ==================== RIGHT PANEL ==================== */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 bg-gray-50/50 overflow-y-auto">
          <div className="w-full max-w-md">
            {/* Mobile logo */}
            <div className="lg:hidden flex items-center justify-center gap-2 mb-6">
              <div className="w-9 h-9 bg-[#0A1628] rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z" />
                </svg>
              </div>
              <span className="text-xl font-bold text-gray-900">E-Santé</span>
            </div>

            {/* Organization selector - pills */}
            <div className="mb-6">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest text-center mb-3">
                Selecteur d'espace de travail
              </p>
              <div className="flex items-center justify-center gap-3">
                {ORGANIZATIONS.map((org) => (
                  <div key={org.code} className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleSelectOrg(org.code)}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
                        selectedOrg === org.code
                          ? `${org.bgColor} ${org.textColor} ring-2 ring-offset-1 ring-current`
                          : `${org.bgColor} ${org.textColor} opacity-60 hover:opacity-100`
                      }`}
                    >
                      {org.name}
                    </button>
                    {selectedOrg === org.code && (
                      <span className="text-[9px] font-bold text-green-600 uppercase tracking-wider">Active</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Form card */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-8">
              {/* Title */}
              <div className="text-center mb-6">
                <h1 className="text-xl font-bold text-gray-900">E-Santé</h1>
                <p className="text-xs text-gray-400 mt-1">
                  Gestion institutionnelle des risques & assurances
                </p>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                {/* Email field */}
                <div>
                  <label htmlFor="email" className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    Email professionnel
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                      </svg>
                    </div>
                    <input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="nom@entreprise.com"
                      className="w-full h-11 pl-10 pr-4 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0A1628]/20 focus:border-[#0A1628] transition-colors"
                      {...register('email')}
                    />
                  </div>
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>

                {/* Password field */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="password" className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      Cle d'acces
                    </label>
                    <Link
                      to="/auth/reset-password"
                      className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider hover:underline"
                    >
                      Acces perdu ?
                    </Link>
                  </div>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••••"
                      className="w-full h-11 pl-10 pr-12 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0A1628]/20 focus:border-[#0A1628] transition-colors"
                      {...register('password')}
                    />
                    <button
                      type="button"
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
                </div>

                {/* Persist session checkbox */}
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 text-[#0A1628] focus:ring-[#0A1628]"
                    {...register('persistSession')}
                  />
                  <span className="text-sm text-gray-600">Session persistante pendant 12 heures</span>
                </label>

                {/* Cloudflare Turnstile */}
                <Turnstile
                  ref={turnstileRef}
                  siteKey={TURNSTILE_SITE_KEY}
                  onSuccess={setTurnstileToken}
                  onExpire={() => setTurnstileToken(undefined)}
                  options={{ theme: 'light', size: 'flexible' }}
                />

                {/* Error display */}
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
                    <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-red-600 text-sm">{error}</p>
                  </div>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-12 bg-[#0A1628] hover:bg-[#0f2035] text-white text-sm font-semibold rounded-xl transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Connexion en cours...
                    </>
                  ) : (
                    <>Se connecter a l'espace de travail &rarr;</>
                  )}
                </button>
              </form>

              {/* Magic link */}
              <div className="mt-4 text-center">
                <Link
                  to="/auth/magic-link"
                  className="text-sm text-[#0A1628] font-medium hover:underline inline-flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                  Connexion par lien magique
                </Link>
              </div>

              {/* Support */}
              <p className="text-center text-[10px] text-gray-400 uppercase tracking-wider mt-5">
                Besoin d'aide ?{' '}
                <a
                  href="mailto:support@e-sante.tn"
                  className="font-semibold text-gray-500 hover:text-gray-700"
                >
                  Contacter le support
                </a>
              </p>
            </div>

            {/* ==================== DEMO ACCOUNTS (dev only) ==================== */}
            {(import.meta.env.DEV || import.meta.env.VITE_ENV !== 'prod') && (
              <div className="mt-8 w-full">
                <div className="flex items-center gap-2 mb-5">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Comptes Demo</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>

                {/* Category tabs - underlined style */}
                <div className="flex items-center justify-center gap-3 sm:gap-6 mb-5 flex-wrap">
                  {DEMO_CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      type="button"
                      onClick={() => setDemoTab(cat.key)}
                      className={`text-[11px] font-semibold uppercase tracking-wider pb-1.5 transition-colors ${
                        demoTab === cat.key
                          ? 'text-[#0A1628] border-b-2 border-[#0A1628]'
                          : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Accounts grid - cards with colored shield icons */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 gap-3">
                  {DEMO_CATEGORIES.find((c) => c.key === demoTab)?.accounts.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => fillDemoAccount(account.email)}
                      className={`flex flex-col items-center gap-2 rounded-xl border p-3 transition-all ${
                        selectedDemo === account.email
                          ? 'border-[#0A1628] bg-[#0A1628]/5 shadow-sm'
                          : 'border-gray-100 bg-white hover:shadow-sm hover:border-gray-200'
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-full ${account.color}/10 flex items-center justify-center`}>
                        <span className="text-base">{account.icon}</span>
                      </div>
                      <span className="text-[10px] font-medium text-gray-600 text-center leading-tight">{account.role}</span>
                    </button>
                  ))}
                </div>

                <p className="text-center text-[10px] text-gray-400 mt-3">
                  Mot de passe : <code className="px-1 py-0.5 bg-gray-100 rounded text-gray-600 font-mono">{DEMO_PASSWORD}</code>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== BOTTOM FOOTER ==================== */}
      <footer className="border-t border-gray-100 bg-white px-6 sm:px-10 py-4">
        <div className="max-w-screen-xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-[10px] text-gray-400">
            <span className="font-semibold text-gray-500 uppercase tracking-wider">E-Santé </span>
            <span>&copy; 2024 E-SANTE. TOUS DROITS RESERVES. GESTIONNAIRE D'ASSURANCE AGREE.</span>
          </div>
          <div className="flex items-center gap-4 text-[10px] text-gray-400 uppercase tracking-wider">
            <a href="#" className="hover:text-gray-600 transition-colors">Politique de confidentialite</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Conditions d'utilisation</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Divulgation de sécurité</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Infos reglementaires</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
