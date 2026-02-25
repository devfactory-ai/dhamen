import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Error message to display */
  error?: string;
  /** ID for the error message element (for aria-describedby) */
  errorId?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, errorId, 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, ...props }, ref) => {
    const hasError = Boolean(error);
    const errorElementId = errorId || (props.id ? `${props.id}-error` : undefined);

    // Combine aria-describedby with error id if error exists
    const describedBy = hasError && errorElementId
      ? ariaDescribedBy ? `${ariaDescribedBy} ${errorElementId}` : errorElementId
      : ariaDescribedBy;

    return (
      <div className="w-full">
        <input
          type={type}
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
            hasError && 'border-destructive focus-visible:ring-destructive',
            className
          )}
          ref={ref}
          aria-invalid={ariaInvalid ?? hasError}
          aria-describedby={describedBy}
          {...props}
        />
        {error && errorElementId && (
          <p
            id={errorElementId}
            className="mt-1.5 text-sm text-destructive"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
