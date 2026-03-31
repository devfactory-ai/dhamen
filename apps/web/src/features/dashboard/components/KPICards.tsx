import { FileText, Clock, CheckCircle, Banknote } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface KPIData {
  totalBulletins: number;
  enAttente: number;
  tauxApprobation: number;
  montantRembourse: number;
}

interface KPICardsProps {
  data: KPIData | undefined;
  isLoading: boolean;
}

function formatMontant(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('fr-TN');
}

const cards = [
  {
    key: 'totalBulletins' as const,
    title: 'Total bulletins (ce mois)',
    iconBg: 'bg-blue-100',
    iconColor: 'text-blue-600',
    Icon: FileText,
    format: (v: number) => v.toLocaleString('fr-TN'),
    suffix: undefined,
  },
  {
    key: 'enAttente' as const,
    title: 'En attente',
    iconBg: 'bg-amber-100',
    iconColor: 'text-amber-600',
    Icon: Clock,
    format: (v: number) => v.toLocaleString('fr-TN'),
    suffix: undefined,
  },
  {
    key: 'tauxApprobation' as const,
    title: "Taux d'approbation",
    iconBg: 'bg-emerald-100',
    iconColor: 'text-emerald-600',
    Icon: CheckCircle,
    format: (v: number) => `${v.toFixed(1)}`,
    suffix: '%',
  },
  {
    key: 'montantRembourse' as const,
    title: 'Montant remboursé',
    iconBg: 'bg-purple-100',
    iconColor: 'text-purple-600',
    Icon: Banknote,
    format: (v: number) => formatMontant(v),
    suffix: 'TND',
  },
] as const;

export default function KPICards({ data, isLoading }: KPICardsProps) {
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const { key, title, iconBg, iconColor, Icon, format, suffix } = card;

        if (isLoading) {
          return (
            <div
              key={key}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-3 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-32" />
                </div>
                <Skeleton className="h-12 w-12 rounded-xl" />
              </div>
            </div>
          );
        }

        const value = data?.[key] ?? 0;

        return (
          <div
            key={key}
            className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between">
              <div className="space-y-1 flex-1">
                <p className="text-sm font-medium text-gray-500">{title}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {format(value)}
                  {suffix && (
                    <span className="ml-1 text-base font-normal text-gray-500">
                      {suffix}
                    </span>
                  )}
                </p>
              </div>
              <div className={`p-3 rounded-xl ${iconBg}`}>
                <Icon className={`h-6 w-6 ${iconColor}`} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
