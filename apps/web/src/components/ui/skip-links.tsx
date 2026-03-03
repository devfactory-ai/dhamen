import { cn } from '@/lib/utils';

interface SkipLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Skip link for keyboard navigation
 * Allows users to skip repetitive content and navigate directly to main content
 */
export function SkipLink({ href, children, className }: SkipLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        'sr-only focus:not-sr-only',
        'fixed top-4 left-4 z-[100]',
        'bg-blue-600 text-white px-4 py-2 rounded-md',
        'font-medium text-sm',
        'focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2',
        'transition-all duration-200',
        className
      )}
    >
      {children}
    </a>
  );
}

/**
 * Skip links container with common navigation targets
 */
export function SkipLinks() {
  return (
    <div className="skip-links">
      <SkipLink href="#main-content">
        Aller au contenu principal
      </SkipLink>
      <SkipLink href="#main-navigation" className="focus:left-44">
        Aller à la navigation
      </SkipLink>
    </div>
  );
}

/**
 * Landmark wrapper for main content area
 */
export function MainContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main
      id="main-content"
      role="main"
      tabIndex={-1}
      className={cn('outline-none', className)}
    >
      {children}
    </main>
  );
}

/**
 * Landmark wrapper for navigation
 */
export function MainNavigation({
  children,
  className,
  label = 'Navigation principale',
}: {
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <nav
      id="main-navigation"
      role="navigation"
      aria-label={label}
      className={className}
    >
      {children}
    </nav>
  );
}
