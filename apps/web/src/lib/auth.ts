import type { AuthTokens, UserPublic } from '@dhamen/shared';

const ACCESS_TOKEN_KEY = 'accessToken';
const REFRESH_TOKEN_KEY = 'refreshToken';
const USER_KEY = 'user';
const PERMISSIONS_KEY = 'userPermissions';

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
  storage.removeItem(PERMISSIONS_KEY);
  storage.removeItem('isAuthenticated');
}

export interface PermissionOverride {
  resource: string;
  action: string;
  isGranted: boolean;
  expiresAt: string | null;
}

export interface UserPermissions {
  role: Record<string, Record<string, boolean>>;
  overrides: PermissionOverride[];
}

export function setPermissions(permissions: UserPermissions): void {
  storage.setItem(PERMISSIONS_KEY, JSON.stringify(permissions));
}

export function getPermissions(): UserPermissions | null {
  const json = storage.getItem(PERMISSIONS_KEY);
  if (!json) return null;
  try {
    return JSON.parse(json) as UserPermissions;
  } catch {
    return null;
  }
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

/**
 * Fetch fresh permissions from the server and update localStorage.
 * Call this after modifying role permissions to apply changes immediately.
 */
export async function refreshPermissions(): Promise<UserPermissions | null> {
  try {
    // Dynamic import to avoid circular dependency
    const { apiClient } = await import('./api-client');
    const response = await apiClient.get<{ permissions: UserPermissions }>('/auth/permissions');
    if (response.success && response.data?.permissions) {
      setPermissions(response.data.permissions);
      return response.data.permissions;
    }
  } catch {
    // Silent fail — permissions will refresh on next login
  }
  return null;
}

export function isAuthenticated(): boolean {
  // Check if we have both access token and user data
  const token = storage.getItem(ACCESS_TOKEN_KEY);
  return !!token && !!getUser();
}

export function setAuthenticated(value: boolean): void {
  if (value) {
    storage.setItem('isAuthenticated', 'true');
  } else {
    storage.removeItem('isAuthenticated');
  }
}
