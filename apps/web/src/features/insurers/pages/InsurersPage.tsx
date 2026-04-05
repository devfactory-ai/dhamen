import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Download, Trash2, Handshake, ShieldCheck, FileText } from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toCSV, downloadCSV, type ExportColumn } from '@/lib/export-utils';
import { apiClient } from '@/lib/api-client';
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
import { useInsurers, useDeleteInsurer, useToggleInsurerStatus, type Insurer } from '../hooks/useInsurers';
import { useToast } from '@/stores/toast';
import { usePermissions } from '@/hooks/usePermissions';

const INSURER_TYPES: Record<string, { label: string; color: string }> = {
  INSURANCE: { label: 'Assurance', color: 'bg-blue-100 text-blue-800' },
  MUTUAL: { label: 'Mutuelle', color: 'bg-green-100 text-green-800' },
  cnam: { label: 'CNAM', color: 'bg-red-100 text-red-800' },
  mutuelle: { label: 'Mutuelle', color: 'bg-green-100 text-green-800' },
  compagnie: { label: 'Compagnie', color: 'bg-blue-100 text-blue-800' },
  reassureur: { label: 'Réassureur', color: 'bg-purple-100 text-purple-800' },
  autre: { label: 'Autre', color: 'bg-gray-100 text-gray-800' },
};

