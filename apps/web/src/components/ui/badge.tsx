import type * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-gray-100 text-gray-800',
        secondary: 'border-transparent bg-gray-100 text-gray-600',
        destructive: 'border-transparent bg-red-100 text-red-700',
        outline: 'text-gray-600 border-gray-300',
        success: 'border-transparent bg-emerald-100 text-emerald-700',
        warning: 'border-transparent bg-amber-100 text-amber-700',
        info: 'border-transparent bg-blue-100 text-blue-700',
        purple: 'border-transparent bg-purple-100 text-purple-700',
        pink: 'border-transparent bg-pink-100 text-pink-700',
        teal: 'border-transparent bg-teal-100 text-teal-700',
        // Status badges with dots
        'status-active': 'border-transparent bg-emerald-50 text-emerald-700 pl-2',
        'status-pending': 'border-transparent bg-amber-50 text-amber-700 pl-2',
        'status-inactive': 'border-transparent bg-gray-100 text-gray-600 pl-2',
        'status-error': 'border-transparent bg-red-50 text-red-700 pl-2',
      },
      size: {
        default: 'px-2.5 py-0.5 text-xs',
        sm: 'px-2 py-0.5 text-[10px]',
        lg: 'px-3 py-1 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
  icon?: React.ReactNode;
}

function Badge({ className, variant, size, dot, icon, children, ...props }: BadgeProps) {
  const isStatusVariant = variant?.toString().startsWith('status-');

  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {(dot || isStatusVariant) && (
        <span className={cn(
          'w-1.5 h-1.5 rounded-full mr-1.5',
          variant === 'status-active' && 'bg-emerald-500',
          variant === 'status-pending' && 'bg-amber-500 animate-pulse',
          variant === 'status-inactive' && 'bg-gray-400',
          variant === 'status-error' && 'bg-red-500',
          !isStatusVariant && dot && 'bg-current opacity-70',
        )} />
      )}
      {icon && <span className="mr-1">{icon}</span>}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
