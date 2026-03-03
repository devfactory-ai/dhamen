/**
 * Auth Hook for SoinFlow Mobile
 *
 * Provides reactive auth state (user, tokens) via SecureStore.
 */
import { useState, useEffect, useCallback } from 'react';
import type { UserPublic } from '@dhamen/shared';
import { getUser, clearAuth, isAuthenticated } from '@/lib/auth';

export function useAuth() {
  const [user, setUser] = useState<UserPublic | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    try {
      const authed = await isAuthenticated();
      if (authed) {
        const u = await getUser();
        setUser(u);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const logout = useCallback(async () => {
    await clearAuth();
    setUser(null);
  }, []);

  return { user, loading, logout, refresh: loadUser };
}
