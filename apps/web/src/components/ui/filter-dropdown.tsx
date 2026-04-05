import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface FilterDropdownProps {
  label: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
  /** Width class for the dropdown menu, e.g. "w-48", "w-64" */
  menuWidth?: string;
}

/**
 * Portal-based filter dropdown that renders above all content,
 * preventing clipping by parent overflow containers.
 */
export function FilterDropdown({
  label,
  value,
  open,
  onToggle,
  onClose,
  children,
  menuWidth = 'w-48',
}: FilterDropdownProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      left: rect.left,
    });
  }, []);

  // Position the dropdown when it opens
useEffect(() => {
  if (!open) return;
  updatePosition();

  const handleScroll = (e: Event) => {
    if (menuRef.current?.contains(e.target as Node)) return;
    onClose();
  };

  window.addEventListener("scroll", handleScroll, true);
  window.addEventListener("resize", onClose);
  return () => {
    window.removeEventListener("scroll", handleScroll, true);
    window.removeEventListener("resize", onClose);
  };
}, [open, updatePosition, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        menuRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open, onClose]);

  return (
    <div className="shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2 w-full  px-4 py-3 bg-[#f3f4f5] rounded-xl hover:bg-gray-200/70 transition-colors cursor-pointer"
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 pt-1">
          {label}
        </span>
        <span className="text-sm font-medium text-gray-900">{value}</span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 ml-auto sm:ml-1 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 9-7 7-7-7" />
        </svg>
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            className={`fixed ${menuWidth} py-1 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 z-[9999] max-h-72 overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150`}
            style={{ top: pos.top, left: pos.left }}
          >
            {children}
          </div>,
          document.body
        )}
    </div>
  );
}

interface FilterOptionProps {
  selected: boolean;
  onClick: () => void;
  color?: string;
  children: React.ReactNode;
}

export function FilterOption({ selected, onClick, color, children }: FilterOptionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 ${selected ? 'text-blue-600 font-semibold bg-blue-50/50' : 'text-gray-700'}`}
    >
      {color && <span className={`w-2 h-2 rounded-full ${color}`} />}
      {children}
      {selected && (
        <svg
          className="w-4 h-4 ml-auto text-blue-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      )}
    </button>
  );
}
