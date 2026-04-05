import { useState, useCallback } from 'react';
import { startRegistration, startAuthentication, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { apiClient } from '@/lib/api-client';
import { setTokens, setUser, setPermissions } from '@/lib/auth';

interface PasskeyLoginResult {
  success: boolean;
  requiresMfa: boolean;
  redirectTo?: string;
  error?: string;
  cancelled?: boolean;
}

interface Passkey {
  id: string;
  name: string | null;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
  lastUsedAt: string | null;
  createdAt: string;
}

export function usePasskey() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supportsPasskey = browserSupportsWebAuthn();

  const loginWithPasskey = useCallback(async (email?: string): Promise<PasskeyLoginResult> => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Get authentication options from server
      const optionsRes = await apiClient.post<Record<string, unknown>>('/auth/passkey/login/options', email ? { email } : {});
      if (!optionsRes.success || !optionsRes.data) {
        const errCode = 'error' in optionsRes && optionsRes.error?.code ? optionsRes.error.code : '';
        const msg = 'error' in optionsRes && optionsRes.error?.message ? optionsRes.error.message : 'Erreur serveur';
        if (errCode === 'PASSKEY_NOT_FOUND') {
          setError(msg);
          return { success: false, requiresMfa: false, error: msg, cancelled: false };
        }
        setError(msg);
        return { success: false, requiresMfa: false, error: msg };
      }

      // 2. Start browser authentication (shows passkey picker)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authResponse = await startAuthentication({ optionsJSON: optionsRes.data as any });

      // 3. Verify with server
      const verifyRes = await apiClient.post<{
        requiresMfa: boolean;
        user: Record<string, unknown>;
        tokens: { accessToken: string; refreshToken: string };
        permissions: Record<string, unknown>;
        tenantCode?: string;
        expiresIn: number;
      }>('/auth/passkey/login/verify', { response: authResponse });

      if (!verifyRes.success || !verifyRes.data) {
        const msg = 'error' in verifyRes && verifyRes.error?.message ? verifyRes.error.message : 'Verification echouee';
        setError(msg);
        return { success: false, requiresMfa: false, error: msg };
      }

      const { user, tokens, permissions } = verifyRes.data;

      // Store auth data (same as password login)
      setTokens(tokens.accessToken, tokens.refreshToken);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setUser(user as any);
      if (permissions) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setPermissions(permissions as any);
      }

      return { success: true, requiresMfa: false, redirectTo: '/dashboard' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur Passkey';
      // User cancelled or no credentials available — both throw NotAllowedError
      if (message.includes('ceremony was sent an abort signal') || message.includes('NotAllowedError') || message.includes('not allowed')) {
        setError(null);
        return { success: false, requiresMfa: false, cancelled: true };
      }
      setError(message);
      return { success: false, requiresMfa: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const registerPasskey = useCallback(async (name?: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    setError(null);

    try {
      // 1. Get registration options
      const optionsRes = await apiClient.post<Record<string, unknown>>('/auth/passkey/register/options', {});
      if (!optionsRes.success || !optionsRes.data) {
        const msg = 'error' in optionsRes && optionsRes.error?.message ? optionsRes.error.message : 'Erreur serveur';
        setError(msg);
        return { success: false, error: msg };
      }

      // 2. Start browser registration (shows biometric prompt)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const regResponse = await startRegistration({ optionsJSON: optionsRes.data as any });

      // 3. Verify with server
      const verifyRes = await apiClient.post<{ id: string }>('/auth/passkey/register/verify', {
        response: regResponse,
        name: name || 'Ma Passkey',
      });

      if (!verifyRes.success) {
        const msg = 'error' in verifyRes && verifyRes.error?.message ? verifyRes.error.message : 'Enregistrement echoue';
        setError(msg);
        return { success: false, error: msg };
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur Passkey';
      if (message.includes('ceremony was sent an abort signal') || message.includes('NotAllowedError')) {
        setError(null);
        return { success: false };
      }
      setError(message);
      return { success: false, error: message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  const listPasskeys = useCallback(async (): Promise<Passkey[]> => {
    const res = await apiClient.get<Passkey[]>('/auth/passkeys');
    if (res.success && res.data) return res.data;
    return [];
  }, []);

  const deletePasskey = useCallback(async (id: string): Promise<boolean> => {
    const res = await apiClient.delete(`/auth/passkeys/${id}`);
    return res.success;
  }, []);

  return {
    supportsPasskey,
    isLoading,
    error,
    setError,
    loginWithPasskey,
    registerPasskey,
    listPasskeys,
    deletePasskey,
  };
}
