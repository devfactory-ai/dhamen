import { useEffect, useRef, useState, createContext, useContext, useCallback } from 'react';

/**
 * Visually hidden text that is still accessible to screen readers
 */
export function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return (
    <span className="sr-only">
      {children}
    </span>
  );
}

/**
 * Live region for announcing dynamic content changes to screen readers
 */
export function LiveRegion({
  children,
  'aria-live': ariaLive = 'polite',
  'aria-atomic': ariaAtomic = true,
  role,
  className,
}: {
  children: React.ReactNode;
  'aria-live'?: 'polite' | 'assertive' | 'off';
  'aria-atomic'?: boolean;
  role?: 'status' | 'alert' | 'log';
  className?: string;
}) {
  return (
    <div
      aria-live={ariaLive}
      aria-atomic={ariaAtomic}
      role={role}
      className={className}
    >
      {children}
    </div>
  );
}

/**
 * Screen reader announcer context
 */
interface AnnouncerContextType {
  announce: (message: string, priority?: 'polite' | 'assertive') => void;
}

const AnnouncerContext = createContext<AnnouncerContextType | null>(null);

/**
 * Provider for screen reader announcements
 * Wrap your app with this to enable announcements
 */
export function AnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [politeMessage, setPoliteMessage] = useState('');
  const [assertiveMessage, setAssertiveMessage] = useState('');
  const politeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const assertiveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    // Clear any pending timeout
    if (priority === 'polite') {
      if (politeTimeoutRef.current) {
        clearTimeout(politeTimeoutRef.current);
      }
      // Clear and re-set to trigger announcement
      setPoliteMessage('');
      politeTimeoutRef.current = setTimeout(() => {
        setPoliteMessage(message);
        // Clear message after announcement
        politeTimeoutRef.current = setTimeout(() => setPoliteMessage(''), 1000);
      }, 50);
    } else {
      if (assertiveTimeoutRef.current) {
        clearTimeout(assertiveTimeoutRef.current);
      }
      setAssertiveMessage('');
      assertiveTimeoutRef.current = setTimeout(() => {
        setAssertiveMessage(message);
        assertiveTimeoutRef.current = setTimeout(() => setAssertiveMessage(''), 1000);
      }, 50);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (politeTimeoutRef.current) clearTimeout(politeTimeoutRef.current);
      if (assertiveTimeoutRef.current) clearTimeout(assertiveTimeoutRef.current);
    };
  }, []);

  return (
    <AnnouncerContext.Provider value={{ announce }}>
      {children}
      {/* Polite announcements */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {politeMessage}
      </div>
      {/* Assertive announcements */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        {assertiveMessage}
      </div>
    </AnnouncerContext.Provider>
  );
}

/**
 * Hook to announce messages to screen readers
 */
export function useAnnounce() {
  const context = useContext(AnnouncerContext);
  if (!context) {
    // Return a no-op if provider is not available
    return {
      announce: (_message: string, _priority?: 'polite' | 'assertive') => {
        console.warn('AnnouncerProvider not found. Screen reader announcements disabled.');
      },
    };
  }
  return context;
}

/**
 * Status message component for forms and actions
 */
export function StatusMessage({
  type,
  children,
}: {
  type: 'success' | 'error' | 'loading' | 'info';
  children: React.ReactNode;
}) {
  const roleMap = {
    success: 'status' as const,
    error: 'alert' as const,
    loading: 'status' as const,
    info: 'status' as const,
  };

  const ariaLiveMap = {
    success: 'polite' as const,
    error: 'assertive' as const,
    loading: 'polite' as const,
    info: 'polite' as const,
  };

  return (
    <div role={roleMap[type]} aria-live={ariaLiveMap[type]} aria-atomic="true">
      {children}
    </div>
  );
}
