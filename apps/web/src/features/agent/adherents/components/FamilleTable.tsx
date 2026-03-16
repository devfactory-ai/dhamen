import type { FamilleMembre } from '@/features/agent/hooks/use-adherent-famille';

interface FamilleTableProps {
  principal: FamilleMembre;
  conjoint: FamilleMembre | null;
  enfants: FamilleMembre[];
  onSelectMembre?: (id: string) => void;
}

const TYPE_LABELS: Record<string, string> = {
  A: 'Adherent',
  C: 'Conjoint',
  E: 'Enfant',
};

/**
 * Table displaying family members (principal, conjoint, children) with their rank.
 * Clicking a row triggers onSelectMembre to view that member's bulletins and plafonds.
 */
export function FamilleTable({ principal, conjoint, enfants, onSelectMembre }: FamilleTableProps) {
  const membres = [principal, ...(conjoint ? [conjoint] : []), ...enfants];

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Rang
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Type
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Nom
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Prenom
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Date naissance
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
              Matricule
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {membres.map((m) => (
            <tr
              key={m.id}
              className={`hover:bg-gray-50 ${onSelectMembre ? 'cursor-pointer' : ''}`}
              onClick={() => onSelectMembre?.(m.id)}
            >
              <td className="px-4 py-3 text-sm">
                {String(m.rangPres).padStart(2, '0')}
              </td>
              <td className="px-4 py-3 text-sm">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    m.codeType === 'A'
                      ? 'bg-blue-100 text-blue-700'
                      : m.codeType === 'C'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-green-100 text-green-700'
                  }`}
                >
                  {TYPE_LABELS[m.codeType] || m.codeType}
                </span>
              </td>
              <td className="px-4 py-3 text-sm font-medium">{m.lastName}</td>
              <td className="px-4 py-3 text-sm">{m.firstName}</td>
              <td className="px-4 py-3 text-sm">{m.dateOfBirth}</td>
              <td className="px-4 py-3 text-sm text-gray-500">
                {m.matricule || '\u2014'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
