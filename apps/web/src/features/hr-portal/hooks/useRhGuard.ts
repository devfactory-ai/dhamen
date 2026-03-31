import { useAuth } from '@/features/auth/hooks/useAuth';

/**
 * Hook to check if the HR user has an associated company.
 * Returns company info from the auth user object.
 */
export function useRhGuard() {
  const { user } = useAuth();
  return {
    hasEntreprise: !!user?.companyId,
    entrepriseId: user?.companyId || null,
  };
}
