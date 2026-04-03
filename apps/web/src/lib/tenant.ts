/**
 * Multi-tenant support for the frontend
 *
 * Tenant is resolved from:
 * 1. Subdomain (star.dhamen.tn -> STAR)
 * 2. URL parameter (?tenant=STAR)
 * 3. LocalStorage (for development)
 */

const TENANT_KEY = 'currentTenant';

export type TenantCode = 'BH' | 'PLATFORM';

export interface TenantConfig {
  code: TenantCode;
  name: string;
  subdomain: string;
  logo?: string;
  primaryColor?: string;
}

export const TENANTS: Record<TenantCode, TenantConfig> = {
  BH: {
    code: 'BH',
    name: 'BH Assurance',
    subdomain: 'bh',
    primaryColor: '#0066CC',
  },
  PLATFORM: {
    code: 'PLATFORM',
    name: 'E-Santé Platform',
    subdomain: 'admin',
    primaryColor: '#6366F1',
  },
};

/**
 * Resolve tenant from current context
 */
export function resolveTenant(): TenantCode | null {
  // 1. Check subdomain
  const hostname = window.location.hostname;
  const subdomain = hostname.split('.')[0]?.toLowerCase();

  // Map subdomains to tenant codes
  if (subdomain === 'admin') {
    return 'PLATFORM';
  }
  for (const [code, config] of Object.entries(TENANTS)) {
    if (config.subdomain === subdomain) {
      return code as TenantCode;
    }
  }

  // 2. Check URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const tenantParam = urlParams.get('tenant')?.toUpperCase();
  if (tenantParam && tenantParam in TENANTS) {
    return tenantParam as TenantCode;
  }

  // 3. Check localStorage (for dev/testing)
  try {
    const stored = localStorage.getItem(TENANT_KEY);
    if (stored && stored in TENANTS) {
      return stored as TenantCode;
    }
  } catch {
    // Ignore storage errors
  }

  // 4. For localhost development, default to null (will need selection)
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return null;
  }

  // 5. Staging/preview: default to BH (single-tenant staging)
  if (hostname.includes('pages.dev') || hostname.includes('workers.dev') || hostname.includes('e-sante.com.tn')) {
    return 'BH';
  }

  return null;
}

/**
 * Set tenant in localStorage (for development/testing)
 */
export function setTenant(code: TenantCode): void {
  try {
    localStorage.setItem(TENANT_KEY, code);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear tenant from localStorage
 */
export function clearTenant(): void {
  try {
    localStorage.removeItem(TENANT_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get tenant config
 */
export function getTenantConfig(code: TenantCode): TenantConfig {
  return TENANTS[code];
}

/**
 * Check if current context is platform admin
 */
export function isPlatformAdmin(): boolean {
  const tenant = resolveTenant();
  return tenant === 'PLATFORM';
}

/**
 * Get the tenant header for API requests
 */
export function getTenantHeader(): Record<string, string> {
  const tenant = resolveTenant();
  if (tenant && tenant !== 'PLATFORM') {
    return { 'X-Tenant-Code': tenant };
  }
  return {};
}
