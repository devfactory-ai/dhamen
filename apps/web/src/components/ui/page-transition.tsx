import { cn } from '@/lib/utils';
import { Suspense, type ReactNode } from 'react';
import { SkeletonDashboard, SkeletonDetailPage, SkeletonTable } from './skeleton';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
}

/**
 * Page wrapper with fade-in animation
 */
export function PageTransition({ children, className }: PageTransitionProps) {
  return (
    <div className={cn('animate-fade-in-up', className)}>
      {children}
    </div>
  );
}

/**
 * Page header with consistent styling
 */
interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
  className?: string;
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-3 flex items-center gap-2 text-sm text-gray-500">
          {breadcrumbs.map((crumb, index) => (
            <span key={index} className="flex items-center gap-2">
              {index > 0 && <span>/</span>}
              {crumb.href ? (
                <a
                  href={crumb.href}
                  className="hover:text-gray-700 transition-colors"
                >
                  {crumb.label}
                </a>
              ) : (
                <span className="text-gray-900 font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {description && (
            <p className="mt-1 text-gray-500">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-3">{actions}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Page section with title
 */
interface PageSectionProps {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PageSection({
  title,
  description,
  actions,
  children,
  className,
}: PageSectionProps) {
  return (
    <section className={cn('mb-8', className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && (
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            )}
            {description && (
              <p className="text-sm text-gray-500 mt-0.5">{description}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Loading fallback components for different page types
 */
export function DashboardPageFallback() {
  return (
    <PageTransition>
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
        <SkeletonDashboard />
      </div>
    </PageTransition>
  );
}

export function DetailPageFallback() {
  return (
    <PageTransition>
      <div className="p-6">
        <SkeletonDetailPage />
      </div>
    </PageTransition>
  );
}

export function TablePageFallback() {
  return (
    <PageTransition>
      <div className="p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="flex gap-2">
            <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
        <SkeletonTable rows={8} columns={6} />
      </div>
    </PageTransition>
  );
}

/**
 * Suspense wrapper with appropriate fallback
 */
interface SuspensePageProps {
  children: ReactNode;
  type?: 'dashboard' | 'detail' | 'table' | 'custom';
  fallback?: ReactNode;
}

export function SuspensePage({
  children,
  type = 'dashboard',
  fallback,
}: SuspensePageProps) {
  const getFallback = () => {
    if (fallback) return fallback;

    switch (type) {
      case 'dashboard':
        return <DashboardPageFallback />;
      case 'detail':
        return <DetailPageFallback />;
      case 'table':
        return <TablePageFallback />;
      default:
        return <DashboardPageFallback />;
    }
  };

  return <Suspense fallback={getFallback()}>{children}</Suspense>;
}
