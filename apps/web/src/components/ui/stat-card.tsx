import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import { Skeleton } from './skeleton';

interface StatCardProps {
  title: string;
  value: string | number;
  previousValue?: number;
  currentValue?: number;
  icon?: LucideIcon;
  iconBgColor?: string;
  iconColor?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  trendLabel?: string;
  suffix?: string;
  prefix?: string;
  isLoading?: boolean;
  className?: string;
  onClick?: () => void;
}

export function StatCard({
  title,
  value,
  previousValue,
  currentValue,
  icon: Icon,
  iconBgColor = 'bg-blue-100',
  iconColor = 'text-blue-600',
  trend,
  trendValue,
  trendLabel,
  suffix,
  prefix,
  isLoading,
  className,
  onClick,
}: StatCardProps) {
  // Calculate trend if previousValue and currentValue provided
  let calculatedTrend = trend;
  let calculatedTrendValue = trendValue;

  if (previousValue !== undefined && currentValue !== undefined && !trend) {
    if (currentValue > previousValue) {
      calculatedTrend = 'up';
      const change = ((currentValue - previousValue) / previousValue) * 100;
      calculatedTrendValue = `+${change.toFixed(1)}%`;
    } else if (currentValue < previousValue) {
      calculatedTrend = 'down';
      const change = ((previousValue - currentValue) / previousValue) * 100;
      calculatedTrendValue = `-${change.toFixed(1)}%`;
    } else {
      calculatedTrend = 'neutral';
      calculatedTrendValue = '0%';
    }
  }

  const trendConfig = {
    up: {
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    down: {
      icon: TrendingDown,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    neutral: {
      icon: Minus,
      color: 'text-gray-500',
      bgColor: 'bg-gray-50',
    },
  };

  const trendStyles = calculatedTrend ? trendConfig[calculatedTrend] : null;

  if (isLoading) {
    return (
      <div className={cn('rounded-xl border border-gray-200 bg-white p-6 shadow-sm', className)}>
        <div className="flex items-center justify-between">
          <div className="space-y-3 flex-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-12 w-12 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all duration-200',
        onClick && 'cursor-pointer hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5',
        className
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1 flex-1">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900 animate-fade-in">
            {prefix}
            {typeof value === 'number' ? value.toLocaleString('fr-TN') : value}
            {suffix && <span className="text-base font-normal text-gray-500 ml-1">{suffix}</span>}
          </p>

          {(calculatedTrendValue || trendLabel) && trendStyles && (
            <div className="flex items-center gap-2 mt-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
                  trendStyles.bgColor,
                  trendStyles.color
                )}
              >
                <trendStyles.icon className="h-3 w-3" />
                {calculatedTrendValue}
              </span>
              {trendLabel && (
                <span className="text-xs text-gray-500">{trendLabel}</span>
              )}
            </div>
          )}
        </div>

        {Icon && (
          <div className={cn('p-3 rounded-xl', iconBgColor)}>
            <Icon className={cn('h-6 w-6', iconColor)} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Compact stat card for inline use
 */
interface MiniStatCardProps {
  title: string;
  value: string | number;
  icon?: LucideIcon;
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple' | 'gray';
  className?: string;
}

export function MiniStatCard({
  title,
  value,
  icon: Icon,
  color = 'blue',
  className,
}: MiniStatCardProps) {
  const colorConfig = {
    blue: { bg: 'bg-blue-50', text: 'text-blue-700', icon: 'text-blue-500' },
    green: { bg: 'bg-green-50', text: 'text-green-700', icon: 'text-green-500' },
    amber: { bg: 'bg-amber-50', text: 'text-amber-700', icon: 'text-amber-500' },
    red: { bg: 'bg-red-50', text: 'text-red-700', icon: 'text-red-500' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-700', icon: 'text-purple-500' },
    gray: { bg: 'bg-gray-50', text: 'text-gray-700', icon: 'text-gray-500' },
  };

  const colors = colorConfig[color];

  return (
    <div className={cn('flex items-center gap-3 p-3 rounded-lg', colors.bg, className)}>
      {Icon && <Icon className={cn('h-5 w-5', colors.icon)} />}
      <div>
        <p className="text-xs text-gray-500">{title}</p>
        <p className={cn('text-sm font-semibold', colors.text)}>
          {typeof value === 'number' ? value.toLocaleString('fr-TN') : value}
        </p>
      </div>
    </div>
  );
}

/**
 * Progress stat card with visual progress bar
 */
interface ProgressStatCardProps {
  title: string;
  current: number;
  total: number;
  unit?: string;
  color?: 'blue' | 'green' | 'amber' | 'red' | 'purple';
  showPercentage?: boolean;
  className?: string;
}

export function ProgressStatCard({
  title,
  current,
  total,
  unit = '',
  color = 'blue',
  showPercentage = true,
  className,
}: ProgressStatCardProps) {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  const colorConfig = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
  };

  return (
    <div className={cn('rounded-xl border border-gray-200 bg-white p-6 shadow-sm', className)}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        {showPercentage && (
          <span className="text-sm font-semibold text-gray-900">{percentage}%</span>
        )}
      </div>

      <div className="mb-3">
        <span className="text-2xl font-bold text-gray-900">
          {current.toLocaleString('fr-TN')}
        </span>
        <span className="text-gray-500 text-sm">
          {' '}/ {total.toLocaleString('fr-TN')} {unit}
        </span>
      </div>

      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', colorConfig[color])}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Comparison stat card showing two metrics
 */
interface ComparisonStatCardProps {
  title: string;
  metric1: { label: string; value: number; color?: string };
  metric2: { label: string; value: number; color?: string };
  className?: string;
}

export function ComparisonStatCard({
  title,
  metric1,
  metric2,
  className,
}: ComparisonStatCardProps) {
  const total = metric1.value + metric2.value;
  const percentage1 = total > 0 ? Math.round((metric1.value / total) * 100) : 50;
  const percentage2 = 100 - percentage1;

  return (
    <div className={cn('rounded-xl border border-gray-200 bg-white p-6 shadow-sm', className)}>
      <p className="text-sm font-medium text-gray-500 mb-4">{title}</p>

      <div className="flex items-center gap-4 mb-4">
        <div className="flex-1">
          <p className="text-xs text-gray-500">{metric1.label}</p>
          <p className={cn('text-xl font-bold', metric1.color ?? 'text-blue-600')}>
            {metric1.value.toLocaleString('fr-TN')}
          </p>
        </div>
        <div className="flex-1 text-right">
          <p className="text-xs text-gray-500">{metric2.label}</p>
          <p className={cn('text-xl font-bold', metric2.color ?? 'text-green-600')}>
            {metric2.value.toLocaleString('fr-TN')}
          </p>
        </div>
      </div>

      <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex">
        <div
          className={cn('h-full transition-all duration-500', metric1.color ?? 'bg-blue-500')}
          style={{ width: `${percentage1}%` }}
        />
        <div
          className={cn('h-full transition-all duration-500', metric2.color ?? 'bg-green-500')}
          style={{ width: `${percentage2}%` }}
        />
      </div>

      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>{percentage1}%</span>
        <span>{percentage2}%</span>
      </div>
    </div>
  );
}
