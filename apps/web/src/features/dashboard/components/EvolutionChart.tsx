import { useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface MonthData {
  mois: string;
  bulletins: number;
  montant_rembourse: number;
}

interface EvolutionChartProps {
  data: MonthData[] | undefined;
  isLoading: boolean;
}

function formatMontant(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString('fr-TN');
}

export default function EvolutionChart({ data, isLoading }: EvolutionChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <Skeleton className="h-5 w-48 mb-6" />
        <div className="flex items-end gap-2 h-48">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton
              key={i}
              className="flex-1 rounded-t"
              style={{ height: `${30 + Math.random() * 70}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  const months = data ?? [];
  const maxBulletins = Math.max(...months.map((m) => m.bulletins), 1);
  const BAR_MAX_HEIGHT = 192; // 12rem

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-gray-900 mb-6">
        Évolution mensuelle
      </h3>

      <div className="relative flex items-end gap-2" style={{ height: BAR_MAX_HEIGHT }}>
        {months?.map((month, index) => {
          const heightPct = (month.bulletins / maxBulletins) * 100;

          return (
            <div
              key={month.mois}
              className="relative flex-1 flex flex-col items-center justify-end h-full"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Tooltip */}
              {hoveredIndex === index && (
                <div className="absolute bottom-full mb-2 z-10 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg whitespace-nowrap text-xs">
                  <p className="font-semibold text-gray-900">{month.mois}</p>
                  <p className="text-gray-600">
                    Bulletins : {month.bulletins.toLocaleString('fr-TN')}
                  </p>
                  <p className="text-gray-600">
                    Remboursé : {formatMontant(month.montant_rembourse)} TND
                  </p>
                </div>
              )}

              {/* Bar */}
              <div
                className="w-full rounded-t-md bg-blue-500 transition-all duration-300 hover:bg-blue-600 cursor-pointer min-h-[4px]"
                style={{ height: `${heightPct}%` }}
              />
            </div>
          );
        })}
      </div>

      {/* Month labels */}
      <div className="flex gap-2 mt-2">
        {months?.map((month) => (
          <div key={month.mois} className="flex-1 text-center">
            <span className="text-[10px] font-medium text-gray-500 leading-none">
              {month.mois}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
