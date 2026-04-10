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
import { usePasskey } from '../hooks/usePasskey';

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
/** Material icon name for each demo role */
const DEMO_ICON: Record<string, string> = {
  admin: 'admin_panel_settings',
  agent: 'assignment_ind',
  rh: 'group',
  pharmacie: 'local_pharmacy',
  medecin: 'stethoscope',
  labo: 'biotech',
  clinique: 'local_hospital',
  assureur: 'assured_workload',
};

const DEMO_CATEGORIES = [
  {
    label: 'Admins',
    key: 'admins',
    accounts: [
      { email: 'adminPrimaire@yopmail.com', role: 'Admin Principal', iconKey: 'admin' },
      { email: 'admin1@yopmail.com', role: 'Admin Secondaire', iconKey: 'admin' },
    ],
  },
  {
    label: 'Agents',
    key: 'agents',
    accounts: [
      { email: 'testagent@yopmail.com', role: 'Test Agent', iconKey: 'agent' },
      { email: 'sirine@yopmail.com', role: 'Sirine Agent', iconKey: 'agent' },
    ],
  },
  {
    label: 'RH',
    key: 'rh',
    accounts: [
      { email: 'rh@yopmail.com', role: 'RH Principal', iconKey: 'rh' },
      { email: 'rhTest@yopmail.com', role: 'RH Test', iconKey: 'rh' },
    ],
  },
  {
    label: 'Praticiens',
    key: 'praticiens',
    accounts: [
      { email: 'pharmacien@yopmail.com', role: 'Pharmacie', iconKey: 'pharmacie' },
      { email: 'medecin@yopmail.com', role: 'Médecin', iconKey: 'medecin' },
      { email: 'labo@yopmail.com', role: 'Labo', iconKey: 'labo' },
      { email: 'clinique@yopmail.com', role: 'Clinique', iconKey: 'clinique' },
    ],
  },
  {
    label: 'Assurance',
    key: 'assurance',
    accounts: [
      { email: 'adminassureur@yopmail.com', role: 'Admin Assureur', iconKey: 'assureur' },
      { email: 'adminassureur2@yopmail.com', role: 'Admin Assureur 2', iconKey: 'assureur' },
    ],
  },
];
const DEMO_PASSWORD = 'Password123!';

