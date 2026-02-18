import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserPublic, LoginRequest } from '@dhamen/shared';
import { apiClient } from '@/lib/api-client';
import { setTokens, clearTokens, getUser, setUser, isAuthenticated } from '@/lib/auth';

interface LoginResponse {
  requiresMfa: boolean;
  mfaToken?: string;
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
  user?: UserPublic;
}

export function useAuth() {
  const [user, setUserState] = useState<UserPublic | null>(getUser());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is authenticated on mount
    const currentUser = getUser();
    if (currentUser) {
      setUserState(currentUser);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await apiClient.post<LoginResponse>('/auth/login', credentials);

        if (!response.success) {
          const errorMessage =
            'error' in response && response.error?.message
              ? response.error.message
              : 'Erreur de connexion';
          setError(errorMessage);
          return { success: false, requiresMfa: false };
        }

        const data = response.data;

        if (data.requiresMfa) {
          return { success: true, requiresMfa: true, mfaToken: data.mfaToken };
        }

        if (data.tokens && data.user) {
          setTokens(data.tokens);
          setUser(data.user);
          setUserState(data.user);
          navigate('/dashboard');
          return { success: true, requiresMfa: false };
        }

        setError('Réponse de connexion invalide');
        return { success: false, requiresMfa: false };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Erreur de connexion';
        setError(errorMessage);
        return { success: false, requiresMfa: false };
      } finally {
        setIsLoading(false);
      }
    },
    [navigate]
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Ignore errors during logout
    } finally {
      clearTokens();
      setUserState(null);
      setIsLoading(false);
      navigate('/login');
    }
  }, [navigate]);

  const fetchCurrentUser = useCallback(async () => {
    if (!isAuthenticated()) {
      return null;
    }

    try {
      const response = await apiClient.get<UserPublic>('/auth/me');
      if (response.success) {
        setUser(response.data);
        setUserState(response.data);
        return response.data;
      }
    } catch {
      clearTokens();
      setUserState(null);
    }
    return null;
  }, []);

  return {
    user,
    isAuthenticated: isAuthenticated() && !!user,
    isLoading,
    error,
    login,
    logout,
    fetchCurrentUser,
  };
}
