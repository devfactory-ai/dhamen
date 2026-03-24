import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '@/lib/api-client';
import { Shield, Loader2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

export function PasswordResetPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    try {
      const res = await apiClient.post('/auth/password-reset/request', { email });
      if (res.success) {
        setIsSent(true);
      } else {
        // Always show success to prevent email enumeration
        setIsSent(true);
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
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600">
                <Shield className="h-5 w-5 text-white" />
              </div>
            </div>

            {isSent ? (
              <>
                <div className="flex justify-center mb-5">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                  </div>
                </div>
                <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
                  Email envoyé
                </h1>
                <p className="text-sm text-gray-500 text-center mb-6">
                  Si un compte existe avec l'adresse <strong>{email}</strong>, vous recevrez un lien de réinitialisation dans quelques instants.
                </p>
                <Link
                  to="/login"
                  className="w-full py-3 bg-[#0A1628] text-white font-semibold rounded-xl hover:bg-[#162440] transition-colors flex items-center justify-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Retour à la connexion
                </Link>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-center text-gray-900 mb-2">
                  Réinitialiser le mot de passe
                </h1>
                <p className="text-sm text-gray-500 text-center mb-8">
                  Entrez votre adresse email pour recevoir un lien de réinitialisation.
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1.5">
                      Adresse email
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="votre@email.com"
                        required
                        className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none text-sm"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading || !email}
                    className="w-full py-3 bg-[#0A1628] text-white font-semibold rounded-xl hover:bg-[#162440] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Envoi en cours...
                      </>
                    ) : (
                      'Envoyer le lien'
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

export default PasswordResetPage;
