import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useActesGroupes } from '../../hooks/use-actes';

export interface ActeSelectionResult {
  code: string;
  label: string;
  typeCalcul: 'taux' | 'forfait';
  valeurBase: number | null;
  tauxRemboursement: number;
}

interface ActeSelectorProps {
  value: string;
  onChange: (acteCode: string, acte: ActeSelectionResult) => void;
  disabled?: boolean;
  /** Filter actes by famille code (e.g. 'FA0001') */
  familleCode?: string;
}

/**
 * Acte selector — shows only actes matching the selected famille.
 * The famille is chosen upstream (in the form header).
 */
export function ActeSelector({ value, onChange, disabled, familleCode }: ActeSelectorProps) {
  const { data: groupes, isLoading } = useActesGroupes();

  const actes = useMemo(() => {
    if (!groupes || !familleCode) return [];
    const groupe = groupes.find((g) => g.famille.code === familleCode);
    return groupe?.actes || [];
  }, [groupes, familleCode]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement...
      </div>
    );
  }

  if (!familleCode) {
    return (
      <div className="rounded-md border border-input px-3 py-2 text-muted-foreground text-sm">
        Sélectionnez une famille d'actes
      </div>
    );
  }

  const handleValueChange = (selectedCode: string) => {
    if (!groupes) return;
    for (const groupe of groupes) {
      const acte = groupe.actes.find((a) => a.code === selectedCode);
      if (acte) {
        onChange(selectedCode, {
          code: acte.code,
          label: acte.label,
          typeCalcul: acte.type_calcul,
          valeurBase: acte.valeur_base,
          tauxRemboursement: acte.taux_remboursement,
        });
        return;
      }
    }
  };

  return (
    <Select value={value || undefined} onValueChange={handleValueChange} disabled={disabled || actes.length === 0}>
      <SelectTrigger className="text-sm rounded-md h-9">
        <SelectValue placeholder={
          actes.length === 0 ? "Aucun acte dans cette famille" : "Sélectionner un acte"
        } />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        {actes.map((acte) => (
          <SelectItem key={acte.code} value={acte.code}>
            <span className="font-mono text-xs mr-1.5">{acte.code}</span>
            {acte.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
