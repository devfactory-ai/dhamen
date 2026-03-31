import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Plus, Pencil, Check, X } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/stores/toast';

// ---- Labels types d'actes ----

const CARE_TYPE_LABELS: Record<string, string> = {
  consultation: 'Consultations et visites',
  pharmacy: 'Frais pharmaceutiques',
  laboratory: 'Analyses et laboratoire',
  optical: 'Optique',
  refractive_surgery: 'Chirurgie réfractive',
  medical_acts: 'Actes médicaux',
  transport: 'Transport du malade',
  surgery: 'Frais chirurgicaux',
  orthopedics: 'Orthopédie / Prothèses',
  hospitalization: 'Hospitalisation',
  maternity: 'Accouchement',
  ivg: 'Interruption involontaire de grossesse',
  dental: 'Soins et prothèses dentaires',
  orthodontics: 'Soins orthodontiques',
  circumcision: 'Circoncision',
  sanatorium: 'Sanatorium',
  thermal_cure: 'Cures thermales',
  funeral: 'Frais funéraires',
};

// ---- Types ----

interface Guarantee {
  id?: string;
  care_type: string;
  label: string;
  reimbursement_rate: number;
  annual_limit: number | null;
  per_event_limit: number | null;
  letter_keys: string | null;
  conditions: string | null;
  requires_prescription: boolean;
  requires_cnam_complement: boolean;
  renewal_period: string | null;
  age_limit: number | null;
  sort_order: number;
}

interface GroupContract {
  id: string;
  contract_number: string;
  company_name: string;
  insurer_name: string;
  status: string;
  guarantees: Guarantee[];
}

type EditingCell = {
  rowIndex: number;
  field: keyof Guarantee;
} | null;

// ---- Composant principal ----

