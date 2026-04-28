import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Pill, Loader2, Search } from 'lucide-react';
import { useDropdownPortal } from '@/hooks/useDropdownPortal';

interface MedicationResult {
  id: string;
  code_pct: string;
  code_amm: string | null;
  dci: string;
  brand_name: string;
  dosage: string | null;
  form: string | null;
  packaging: string | null;
  price_public: number | null;
  price_hospital: number | null;
  price_reference: number | null;
  reimbursement_rate: number | null;
  is_generic: number;
  gpb: string | null;
  family_id: string | null;
  family_name: string | null;
  family_code: string | null;
}

interface MedicationAutocompleteProps {
  value: string;
  onSelect: (medication: MedicationResult) => void;
  /** Called when the user types free text without selecting from dropdown */
  onFreeText?: (text: string) => void;
  familyId?: string;
  placeholder?: string;
  className?: string;
}

export function MedicationAutocomplete({
  value,
  onSelect,
  onFreeText,
  familyId,
  placeholder = 'Rechercher un médicament...',
  className,
}: MedicationAutocompleteProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [displayValue, setDisplayValue] = useState(value || '');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevValueRef = useRef(value);

  // Debounced search query
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: results, isFetching } = useQuery({
    queryKey: ['medication-search', debouncedQuery, familyId],
    queryFn: async () => {
      let url = `/medications/search?q=${encodeURIComponent(debouncedQuery)}&limit=15`;
      if (familyId && familyId !== 'all') {
        url += `&familyId=${encodeURIComponent(familyId)}`;
      }
      const response = await apiClient.get<{ results: MedicationResult[] }>(url);
      if (!response.success) return [];
      return response.data?.results || [];
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync display value only when the parent prop actually changes (OCR fill, selection, reset)
  useEffect(() => {
    if (value !== prevValueRef.current) {
      prevValueRef.current = value;
      setDisplayValue(value || '');
      setSearchQuery('');
    }
  }, [value]);

  const handleSelect = useCallback(
    (med: MedicationResult) => {
      const label = [
        med.brand_name,
        med.dci ? `- ${med.dci}` : '',
        med.dosage || '',
        med.form || '',
      ]
        .filter(Boolean)
        .join(' ')
        .trim();
      setDisplayValue(label);
      setSearchQuery('');
      setIsOpen(false);
      setHighlightIndex(-1);
      onSelect(med);
    },
    [onSelect]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || !results?.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === 'Enter' && highlightIndex >= 0 && results[highlightIndex]) {
      e.preventDefault();
      handleSelect(results[highlightIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const formatPrice = (priceInMills: number | null) => {
    if (!priceInMills) return null;
    return (priceInMills / 1000).toFixed(3);
  };

  const dropdownVisible = isOpen && debouncedQuery.length >= 2;
  const { triggerRef: portalTriggerRef, position: portalPos } = useDropdownPortal(dropdownVisible);

  return (
    <div ref={(el) => { (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el; (portalTriggerRef as React.MutableRefObject<HTMLDivElement | null>).current = el; }} className={cn('relative', className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery || displayValue}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setDisplayValue('');
            setIsOpen(true);
            setHighlightIndex(-1);
          }}
          onFocus={() => {
            if (searchQuery.length >= 2 || displayValue) {
              setIsOpen(true);
            }
          }}
          onBlur={() => {
            // Commit free text if user typed without selecting from dropdown
            if (searchQuery && onFreeText) {
              onFreeText(searchQuery);
              setDisplayValue(searchQuery);
              setSearchQuery('');
            }
            setIsOpen(false);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex h-9 w-full rounded-md border border-input bg-transparent pl-8 pr-8 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        {isFetching && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 animate-spin" />
        )}
      </div>

      {dropdownVisible && portalPos && createPortal(
        <div className="fixed z-[9999] max-h-72 overflow-y-auto rounded-xl border bg-white shadow-lg" style={{ top: portalPos.top, left: portalPos.left, width: portalPos.width }}>
          {!results?.length && !isFetching && (
            <div className="px-3 py-4 text-sm text-gray-500 text-center">
              Aucun médicament trouvé pour « {debouncedQuery} »
            </div>
          )}
          {(results || []).map((med, idx) => (
            <button
              key={med.id}
              type="button"
              className={cn(
                'w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0',
                highlightIndex === idx && 'bg-blue-50'
              )}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(med);
              }}
              onMouseEnter={() => setHighlightIndex(idx)}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Pill className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="font-medium truncate">{med.brand_name}</span>
                  <span className="text-xs text-gray-500 truncate">{med.dci}</span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {med.is_generic ? (
                    <span className="text-[10px] px-1 bg-blue-100 text-blue-700 rounded font-medium">GEN</span>
                  ) : null}
                  {med.reimbursement_rate ? (
                    <span className="text-[10px] px-1 bg-green-100 text-green-700 rounded font-medium">
                      R {Math.round(med.reimbursement_rate * 100)}%
                    </span>
                  ) : (
                    <span className="text-[10px] px-1 bg-red-100 text-red-600 rounded font-medium">NR</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-gray-500">
                {med.dosage && <span>{med.dosage}</span>}
                {med.form && <span>• {med.form}</span>}
                {med.code_pct && <span className="font-mono">PCT:{med.code_pct}</span>}
                {med.price_public && (
                  <span className="ml-auto text-emerald-700 font-medium">
                    {formatPrice(med.price_public)} DT
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
