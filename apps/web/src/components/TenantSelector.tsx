/**
 * Tenant Selector Component
 *
 * Used in development mode when subdomain routing is not available.
 * Allows selecting which tenant to login as.
 */

import { useState, useEffect } from 'react';
import { resolveTenant, setTenant, TENANTS, type TenantCode } from '@/lib/tenant';

interface TenantSelectorProps {
  onTenantSelected?: (tenant: TenantCode) => void;
}

export function TenantSelector({ onTenantSelected }: TenantSelectorProps) {
  const [selectedTenant, setSelectedTenant] = useState<TenantCode | null>(null);

  useEffect(() => {
    const current = resolveTenant();
    if (current) {
      setSelectedTenant(current);
    }
  }, []);

  const handleSelect = (code: TenantCode) => {
    setSelectedTenant(code);
    setTenant(code);
    onTenantSelected?.(code);
  };

  // Only show in development or when no tenant is resolved from subdomain
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isDev = hostname === 'localhost' || hostname === '127.0.0.1';

  if (!isDev) {
    return null;
  }

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Environnement de test - Selectionner un tenant
      </label>
      <div className="grid grid-cols-2 gap-3">
        {Object.values(TENANTS)
          .filter((t) => t.code !== 'PLATFORM')
          .map((tenant) => (
            <button
              key={tenant.code}
              type="button"
              onClick={() => handleSelect(tenant.code)}
              className={`p-3 rounded-lg border-2 text-left transition-all ${
                selectedTenant === tenant.code
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div
                className="w-3 h-3 rounded-full mb-2"
                style={{ backgroundColor: tenant.primaryColor }}
              />
              <div className="font-medium text-sm">{tenant.code}</div>
              <div className="text-xs text-gray-500">{tenant.name}</div>
            </button>
          ))}
      </div>
      {selectedTenant && (
        <p className="mt-2 text-xs text-green-600">
          Tenant actif: {TENANTS[selectedTenant].name}
        </p>
      )}
    </div>
  );
}

/**
 * Tenant Badge - shows current tenant in header
 */
export function TenantBadge() {
  const tenant = resolveTenant();

  if (!tenant || tenant === 'PLATFORM') {
    return null;
  }

  const config = TENANTS[tenant];

  return (
    <div
      className="flex items-center gap-2 px-3 py-1 rounded-full text-white text-sm font-medium"
      style={{ backgroundColor: config.primaryColor }}
    >
      <span>{config.code}</span>
    </div>
  );
}
