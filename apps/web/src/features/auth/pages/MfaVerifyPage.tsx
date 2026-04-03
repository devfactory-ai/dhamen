import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { setTokens, setUser, setPermissions, type UserPermissions } from '@/lib/auth';
import type { UserPublic, AuthTokens } from '@dhamen/shared';
import { Shield, Loader2, RefreshCw, ArrowRightLeft, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

interface MfaVerifyResponse {
  user: UserPublic;
  tokens: AuthTokens;
  permissions?: UserPermissions;
  tenantCode?: string;
}

export function MfaVerifyPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mfaToken = searchParams.get('token');
  const methodsParam = searchParams.get('methods') || 'email,totp';
  const availableMethods = methodsParam.split(',');

  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [method, setMethod] = useState<'email' | 'totp'>(
    availableMethods.includes('email') ? 'email' : 'totp'
  );
  const [emailSent, setEmailSent] = useState(false);
  const emailSendingRef = useRef(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Redirect if no MFA token
  useEffect(() => {
    if (!mfaToken) {
      navigate('/login', { replace: true });
    }
  }, [mfaToken, navigate]);

  // Auto-send email code on mount if method is email
  useEffect(() => {
    if (method === 'email' && mfaToken && !emailSent) {
      sendEmailCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, mfaToken]);

  // Focus first input
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, [method]);

  const sendEmailCode = async () => {
    if (!mfaToken || emailSendingRef.current) return;
    emailSendingRef.current = true;
    setIsResending(true);
    try {
      const res = await apiClient.post('/auth/mfa/email/send', { mfaToken });
      if (res.success) {
        setEmailSent(true);
        toast.success('Code envoyé à votre adresse email');
      } else {
        toast.error(res.error?.message || 'Erreur lors de l\'envoi du code');
      }
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setIsResending(false);
      emailSendingRef.current = false;
    }
  };

  const handleCodeChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    setErrorMsg(null);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      const newCode = pasted.split('');
      setCode(newCode);
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify = async () => {
    const otpCode = code.join('');
    if (otpCode.length !== 6) {
      setErrorMsg('Veuillez entrer les 6 chiffres');
      return;
    }
    if (!mfaToken) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await apiClient.post<MfaVerifyResponse>('/auth/mfa/email/verify', {
        mfaToken,
        otpCode,
        method,
      });

      if (res.success) {
        const { tokens: resTokens, user: resUser, permissions: resPermissions } = res.data;
        if (resTokens && resUser) {
          setTokens(resTokens);
          setUser(resUser);
          if (resPermissions) {
            setPermissions(resPermissions);
          }
          localStorage.setItem('isAuthenticated', 'true');
          navigate('/auth/success', { replace: true });
        } else {
          setErrorMsg('Réponse invalide');
          setCode(['', '', '', '', '', '']);
          inputRefs.current[0]?.focus();
        }
      } else {
        setErrorMsg(res.error?.message || 'Code invalide');
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch {
      setErrorMsg('Erreur de vérification');
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-submit when all 6 digits entered
  useEffect(() => {
    if (code.every((d) => d !== '')) {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const switchMethod = () => {
    const next = method === 'email' ? 'totp' : 'email';
    setMethod(next);
    setCode(['', '', '', '', '', '']);
    setErrorMsg(null);
    if (next === 'email') {
      setEmailSent(false); // Will trigger auto-send via useEffect
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Main content */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="relative w-full max-w-md">
          {/* Vertical blue line */}
          <div className="absolute left-0 top-8 bottom-8 w-0.5 bg-gradient-to-b from-blue-500 to-blue-300 rounded-full hidden sm:block" />

          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5 sm:p-8 sm:ml-6">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600">
                <Shield className="h-5 w-5 text-white" />
              </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
              Vérification de sécurité
            </h1>
            <p className="text-sm text-gray-500 text-center mb-8">
              {method === 'email'
                ? 'Un code a été envoyé à votre adresse email. Veuillez le saisir ci-dessous pour continuer.'
                : 'Entrez le code de votre application d\'authentification.'}
            </p>

            {/* 6-digit code input */}
            <div className="flex justify-center gap-1.5 sm:gap-2 mb-6" onPaste={handlePaste}>
              {code.map((digit, idx) => (
                <input
                  key={idx}
                  ref={(el) => { inputRefs.current[idx] = el; }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleCodeChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                  className={`w-10 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-bold border-2 rounded-lg transition-colors
                    ${digit ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-gray-50'}
                    focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:outline-none`}
                />
              ))}
            </div>

            {errorMsg && (
              <p className="text-sm text-red-600 text-center mb-4">{errorMsg}</p>
            )}

            {/* Verify button */}
            <button
              type="button"
              onClick={handleVerify}
              disabled={isLoading || code.some((d) => !d)}
              className="w-full py-3 bg-[#0A1628] text-white font-semibold rounded-xl hover:bg-[#162440] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Vérification...
                </>
              ) : (
                'Vérifier'
              )}
            </button>

            {/* Actions */}
            <div className="mt-5 flex flex-col items-center gap-3">
              {method === 'email' && (
                <button
                  type="button"
                  onClick={sendEmailCode}
                  disabled={isResending}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1.5"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isResending ? 'animate-spin' : ''}`} />
                  Renvoyer le code
                </button>
              )}

              <button
                type="button"
                onClick={() => navigate('/login', { replace: true })}
                className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Retour à la connexion
              </button>

              {availableMethods.length > 1 && (
                <button
                  type="button"
                  onClick={switchMethod}
                  className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5"
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                  {method === 'email'
                    ? 'Utiliser une application d\'authentification'
                    : 'Recevoir un code par email'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-4 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="text-xs text-gray-400">
            <span className="font-semibold text-gray-600">E-Santé</span>
            <span className="mx-2">|</span>
            © {new Date().getFullYear()} E-Santé. All rights reserved.
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

export default MfaVerifyPage;
