import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserPublic, LoginRequest } from '@dhamen/shared';
import { apiClient } from '@/lib/api-client';
import { setTokens, clearTokens, getUser, setUser, isAuthenticated, setPermissions, type UserPermissions } from '@/lib/auth';
import { useAgentContext } from '@/features/agent/stores/agent-context';
interface LoginResponse {
  requiresMfa: boolean;
  requiresMfaSetup?: boolean;
  mfaToken?: string;
  mfaSetupToken?: string;
  mfaMethods?: string[];
  expiresIn?: number;
  user?: UserPublic;
  permissions?: UserPermissions;
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
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

        // Handle MFA setup required
        if (data.requiresMfaSetup) {
          return { success: true, requiresMfaSetup: true, mfaSetupToken: data.mfaSetupToken };
        }

        // Handle MFA verification required
        if (data.requiresMfa) {
          return { success: true, requiresMfa: true, mfaToken: data.mfaToken, mfaMethods: data.mfaMethods };
        }

        // Login successful - store tokens and user
        if (data.user && data.tokens) {
          // Store tokens in localStorage for Bearer auth
          setTokens(data.tokens);
          setUser(data.user);
          setUserState(data.user);
          // Store resolved permissions (role + individual overrides)
          if (data.permissions) {
            setPermissions(data.permissions);
          }
          // Mark as authenticated in localStorage
          localStorage.setItem('isAuthenticated', 'true');
          // Agents must select company + batch before working
          const agentRoles = ['INSURER_AGENT', 'INSURER_ADMIN'];
          if (agentRoles.includes(data.user.role)) {
            useAgentContext.getState().clearIfDifferentUser(data.user.id);
            // Re-read state after update
            if (useAgentContext.getState().isContextReady()) {
              navigate('/bulletins/saisie');
            } else {
              navigate('/select-context');
            }
          } else {
            navigate('/dashboard');
          }
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
      // Clear agent context (company + batch selection) so it doesn't leak between accounts
      useAgentContext.getState().clearContext();
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