export default function GarantiesContratPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { success, error: toastError } = useToast();

  const [guarantees, setGuarantees] = useState<Guarantee[]>([]);
  const [editingCell, setEditingCell] = useState<EditingCell>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [justification, setJustification] = useState('');
  const [justificationError, setJustificationError] = useState('');

  // ---- Fetch contrat ----

  const { data: contract, isLoading } = useQuery({
    queryKey: ['group-contract', id],
    queryFn: async () => {
      const res = await apiClient.get<GroupContract>(`/group-contracts/${id}`);
      if (!res.success) {
        throw new Error(res.error?.message ?? 'Erreur de chargement');
      }
      return res.data;
    },
    enabled: !!id,
  });

  // Initialiser les garanties quand le contrat est chargé
  if (contract && guarantees.length === 0 && !hasChanges) {
    setGuarantees(contract.guarantees ?? []);
  }

  // ---- Mutation sauvegarde ----

  const saveMutation = useMutation({
    mutationFn: async (payload: { guarantees: Guarantee[]; justification: string }) => {
      const res = await apiClient.put<GroupContract>(`/group-contracts/${id}`, {
        guarantees: payload.guarantees,
        justification: payload.justification,
      });
      if (!res.success) {
        throw new Error(res.error?.message ?? 'Erreur lors de la sauvegarde');
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-contract', id] });
      setHasChanges(false);
      setShowSaveDialog(false);
      setJustification('');
      setJustificationError('');
      success('Garanties sauvegardées', 'Les modifications ont été enregistrées avec succès.');
    },
    onError: (err: Error) => {
      toastError('Erreur de sauvegarde', err.message);
    },
  });

  // ---- Gestion édition inline ----

  function startEditing(rowIndex: number, field: keyof Guarantee) {
    const guarantee = guarantees[rowIndex]!;
    const value = guarantee[field];
    setEditingCell({ rowIndex, field });
    setEditValue(value !== null && value !== undefined ? String(value) : '');
  }

  function cancelEditing() {
    setEditingCell(null);
    setEditValue('');
  }

  function commitEdit() {
    if (!editingCell) return;

    const { rowIndex, field } = editingCell;
    const updated = [...guarantees];
    const guarantee = { ...updated[rowIndex]! };

    // Validation et conversion selon le champ
    if (field === 'reimbursement_rate') {
      const num = Number(editValue);
      if (Number.isNaN(num) || num < 0 || num > 100) {
        toastError('Valeur invalide', 'Le taux doit être compris entre 0 et 100.');
        return;
      }
      guarantee.reimbursement_rate = num;
    } else if (field === 'per_event_limit' || field === 'annual_limit') {
      if (editValue === '') {
        (guarantee as Record<string, unknown>)[field] = null;
      } else {
        const num = Number(editValue);
        if (Number.isNaN(num) || num < 0) {
          toastError('Valeur invalide', 'Le plafond doit être supérieur ou égal à 0.');
          return;
        }
        (guarantee as Record<string, unknown>)[field] = num;
      }
    } else {
      (guarantee as Record<string, unknown>)[field] = editValue || null;
    }

    updated[rowIndex] = guarantee;
    setGuarantees(updated);
    setHasChanges(true);
    setEditingCell(null);
    setEditValue('');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      commitEdit();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  }

  // ---- Ajouter une garantie ----

  function addGuarantee() {
    const newGuarantee: Guarantee = {
      care_type: '',
      label: '',
      reimbursement_rate: 0,
      annual_limit: null,
      per_event_limit: null,
      letter_keys: null,
      conditions: null,
      requires_prescription: false,
      requires_cnam_complement: false,
      renewal_period: null,
      age_limit: null,
      sort_order: guarantees.length + 1,
    };
    setGuarantees([...guarantees, newGuarantee]);
    setHasChanges(true);
  }

  // ---- Sauvegarde avec justification ----

  function handleSaveClick() {
    setShowSaveDialog(true);
    setJustification('');
    setJustificationError('');
  }

  function handleConfirmSave() {
    if (!justification.trim()) {
      setJustificationError('La justification est obligatoire pour toute modification des garanties.');
      return;
    }
    saveMutation.mutate({ guarantees, justification: justification.trim() });
  }

  // ---- Rendu cellule éditable ----

  function renderEditableCell(
    rowIndex: number,
    field: keyof Guarantee,
    displayValue: string,
    inputType: 'text' | 'number' = 'text'
  ) {
    const isEditing =
      editingCell?.rowIndex === rowIndex && editingCell?.field === field;

    if (isEditing) {
      return (
        <div className="flex items-center gap-1">
          <Input
            type={inputType}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-8 text-sm w-24"
            autoFocus
          />
          <button
            type="button"
            onClick={commitEdit}
            className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
          >
            <Check className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={cancelEditing}
            className="p-1 text-red-500 hover:bg-red-50 rounded"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        onClick={() => startEditing(rowIndex, field)}
        className="group flex items-center gap-1.5 text-left w-full px-2 py-1 rounded hover:bg-gray-50 transition-colors"
      >
        <span className="text-sm text-gray-900">{displayValue || '—'}</span>
        <Pencil className="h-3 w-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </button>
    );
  }

  // ---- Badge statut ----

  function statusBadge(status: string) {
    const variants: Record<string, 'default' | 'success' | 'warning' | 'destructive' | 'info'> = {
      active: 'success',
      draft: 'warning',
      suspended: 'destructive',
      terminated: 'destructive',
    };
    const labels: Record<string, string> = {
      active: 'Actif',
      draft: 'Brouillon',
      suspended: 'Suspendu',
      terminated: 'Résilié',
    };
    const variant = variants[status] ?? 'default';
    const label = labels[status] ?? status;
    return <Badge variant={variant}>{label}</Badge>;
  }

  // ---- Formatage montants ----

  function formatAmount(value: number | null): string {
    if (value === null || value === undefined) return '—';
    return `${value.toLocaleString('fr-TN')} TND`;
  }

  // ---- Rendu ----

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-20 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-64 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="space-y-6">
        <PageHeader title="Contrat introuvable" />
        <p className="text-gray-500">Le contrat demandé n'existe pas ou a été supprimé.</p>
        <Button variant="outline" onClick={() => navigate('/group-contracts')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Retour aux contrats
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* En-tête */}
      <PageHeader
        title="Gestion des garanties"
        description={`Contrat ${contract.contract_number} — ${contract.company_name}`}
        breadcrumb={[
          { label: 'Contrats groupe', href: '/group-contracts' },
          { label: contract.contract_number, href: `/group-contracts/${id}` },
          { label: 'Garanties' },
        ]}
        action={
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => navigate(`/group-contracts/${id}`)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour
            </Button>
            {hasChanges && (
              <Button
                onClick={handleSaveClick}
                disabled={saveMutation.isPending}
                className="gap-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25"
              >
                <Save className="h-4 w-4" />
                Sauvegarder
              </Button>
            )}
          </div>
        }
      />

      {/* Infos contrat */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 mb-1">N° Contrat</p>
            <p className="text-sm font-semibold text-gray-900">{contract.contract_number}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Entreprise</p>
            <p className="text-sm font-semibold text-gray-900">{contract.company_name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Assureur</p>
            <p className="text-sm font-semibold text-gray-900">{contract.insurer_name}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Statut</p>
            {statusBadge(contract.status)}
          </div>
        </div>
      </div>

      {/* Tableau des garanties */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            Garanties ({guarantees.length})
          </h3>
          <Button variant="outline" size="sm" onClick={addGuarantee} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Ajouter une garantie
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Type acte
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Taux (%)
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Plafond/acte
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Plafond annuel
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Franchise
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Conditions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {guarantees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                    Aucune garantie configurée. Cliquez sur "Ajouter une garantie" pour commencer.
                  </td>
                </tr>
              ) : (
                guarantees.map((g, index) => (
                  <tr key={g.id ?? `new-${index}`} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-2">
                      {renderEditableCell(
                        index,
                        'care_type',
                        CARE_TYPE_LABELS[g.care_type] ?? g.care_type ?? ''
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {renderEditableCell(
                        index,
                        'reimbursement_rate',
                        g.reimbursement_rate !== null && g.reimbursement_rate !== undefined
                          ? `${g.reimbursement_rate}%`
                          : '—',
                        'number'
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {renderEditableCell(
                        index,
                        'per_event_limit',
                        formatAmount(g.per_event_limit),
                        'number'
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {renderEditableCell(
                        index,
                        'annual_limit',
                        formatAmount(g.annual_limit),
                        'number'
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {renderEditableCell(
                        index,
                        'letter_keys',
                        g.letter_keys ?? '—'
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {renderEditableCell(
                        index,
                        'conditions',
                        g.conditions ?? '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modale de confirmation avec justification */}
      <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer les modifications</AlertDialogTitle>
            <AlertDialogDescription>
              Vous êtes sur le point de modifier les garanties du contrat{' '}
              <strong>{contract.contract_number}</strong>. Veuillez indiquer la raison de cette
              modification.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2 py-2">
            <label htmlFor="justification" className="text-sm font-medium text-gray-700">
              Justification <span className="text-red-500">*</span>
            </label>
            <textarea
              id="justification"
              value={justification}
              onChange={(e) => {
                setJustification(e.target.value);
                if (e.target.value.trim()) setJustificationError('');
              }}
              placeholder="Ex : Avenant n°3 du 15/03/2026 — ajustement taux optique"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
              rows={3}
            />
            {justificationError && (
              <p className="text-sm text-red-600">{justificationError}</p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setJustificationError('')}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmSave}
              disabled={saveMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saveMutation.isPending ? 'Sauvegarde...' : 'Confirmer et sauvegarder'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
