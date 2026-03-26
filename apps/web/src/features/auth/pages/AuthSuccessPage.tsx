import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUser } from '@/lib/auth';
import { useAgentContext } from '@/features/agent/stores/agent-context';
import { Shield, CheckCircle2 } from 'lucide-react';

export function AuthSuccessPage() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Animate progress bar over 2.5 seconds
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
    const timeout = setTimeout(() => {
      const user = getUser();
      if (!user) {
        navigate('/login', { replace: true });
        return;
      }
      const agentRoles = ['INSURER_AGENT', 'INSURER_ADMIN'];
      if (agentRoles.includes(user.role)) {
        useAgentContext.getState().clearIfDifferentUser(user.id);
        if (useAgentContext.getState().isContextReady()) {
          navigate('/bulletins/saisie', { replace: true });
        } else {
          navigate('/select-context', { replace: true });
        }
      } else {
        navigate('/dashboard', { replace: true });
      }
    }, 2500);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-10 max-w-sm w-full text-center">
          {/* Logo */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <Shield className="h-5 w-5 text-blue-600" />
            <span className="font-bold text-gray-900 tracking-wide">E-SANTE</span>
          </div>

          {/* Checkmark */}
          <div className="flex justify-center mb-5">
            <div className="w-20 h-20 rounded-full bg-[#0A1628] flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-white" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-xl font-bold text-gray-900 mb-2">Connexion réussie !</h1>
          <p className="text-sm text-gray-500 mb-6">
            Vous allez être redirigé vers votre tableau de bord...
          </p>

          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-1.5 mb-6 overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-75 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="text-[10px] text-gray-400 uppercase tracking-widest flex items-center justify-center gap-1.5">
            <Shield className="h-3 w-3" />
            Session sécurisée par Sentinel Protocol
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white py-4 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="text-xs text-gray-400">
            <span className="font-semibold text-gray-600">E-Santé</span>
            <span className="mx-2">|</span>
            © {new Date().getFullYear()} E-Santé. All rights reserved. Registered Insurance Manager.
          </div>
          <div className="flex items-center gap-4 text-[10px] text-gray-400 uppercase tracking-wider">
            <span>Politique de confidentialité</span>
            <span>Conditions d'utilisation</span>
            <span>Divulgation de sécurité</span>
            <span>Informations réglementaires</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default AuthSuccessPage;
