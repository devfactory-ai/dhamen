import { useEffect, useRef, useCallback } from 'react';

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'area[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'iframe',
  'object',
  'embed',
  '[contenteditable]',
].join(', ');

interface UseFocusTrapOptions {
  /**
   * Whether the focus trap is active
   */
  enabled?: boolean;
  /**
   * Whether to return focus to the previously focused element on unmount
   */
  returnFocus?: boolean;
  /**
   * Callback when escape key is pressed
   */
  onEscape?: () => void;
}

/**
 * Hook to trap focus within a container
 * Useful for modals, dialogs, and dropdown menus
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  options: UseFocusTrapOptions = {}
) {
  const { enabled = true, returnFocus = true, onEscape } = options;
  const containerRef = useRef<T>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Get all focusable elements within the container
  const getFocusableElements = useCallback(() => {
    if (!containerRef.current) return [];
    return Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
    ).filter((el) => {
      // Check if element is visible
      const style = window.getComputedStyle(el);
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        !el.hasAttribute('hidden')
      );
    });
  }, []);

  // Focus the first focusable element
  const focusFirst = useCallback(() => {
    const elements = getFocusableElements();
    if (elements.length > 0) {
      elements[0].focus();
    }
  }, [getFocusableElements]);

  // Focus the last focusable element
  const focusLast = useCallback(() => {
    const elements = getFocusableElements();
    if (elements.length > 0) {
      elements[elements.length - 1].focus();
    }
  }, [getFocusableElements]);

  useEffect(() => {
    if (!enabled) return;

    // Store the currently focused element
    previousFocusRef.current = document.activeElement as HTMLElement;

    // Focus the first element in the trap
    focusFirst();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!containerRef.current) return;

      // Handle escape key
      if (event.key === 'Escape' && onEscape) {
        event.preventDefault();
        onEscape();
        return;
      }

      // Handle tab key for focus trapping
      if (event.key === 'Tab') {
        const elements = getFocusableElements();
        if (elements.length === 0) return;

        const firstElement = elements[0];
        const lastElement = elements[elements.length - 1];
        const activeElement = document.activeElement;

        if (event.shiftKey) {
          // Shift + Tab: go to last element if at first
          if (activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: go to first element if at last
          if (activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);

      // Return focus to previously focused element
      if (returnFocus && previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [enabled, returnFocus, onEscape, focusFirst, getFocusableElements]);

  return {
    containerRef,
    focusFirst,
    focusLast,
    getFocusableElements,
  };
}

/**
 * Hook to manage focus when a section expands/collapses
 */
export function useFocusOnMount<T extends HTMLElement = HTMLElement>(
  shouldFocus: boolean = true
) {
  const elementRef = useRef<T>(null);

  useEffect(() => {
    if (shouldFocus && elementRef.current) {
      // Small delay to ensure element is mounted
      const timeout = setTimeout(() => {
        elementRef.current?.focus();
      }, 10);
      return () => clearTimeout(timeout);
    }
  }, [shouldFocus]);

  return elementRef;
}

/**
 * Hook to return focus to a specific element
 */
export function useReturnFocus() {
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const saveFocus = useCallback(() => {
    returnFocusRef.current = document.activeElement as HTMLElement;
  }, []);

  const restoreFocus = useCallback(() => {
    if (returnFocusRef.current) {
      returnFocusRef.current.focus();
      returnFocusRef.current = null;
    }
  }, []);

  return { saveFocus, restoreFocus };
}
