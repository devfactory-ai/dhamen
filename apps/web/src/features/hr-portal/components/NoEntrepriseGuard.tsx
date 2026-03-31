import type { ReactNode } from 'react';
import { AlertTriangle, Phone } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useRhGuard } from '../hooks/useRhGuard';

interface NoEntrepriseGuardProps {
  children: ReactNode;
}

/**
 * Guard component for HR pages.
 * If the user has no associated company, shows a full-page banner
 * and does NOT render children (preventing API calls).
 */
export function NoEntrepriseGuard({ children }: NoEntrepriseGuardProps) {
  const { hasEntreprise } = useRhGuard();

  if (!hasEntreprise) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center text-center p-8 space-y-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
            </div>
            <h2 className="text-xl font-semibold">Compte non configure</h2>
            <p className="text-muted-foreground">
              Votre compte n'est pas associe a une entreprise.
              Contactez l'administrateur BH Assurance pour configurer votre acces.
            </p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
              <Phone className="h-4 w-4" />
              <span>Support : 71 184 200</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}
