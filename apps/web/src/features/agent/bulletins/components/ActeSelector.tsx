import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
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
}

/**
 * Acte selector component with acts grouped by family (optgroup).
 * Uses the grouped referentiel endpoint to display acts organized
 * by famille d'actes (FA0001, FA0002, etc.).
 */
export function ActeSelector({ value, onChange, disabled }: ActeSelectorProps) {
  const { data: groupes, isLoading } = useActesGroupes();

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement des actes...
      </div>
    );
  }

  const handleValueChange = (selectedCode: string) => {
    if (!(selectedCode && groupes)) {
      return;
    }

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
    <Select value={value || undefined} onValueChange={handleValueChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue placeholder="Selectionner un acte" />
      </SelectTrigger>
      <SelectContent className="max-h-80 overflow-y-auto" position="popper" sideOffset={4}>
        {(groupes || []).map((groupe) => (
          <SelectGroup key={groupe.famille.id}>
            <SelectLabel className="bg-muted/50 py-1.5 font-semibold text-primary/80 text-xs">
              {groupe.famille.code} - {groupe.famille.label}
            </SelectLabel>
            {groupe.actes.map((acte) => (
              <SelectItem key={acte.code} value={acte.code}>
                <span className="mr-2 font-mono text-xs">{acte.code}</span>
                {acte.label}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
