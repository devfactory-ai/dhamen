import { DataTable } from '@/components/ui/data-table';
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

const columns = [
  {
    key: 'rangPres',
    header: 'Rang',
    render: (m: FamilleMembre) => (
      <span className="text-sm">{String(m.rangPres).padStart(2, '0')}</span>
    ),
  },
  {
    key: 'codeType',
    header: 'Type',
    render: (m: FamilleMembre) => (
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
    ),
  },
  {
    key: 'lastName',
    header: 'Nom',
    render: (m: FamilleMembre) => (
      <span className="text-sm font-medium">{m.lastName}</span>
    ),
  },
  {
    key: 'firstName',
    header: 'Prenom',
    render: (m: FamilleMembre) => (
      <span className="text-sm">{m.firstName}</span>
    ),
  },
  {
    key: 'dateOfBirth',
    header: 'Date naissance',
    render: (m: FamilleMembre) => (
      <span className="text-sm">{m.dateOfBirth}</span>
    ),
  },
  {
    key: 'matricule',
    header: 'Matricule',
    render: (m: FamilleMembre) => (
      <span className="text-sm text-gray-500">{m.matricule || '\u2014'}</span>
    ),
  },
];

/**
 * Table displaying family members (principal, conjoint, children) with their rank.
 * Clicking a row triggers onSelectMembre to view that member's bulletins and plafonds.
 */
export function FamilleTable({ principal, conjoint, enfants, onSelectMembre }: FamilleTableProps) {
  const membres = [principal, ...(conjoint ? [conjoint] : []), ...enfants];

  return (
    <DataTable
      columns={columns}
      data={membres}
      onRowClick={onSelectMembre ? (m) => onSelectMembre(m.id) : undefined}
      emptyMessage="Aucun membre de famille"
    />
  );
}
