import { useState, useEffect } from 'react';
import { usePWA } from '@/hooks/usePWA';
import { Button } from './button';
import { cn } from '@/lib/utils';
import { Download, RefreshCw, WifiOff, X } from 'lucide-react';

/**
 * Offline indicator banner
 * Shows when the user loses internet connection
 */
export function OfflineIndicator() {
  const { isOnline } = usePWA();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setShowBanner(true);
    } else {
      // Delay hiding to show "back online" message briefly
      const timeout = setTimeout(() => setShowBanner(false), 2000);
      return () => clearTimeout(timeout);
    }
  }, [isOnline]);

  if (!showBanner) return null;

  return (
    <div
      className={cn(
        'fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-300',
        isOnline
          ? 'bg-green-500 text-white animate-fade-in'
          : 'bg-amber-500 text-white animate-fade-in'
      )}
    >
      {isOnline ? (
        <>
          <WifiOff className="h-4 w-4" />
          Connexion rétablie
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4" />
          Vous êtes hors ligne. Certaines fonctionnalités peuvent être limitées.
        </>
      )}
    </div>
  );
}

/**
 * PWA Install prompt
 * Shows when the app can be installed
 */
export function InstallPrompt() {
  const { isInstallable, install } = usePWA();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  // Check if user previously dismissed the prompt
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissedAt = new Date(dismissed).getTime();
      const daysSinceDismissed = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
      // Show again after 7 days
      if (daysSinceDismissed < 7) {
        setIsDismissed(true);
      }
    }
  }, []);

  if (!isInstallable || isDismissed) return null;

  const handleInstall = async () => {
    setIsInstalling(true);
    const success = await install();
    setIsInstalling(false);

    if (!success) {
      handleDismiss();
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('pwa-install-dismissed', new Date().toISOString());
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-slide-in-bottom">
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 rounded"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className="p-3 bg-blue-100 rounded-xl">
            <Download className="h-6 w-6 text-blue-600" />
          </div>

          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">Installer Dhamen</h3>
            <p className="text-sm text-gray-500 mt-1">
              Installez l'application pour un accès rapide et une utilisation hors ligne.
            </p>

            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={handleInstall}
                disabled={isInstalling}
              >
                {isInstalling ? 'Installation...' : 'Installer'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDismiss}
              >
                Plus tard
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Update available prompt
 * Shows when a new version of the app is available
 */
export function UpdatePrompt() {
  const { isUpdateAvailable, update } = usePWA();
  const [isDismissed, setIsDismissed] = useState(false);

  if (!isUpdateAvailable || isDismissed) return null;

  const handleUpdate = () => {
    update();
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-slide-in-bottom">
      <div className="bg-blue-600 text-white rounded-xl shadow-lg p-4">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-blue-500 rounded-lg">
            <RefreshCw className="h-5 w-5" />
          </div>

          <div className="flex-1">
            <h3 className="font-semibold">Mise à jour disponible</h3>
            <p className="text-sm text-blue-100 mt-1">
              Une nouvelle version de Dhamen est disponible.
            </p>

            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="secondary"
                onClick={handleUpdate}
                className="bg-white text-blue-600 hover:bg-blue-50"
              >
                Mettre à jour
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setIsDismissed(true)}
                className="text-blue-100 hover:text-white hover:bg-blue-500"
              >
                Plus tard
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Combined PWA prompts component
 * Use this in your app layout
 */
export function PWAPrompts() {
  return (
    <>
      <OfflineIndicator />
      <InstallPrompt />
      <UpdatePrompt />
    </>
  );
}
