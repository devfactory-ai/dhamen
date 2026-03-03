import * as React from 'react';
import { Button, type ButtonProps } from './button';
import { cn } from '@/lib/utils';
import { Loader2, Check, AlertCircle } from 'lucide-react';

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

interface LoadingButtonProps extends ButtonProps {
  isLoading?: boolean;
  loadingText?: string;
  successText?: string;
  errorText?: string;
  showSuccessState?: boolean;
  showErrorState?: boolean;
  onSuccess?: () => void;
  onError?: () => void;
}

export const LoadingButton = React.forwardRef<HTMLButtonElement, LoadingButtonProps>(
  (
    {
      children,
      isLoading,
      loadingText,
      successText,
      errorText,
      showSuccessState = true,
      showErrorState = true,
      className,
      disabled,
      onClick,
      onSuccess,
      onError,
      ...props
    },
    ref
  ) => {
    const [state, setState] = React.useState<LoadingState>('idle');
    const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

    React.useEffect(() => {
      if (isLoading) {
        setState('loading');
      } else if (state === 'loading') {
        setState('idle');
      }
    }, [isLoading, state]);

    React.useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }, []);

    const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
      if (onClick) {
        try {
          setState('loading');
          await onClick(e);
          if (showSuccessState) {
            setState('success');
            onSuccess?.();
            timeoutRef.current = setTimeout(() => {
              setState('idle');
            }, 2000);
          } else {
            setState('idle');
          }
        } catch {
          if (showErrorState) {
            setState('error');
            onError?.();
            timeoutRef.current = setTimeout(() => {
              setState('idle');
            }, 2000);
          } else {
            setState('idle');
          }
        }
      }
    };

    const isDisabled = disabled || state === 'loading';

    const renderContent = () => {
      switch (state) {
        case 'loading':
          return (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {loadingText ?? children}
            </>
          );
        case 'success':
          return (
            <>
              <Check className="mr-2 h-4 w-4 animate-scale-in text-green-500" />
              {successText ?? 'Succès'}
            </>
          );
        case 'error':
          return (
            <>
              <AlertCircle className="mr-2 h-4 w-4 animate-scale-in text-red-500" />
              {errorText ?? 'Erreur'}
            </>
          );
        default:
          return children;
      }
    };

    return (
      <Button
        ref={ref}
        className={cn(
          'transition-all duration-200',
          state === 'success' && 'bg-green-500 hover:bg-green-600',
          state === 'error' && 'bg-red-500 hover:bg-red-600',
          className
        )}
        disabled={isDisabled}
        onClick={handleClick}
        {...props}
      >
        {renderContent()}
      </Button>
    );
  }
);

LoadingButton.displayName = 'LoadingButton';

/**
 * Simple loading spinner for inline use
 */
export function LoadingSpinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  };

  return (
    <Loader2 className={cn('animate-spin text-blue-600', sizeClasses[size], className)} />
  );
}

/**
 * Full page loading overlay
 */
export function LoadingOverlay({
  isVisible,
  message,
}: {
  isVisible: boolean;
  message?: string;
}) {
  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm animate-fade-in">
      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <div className="h-16 w-16 rounded-full border-4 border-blue-100" />
          <div className="absolute top-0 h-16 w-16 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
        {message && (
          <p className="text-gray-600 font-medium animate-pulse">{message}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Inline loading indicator
 */
export function InlineLoading({ text = 'Chargement...' }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 text-gray-500">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="text-sm">{text}</span>
    </div>
  );
}
