/**
 * API Client for SoinFlow Mobile
 * Adapted from web client with SecureStore for tokens
 */
import * as SecureStore from 'expo-secure-store';
import type { ApiResponse, PaginatedResponse, ApiError as SharedApiError } from '@dhamen/shared';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://dhamen-api.yassine-techini.workers.dev/api/v1';
const REQUEST_TIMEOUT_MS = 30000;
let _accessToken: string | null = null;
let _refreshToken: string | null = null;
let _tenantCode: string | null = null;

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean | undefined>;
  responseType?: 'json' | 'blob';
  timeout?: number;
}

type PaginatedResult<T> = PaginatedResponse<T> | { success: false; error: SharedApiError };

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

  private async getAccessToken(): Promise<string | null> {
    if (_accessToken) return _accessToken;
    try {
      return await SecureStore.getItemAsync('accessToken');
    } catch {
      return null;
    }
  }

  private async getRefreshToken(): Promise<string | null> {
    if (_refreshToken) return _refreshToken;
    try {
      return await SecureStore.getItemAsync('refreshToken');
    } catch {
      return null;
    }
  }

  setTenantCode(code: string | null): void {
    _tenantCode = code;
  }

  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    _accessToken = accessToken;
    _refreshToken = refreshToken;
    try {
      await SecureStore.setItemAsync('accessToken', accessToken);
      await SecureStore.setItemAsync('refreshToken', refreshToken);
    } catch {
      // Ignore storage errors
    }
  }

  async clearTokens(): Promise<void> {
    _accessToken = null;
    _refreshToken = null;
    try {
      await SecureStore.deleteItemAsync('accessToken');
      await SecureStore.deleteItemAsync('refreshToken');
      await SecureStore.deleteItemAsync('user');
    } catch {
      // Ignore storage errors
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const { params, responseType = 'json', timeout = REQUEST_TIMEOUT_MS, ...init } = options;
    let url = `${this.baseUrl}${endpoint}`;

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const token = await this.getAccessToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...init.headers,
      };

      if (token) {
        (headers as Record<string, string>).Authorization = `Bearer ${token}`;
      }

      if (_tenantCode) {
        (headers as Record<string, string>)['X-Tenant-Code'] = _tenantCode;
      }

      const response = await fetch(url, {
        ...init,
        headers,
        signal: controller.signal,
      });

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

      let data: ApiResponse<T>;
      try {
        data = await response.json();
      } catch {
        return {
          success: false,
          error: { code: 'PARSE_ERROR', message: 'Réponse invalide du serveur' },
        };
      }

      if (response.status === 401 && token) {
        const refreshed = await this.refreshTokenWithLocking();
        if (refreshed) {
          const retryHeaders: HeadersInit = {
            'Content-Type': 'application/json',
            ...init.headers,
            Authorization: `Bearer ${await this.getAccessToken()}`,
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

        await this.clearTokens();
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

      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Erreur de connexion au serveur' },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async refreshTokenWithLocking(): Promise<boolean> {
    if (this.refreshTokenPromise) {
      return this.refreshTokenPromise;
    }

    this.refreshTokenPromise = this.doRefreshToken();

    try {
      const result = await this.refreshTokenPromise;
      if (result) {
        emitAuthEvent('refreshed');
      }
      return result;
    } finally {
      this.refreshTokenPromise = null;
    }
  }

  private async doRefreshToken(): Promise<boolean> {
    const refreshToken = await this.getRefreshToken();
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
        await this.setTokens(data.data.tokens.accessToken, data.data.tokens.refreshToken);
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

  /**
   * Poll OCR result endpoint until status is not 'processing'
   */
  async pollOcrResult<T>(
    documentId: string,
    options?: { maxAttempts?: number; intervalMs?: number }
  ): Promise<ApiResponse<T>> {
    const maxAttempts = options?.maxAttempts ?? 15;
    const intervalMs = options?.intervalMs ?? 2000;

    for (let i = 0; i < maxAttempts; i++) {
      const result = await this.get<T>(`/sante/documents/${documentId}/ocr`);

      if (!result.success) return result;

      // Check if OCR is still processing
      const data = result.data as Record<string, unknown> | undefined;
      const status = (data as { data?: { ocrStatus?: string } })?.data?.ocrStatus
        ?? (data as { ocrStatus?: string })?.ocrStatus;

      if (status !== 'processing') return result;

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    return {
      success: false,
      error: { code: 'OCR_TIMEOUT', message: 'L\'extraction a pris trop de temps' },
    };
  }

  async upload<T>(
    endpoint: string,
    formData: FormData,
    options?: { maxRetries?: number; onRetry?: (attempt: number) => void }
  ): Promise<ApiResponse<T>> {
    const maxRetries = options?.maxRetries ?? 3;
    let lastError: ApiResponse<T> | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        options?.onRetry?.(attempt);
      }

      const result = await this._doUpload<T>(endpoint, formData);

      // Don't retry on non-network errors (auth, validation, server errors with response)
      if (result.success) return result;

      const code = result.error?.code;
      const isRetryable = code === 'NETWORK_ERROR' || code === 'TIMEOUT';
      if (!isRetryable) return result;

      lastError = result;
    }

    return lastError!;
  }

  private async _doUpload<T>(endpoint: string, formData: FormData): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    try {
      const token = await this.getAccessToken();
      const headers: HeadersInit = {};

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      if (_tenantCode) {
        (headers as Record<string, string>)['X-Tenant-Code'] = _tenantCode;
      }

      // Note: Don't set Content-Type for FormData, let fetch set it with boundary
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          if (response.status === 401 && token) {
            const refreshed = await this.refreshTokenWithLocking();
            if (refreshed) {
              headers.Authorization = `Bearer ${await this.getAccessToken()}`;
              const retryResponse = await fetch(url, {
                method: 'POST',
                headers,
                body: formData,
              });
              return retryResponse.json();
            }
            await this.clearTokens();
            emitAuthEvent('logout');
            return {
              success: false,
              error: { code: 'SESSION_EXPIRED', message: 'Session expirée' },
            };
          }

          const errorData = await response.json().catch(() => ({}));
          return {
            success: false,
            error: errorData.error || { code: 'UPLOAD_ERROR', message: 'Échec de l\'upload' },
          };
        }

        return response.json();
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: { code: 'TIMEOUT', message: 'La requête a expiré' },
        };
      }

      return {
        success: false,
        error: { code: 'NETWORK_ERROR', message: 'Erreur de connexion' },
      };
    }
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
