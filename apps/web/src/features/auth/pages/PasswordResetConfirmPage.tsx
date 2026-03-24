import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { Shield, Loader2, Eye, EyeOff, Lock, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export function PasswordResetConfirmPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-md w-full text-center">
          <Shield className="h-8 w-8 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Lien invalide</h1>
          <p className="text-sm text-gray-500 mb-6">
            Ce lien de réinitialisation est invalide ou a expiré.
          </p>
          <Link
            to="/auth/reset-password"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            Demander un nouveau lien
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 8) {
      setErrorMsg('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMsg('Les mots de passe ne correspondent pas');
      return;
    }

    setIsLoading(true);
    try {
      const res = await apiClient.post('/auth/password-reset/confirm', {
        token,
        newPassword: password,
      });

      if (res.success) {
        setIsSuccess(true);
        setTimeout(() => navigate('/login', { replace: true }), 3000);
      } else {
        setErrorMsg(res.error?.message || 'Erreur lors de la réinitialisation');
      }
    } catch {
      toast.error('Erreur réseau');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="relative w-full max-w-md">
          <div className="absolute left-0 top-8 bottom-8 w-0.5 bg-gradient-to-b from-blue-500 to-blue-300 rounded-full hidden sm:block" />

          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-5 sm:p-8 sm:ml-6">
            <div className="flex justify-center mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600">
                <Shield className="h-5 w-5 text-white" />
              </div>
            </div>

            {isSuccess ? (
              <>
                <div className="flex justify-center mb-5">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
                  Mot de passe réinitialisé
                </h1>
                <p className="text-sm text-gray-500 text-center mb-6">
                  Votre mot de passe a été mis à jour. Vous allez être redirigé vers la page de connexion...
                </p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
                  Nouveau mot de passe
                </h1>
                <p className="text-sm text-gray-500 text-center mb-8">
                  Choisissez un nouveau mot de passe sécurisé.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Nouveau mot de passe
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min. 8 caractères"
                        required
                        minLength={8}
                        className="w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Confirmer le mot de passe
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        id="confirm"
                        type={showPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Retapez le mot de passe"
                        required
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none text-sm"
                      />
                    </div>
                  </div>

                  {errorMsg && (
                    <p className="text-sm text-red-600 text-center">{errorMsg}</p>
                  )}

                  <button
                    type="submit"
                    disabled={isLoading || !password || !confirmPassword}
                    className="w-full py-3 bg-[#0A1628] text-white font-semibold rounded-xl hover:bg-[#162440] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Réinitialisation...
                      </>
                    ) : (
                      'Réinitialiser le mot de passe'
                    )}
                  </button>
                </form>

                <div className="mt-5 text-center">
                  <Link
                    to="/login"
                    className="text-sm text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Retour à la connexion
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <footer className="border-t border-gray-200 bg-white py-4 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="text-xs text-gray-400">
            <span className="font-semibold text-gray-600">Dhamen</span>
            <span className="mx-2">|</span>
            © {new Date().getFullYear()} Dhamen. All rights reserved.
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

export default PasswordResetConfirmPage;
