import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, XCircle, Loader2, ShieldCheck, Search } from 'lucide-react';
import { validerMatriculeFiscal } from '@dhamen/shared';
import { useDropdownPortal } from '@/hooks/useDropdownPortal';

interface ProviderInfo {
  id: string;
  name: string;
  type: string;
  speciality: string | null;
  address: string | null;
  city: string | null;
  mf_number: string;
  mf_verified: boolean | number;
}

interface LookupResponse {
  status: 'found' | 'not_found' | 'created';
  provider?: ProviderInfo;
  mfVerified?: boolean;
  verificationStatus?: string;
  isValidFormat?: boolean;
  message?: string;
}

interface ProviderSearchResult {
  id: string;
  name: string;
  type: string;
  speciality: string | null;
  mfNumber: string | null;
  address: string;
  city: string;
  isActive: boolean;
}

export type MfStatus = 'idle' | 'loading' | 'found' | 'not_found' | 'registering' | 'registered' | 'invalid' | 'forced' | 'error';

interface MfLookupInputProps {
  value: string;
  onChange: (value: string) => void;
  onProviderFound: (provider: ProviderInfo) => void;
  onStatusChange?: (status: MfStatus) => void;
  providerType?: 'pharmacist' | 'doctor' | 'lab' | 'clinic';
  error?: string;
  className?: string;
  placeholder?: string;
}

const typeLabels: Record<string, string> = {
  pharmacist: 'Pharmacie',
  doctor: 'Médecin',
  lab: 'Laboratoire',
  clinic: 'Clinique',
};

