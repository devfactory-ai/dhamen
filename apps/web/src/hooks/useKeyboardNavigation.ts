import { useEffect, useCallback, useRef, useState } from 'react';

interface UseKeyboardNavigationOptions<T> {
  /**
   * List of items to navigate through
   */
  items: T[];
  /**
   * Whether the navigation is enabled
   */
  enabled?: boolean;
  /**
   * Whether to loop from end to start and vice versa
   */
  loop?: boolean;
  /**
   * Orientation of the list
   */
  orientation?: 'horizontal' | 'vertical' | 'both';
  /**
   * Callback when an item is selected (Enter key)
   */
  onSelect?: (item: T, index: number) => void;
  /**
   * Initial selected index
   */
  initialIndex?: number;
}

/**
 * Hook for keyboard navigation in lists and menus
 * Follows WAI-ARIA best practices for listbox/menu navigation
 */
export function useKeyboardNavigation<T>({
  items,
  enabled = true,
  loop = true,
  orientation = 'vertical',
  onSelect,
  initialIndex = -1,
}: UseKeyboardNavigationOptions<T>) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const containerRef = useRef<HTMLElement>(null);

  const navigateUp = useCallback(() => {
    setActiveIndex((current) => {
      if (current <= 0) {
        return loop ? items.length - 1 : 0;
      }
      return current - 1;
    });
  }, [items.length, loop]);

  const navigateDown = useCallback(() => {
    setActiveIndex((current) => {
      if (current >= items.length - 1) {
        return loop ? 0 : items.length - 1;
      }
      return current + 1;
    });
  }, [items.length, loop]);

  const navigateToFirst = useCallback(() => {
    setActiveIndex(0);
  }, []);

  const navigateToLast = useCallback(() => {
    setActiveIndex(items.length - 1);
  }, [items.length]);

  const selectCurrent = useCallback(() => {
    if (activeIndex >= 0 && activeIndex < items.length && onSelect) {
      onSelect(items[activeIndex], activeIndex);
    }
  }, [activeIndex, items, onSelect]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled || items.length === 0) return;

      const upKeys = orientation === 'horizontal' ? ['ArrowLeft'] : ['ArrowUp'];
      const downKeys = orientation === 'horizontal' ? ['ArrowRight'] : ['ArrowDown'];

      if (orientation === 'both') {
        upKeys.push('ArrowLeft');
        downKeys.push('ArrowRight');
      }

      if (upKeys.includes(event.key)) {
        event.preventDefault();
        navigateUp();
      } else if (downKeys.includes(event.key)) {
        event.preventDefault();
        navigateDown();
      } else if (event.key === 'Home') {
        event.preventDefault();
        navigateToFirst();
      } else if (event.key === 'End') {
        event.preventDefault();
        navigateToLast();
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectCurrent();
      }
    },
    [enabled, items.length, orientation, navigateUp, navigateDown, navigateToFirst, navigateToLast, selectCurrent]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    container.addEventListener('keydown', handleKeyDown as EventListener);
    return () => {
      container.removeEventListener('keydown', handleKeyDown as EventListener);
    };
  }, [enabled, handleKeyDown]);

  // Reset active index when items change
  useEffect(() => {
    if (activeIndex >= items.length) {
      setActiveIndex(items.length > 0 ? items.length - 1 : -1);
    }
  }, [items.length, activeIndex]);

  return {
    activeIndex,
    setActiveIndex,
    containerRef,
    navigateUp,
    navigateDown,
    navigateToFirst,
    navigateToLast,
    selectCurrent,
    // Helper props to spread on list items
    getItemProps: (index: number) => ({
      'aria-selected': index === activeIndex,
      'data-active': index === activeIndex,
      tabIndex: index === activeIndex ? 0 : -1,
      onMouseEnter: () => setActiveIndex(index),
      onClick: () => {
        setActiveIndex(index);
        if (onSelect) onSelect(items[index], index);
      },
    }),
  };
}

/**
 * Hook for roving tabindex pattern
 * Manages a single tab stop within a group of elements
 */
export function useRovingTabIndex<T extends HTMLElement = HTMLElement>(
  itemCount: number,
  options: {
    orientation?: 'horizontal' | 'vertical';
    loop?: boolean;
  } = {}
) {
  const { orientation = 'horizontal', loop = true } = options;
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemRefs = useRef<(T | null)[]>([]);

  const focusItem = useCallback((index: number) => {
    const item = itemRefs.current[index];
    if (item) {
      item.focus();
      setFocusedIndex(index);
    }
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const prevKey = orientation === 'horizontal' ? 'ArrowLeft' : 'ArrowUp';
      const nextKey = orientation === 'horizontal' ? 'ArrowRight' : 'ArrowDown';

      let newIndex = focusedIndex;

      if (event.key === prevKey) {
        event.preventDefault();
        newIndex = focusedIndex - 1;
        if (newIndex < 0) {
          newIndex = loop ? itemCount - 1 : 0;
        }
      } else if (event.key === nextKey) {
        event.preventDefault();
        newIndex = focusedIndex + 1;
        if (newIndex >= itemCount) {
          newIndex = loop ? 0 : itemCount - 1;
        }
      } else if (event.key === 'Home') {
        event.preventDefault();
        newIndex = 0;
      } else if (event.key === 'End') {
        event.preventDefault();
        newIndex = itemCount - 1;
      }

      if (newIndex !== focusedIndex) {
        focusItem(newIndex);
      }
    },
    [focusedIndex, itemCount, loop, orientation, focusItem]
  );

  const getItemProps = useCallback(
    (index: number) => ({
      ref: (el: T | null) => {
        itemRefs.current[index] = el;
      },
      tabIndex: index === focusedIndex ? 0 : -1,
      onKeyDown: handleKeyDown,
      onFocus: () => setFocusedIndex(index),
    }),
    [focusedIndex, handleKeyDown]
  );

  return {
    focusedIndex,
    setFocusedIndex,
    focusItem,
    getItemProps,
  };
}

/**
 * Hook for type-ahead search in lists
 */
export function useTypeAhead<T>(
  items: T[],
  options: {
    getLabel: (item: T) => string;
    onMatch: (item: T, index: number) => void;
    timeout?: number;
  }
) {
  const { getLabel, onMatch, timeout = 500 } = options;
  const searchStringRef = useRef('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Only handle single character keys
      if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Add character to search string
      searchStringRef.current += event.key.toLowerCase();

      // Find matching item
      const matchIndex = items.findIndex((item) =>
        getLabel(item).toLowerCase().startsWith(searchStringRef.current)
      );

      if (matchIndex !== -1) {
        onMatch(items[matchIndex], matchIndex);
      }

      // Clear search string after timeout
      timeoutRef.current = setTimeout(() => {
        searchStringRef.current = '';
      }, timeout);
    },
    [items, getLabel, onMatch, timeout]
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return { handleKeyDown };
}
