import type { ApiResponse, PaginatedResponse, ApiError as SharedApiError } from '@dhamen/shared';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';
const REQUEST_TIMEOUT_MS = 30000;

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  responseType?: 'json' | 'blob';
  timeout?: number;
}

/**
 * Extended paginated response that includes error cases
 */
type PaginatedResult<T> = PaginatedResponse<T> | { success: false; error: SharedApiError };

/**
 * Custom error class for API errors with structured error codes
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Event emitter for auth state changes
 */
type AuthEventListener = (event: 'logout' | 'refreshed') => void;
const authListeners: Set<AuthEventListener> = new Set();

export function onAuthStateChange(listener: AuthEventListener): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

function emitAuthEvent(event: 'logout' | 'refreshed'): void {
  for (const listener of authListeners) {
    listener(event);
  }
}

class ApiClient {
  private baseUrl: string;
  private refreshTokenPromise: Promise<boolean> | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getAccessToken(): string | null {
    try {
      return localStorage.getItem('accessToken');
    } catch {
      // Handle private browsing mode
      return null;
    }
  }

  private getRefreshToken(): string | null {
    try {
      return localStorage.getItem('refreshToken');
    } catch {
      return null;
    }
  }

  private setTokens(accessToken: string, refreshToken: string): void {
    try {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
    } catch {
      // Ignore storage errors in private mode
    }
  }

  private clearTokens(): void {
    try {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Main request method with timeout, retry logic, and proper error handling
   */
  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { params, responseType = 'json', timeout = REQUEST_TIMEOUT_MS, ...init } = options;
    let url = `${this.baseUrl}${endpoint}`;

    // Add query parameters
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      }
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }

    // Setup abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Add authorization header if token exists
      const token = this.getAccessToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...init.headers,
      };

      if (token) {
        (headers as Record<string, string>).Authorization = `Bearer ${token}`;
      }

      const response = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });

      // Handle blob responses (for file downloads)
      if (responseType === 'blob') {
        if (!response.ok) {
          return {
            success: false,
            error: { code: 'DOWNLOAD_ERROR', message: 'Échec du téléchargement du fichier' },
          } as ApiResponse<T>;
        }
        const blob = await response.blob();
        return { success: true, data: blob as T } as ApiResponse<T>;
      }

      // Parse JSON response
      let data: ApiResponse<T>;
      try {
        data = await response.json();
      } catch {
        return {
          success: false,
          error: { code: 'PARSE_ERROR', message: 'Réponse invalide du serveur' },
        };
      }

      // Handle 401 - token expired
      if (response.status === 401 && token) {
        const refreshed = await this.refreshTokenWithLocking();
        if (refreshed) {
          // Retry the request with new token
          const retryHeaders: HeadersInit = {
            'Content-Type': 'application/json',
            ...init.headers,
            Authorization: `Bearer ${this.getAccessToken()}`,
          };

          const retryController = new AbortController();
          const retryTimeoutId = setTimeout(() => retryController.abort(), timeout);

          try {
            const retryResponse = await fetch(url, {
              ...init,
              headers: retryHeaders,
              signal: retryController.signal,
            });
            return retryResponse.json();
          } finally {
            clearTimeout(retryTimeoutId);
          }
        }

        // Refresh failed, emit logout event
        this.clearTokens();
        emitAuthEvent('logout');
        return {
          success: false,
          error: { code: 'SESSION_EXPIRED', message: 'Session expirée, veuillez vous reconnecter' },
        };
      }

      return data;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: { code: 'TIMEOUT', message: 'La requête a expiré' },
        };
      }

      // Network error
      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Erreur de connexion au serveur' },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Refresh token with locking mechanism to prevent race conditions
   * Only one refresh can happen at a time - other requests wait for it
   */
  private async refreshTokenWithLocking(): Promise<boolean> {
    // If a refresh is already in progress, wait for it
    if (this.refreshTokenPromise) {
      return this.refreshTokenPromise;
    }

    // Start a new refresh
    this.refreshTokenPromise = this.doRefreshToken();

    try {
      const result = await this.refreshTokenPromise;
      if (result) {
        emitAuthEvent('refreshed');
      }
      return result;
    } finally {
      // Clear the promise so next refresh can happen
      this.refreshTokenPromise = null;
    }
  }

  /**
   * Actual refresh token logic
   */
  private async doRefreshToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      if (data.success && data.data?.tokens) {
        this.setTokens(data.data.tokens.accessToken, data.data.tokens.refreshToken);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async get<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  async getPaginated<T>(
    endpoint: string,
    options?: RequestOptions
  ): Promise<PaginatedResult<T>> {
    const response = await this.request<{ data: T[]; meta: { page: number; limit: number; total: number; totalPages: number } }>(
      endpoint,
      { ...options, method: 'GET' }
    );

    if (!response.success) {
      return {
        success: false,
        error: response.error,
      };
    }

    const meta = response.data?.meta ?? { page: 1, limit: 20, total: 0, totalPages: 1 };
    return {
      success: true,
      data: response.data?.data ?? [],
      meta,
    };
  }

  async post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async delete<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
