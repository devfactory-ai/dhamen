import { forwardRef, useId, createContext, useContext } from 'react';
import { cn } from '@/lib/utils';

/**
 * Form field context for connecting labels, inputs, and error messages
 */
interface FormFieldContextType {
  id: string;
  errorId: string;
  descriptionId: string;
  hasError: boolean;
}

const FormFieldContext = createContext<FormFieldContextType | null>(null);

function useFormFieldContext() {
  return useContext(FormFieldContext);
}

/**
 * Accessible form field wrapper
 * Provides automatic ID generation and ARIA connections
 */
export function FormField({
  children,
  error,
  className,
}: {
  children: React.ReactNode;
  error?: string | boolean;
  className?: string;
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const descriptionId = `${id}-description`;
  const hasError = Boolean(error);

  return (
    <FormFieldContext.Provider value={{ id, errorId, descriptionId, hasError }}>
      <div className={cn('space-y-1.5', className)}>
        {children}
        {typeof error === 'string' && error && (
          <FormError id={errorId}>{error}</FormError>
        )}
      </div>
    </FormFieldContext.Provider>
  );
}

/**
 * Accessible form label
 */
export function FormLabel({
  children,
  required,
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & {
  required?: boolean;
}) {
  const context = useFormFieldContext();

  return (
    <label
      htmlFor={context?.id}
      className={cn(
        'block text-sm font-medium text-gray-700',
        context?.hasError && 'text-red-700',
        className
      )}
      {...props}
    >
      {children}
      {required && (
        <span className="text-red-500 ml-1" aria-hidden="true">
          *
        </span>
      )}
      {required && <span className="sr-only">(requis)</span>}
    </label>
  );
}

/**
 * Accessible form input
 */
export const FormInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & {
    hasError?: boolean;
  }
>(({ className, hasError: hasErrorProp, ...props }, ref) => {
  const context = useFormFieldContext();
  const hasError = hasErrorProp ?? context?.hasError;

  return (
    <input
      ref={ref}
      id={context?.id}
      aria-invalid={hasError || undefined}
      aria-describedby={
        [
          hasError ? context?.errorId : null,
          context?.descriptionId,
        ]
          .filter(Boolean)
          .join(' ') || undefined
      }
      className={cn(
        'flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2',
        'text-sm ring-offset-white',
        'placeholder:text-gray-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        hasError && 'border-red-500 focus-visible:ring-red-500',
        className
      )}
      {...props}
    />
  );
});
FormInput.displayName = 'FormInput';

/**
 * Accessible form textarea
 */
export const FormTextarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    hasError?: boolean;
  }
>(({ className, hasError: hasErrorProp, ...props }, ref) => {
  const context = useFormFieldContext();
  const hasError = hasErrorProp ?? context?.hasError;

  return (
    <textarea
      ref={ref}
      id={context?.id}
      aria-invalid={hasError || undefined}
      aria-describedby={
        [
          hasError ? context?.errorId : null,
          context?.descriptionId,
        ]
          .filter(Boolean)
          .join(' ') || undefined
      }
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-gray-200 bg-white px-3 py-2',
        'text-sm ring-offset-white',
        'placeholder:text-gray-500',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        hasError && 'border-red-500 focus-visible:ring-red-500',
        className
      )}
      {...props}
    />
  );
});
FormTextarea.displayName = 'FormTextarea';

/**
 * Accessible form select
 */
export const FormSelect = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    hasError?: boolean;
  }
>(({ className, hasError: hasErrorProp, children, ...props }, ref) => {
  const context = useFormFieldContext();
  const hasError = hasErrorProp ?? context?.hasError;

  return (
    <select
      ref={ref}
      id={context?.id}
      aria-invalid={hasError || undefined}
      aria-describedby={
        [
          hasError ? context?.errorId : null,
          context?.descriptionId,
        ]
          .filter(Boolean)
          .join(' ') || undefined
      }
      className={cn(
        'flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2',
        'text-sm ring-offset-white',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        hasError && 'border-red-500 focus-visible:ring-red-500',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
});
FormSelect.displayName = 'FormSelect';

/**
 * Form field description/help text
 */
export function FormDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const context = useFormFieldContext();

  return (
    <p
      id={context?.descriptionId}
      className={cn('text-sm text-gray-500', className)}
    >
      {children}
    </p>
  );
}

/**
 * Form field error message
 */
export function FormError({
  children,
  id,
  className,
}: {
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  const context = useFormFieldContext();

  return (
    <p
      id={id || context?.errorId}
      role="alert"
      aria-live="polite"
      className={cn('text-sm text-red-600 flex items-center gap-1', className)}
    >
      <svg
        className="h-4 w-4 flex-shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
      {children}
    </p>
  );
}

/**
 * Accessible fieldset/legend for grouped form fields
 */
export function FormFieldset({
  children,
  legend,
  description,
  className,
}: {
  children: React.ReactNode;
  legend: string;
  description?: string;
  className?: string;
}) {
  const descId = useId();

  return (
    <fieldset
      className={cn('space-y-4', className)}
      aria-describedby={description ? descId : undefined}
    >
      <legend className="text-base font-semibold text-gray-900">{legend}</legend>
      {description && (
        <p id={descId} className="text-sm text-gray-500 -mt-2">
          {description}
        </p>
      )}
      {children}
    </fieldset>
  );
}

/**
 * Accessible checkbox with label
 */
export function FormCheckbox({
  children,
  id,
  error,
  description,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  error?: string;
  description?: string;
}) {
  const generatedId = useId();
  const checkboxId = id || generatedId;
  const descId = `${checkboxId}-desc`;
  const errorId = `${checkboxId}-error`;

  return (
    <div className={cn('relative flex items-start', className)}>
      <div className="flex h-6 items-center">
        <input
          type="checkbox"
          id={checkboxId}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [description ? descId : null, error ? errorId : null]
              .filter(Boolean)
              .join(' ') || undefined
          }
          className={cn(
            'h-4 w-4 rounded border-gray-300 text-blue-600',
            'focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
            error && 'border-red-500'
          )}
          {...props}
        />
      </div>
      <div className="ml-3 text-sm leading-6">
        <label htmlFor={checkboxId} className="font-medium text-gray-900">
          {children}
        </label>
        {description && (
          <p id={descId} className="text-gray-500">
            {description}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Accessible radio group
 */
export function FormRadioGroup({
  name,
  legend,
  options,
  value,
  onChange,
  error,
  className,
}: {
  name: string;
  legend: string;
  options: { value: string; label: string; description?: string }[];
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
  className?: string;
}) {
  const errorId = useId();

  return (
    <fieldset className={cn('space-y-3', className)}>
      <legend className="text-sm font-semibold text-gray-900">{legend}</legend>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="space-y-2">
        {options.map((option) => (
          <div key={option.value} className="relative flex items-start">
            <div className="flex h-6 items-center">
              <input
                type="radio"
                name={name}
                id={`${name}-${option.value}`}
                value={option.value}
                checked={value === option.value}
                onChange={(e) => onChange?.(e.target.value)}
                aria-describedby={error ? errorId : undefined}
                className={cn(
                  'h-4 w-4 border-gray-300 text-blue-600',
                  'focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
                  error && 'border-red-500'
                )}
              />
            </div>
            <div className="ml-3 text-sm leading-6">
              <label
                htmlFor={`${name}-${option.value}`}
                className="font-medium text-gray-900"
              >
                {option.label}
              </label>
              {option.description && (
                <p className="text-gray-500">{option.description}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
