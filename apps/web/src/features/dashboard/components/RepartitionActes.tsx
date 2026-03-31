import { Skeleton } from '@/components/ui/skeleton';

interface ActeData {
  type_acte: string;
  count: number;
  montant: number;
}

interface RepartitionActesProps {
  data: ActeData[] | undefined;
  isLoading: boolean;
}

const BAR_COLORS = [
  'bg-blue-500',
  'bg-indigo-500',
  'bg-blue-400',
  'bg-indigo-400',
  'bg-blue-600',
  'bg-indigo-600',
];

export default function RepartitionActes({ data, isLoading }: RepartitionActesProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <Skeleton className="h-5 w-56 mb-6" />
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-6 flex-1 rounded" />
              <Skeleton className="h-4 w-10" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const sorted = [...(data ?? [])].sort((a, b) => b.count - a.count);
  const maxCount = Math.max(...sorted.map((d) => d.count), 1);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-6">
        Répartition par type d'acte
      </h3>

      <div className="space-y-4">
        {sorted.map((item, index) => {
          const widthPct = (item.count / maxCount) * 100;
          const color = BAR_COLORS[index % BAR_COLORS.length];

          return (
            <div key={item.type_acte} className="flex items-center gap-3">
              <span className="text-sm text-gray-600 w-28 shrink-0 truncate" title={item.type_acte}>
                {item.type_acte}
              </span>
              <div className="flex-1 h-7 bg-gray-100 rounded-md overflow-hidden">
                <div
                  className={`h-full rounded-md transition-all duration-500 ${color}`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              <span className="text-sm font-semibold text-gray-900 w-12 text-right shrink-0">
                {item.count.toLocaleString('fr-TN')}
              </span>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            Aucune donnée disponible
          </p>
        )}
      </div>
    </div>
  );
}