export function InsurersPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<Insurer | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('insurers', 'read');
  const canCreate = hasPermission('insurers', 'create');
  const canUpdate = hasPermission('insurers', 'update');
  const canDelete = hasPermission('insurers', 'delete');
  const canExport = hasPermission('insurers', 'list');

  const { data, isLoading } = useInsurers(page);
  const deleteInsurer = useDeleteInsurer();
  const toggleStatus = useToggleInsurerStatus();

  const filteredInsurers = useMemo(() => {
    const all = data?.insurers || [];
    if (!search.trim()) return all;
    const q = search.toLowerCase();
    return all.filter((i) =>
      i.name?.toLowerCase().includes(q) ||
      i.code?.toLowerCase().includes(q) ||
      i.city?.toLowerCase().includes(q) ||
      i.email?.toLowerCase().includes(q) ||
      i.phone?.toLowerCase().includes(q)
    );
  }, [data?.insurers, search]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredInsurers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredInsurers.map((i) => i.id)));
    }
  };

  const handleBulkDelete = async () => {
    try {
      for (const id of selectedIds) {
        await deleteInsurer.mutateAsync(id);
      }
      toast({ title: `${selectedIds.size} assureur(s) supprimé(s) avec succès`, variant: 'success' });
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
    } catch {
      toast({ title: 'Erreur lors de la suppression groupée', description: 'Veuillez réessayer', variant: 'destructive' });
    }
  };

  const exportColumns: ExportColumn<Insurer>[] = [
    { key: 'code', header: 'Code' },
    { key: 'name', header: 'Nom' },
    { key: 'registrationNumber', header: 'N° Registre' },
    { key: 'type', header: 'Type', format: (v) => INSURER_TYPES[v as keyof typeof INSURER_TYPES]?.label || String(v) },
    { key: 'address', header: 'Adresse' },
    { key: 'city', header: 'Ville' },
    { key: 'phone', header: 'Téléphone' },
    { key: 'email', header: 'Email' },
    { key: 'isActive', header: 'Actif', format: (v) => v ? 'Oui' : 'Non' },
  ];

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const response = await apiClient.get<{ data: Insurer[]; meta: { total: number } }>('/insurers?limit=10000');
      if (!response.success) throw new Error(response.error?.message);

      const allData = response.data?.data || [];
      const csv = toCSV(allData, exportColumns);
      downloadCSV(csv, 'assureurs');
      toast({ title: `${allData.length} assureurs exportés`, variant: 'success' });
    } catch {
      toast({ title: 'Erreur lors de l\'export', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteInsurer.mutateAsync(deleteConfirm.id);
      setDeleteConfirm(null);
      toast({ title: 'Assureur supprimé avec succès', variant: 'success' });
    } catch {
      toast({ title: 'Erreur lors de la suppression', description: 'Veuillez réessayer', variant: 'destructive' });
    }
  };

  const handleToggleStatus = async (insurer: Insurer) => {
    const newStatus = insurer.isActive ? 'suspended' : 'active';
    try {
      await toggleStatus.mutateAsync({ id: insurer.id, status: newStatus as 'active' | 'suspended' });
      toast({ title: `Compagnie ${newStatus === 'active' ? 'activée' : 'suspendue'}`, variant: 'success' });
    } catch {
      toast({ title: 'Erreur lors du changement de statut', variant: 'destructive' });
    }
  };

  const columns = [
    ...(canDelete ? [{
      key: 'select',
      header: filteredInsurers.length > 0 ? (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300"
          checked={selectedIds.size === filteredInsurers.length}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); toggleSelectAll(); }}
        />
      ) : null,
      render: (insurer: Insurer) => (
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300"
          checked={selectedIds.has(insurer.id)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); toggleSelect(insurer.id); }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        />
      ),
    }] : []),
    {
      key: 'name',
      header: 'Compagnie',
      render: (insurer: Insurer) => (
        <div className="flex items-center gap-3">
          <div className='flex h-10 w-10 items-center justify-center rounded-lg bg-muted font-bold text-sm'>
            {insurer.code}
          </div>
          <div>
            <p className="font-medium">{insurer.name}</p>
            <p className='text-muted-foreground text-sm'>{insurer.registrationNumber}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (insurer: Insurer) => {
        const typeKey = insurer.typeAssureur || insurer.type;
        const typeInfo = INSURER_TYPES[typeKey] || INSURER_TYPES.autre;
        return (
          <span className={`rounded-full px-2 py-1 font-medium text-xs ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
        );
      },
    },
    {
      key: 'matriculeFiscal',
      header: 'Matricule Fiscal',
      render: (insurer: Insurer) => (
        <div>
          {insurer.matriculeFiscal ? (
            <div>
              <span className="font-mono text-sm">{insurer.matriculeFiscal}</span>
              {!insurer.matriculeValide && (
                <p className="text-xs text-amber-600 mt-0.5">MF invalide</p>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </div>
      ),
    },
    {
      key: 'convention',
      header: 'Convention',
      render: (insurer: Insurer) => (
        <div>
          {insurer.dateFinConvention ? (
            <div>
              <span className="text-sm">{new Date(insurer.dateFinConvention).toLocaleDateString('fr-TN')}</span>
              {insurer.conventionExpireBientot && (
                <p className="text-xs text-amber-600 mt-0.5">Expire bientot</p>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (insurer: Insurer) => (
        <div>
          <p className="text-sm">{insurer.phone}</p>
          {insurer.email && <p className='text-muted-foreground text-xs'>{insurer.email}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (insurer: Insurer) => (
        <Badge variant={insurer.isActive ? 'success' : 'destructive'}>
          {insurer.isActive ? 'Actif' : 'Suspendu'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (insurer: Insurer) => (
        <div className="flex justify-end gap-2">
          {canUpdate && (
            <Button variant="ghost" size="sm" onClick={() => navigate(`/insurers/${insurer.id}/edit`)}>
              Modifier
            </Button>
          )}
          {canUpdate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleToggleStatus(insurer)}
              disabled={toggleStatus.isPending}
            >
              {insurer.isActive ? 'Suspendre' : 'Activer'}
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteConfirm(insurer)}
            >
              Supprimer
            </Button>
          )}
        </div>
      ),
    },
  ];

  if (!canRead) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">Accès refusé</p>
          <p className="text-sm text-gray-500 mt-1">Vous n'avez pas la permission de consulter les compagnies partenaires.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FloatingHelp
        title="Aide - Compagnies partenaires"
        subtitle="Gestion des assureurs et mutuelles"
        tips={[
          {
            icon: <Handshake className="h-4 w-4 text-blue-500" />,
            title: "Conventionnement",
            desc: "Chaque compagnie a une date de fin de convention. Surveillez les alertes d'expiration pour renouveler les accords à temps.",
          },
          {
            icon: <ShieldCheck className="h-4 w-4 text-green-500" />,
            title: "Types de compagnies",
            desc: "Assurance, Mutuelle, CNAM, Réassureur — chaque type a ses spécificités en matière de barèmes et de circuits de remboursement en Tunisie.",
          },
          {
            icon: <FileText className="h-4 w-4 text-purple-500" />,
            title: "Matricule fiscal",
            desc: "Le matricule fiscal de la compagnie est vérifié automatiquement. Un MF invalide est signalé en orange dans la liste.",
          },
        ]}
      />
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compagnies Partenaires</h1>
          <p className="mt-1 text-sm text-gray-500">Gérer les organismes partenaires et conventions de remboursement</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {canDelete && selectedIds.size > 0 && (
            <Button
              variant="outline"
              className="text-destructive border-destructive hover:bg-destructive/10"
              onClick={() => setBulkDeleteConfirm(true)}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Supprimer ({selectedIds.size})
            </Button>
          )}
          {canExport && (
            <Button variant="outline" onClick={handleExportCSV} disabled={isExporting}>
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? 'Export...' : 'Exporter'}
            </Button>
          )}
          {canCreate && (
            <Button className="gap-2 bg-slate-900 hover:bg-[#19355d]" onClick={() => navigate('/insurers/new')}>
              <Plus className="w-4 h-4" /> Nouvelle compagnie
            </Button>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg className="w-[18px] h-[18px] text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Rechercher par nom, code, ville..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-11 pr-10 rounded-xl bg-[#f3f4f5] text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={filteredInsurers}
          isLoading={isLoading}
          emptyMessage="Aucune compagnie partenaire enregistrée"
          pagination={
            data
              ? {
                  page,
                  limit: 20,
                  total: data.total,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer l'assureur{' '}
              <strong>{deleteConfirm?.name}</strong> ?
              Cette action est irréversible et supprimera tous les contrats associés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteInsurer.isPending ? 'Suppression...' : 'Supprimer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteConfirm} onOpenChange={() => setBulkDeleteConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer la suppression groupée</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer{' '}
              <strong>{selectedIds.size} assureur(s)</strong> ?
              Cette action est irréversible et supprimera tous les contrats associés.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteInsurer.isPending ? 'Suppression...' : `Supprimer (${selectedIds.size})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default InsurersPage;
