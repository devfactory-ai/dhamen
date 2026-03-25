import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { setTokens, setUser } from '@/lib/auth';
import { setTenant, type TenantCode } from '@/lib/tenant';
import { useAgentContext } from '@/features/agent/stores/agent-context';
import { Shield, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

type VerifyState = 'loading' | 'success' | 'error';

export function MagicLinkVerifyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const tenantParam = searchParams.get('tenant');
  const [state, setState] = useState<VerifyState>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Set tenant from URL param before verifying (so API client sends correct X-Tenant-Code)
    if (tenantParam) {
      setTenant(tenantParam.toUpperCase() as TenantCode);
    }

    if (!token) {
      setState('error');
      setErrorMessage('Lien de connexion invalide. Aucun token fourni.');
      return;
    }

    const verify = async () => {
      try {
        const res = await apiClient.post('/auth/magic-link/verify', { token });
        if (res.success && res.data) {
          const data = res.data as {
            user: Parameters<typeof setUser>[0];
            tokens: Parameters<typeof setTokens>[0];
            expiresIn: number;
            tenantCode?: string;
          };

          // Store tokens and user
          setTokens({ ...data.tokens, expiresIn: data.expiresIn });
          setUser(data.user);

          setState('success');

          // Animate progress bar
          const interval = setInterval(() => {
            setProgress((prev) => {
              if (prev >= 100) {
                clearInterval(interval);
                return 100;
              }
              return prev + 2;
            });
          }, 50);

          // Redirect after 2.5 seconds
          setTimeout(() => {
            const agentRoles = ['INSURER_AGENT', 'INSURER_ADMIN'];
            if (agentRoles.includes(data.user.role)) {
              useAgentContext.getState().clearIfDifferentUser(data.user.id);
              if (useAgentContext.getState().isContextReady()) {
                navigate('/bulletins/saisie', { replace: true });
              } else {
                navigate('/select-context', { replace: true });
              }
            } else {
              navigate('/dashboard', { replace: true });
            }
          }, 2500);

        } else {
          setState('error');
          const errData = res as { error?: { message?: string } };
          setErrorMessage(errData.error?.message || 'Le lien de connexion est invalide ou a expiré.');
        }
      } catch {
        setState('error');
        setErrorMessage('Erreur de connexion au serveur. Veuillez réessayer.');
      }
    };

    verify();
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-10 max-w-sm w-full text-center">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <Shield className="h-5 w-5 text-blue-600" />
            <span className="font-bold text-gray-900 tracking-wide">DHAMEN</span>
          </div>

          {state === 'loading' && (
            <>
              <div className="flex justify-center mb-5">
                <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center">
                  <Loader2 className="h-10 w-10 text-blue-600 animate-spin" />
                </div>
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Vérification en cours...</h1>
              <p className="text-sm text-gray-500">
                Nous vérifions votre lien de connexion.
              </p>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="flex justify-center mb-5">
                <div className="w-20 h-20 rounded-full bg-[#0A1628] flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-white" />
                </div>
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Connexion réussie !</h1>
              <p className="text-sm text-gray-500 mb-6">
                Vous allez être redirigé vers votre tableau de bord...
              </p>
              <div className="w-full bg-gray-200 rounded-full h-1.5 mb-6 overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all duration-75 ease-linear"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="flex justify-center mb-5">
                <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center">
                  <XCircle className="h-10 w-10 text-red-600" />
                </div>
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Lien invalide</h1>
              <p className="text-sm text-gray-500 mb-6">
                {errorMessage}
              </p>
              <div className="space-y-3">
                <Link
                  to="/auth/magic-link"
                  className="w-full py-3 bg-[#0A1628] text-white font-semibold rounded-xl hover:bg-[#162440] transition-colors flex items-center justify-center gap-2"
                >
                  Demander un nouveau lien
                </Link>
                <Link
                  to="/login"
                  className="w-full py-3 border border-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                >
                  Retour à la connexion
                </Link>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-4 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="text-xs text-gray-400">
            <span className="font-semibold text-gray-600">Dhamen</span>
            <span className="mx-2">|</span>
            &copy; {new Date().getFullYear()} Dhamen. All rights reserved.
          </div>
          <div className="flex items-center gap-4 text-[10px] text-gray-400 uppercase tracking-wider">
            <span>Politique de confidentialité</span>
            <span>Conditions d'utilisation</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default MagicLinkVerifyPage;