export function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error } = useAuth();
  const { supportsPasskey, isLoading: passkeyLoading, error: passkeyError, setError: setPasskeyError, loginWithPasskey } = usePasskey();
  const [selectedOrg, setSelectedOrg] = useState<TenantCode | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [demoTab, setDemoTab] = useState('admins');
  const [selectedDemo, setSelectedDemo] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>();
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  // Load Material Symbols font for demo icons
  useEffect(() => {
    const id = 'material-symbols-font';
    if (!document.getElementById(id)) {
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap';
      document.head.appendChild(link);
    }
  }, []);

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

  const handlePasskeyLogin = async () => {
    if (!supportsPasskey) {
      setPasskeyError('Votre navigateur ne supporte pas les Passkeys');
      return;
    }
    const result = await loginWithPasskey();
    if (result.success && result.redirectTo) {
      navigate(result.redirectTo);
    } else if (result.cancelled) {
      // NotAllowedError: no passkeys on device OR user cancelled the prompt
      setPasskeyError('Aucune Passkey trouvée sur cet appareil. Connectez-vous avec vos identifiants puis créez une Passkey depuis votre profil.');
    } else if (result.error) {
      setPasskeyError(result.error);
    }
  };

  const onSubmit = async (data: LoginFormValues) => {
    const result = await login({
      email: data.email,
      password: data.password,
      turnstileToken,
    } as Parameters<typeof login>[0]);

    if (result.requiresMfa && result.mfaToken) {
      navigate(`/mfa/verify?token=${result.mfaToken}&methods=email,totp`);
    } else if (result.success && result.hasPasskey === false && supportsPasskey) {
      // User has no passkey yet — invite them to create one
      navigate('/auth/passkey/invite');
    } else if (result.redirectTo) {
      navigate(result.redirectTo);
    }
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
                  <svg
                    className="w-6 h-6 text-white"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5zm0 2.18l7 3.82v5c0 4.52-3.13 8.69-7 9.93C8.13 21.69 5 17.52 5 13V8l7-3.82z" />
                    <path d="M12 7l-4 2.18v3.64c0 2.6 1.8 5 4 5.72 2.2-.72 4-3.12 4-5.72V9.18L12 7z" />
                  </svg>
                </div>
                <span className="text-2xl font-bold tracking-tight">
                  E-Santé
                </span>
              </div>
              <p className="text-sm text-blue-200/70 max-w-xs mt-1">
                Plateforme de gestion d'assurance propulsée par l'intelligence
                artificielle
              </p>
            </div>

            {/* Feature bullets */}
            <div className="space-y-6 my-auto py-12">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 border border-blue-400/20">
                  <svg
                    className="w-5 h-5 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">
                    Intégration de l'Ecosysteme Numerique
                  </h3>
                  <p className="text-xs text-blue-200/50 leading-relaxed">
                    Connectez pharmacies, cliniques et laboratoires en temps
                    réel
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 border border-emerald-400/20">
                  <svg
                    className="w-5 h-5 text-emerald-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">
                    Vérification Automatisée
                  </h3>
                  <p className="text-xs text-blue-200/50 leading-relaxed">
                    Automatisez la vérification d'éligibilite et la tarification
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0 border border-amber-400/20">
                  <svg
                    className="w-5 h-5 text-amber-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">
                    Sécurité de Grade Institutionnel
                  </h3>
                  <p className="text-xs text-blue-200/50 leading-relaxed">
                    Chiffrement AES-256, audit trail complet, détection de
                    fraude IA
                  </p>
                </div>
              </div>
            </div>

            {/* Footer */}
            <p className="text-[10px] text-blue-200/30 uppercase tracking-widest">
              &copy; 2024 E-SANTE &bull; VERSION 4.0.2
            </p>
          </div>
        </div>

        {/* ==================== RIGHT PANEL ==================== */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 bg-[#f3f4f5] overflow-y-auto">
          <div className="w-full max-w-md">
            {/* Mobile logo */}
            <div className="lg:hidden flex items-center justify-center gap-2 mb-6">
              <div className="w-9 h-9 bg-[#0A1628] rounded-lg flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-white"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
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
                  <div
                    key={org.code}
                    className="flex flex-col items-center gap-1"
                  >
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
                      <span className="text-[9px] font-bold text-green-600 uppercase tracking-wider">
                        Active
                      </span>
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

              {/* Passkey login */}
              {supportsPasskey && (
                <div className="mb-6">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest text-center mb-3">
                    Connexion avec Passkey
                  </p>
                  <button
                    type="button"
                    onClick={handlePasskeyLogin}
                    disabled={passkeyLoading}
                    className="w-full h-12 flex items-center justify-center gap-3 rounded-xl border-2 border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300 transition-all disabled:opacity-50"
                  >
                    {passkeyLoading ? (
                      <svg
                        className="animate-spin w-5 h-5 text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5"
                        viewBox="0 0 512 512"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <path
                          d="M0 0 C1.67985177 1.5065135 3.34967653 3.02430519 5.0078125 4.5546875 C7.00801935 6.38849933 9.05515113 8.13146742 11.13671875 9.87109375 C51.53067833 45.31719884 75.85294692 102.64775674 79.46362305 155.58105469 C81.03459199 183.01594157 79.87326716 209.19634398 60.88671875 230.93359375 C59.36465422 232.51519482 57.82297843 234.07817101 56.26171875 235.62109375 C55.5140625 236.39066406 54.76640625 237.16023438 53.99609375 237.953125 C39.5283326 252.01368095 20.39948758 257.91731794 0.52246094 257.93579102 C-20.23135554 257.58265016 -38.12714611 248.54939247 -53.046875 234.4375 C-70.49015855 215.90613639 -75.00286379 193.2046778 -75.27246094 168.70214844 C-75.59325097 152.34185678 -80.96608128 138.04560524 -92.6171875 126.390625 C-103.57761815 116.20782798 -117.39916569 111.89763768 -132.21875 112.2734375 C-146.60216693 113.69421897 -158.56154277 120.62225919 -167.73828125 131.62109375 C-179.57649223 147.51934099 -183.81570609 166.78686346 -181.2421875 186.40234375 C-176.25374118 213.23285729 -163.48796161 237.05922123 -145.73828125 257.62109375 C-145.09117187 258.37777344 -144.4440625 259.13445312 -143.77734375 259.9140625 C-141.47936555 262.53239082 -139.12499121 265.08323721 -136.73828125 267.62109375 C-135.95155029 268.45882324 -135.95155029 268.45882324 -135.14892578 269.31347656 C-118.17856759 287.23332653 -98.03834785 304.47994497 -73.04296875 308.58203125 C-68.0686027 310.14607542 -65.69055822 313.14342259 -62.92578125 317.43359375 C-60.85303416 322.9972833 -60.98402068 327.49860588 -63.30078125 332.87109375 C-65.61161229 336.90512182 -68.21138828 339.37735694 -72.73828125 340.62109375 C-94.70153829 343.58528654 -116.23107609 329.55962889 -133.02978516 316.92919922 C-139.35573192 312.04963397 -145.32375013 306.9023091 -151.02050781 301.30371094 C-152.94869527 299.4149861 -154.90259105 297.55457895 -156.85546875 295.69140625 C-166.53009284 286.35529093 -174.96473781 276.58330588 -182.73828125 265.62109375 C-183.18220215 265.00588867 -183.62612305 264.39068359 -184.08349609 263.75683594 C-206.16940482 232.97851475 -220.54314015 194.93877379 -214.67578125 156.68359375 C-211.26215501 137.07668527 -202.7917849 118.78311867 -188.73828125 104.62109375 C-187.89265625 103.73421875 -187.04703125 102.84734375 -186.17578125 101.93359375 C-185.37140625 101.17046875 -184.56703125 100.40734375 -183.73828125 99.62109375 C-182.88363281 98.80898438 -182.88363281 98.80898438 -182.01171875 97.98046875 C-166.01046434 83.31796471 -145.20621202 77.66987911 -123.84765625 78.26953125 C-101.51428205 79.4480958 -82.57892296 89.04141813 -66.73828125 104.62109375 C-65.96613281 105.38035156 -65.19398438 106.13960937 -64.3984375 106.921875 C-47.06516748 125.02551258 -41.44864625 148.22823496 -41.20410156 172.58837891 C-40.95397494 186.65082542 -38.06251988 201.29685512 -27.73828125 211.62109375 C-16.47298977 220.70399482 -5.17558704 224.76003676 9.26171875 223.62109375 C20.18503298 221.28989864 30.37697215 215.54820537 37.26171875 206.62109375 C51.65370546 182.28072914 46.46911338 151.36644724 39.9453125 125.12890625 C32.11008391 95.53824127 18.42076654 68.70270531 -1.73828125 45.62109375 C-2.19315918 45.09918457 -2.64803711 44.57727539 -3.11669922 44.03955078 C-9.77882943 36.45144457 -16.69130151 29.76730175 -24.73828125 23.62109375 C-26.12080078 22.51507813 -26.12080078 22.51507813 -27.53125 21.38671875 C-35.45695579 15.1830624 -43.83665884 10.25765809 -52.73828125 5.62109375 C-53.4152002 5.2662793 -54.09211914 4.91146484 -54.78955078 4.54589844 C-77.62565388 -7.25629658 -102.44549847 -12.60714904 -128.05078125 -12.62890625 C-129.12082901 -12.62991837 -129.12082901 -12.62991837 -130.2124939 -12.63095093 C-141.62963176 -12.61382514 -152.58850741 -11.95749407 -163.73828125 -9.37890625 C-164.91753174 -9.11352051 -164.91753174 -9.11352051 -166.12060547 -8.84277344 C-177.07162058 -6.32314787 -187.48555182 -3.0167873 -197.73828125 1.62109375 C-198.36766602 1.90291504 -198.99705078 2.18473633 -199.64550781 2.47509766 C-243.26459067 22.31290757 -275.81835071 59.76865541 -292.5546875 104.3203125 C-296.1937639 114.53242245 -298.68917619 124.98698975 -300.73828125 135.62109375 C-300.95355469 136.71550781 -301.16882813 137.80992187 -301.390625 138.9375 C-306.72576922 169.42960165 -303.04803764 201.56217862 -292.73828125 230.62109375 C-292.11179687 232.39613281 -292.11179687 232.39613281 -291.47265625 234.20703125 C-284.79692954 251.8938704 -275.54264018 267.94608919 -264.00390625 282.86328125 C-260.20538452 288.17694367 -259.67506493 293.19257283 -260.73828125 299.62109375 C-263.19395677 304.62339573 -266.73531195 308.1196091 -271.73828125 310.62109375 C-277.60642523 311.38460691 -282.73861668 311.17759024 -287.625 307.65234375 C-322.69916613 273.93965172 -336.6723032 216.23985438 -337.70214844 169.47412109 C-338.1767215 132.0020886 -328.37140375 95.52467405 -310.73828125 62.62109375 C-310.41891602 62.02103516 -310.09955078 61.42097656 -309.77050781 60.80273438 C-302.07074598 46.46632504 -292.49597017 33.7852121 -281.73828125 21.62109375 C-281.26712891 21.08677734 -280.79597656 20.55246094 -280.31054688 20.00195312 C-274.80283391 13.78793044 -269.21384058 7.84620025 -262.73828125 2.62109375 C-261.7225 1.7909375 -260.70671875 0.96078125 -259.66015625 0.10546875 C-233.02394516 -21.41338431 -202.4701407 -36.70204324 -168.73828125 -43.37890625 C-167.93406738 -43.54116699 -167.12985352 -43.70342773 -166.30126953 -43.87060547 C-108.17182692 -55.02676112 -44.71975562 -38.85068641 0 0 Z "
                          fill="#2096F3"
                          transform="translate(384.73828125,171.37890625)"
                        />
                        <path
                          d="M0 0 C2.97627192 2.65175775 5.82874228 5.41743746 8.6796875 8.203125 C9.52917969 8.99074219 10.37867188 9.77835938 11.25390625 10.58984375 C35.21874931 33.35080144 49.14005186 65.88362947 53.6796875 98.203125 C53.87691406 99.58371094 53.87691406 99.58371094 54.078125 100.9921875 C54.36832814 103.40008923 54.5524122 105.78115085 54.6796875 108.203125 C54.74414062 109.33621094 54.80859375 110.46929687 54.875 111.63671875 C55.29319526 124.80986945 55.29319526 124.80986945 50.6796875 130.203125 C46.91677889 133.6602442 43.24961986 135.49411407 38.1171875 135.765625 C32.19726207 135.39818135 28.34510763 133.00002567 24.3046875 128.640625 C22.0378467 125.2403638 21.53747057 122.46688092 21.28515625 118.4765625 C18.95176191 85.24276673 8.88100408 57.84657095 -14.3203125 33.203125 C-14.87074219 32.58824219 -15.42117188 31.97335938 -15.98828125 31.33984375 C-34.76413064 11.1731907 -63.61620646 1.57987863 -90.4140625 0.0234375 C-120.18851257 -0.6969121 -148.50875474 10.84458292 -170.125 31.10546875 C-171.21167969 32.14380859 -171.21167969 32.14380859 -172.3203125 33.203125 C-172.92101562 33.74066406 -173.52171875 34.27820313 -174.140625 34.83203125 C-195.3044032 54.47004869 -206.05191243 85.34617658 -207.59765625 113.53515625 C-208.14204724 129.6465372 -204.70415656 145.10495362 -199.3203125 160.203125 C-198.91296875 161.36585938 -198.505625 162.52859375 -198.0859375 163.7265625 C-185.02631695 198.52661019 -162.20988376 229.35542787 -137.3828125 256.640625 C-126.88504534 268.22436808 -126.88504534 268.22436808 -127.046875 277.01171875 C-127.73972084 282.5643833 -130.09971398 286.20671805 -134.3828125 289.703125 C-139.06193869 291.95715568 -144.27267541 292.14609017 -149.3203125 291.203125 C-154.50218995 288.71605464 -157.84794362 285.97902445 -161.6953125 281.640625 C-162.16590088 281.11251221 -162.63648926 280.58439941 -163.12133789 280.0402832 C-167.67754473 274.88828247 -172.01837565 269.56806117 -176.3203125 264.203125 C-177.21875576 263.11871634 -178.11855979 262.03543404 -179.01953125 260.953125 C-214.99550726 217.37341304 -246.39138256 160.99264567 -240.859375 102.75 C-238.74153697 83.96591605 -233.65631651 66.16258143 -225.3203125 49.203125 C-224.77632812 48.08679688 -224.23234375 46.97046875 -223.671875 45.8203125 C-216.7713586 32.37564439 -207.75714737 21.03323191 -197.3203125 10.203125 C-196.17175781 8.94242188 -196.17175781 8.94242188 -195 7.65625 C-187.70566495 -0.10788968 -179.19263587 -5.98900543 -170.3203125 -11.796875 C-169.72734375 -12.18649414 -169.134375 -12.57611328 -168.5234375 -12.97753906 C-117.65527672 -45.75065901 -45.47243525 -39.18047895 0 0 Z "
                          fill="#2096F3"
                          transform="translate(349.3203125,220.796875)"
                        />
                        <path
                          d="M0 0 C0.63067383 0.56895996 1.26134766 1.13791992 1.91113281 1.72412109 C9.6996062 8.78543884 17.22775809 15.93999732 24 24 C24.48678223 24.57443848 24.97356445 25.14887695 25.47509766 25.74072266 C29.42022604 30.41469882 33.24948573 35.16861629 37 40 C37.51401367 40.65758301 38.02802734 41.31516602 38.55761719 41.99267578 C43.95620345 49.01999404 48.48460989 55.16588921 47.59765625 64.47265625 C46.75014092 68.05659363 45.49857278 70.29884023 43 73 C42.29875 73.763125 41.5975 74.52625 40.875 75.3125 C35.55306794 78.43624273 30.21596044 78.56337977 24.3125 77.0625 C17.25889026 72.67062978 12.9929666 65.64100358 8.2265625 58.98828125 C4.08770422 53.43349777 -0.44233613 48.21287812 -5 43 C-5.44166504 42.4937207 -5.88333008 41.98744141 -6.33837891 41.46582031 C-11.56168657 35.51027326 -16.92019092 30.06650757 -23 25 C-23.92039062 24.19175781 -24.84078125 23.38351563 -25.7890625 22.55078125 C-39.65993151 10.41872947 -54.62675748 0.43164928 -71 -8 C-71.80920898 -8.42023438 -72.61841797 -8.84046875 -73.45214844 -9.2734375 C-125.63029065 -36.08353782 -184.75058225 -40.62483826 -241 -25 C-241.88042969 -24.75830078 -242.76085937 -24.51660156 -243.66796875 -24.26757812 C-277.20012628 -14.79333147 -308.08842332 3.83804711 -333.3828125 27.5703125 C-335.48061379 29.51782355 -337.60309773 31.37088035 -339.8125 33.1875 C-343.6369743 36.43555832 -346.76437455 40.178299 -350 44 C-350.91772905 45.04562605 -351.8371288 46.08978711 -352.7578125 47.1328125 C-358.42831454 53.59643035 -363.75898327 60.12735931 -368.52661133 67.29345703 C-371.66936568 71.91012555 -375.05863952 76.05440034 -380.52734375 77.8125 C-386.13878912 78.2490468 -390.03276033 78.01930254 -395 75 C-399.15949218 71.02537414 -401.83364744 66.81255426 -402 61 C-400.93342901 54.98674634 -399.11142948 51.00627017 -395.4375 46.1875 C-394.99349854 45.58711914 -394.54949707 44.98673828 -394.09204102 44.36816406 C-387.84076917 35.98868145 -381.14513126 28.03187308 -374.09375 20.31640625 C-372.29965017 18.33151595 -370.58598419 16.30579989 -368.875 14.25 C-359.21329475 3.20486351 -347.73848462 -6.2596429 -336 -15 C-335.38527832 -15.46583496 -334.77055664 -15.93166992 -334.13720703 -16.41162109 C-296.42711448 -44.85047437 -250.79372425 -61.80299788 -204 -67 C-202.845 -67.13148437 -201.69 -67.26296875 -200.5 -67.3984375 C-127.57126865 -74.01207245 -54.1680355 -48.99840941 0 0 Z "
                          fill="#2096F3"
                          transform="translate(433,130)"
                        />
                        <path
                          d="M0 0 C3.07344483 0.00314853 6.14591221 -0.02035842 9.21923828 -0.0456543 C27.1251353 -0.10296504 44.76505462 1.74047382 62.28564453 5.50317383 C63.7486499 5.81617432 63.7486499 5.81617432 65.24121094 6.13549805 C111.61653724 16.4632412 169.12007621 40.62089347 199.47314453 79.31567383 C201.66225094 83.69388665 201.21977083 89.85090749 199.82470703 94.45629883 C197.91841025 98.20371985 195.29472691 100.78823707 191.52783203 102.65551758 C186.10214145 104.39875277 181.19374711 104.02234989 175.97314453 101.87817383 C173.13655946 99.99796033 170.71675802 97.74941597 168.22314453 95.44067383 C121.48135776 52.44105427 55.07762076 31.14695745 -7.77685547 33.50317383 C-68.25536476 36.68352413 -121.83749122 61.37674235 -167.24169922 100.52270508 C-171.81340981 104.10973954 -176.95649427 103.91673104 -182.52685547 103.31567383 C-186.44525736 102.02186188 -189.08819304 99.76558402 -191.96435547 96.81567383 C-194.22731918 91.74663512 -194.49400979 86.77725115 -193.52685547 81.31567383 C-182.43675479 61.52992604 -155.50271919 47.30557049 -136.52685547 36.31567383 C-135.37032471 35.64544189 -135.37032471 35.64544189 -134.19042969 34.96166992 C-93.54518712 11.764655 -46.66063101 -0.09943465 0 0 Z "
                          fill="#2096F3"
                          transform="translate(252.52685546875,-0.315673828125)"
                        />
                        <path
                          d="M0 0 C4.09596922 1.65551369 6.27112592 3.85862164 8.62890625 7.55078125 C10.42926941 12.07989996 10.60403491 16.23219745 10.875 21.0625 C13.29008537 52.61628675 25.61758264 80.73436056 47 104 C47.80050781 104.88300781 48.60101563 105.76601563 49.42578125 106.67578125 C63.55803153 121.54818212 82.1187709 132.53492218 102.75317383 134.60571289 C108.96822639 135.24933063 113.30551126 135.8601189 117.80078125 140.3671875 C121.66647891 145.6305804 121.71232125 150.63419238 121 157 C119.73750625 161.12767418 117.44784262 163.61186973 114.1875 166.4375 C102.97235881 171.93791956 87.03390071 167.00582888 75.85009766 163.28466797 C59.21825763 157.40725082 44.85615855 147.98183776 32 136 C31.04843018 135.11417236 31.04843018 135.11417236 30.07763672 134.21044922 C15.54864248 120.52473396 4.11652338 105.75053288 -5 88 C-5.35046387 87.32888184 -5.70092773 86.65776367 -6.06201172 85.96630859 C-16.79237872 65.21301695 -27.62706913 34.48842276 -22.5390625 10.859375 C-18.7575127 0.62694614 -9.76297261 -1.09864653 0 0 Z "
                          fill="#2096F3"
                          transform="translate(261,313)"
                        />
                      </svg>
                    )}
                    <span className="text-sm font-semibold text-[#0A1628]">
                      Utiliser votre Passkey
                    </span>
                  </button>
                  <p className="text-[10px] text-gray-400 text-center mt-2">
                    La méthode la plus sûre et la plus rapide sans mot de passe.
                  </p>
                  {passkeyError && (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-100 mt-2">
                      <svg
                        className="w-4 h-4 text-amber-500 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <p className="text-amber-700 text-xs">{passkeyError}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Separator */}
              <div className="flex items-center gap-3 mb-6">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                  Ou par identifiants
                </span>
                <div className="h-px flex-1 bg-gray-200" />
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
                      Clé d'accès
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
                  <span className="text-sm text-gray-600">
                    Rester connecte sur cet appareil
                  </span>
                </label>

                {/* Cloudflare Turnstile */}
                <Turnstile
                  ref={turnstileRef}
                  siteKey={TURNSTILE_SITE_KEY}
                  onSuccess={setTurnstileToken}
                  onExpire={() => setTurnstileToken(undefined)}
                  options={{ theme: "light", size: "flexible" }}
                />

                {/* Error display */}
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-100">
                    <svg
                      className="w-5 h-5 text-red-500 flex-shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
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
                      <svg
                        className="animate-spin w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      Connexion en cours...
                    </>
                  ) : (
                    <>Se connecter</>
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
            {(import.meta.env.DEV || import.meta.env.VITE_ENV !== "prod") && (
              <div className="mt-8 w-full">
                <div className="flex items-center gap-2 mb-5">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                    Comptes Demo
                  </span>
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
                          ? "text-[#0A1628] border-b-2 border-[#0A1628]"
                          : "text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Accounts grid - cards with colored shield icons */}
                <div className={`grid gap-3 ${
                  (DEMO_CATEGORIES.find((c) => c.key === demoTab)?.accounts.length ?? 0) <= 2
                    ? 'grid-cols-2'
                    : 'grid-cols-2 sm:grid-cols-4'
                }`}>
                  {DEMO_CATEGORIES.find((c) => c.key === demoTab)?.accounts.map(
                    (account) => (
                      <button
                        key={account.email}
                        type="button"
                        onClick={() => fillDemoAccount(account.email)}
                        className={`flex flex-col items-center gap-2.5 rounded-2xl border p-4 transition-all ${
                          selectedDemo === account.email
                            ? "border-blue-500 bg-blue-50 shadow-sm"
                            : "border-gray-200 bg-gray-50/50 hover:shadow-sm hover:border-gray-300 hover:bg-white"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 shadow-sm flex items-center justify-center">
                          <span className="material-symbols-outlined text-xl text-gray-600">{DEMO_ICON[account.iconKey]}</span>
                        </div>
                        <span className="text-[10px] font-bold text-gray-700 uppercase tracking-wider text-center leading-tight">
                          {account.role}
                        </span>
                      </button>
                    ),
                  )}
                </div>

                <p className="text-center text-[10px] text-gray-400 mt-3">
                  Mot de passe :{" "}
                  <code className="px-1 py-0.5 bg-gray-100 rounded text-gray-600 font-mono">
                    {DEMO_PASSWORD}
                  </code>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==================== BOTTOM FOOTER ==================== */}
      <footer className="border-t border-gray-100 bg-white px-6 sm:px-10 py-4">
        <div className="max-w-screen-xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[10px] text-gray-400">
            &copy; 2024 AssurArchitect. Securité de niveau bancaire.
          </span>
          <div className="flex items-center gap-4 text-[10px] text-gray-400 uppercase tracking-wider">
            <a href="#" className="hover:text-gray-600 transition-colors">
              Mentions legales
            </a>
            <a href="#" className="hover:text-gray-600 transition-colors">
              Confidentialite
            </a>
            <a href="#" className="hover:text-gray-600 transition-colors">
              Support
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
