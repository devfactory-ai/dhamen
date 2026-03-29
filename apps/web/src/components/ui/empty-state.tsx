import { cn } from '@/lib/utils';
import { Button } from './button';
import {
  FileText,
  Users,
  CreditCard,
  Search,
  Inbox,
  FileSearch,
  AlertCircle,
  WifiOff,
  Clock,
  ShieldAlert,
  Building2,
  Stethoscope,
  Receipt,
  type LucideIcon,
} from 'lucide-react';

type EmptyStateType =
  | 'no-data'
  | 'no-results'
  | 'error'
  | 'offline'
  | 'no-access'
  | 'coming-soon'
  | 'adherents'
  | 'providers'
  | 'claims'
  | 'contracts'
  | 'cards'
  | 'documents'
  | 'custom';

interface EmptyStateConfig {
  icon: LucideIcon;
  title: string;
  description: string;
  iconBgColor: string;
  iconColor: string;
}

const emptyStateConfigs: Record<Exclude<EmptyStateType, 'custom'>, EmptyStateConfig> = {
  'no-data': {
    icon: Inbox,
    title: 'Aucune donnée',
    description: 'Aucun élément à afficher pour le moment.',
    iconBgColor: 'bg-gray-100',
    iconColor: 'text-gray-400',
  },
  'no-results': {
    icon: FileSearch,
    title: 'Aucun résultat',
    description: 'Aucun résultat ne correspond à votre recherche. Essayez de modifier vos filtres.',
    iconBgColor: 'bg-blue-50',
    iconColor: 'text-blue-400',
  },
  error: {
    icon: AlertCircle,
    title: 'Une erreur est survenue',
    description: "Impossible de charger les données. Veuillez réessayer.",
    iconBgColor: 'bg-red-50',
    iconColor: 'text-red-400',
  },
  offline: {
    icon: WifiOff,
    title: 'Vous êtes hors ligne',
    description: 'Vérifiez votre connexion internet et réessayez.',
    iconBgColor: 'bg-amber-50',
    iconColor: 'text-amber-400',
  },
  'no-access': {
    icon: ShieldAlert,
    title: 'Accès refusé',
    description: "Vous n'avez pas les permissions nécessaires pour accéder à cette ressource.",
    iconBgColor: 'bg-red-50',
    iconColor: 'text-red-400',
  },
  'coming-soon': {
    icon: Clock,
    title: 'Bientôt disponible',
    description: 'Cette fonctionnalité sera disponible prochainement.',
    iconBgColor: 'bg-purple-50',
    iconColor: 'text-purple-400',
  },
  adherents: {
    icon: Users,
    title: 'Aucun adhérent',
    description: "Commencez par ajouter des adhérents à votre système.",
    iconBgColor: 'bg-blue-50',
    iconColor: 'text-blue-400',
  },
  providers: {
    icon: Stethoscope,
    title: 'Aucun praticien',
    description: 'Ajoutez des praticiens de santé pour commencer.',
    iconBgColor: 'bg-green-50',
    iconColor: 'text-green-400',
  },
  claims: {
    icon: Receipt,
    title: 'Aucune demande',
    description: "Aucune demande de prise en charge n'a été soumise.",
    iconBgColor: 'bg-amber-50',
    iconColor: 'text-amber-400',
  },
  contracts: {
    icon: FileText,
    title: 'Aucun contrat',
    description: 'Aucun contrat actif pour le moment.',
    iconBgColor: 'bg-indigo-50',
    iconColor: 'text-indigo-400',
  },
  cards: {
    icon: CreditCard,
    title: 'Aucune carte',
    description: 'Aucune carte adhérent générée.',
    iconBgColor: 'bg-teal-50',
    iconColor: 'text-teal-400',
  },
  documents: {
    icon: FileText,
    title: 'Aucun document',
    description: 'Aucun document disponible.',
    iconBgColor: 'bg-gray-100',
    iconColor: 'text-gray-400',
  },
};

interface EmptyStateProps {
  type?: EmptyStateType;
  title?: string;
  description?: string;
  icon?: LucideIcon;
  iconBgColor?: string;
  iconColor?: string;
  action?: {
    label: string;
    onClick: () => void;
    variant?: 'default' | 'outline' | 'ghost';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function EmptyState({
  type = 'no-data',
  title,
  description,
  icon,
  iconBgColor,
  iconColor,
  action,
  secondaryAction,
  className,
  size = 'md',
}: EmptyStateProps) {
  const config = type !== 'custom' ? emptyStateConfigs[type] : null;

  const Icon = icon ?? config?.icon ?? Inbox;
  const finalTitle = title ?? config?.title ?? 'Aucune donnée';
  const finalDescription = description ?? config?.description ?? '';
  const finalIconBgColor = iconBgColor ?? config?.iconBgColor ?? 'bg-gray-100';
  const finalIconColor = iconColor ?? config?.iconColor ?? 'text-gray-400';

  const sizeClasses = {
    sm: {
      container: 'py-8',
      iconWrapper: 'w-12 h-12',
      icon: 'w-6 h-6',
      title: 'text-base',
      description: 'text-sm',
    },
    md: {
      container: 'py-16',
      iconWrapper: 'w-16 h-16',
      icon: 'w-8 h-8',
      title: 'text-lg',
      description: 'text-sm',
    },
    lg: {
      container: 'py-24',
      iconWrapper: 'w-20 h-20',
      icon: 'w-10 h-10',
      title: 'text-xl',
      description: 'text-base',
    },
  };

  const sizes = sizeClasses[size];

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-4',
        sizes.container,
        className
      )}
    >
      <div
        className={cn(
          'rounded-full flex items-center justify-center mb-4',
          finalIconBgColor,
          sizes.iconWrapper
        )}
      >
        <Icon className={cn(finalIconColor, sizes.icon)} />
      </div>

      <h3 className={cn('font-semibold text-gray-900 mb-2', sizes.title)}>
        {finalTitle}
      </h3>

      <p className={cn('text-gray-500 max-w-md mb-6', sizes.description)}>
        {finalDescription}
      </p>

      {(action || secondaryAction) && (
        <div className="flex items-center gap-3">
          {action && (
            <Button
              onClick={action.onClick}
              variant={action.variant ?? 'default'}
            >
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button
              onClick={secondaryAction.onClick}
              variant="outline"
            >
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Empty state for search results
 */
export function SearchEmptyState({
  searchTerm,
  onClear,
}: {
  searchTerm: string;
  onClear?: () => void;
}) {
  return (
    <EmptyState
      type="no-results"
      title="Aucun résultat trouvé"
      description={`Aucun résultat pour "${searchTerm}". Essayez avec d'autres termes.`}
      action={
        onClear
          ? {
              label: 'Effacer la recherche',
              onClick: onClear,
              variant: 'outline',
            }
          : undefined
      }
    />
  );
}

/**
 * Empty state for error scenarios
 */
export function ErrorEmptyState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <EmptyState
      type="error"
      description={message ?? "Une erreur inattendue s'est produite."}
      action={
        onRetry
          ? {
              label: 'Réessayer',
              onClick: onRetry,
            }
          : undefined
      }
    />
  );
}

/**
 * Empty state for offline scenarios
 */
export function OfflineEmptyState({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      type="offline"
      action={
        onRetry
          ? {
              label: 'Réessayer',
              onClick: onRetry,
            }
          : undefined
      }
    />
  );
}
