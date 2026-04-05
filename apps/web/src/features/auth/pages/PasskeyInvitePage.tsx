import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePasskey } from '../hooks/usePasskey';

/**
 * Post-login invitation to set up a Passkey.
 * Shown after first successful password login when no passkey exists.
 */
export default function PasskeyInvitePage() {
  const navigate = useNavigate();
  const { registerPasskey, isLoading: isCreating, error, supportsPasskey } = usePasskey();
  const [success, setSuccess] = useState(false);

  const handleCreatePasskey = async () => {
    if (!supportsPasskey) return;
    const result = await registerPasskey('Mon appareil');
    if (result.success) {
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 1500);
    }
  };

  const handleSkip = () => {
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <div className="flex flex-1">
        {/* Left panel */}
        <div className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col justify-center bg-[#0A1628] p-10 text-white relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none" />
          <div className="relative z-10 flex flex-col items-center text-center">
            {/* User avatar */}
            <div className="w-24 h-24 rounded-2xl bg-blue-500/20 border-2 border-blue-400/30 flex items-center justify-center mb-8">
              <svg className="w-12 h-12 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <div className="w-16 h-1.5 bg-blue-400/30 rounded-full mb-2" />
            <div className="w-10 h-1.5 bg-blue-400/20 rounded-full" />
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10 bg-gray-50/50">
          <div className="w-full max-w-md">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-10">
              {/* Success badge */}
              <div className="flex items-center gap-2 mb-6">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Connexion reussie</span>
              </div>

              {/* Title */}
              <h1 className="text-2xl font-bold text-gray-900 leading-tight mb-3">
                Simplifiez vos<br />prochaines connexions
              </h1>
              <p className="text-sm text-gray-500 leading-relaxed mb-8">
                Activez votre Passkey pour acceder a votre espace{' '}
                <span className="font-semibold text-gray-700">E-Sante</span> en un clin d'oeil,
                sans jamais avoir a retenir de mot de passe.
              </p>

              {/* Features */}
              <div className="space-y-3 mb-8">
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4.5 h-4.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Securite de niveau bancaire</p>
                    <p className="text-xs text-gray-400">Protection cryptographique contre le phishing.</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-gray-50 border border-gray-100">
                  <div className="w-9 h-9 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4.5 h-4.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Acces instantane</p>
                    <p className="text-xs text-gray-400">Utilisez FaceID, TouchID ou votre code PIN appareil.</p>
                  </div>
                </div>
              </div>

              {/* Success message */}
              {success && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 border border-green-100 mb-4">
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <p className="text-green-700 text-xs">Passkey créée avec succès ! Redirection...</p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-100 mb-4">
                  <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-amber-700 text-xs">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCreatePasskey}
                  disabled={isCreating || success || !supportsPasskey}
                  className="flex-1 h-12 bg-[#0A1628] hover:bg-[#0f2035] text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isCreating ? (
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  ) : (
                    <>
                      Créer ma Passkey
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleSkip}
                  className="h-12 px-6 border-2 border-gray-200 hover:border-gray-300 text-sm font-semibold text-gray-600 rounded-xl transition-colors"
                >
                  Plus tard
                </button>
              </div>

              {/* Framework version */}
              <p className="text-center text-[9px] text-gray-300 uppercase tracking-widest mt-6">
                E-Santé
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 bg-white px-6 sm:px-10 py-4">
        <div className="max-w-screen-xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-[10px] text-gray-400">
            &copy; 2024 AssurArchitect. Securité de niveau bancaire.
          </span>
          <div className="flex items-center gap-4 text-[10px] text-gray-400 uppercase tracking-wider">
            <a href="#" className="hover:text-gray-600 transition-colors">Mentions légales</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Confidentialité</a>
            <a href="#" className="hover:text-gray-600 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
