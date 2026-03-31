import { useNavigate } from 'react-router-dom';
import { AlertTriangle, FileWarning } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle } from 'lucide-react';

interface AlertesData {
  bulletinsEnAttente: number;
  contratsExpirant: number;
  overrideNonJustifie?: number;
}

interface AlertesPanelProps {
  data: AlertesData | undefined;
  isLoading: boolean;
}

interface AlertConfig {
  key: keyof AlertesData;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  borderColor: string;
  iconColor: string;
  badgeBg: string;
  badgeText: string;
  href: string;
}

const alerts: AlertConfig[] = [
  {
    key: 'bulletinsEnAttente',
    label: 'Bulletins en attente',
    description: 'Bulletins nécessitant une validation urgente',
    Icon: AlertTriangle,
    borderColor: 'border-l-red-500',
    iconColor: 'text-red-500',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-700',
    href: '/bulletins/validation',
  },
  {
    key: 'contratsExpirant',
    label: 'Contrats expirant bientôt',
    description: 'Contrats arrivant à échéance dans les 30 prochains jours',
    Icon: FileWarning,
    borderColor: 'border-l-orange-500',
    iconColor: 'text-orange-500',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-700',
    href: '/group-contracts',
  },
];

export default function AlertesPanel({ data, isLoading }: AlertesPanelProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <Skeleton className="h-5 w-36 mb-6" />
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Only show alerts that have count > 0
  const activeAlerts = alerts.filter((alert) => (data?.[alert.key] ?? 0) > 0);

  if (activeAlerts.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-6">
          Alertes actives
        </h3>
        <div className="flex items-center gap-3 py-4 text-center justify-center">
          <CheckCircle className="h-5 w-5 text-emerald-500" />
          <p className="text-sm text-gray-500">Aucune alerte active — tout est en ordre</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-6">
        Alertes actives
      </h3>

      <div className="space-y-3">
        {activeAlerts.map((alert) => {
          const count = data?.[alert.key] ?? 0;
          const { Icon } = alert;

          return (
            <button
              key={alert.key}
              type="button"
              onClick={() => navigate(alert.href)}
              className={`w-full flex items-center gap-4 rounded-lg border border-gray-200 border-l-4 ${alert.borderColor} bg-white p-4 text-left transition-all hover:shadow-md hover:bg-gray-50`}
            >
              <Icon className={`h-5 w-5 shrink-0 ${alert.iconColor}`} />

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {alert.label}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {alert.description}
                </p>
              </div>

              <span
                className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${alert.badgeBg} ${alert.badgeText} shrink-0`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
