import { useState, useCallback, useRef, useEffect } from 'react';

interface DropdownPosition {
  top: number;
  left: number;
  width: number;
}

/**
 * Hook to compute portal dropdown position based on a trigger element.
 * Returns a ref to attach to the trigger container and the computed position.
 */
export function useDropdownPortal(isOpen: boolean) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<DropdownPosition | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPosition({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setPosition(null);
      return;
    }
    updatePosition();
    // Recompute on scroll/resize to keep in sync
    const handleScroll = () => updatePosition();
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleScroll);
    };
  }, [isOpen, updatePosition]);

  return { triggerRef, position };
}
