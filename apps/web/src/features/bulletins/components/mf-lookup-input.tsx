import { useState, useEffect, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { CheckCircle2, AlertTriangle, XCircle, Loader2, ShieldCheck } from 'lucide-react';
import { validerMatriculeFiscal } from '@dhamen/shared';

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

export function MfLookupInput({
  value,
  onChange,
  onProviderFound,
  onStatusChange,
  providerType,
  error,
  className,
  placeholder = '1234567APM000',
}: MfLookupInputProps) {
  const [lookupStatus, setLookupStatus] = useState<MfStatus>('idle');
  const [providerName, setProviderName] = useState<string | null>(null);
  const [mfVerified, setMfVerified] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  const updateStatus = useCallback((status: MfStatus) => {
    setLookupStatus(status);
    onStatusChange?.(status);
  }, [onStatusChange]);

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

  useEffect(() => {
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
  }, [value]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value.toUpperCase());
    },
    [onChange]
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

  return (
    <div className={className}>
      {/* Same input layout as original — only added status icon inside */}
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          maxLength={20}
          className={cn(
            'flex h-9 w-full rounded-xl border border-input bg-transparent px-3 pr-8 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 font-mono',
            (lookupStatus === 'found' || lookupStatus === 'registered') && 'border-emerald-300',
            lookupStatus === 'forced' && 'border-blue-300',
            lookupStatus === 'not_found' && 'border-amber-300',
            lookupStatus === 'invalid' && 'border-red-300',
            error && 'border-destructive',
          )}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {statusIcon()}
        </div>
      </div>

      {/* Status messages — small text below input */}
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
