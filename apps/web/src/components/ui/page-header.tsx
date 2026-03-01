import { Button } from './button';

interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  badge?: {
    label: string;
    variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  };
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    variant?: 'default' | 'outline' | 'secondary';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
  };
  breadcrumb?: Array<{ label: string; href?: string }>;
}

const badgeVariants = {
  default: 'bg-gray-100 text-gray-700',
  success: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  danger: 'bg-red-100 text-red-700',
  info: 'bg-blue-100 text-blue-700',
};

export function PageHeader({
  title,
  description,
  icon,
  badge,
  action,
  secondaryAction,
  breadcrumb,
}: PageHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex items-center gap-2 text-sm">
          {breadcrumb.map((item, index) => (
            <div key={item.label} className="flex items-center gap-2">
              {index > 0 && (
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              )}
              {item.href ? (
                <a href={item.href} className="text-gray-500 hover:text-gray-700 transition-colors">
                  {item.label}
                </a>
              ) : (
                <span className="text-gray-900 font-medium">{item.label}</span>
              )}
            </div>
          ))}
        </nav>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          {icon && (
            <div className="hidden sm:flex w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 items-center justify-center text-white shadow-lg shadow-blue-500/25">
              {icon}
            </div>
          )}

          {/* Title & Description */}
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
              {badge && (
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badgeVariants[badge.variant || 'default']}`}>
                  {badge.label}
                </span>
              )}
            </div>
            {description && (
              <p className="text-gray-500 text-sm max-w-2xl">{description}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {secondaryAction && (
            <Button
              variant="outline"
              onClick={secondaryAction.onClick}
              className="gap-2"
            >
              {secondaryAction.icon}
              {secondaryAction.label}
            </Button>
          )}
          {action && (
            <Button
              variant={action.variant || 'default'}
              onClick={action.onClick}
              className="gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25"
            >
              {action.icon}
              {action.label}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
