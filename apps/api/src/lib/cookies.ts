/**
 * Cookie utilities for secure token storage
 * Uses HttpOnly, Secure, SameSite cookies to prevent XSS attacks
 */

import type { Context } from 'hono';

export interface CookieOptions {
  maxAge?: number;
  expires?: Date;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

const DEFAULT_OPTIONS: CookieOptions = {
  path: '/',
  httpOnly: true,
  secure: true,
  sameSite: 'Strict',
};

/**
 * Set the access token cookie
 */
export function setAccessTokenCookie(
  c: Context,
  token: string,
  expiresIn: number,
  isProduction: boolean
): void {
  const options: CookieOptions = {
    ...DEFAULT_OPTIONS,
    maxAge: expiresIn,
    secure: isProduction,
    sameSite: isProduction ? 'Strict' : 'Lax',
  };

  setCookie(c, 'access_token', token, options);
}

/**
 * Set the refresh token cookie
 */
export function setRefreshTokenCookie(
  c: Context,
  token: string,
  expiresIn: number,
  isProduction: boolean
): void {
  const options: CookieOptions = {
    ...DEFAULT_OPTIONS,
    maxAge: expiresIn,
    path: '/api/v1/auth/refresh', // Only sent to refresh endpoint
    secure: isProduction,
    sameSite: isProduction ? 'Strict' : 'Lax',
  };

  setCookie(c, 'refresh_token', token, options);
}

/**
 * Clear authentication cookies
 */
export function clearAuthCookies(c: Context, isProduction: boolean): void {
  const options: CookieOptions = {
    ...DEFAULT_OPTIONS,
    maxAge: 0,
    secure: isProduction,
    sameSite: isProduction ? 'Strict' : 'Lax',
  };

  setCookie(c, 'access_token', '', options);
  setCookie(c, 'refresh_token', '', { ...options, path: '/api/v1/auth/refresh' });
}

/**
 * Get access token from cookie
 */
export function getAccessTokenFromCookie(c: Context): string | undefined {
  return getCookie(c, 'access_token');
}

/**
 * Get refresh token from cookie
 */
export function getRefreshTokenFromCookie(c: Context): string | undefined {
  return getCookie(c, 'refresh_token');
}

/**
 * Low-level cookie setter
 */
function setCookie(c: Context, name: string, value: string, options: CookieOptions): void {
  const parts = [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`];

  if (options.maxAge !== undefined) {
    parts.push(`Max-Age=${options.maxAge}`);
  }
  if (options.expires) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  if (options.path) {
    parts.push(`Path=${options.path}`);
  }
  if (options.domain) {
    parts.push(`Domain=${options.domain}`);
  }
  if (options.secure) {
    parts.push('Secure');
  }
  if (options.httpOnly) {
    parts.push('HttpOnly');
  }
  if (options.sameSite) {
    parts.push(`SameSite=${options.sameSite}`);
  }

  c.header('Set-Cookie', parts.join('; '), { append: true });
}

/**
 * Low-level cookie getter
 */
function getCookie(c: Context, name: string): string | undefined {
  const cookieHeader = c.req.header('Cookie');
  if (!cookieHeader) {
    return undefined;
  }

  const cookies = parseCookies(cookieHeader);
  return cookies[name];
}

/**
 * Parse cookie header into object
 */
function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const pair of header.split(';')) {
    const [name, ...valueParts] = pair.trim().split('=');
    if (name) {
      const value = valueParts.join('=');
      cookies[decodeURIComponent(name)] = decodeURIComponent(value || '');
    }
  }

  return cookies;
}
