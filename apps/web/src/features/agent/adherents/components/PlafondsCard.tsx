import type { PlafondAvecFamille } from '../../hooks/use-adherent-plafonds';

interface PlafondsCardProps {
  global: PlafondAvecFamille | null;
  parFamille: PlafondAvecFamille[];
  totalConsomme: number;
  totalPlafond: number;
}

/**
 * Formats millimes to Tunisian Dinars (1 DT = 1000 millimes).
 */
function formatMontant(millimes: number): string {
  return `${(millimes / 1000).toFixed(3)} DT`;
}

/**
 * Progress bar with color coding: green < 50%, yellow 50-80%, red >= 80%.
 */
function ProgressBar({ percentage }: { percentage: number }) {
  const color =
    percentage >= 80
      ? 'bg-red-500'
      : percentage >= 50
        ? 'bg-yellow-500'
        : 'bg-green-500';

  return (
    <div className="w-full bg-gray-200 rounded-full h-2">
      <div
        className={`h-2 rounded-full ${color}`}
        style={{ width: `${Math.min(100, percentage)}%` }}
      />
    </div>
  );
}

/**
 * Card displaying plafond consumption with progress bars.
 * Shows global plafond at the top with an alert when >= 80%,
 * followed by per-act-family breakdown.
 */
export function PlafondsCard({
  global,
  parFamille,
  totalConsomme,
  totalPlafond,
}: PlafondsCardProps) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">
        Plafonds de remboursement
      </h3>

      {global && (
        <div className="p-3 rounded-md bg-gray-50 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Plafond global</span>
            <span
              className={
                global.pourcentageConsomme >= 80
                  ? 'text-red-600 font-semibold'
                  : 'text-gray-600'
              }
            >
              {formatMontant(global.montantConsomme)} /{' '}
              {formatMontant(global.montantPlafond)}
            </span>
          </div>
          <ProgressBar percentage={global.pourcentageConsomme} />
          {global.pourcentageConsomme >= 80 && (
            <p className="text-xs text-red-600 font-medium">
              Attention : plafond global bientot atteint (
              {global.pourcentageConsomme}%)
            </p>
          )}
        </div>
      )}

      {parFamille.length > 0 && (
        <div className="space-y-3">
          {parFamille.map((p) => (
            <div
              key={`${p.familleActeId}-${p.typeMaladie}`}
              className="space-y-1"
            >
              <div className="flex justify-between text-sm">
                <span className="text-gray-700">
                  {p.familleCode} - {p.familleLabel}
                  {p.typeMaladie === 'chronique' && (
                    <span className="ml-1 text-xs text-orange-600">
                      (chronique)
                    </span>
                  )}
                </span>
                <span className="text-gray-500 text-xs">
                  {formatMontant(p.montantConsomme)} /{' '}
                  {formatMontant(p.montantPlafond)} ({p.pourcentageConsomme}%)
                </span>
              </div>
              <ProgressBar percentage={p.pourcentageConsomme} />
            </div>
          ))}
        </div>
      )}

      {!global && parFamille.length === 0 && (
        <p className="text-sm text-gray-500">
          Aucun plafond configure pour cet adherent.
        </p>
      )}

      {totalPlafond > 0 && (
        <div className="pt-2 border-t border-gray-100 text-xs text-gray-500 flex justify-between">
          <span>Total consomme</span>
          <span>
            {formatMontant(totalConsomme)} / {formatMontant(totalPlafond)}
          </span>
        </div>
      )}
    </div>
  );
}
