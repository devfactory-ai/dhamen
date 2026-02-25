import type { AuthTokens, UserPublic } from '@dhamen/shared';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';

/**
 * Safely access localStorage with fallback for private browsing mode
 */
function safeLocalStorage() {
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return localStorage;
  } catch {
    // Return a no-op storage for private browsing or when localStorage is disabled
    const memoryStorage: Record<string, string> = {};
    return {
      getItem: (key: string) => memoryStorage[key] ?? null,
      setItem: (key: string, value: string) => { memoryStorage[key] = value; },
      removeItem: (key: string) => { delete memoryStorage[key]; },
    };
  }
}

const storage = safeLocalStorage();

export function setTokens(tokens: AuthTokens): void {
  storage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken);
  storage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
}

export function getAccessToken(): string | null {
  return storage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return storage.getItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  storage.removeItem(ACCESS_TOKEN_KEY);
  storage.removeItem(REFRESH_TOKEN_KEY);
  storage.removeItem(USER_KEY);
}

export function setUser(user: UserPublic): void {
  storage.setItem(USER_KEY, JSON.stringify(user));
}

export function getUser(): UserPublic | null {
  const userJson = storage.getItem(USER_KEY);
  if (!userJson) {
    return null;
  }
  try {
    return JSON.parse(userJson) as UserPublic;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}
