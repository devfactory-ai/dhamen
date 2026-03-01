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
 * Note: For cross-origin requests (different domains), we need SameSite=None + Secure
 */
export function setAccessTokenCookie(
  c: Context,
  token: string,
  expiresIn: number,
  isProduction: boolean,
  isCrossOrigin = true
): void {
  const options: CookieOptions = {
    ...DEFAULT_OPTIONS,
    maxAge: expiresIn,
    // Cross-origin requires Secure=true and SameSite=None
    secure: true, // Always secure for cross-origin cookie to work
    sameSite: isCrossOrigin ? 'None' : (isProduction ? 'Strict' : 'Lax'),
  };

  setCookie(c, 'access_token', token, options);
}

/**
 * Set the refresh token cookie
 * Note: For cross-origin requests (different domains), we need SameSite=None + Secure
 */
export function setRefreshTokenCookie(
  c: Context,
  token: string,
  expiresIn: number,
  isProduction: boolean,
  isCrossOrigin = true
): void {
  const options: CookieOptions = {
    ...DEFAULT_OPTIONS,
    maxAge: expiresIn,
    path: '/api/v1/auth/refresh', // Only sent to refresh endpoint
    // Cross-origin requires Secure=true and SameSite=None
    secure: true, // Always secure for cross-origin cookie to work
    sameSite: isCrossOrigin ? 'None' : (isProduction ? 'Strict' : 'Lax'),
  };

  setCookie(c, 'refresh_token', token, options);
}

/**
 * Clear authentication cookies
 */
export function clearAuthCookies(c: Context, isProduction: boolean, isCrossOrigin = true): void {
  const options: CookieOptions = {
    ...DEFAULT_OPTIONS,
    maxAge: 0,
    secure: true,
    sameSite: isCrossOrigin ? 'None' : (isProduction ? 'Strict' : 'Lax'),
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