export function MfLookupInput({
  value,
  onChange,
  onProviderFound,
  onStatusChange,
  providerType,
  error,
  className,
  placeholder = 'Rechercher par MF ou nom...',
}: MfLookupInputProps) {
  const [lookupStatus, setLookupStatus] = useState<MfStatus>('idle');
  const [providerName, setProviderName] = useState<string | null>(null);
  const [mfVerified, setMfVerified] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  // Track if provider was selected from dropdown (skip MF validation)
  const [selectedFromDropdown, setSelectedFromDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateStatus = useCallback((status: MfStatus) => {
    setLookupStatus(status);
    onStatusChange?.(status);
  }, [onStatusChange]);

  // Debounce search for provider autocomplete
  useEffect(() => {
    if (!value || value.length < 3) {
      setDebouncedSearch('');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(value.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [value]);

  // Search providers for autocomplete dropdown
  const { data: searchResults } = useQuery({
    queryKey: ['providers-mf-search', debouncedSearch, providerType],
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedSearch, limit: '8' });
      if (providerType) params.set('type', providerType);
      const response = await apiClient.get<ProviderSearchResult[]>(`/providers?${params}`);
      if (!response.success) return [];
      return (response.data as ProviderSearchResult[]) || [];
    },
    enabled: debouncedSearch.length >= 3 && isFocused && !selectedFromDropdown,
    staleTime: 10_000,
  });

  // Exact MF lookup (for validation + status)
  const lookupMutation = useMutation({
    mutationFn: async (mfNumber: string) => {
      const response = await apiClient.post<LookupResponse>('/mf-verification/lookup', {
        mfNumber,
        providerType,
      });
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: (data) => {
      if (!data) return;
      if (data.status === 'found' && data.provider) {
        updateStatus('found');
        setProviderName(data.provider.name);
        setMfVerified(!!data.mfVerified);
        onProviderFound(data.provider);
        setShowDropdown(false);
      } else if (data.status === 'not_found') {
        updateStatus('not_found');
        setProviderName(null);
        setMfVerified(false);
      }
    },
    onError: () => {
      updateStatus('error');
      setProviderName(null);
    },
  });

  // MF validation + exact lookup when value looks like a complete MF
  useEffect(() => {
    // Skip MF validation if provider was selected from dropdown
    if (selectedFromDropdown) return;

    setValidationErrors([]);
    setValidationWarnings([]);

    if (!value || value.length < 8) {
      updateStatus('idle');
      setProviderName(null);
      return;
    }

    const cleanValue = value.trim().toUpperCase();
    const result = validerMatriculeFiscal(cleanValue, providerType);

    if (!result.valid) {
      setValidationErrors(result.errors);
      updateStatus('invalid');
      return;
    }

    if (result.warnings.length > 0) {
      setValidationWarnings(result.warnings);
    }

    updateStatus('loading');
    const timer = setTimeout(() => {
      lookupMutation.mutate(cleanValue);
    }, 500);

    return () => clearTimeout(timer);
  }, [value, selectedFromDropdown]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = e.target.value.toUpperCase();
      onChange(newVal);
      setSelectedFromDropdown(false);
      setShowDropdown(true);
    },
    [onChange]
  );

  const handleSelectProvider = useCallback(
    (provider: ProviderSearchResult) => {
      const mf = provider.mfNumber || value;
      setSelectedFromDropdown(true);
      onChange(mf);
      // Notify parent with full provider info (sets nom_prof_sant + provider_id)
      onProviderFound({
        id: provider.id,
        name: provider.name,
        type: provider.type,
        speciality: provider.speciality,
        address: provider.address,
        city: provider.city,
        mf_number: mf,
        mf_verified: !!provider.mfNumber,
      });
      setProviderName(provider.name);
      setMfVerified(!!provider.mfNumber);
      // Provider was selected from list — it EXISTS, always mark as found
      updateStatus('found');
      setShowDropdown(false);
    },
    [onChange, onProviderFound, updateStatus, value]
  );

  const handleForceValidate = () => {
    setValidationErrors([]);
    updateStatus('forced');
  };

  const statusIcon = () => {
    if (lookupStatus === 'loading') {
      return <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />;
    }
    switch (lookupStatus) {
      case 'found':
      case 'registered':
        return <CheckCircle2 className={cn('h-4 w-4', mfVerified ? 'text-emerald-600' : 'text-amber-500')} />;
      case 'forced':
        return <ShieldCheck className="h-4 w-4 text-blue-500" />;
      case 'not_found':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'invalid':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  // Show dropdown when focused, typing, and not already found
  const shouldShowDropdown = showDropdown && isFocused && value.length >= 3
    && lookupStatus !== 'found' && lookupStatus !== 'registered'
    && !selectedFromDropdown;
  const hasResults = searchResults && searchResults.length > 0;
  const { triggerRef: portalTriggerRef, position: portalPos } = useDropdownPortal(shouldShowDropdown);

  return (
    <div className={cn('relative', className)} ref={portalTriggerRef}>
      {/* Input with search icon */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          maxLength={20}
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-8 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono',
            (lookupStatus === 'found' || lookupStatus === 'registered') && 'border-emerald-300',
            lookupStatus === 'forced' && 'border-blue-300',
            lookupStatus === 'not_found' && 'border-amber-300',
            lookupStatus === 'invalid' && 'border-red-300',
            error && 'border-destructive',
          )}
          onFocus={() => {
            setIsFocused(true);
            if (value.length >= 3 && lookupStatus !== 'found' && lookupStatus !== 'registered') {
              setShowDropdown(true);
            }
          }}
          onBlur={() => {
            setTimeout(() => {
              setIsFocused(false);
              setShowDropdown(false);
            }, 200);
          }}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {statusIcon()}
        </div>
      </div>

      {/* Autocomplete dropdown */}
      {shouldShowDropdown && portalPos && createPortal(
        <div className="fixed z-[9999] bg-white border rounded-lg shadow-lg max-h-52 overflow-y-auto" style={{ top: portalPos.top, left: portalPos.left, width: portalPos.width }}>
          {hasResults ? (
            searchResults.map((p) => (
              <button
                key={p.id}
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-blue-50 text-sm border-b last:border-0 flex flex-col gap-0.5 transition-colors"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectProvider(p);
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900 truncate">{p.name}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0 ml-2">
                    {typeLabels[p.type] || p.type}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {p.mfNumber && (
                    <span className="font-mono">{p.mfNumber}</span>
                  )}
                  {p.city && p.city !== 'À compléter' && (
                    <span>· {p.city}</span>
                  )}
                  {p.speciality && (
                    <span>· {p.speciality}</span>
                  )}
                </div>
              </button>
            ))
          ) : debouncedSearch.length >= 3 ? (
            <div className="px-3 py-2 text-sm text-gray-500">
              Aucun praticien trouvé
            </div>
          ) : null}
        </div>,
        document.body
      )}

      {/* Status messages */}
      {lookupStatus === 'found' && providerName && (
        <p className={cn('text-[11px] mt-1', mfVerified ? 'text-emerald-600' : 'text-amber-600')}>
          {mfVerified ? '✓ Vérifié' : '✓ Trouvé'} — {providerName}
        </p>
      )}

      {lookupStatus === 'registered' && providerName && (
        <p className="text-[11px] text-emerald-600 mt-1">✓ Enregistré — {providerName}</p>
      )}

      {lookupStatus === 'forced' && (
        <p className="text-[11px] text-blue-600 mt-1">✓ Validé manuellement</p>
      )}

      {lookupStatus === 'not_found' && (
        <p className="text-[11px] text-amber-600 mt-1">MF valide — praticien non trouvé, sera ajouté automatiquement</p>
      )}

      {lookupStatus === 'invalid' && validationErrors.length > 0 && (
        <div className="mt-1 flex items-start gap-1">
          <div className="flex-1">
            {validationErrors.map((err, i) => (
              <p key={i} className="text-[11px] text-red-600">{err}</p>
            ))}
          </div>
          <button
            type="button"
            onClick={handleForceValidate}
            title="Je confirme que ce matricule est correct"
            className="shrink-0 mt-0.5 text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors flex items-center gap-0.5"
          >
            <ShieldCheck className="h-3 w-3" />
            Forcer
          </button>
        </div>
      )}

      {lookupStatus === 'error' && (
        <p className="text-[11px] text-red-600 mt-1">Erreur de vérification</p>
      )}

      {validationWarnings.length > 0 && lookupStatus !== 'invalid' && (
        <div className="mt-1">
          {validationWarnings.map((warn, i) => (
            <p key={i} className="text-[11px] text-amber-600">{warn}</p>
          ))}
        </div>
      )}

      {error && lookupStatus === 'idle' && (
        <p className="text-xs text-destructive mt-1">{error}</p>
      )}
    </div>
  );
}
