import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Plus, Download, Eye, Pencil, Trash2, Stethoscope, Search, Filter, X, Handshake, FileSpreadsheet } from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';
import { FilterDropdown, FilterOption } from '@/components/ui/filter-dropdown';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { toCSV, downloadCSV, type ExportColumn } from '@/lib/export-utils';
import { apiClient } from '@/lib/api-client';
import { useProviders, useDeleteProvider, type Provider } from '../hooks/useProviders';
import { useToast } from '@/stores/toast';
import { usePermissions } from '@/hooks/usePermissions';

const PROVIDER_TYPES: Record<string, { label: string; color: string }> = {
  PHARMACY: { label: 'Pharmacie', color: 'bg-emerald-100 text-emerald-800' },
  DOCTOR: { label: 'Médecin', color: 'bg-blue-100 text-blue-800' },
  LAB: { label: 'Laboratoire', color: 'bg-purple-100 text-purple-800' },
  CLINIC: { label: 'Clinique', color: 'bg-orange-100 text-orange-800' },
  HOSPITAL: { label: 'Hôpital', color: 'bg-red-100 text-red-800' },
  DENTIST: { label: 'Dentiste', color: 'bg-pink-100 text-pink-800' },
  OPTICIAN: { label: 'Opticien', color: 'bg-cyan-100 text-cyan-800' },
  KINESITHERAPEUTE: { label: 'Kinésithérapeute', color: 'bg-amber-100 text-amber-800' },
};

const SPECIALITES_PROVIDER = [
  'Médecine générale',
  'Cardiologie',
  'Dermatologie',
  'Gastro-entérologie',
  'Gynécologie',
  'Neurologie',
  'Ophtalmologie',
  'ORL',
  'Pédiatrie',
  'Pneumologie',
  'Psychiatrie',
  'Radiologie',
  'Rhumatologie',
  'Urologie',
  'Chirurgie générale',
  'Orthopédie',
  'Biologie',
  'Kinésithérapie',
  'Dentaire',
  'Optique',
];

const VILLES_TUNISIE = [
  'Tunis', 'Sfax', 'Sousse', 'Kairouan', 'Bizerte', 'Gabes', 'Ariana',
  'Gafsa', 'Monastir', 'Ben Arous', 'Kasserine', 'Medenine', 'Nabeul',
  'Tataouine', 'Beja', 'Jendouba', 'Mahdia', 'Sidi Bouzid', 'Tozeur',
  'Siliana', 'Kef', 'Kebili', 'Zaghouan', 'Manouba',
];

const avatarColors = ['bg-blue-600', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500'];
function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}
function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0]?.[0] || ''}${parts[1]?.[0] || ''}`.toUpperCase()
    : (name.slice(0, 2) || '??').toUpperCase();
}

export function ProvidersPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [specialityFilter, setSpecialityFilter] = useState<string | undefined>();
  const [cityFilter, setCityFilter] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);
  const [specialityDropdownOpen, setSpecialityDropdownOpen] = useState(false);
  const [cityDropdownOpen, setCityDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Provider | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('providers', 'create');
  const canUpdate = hasPermission('providers', 'update');
  const canDelete = hasPermission('providers', 'delete');
  const canExport = hasPermission('providers', 'list');
  const canRead = hasPermission('providers', 'read');
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const { data, isLoading } = useProviders(page, 20, typeFilter);
  const deleteProvider = useDeleteProvider();

  const providers = data?.providers || [];
  const total = data?.total || 0;

  // Client-side search + filters
  const filtered = providers.filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      if (
        !p.name.toLowerCase().includes(q) &&
        !(p.city || '').toLowerCase().includes(q) &&
        !(p.licenseNo || '').toLowerCase().includes(q)
      ) return false;
    }
    if (specialityFilter && (p.speciality || '').toLowerCase() !== specialityFilter.toLowerCase()) return false;
    if (cityFilter && (p.city || '').toLowerCase() !== cityFilter.toLowerCase()) return false;
    if (statusFilter === 'active' && !p.isActive) return false;
    if (statusFilter === 'inactive' && p.isActive) return false;
    return true;
  });

  const exportColumns: ExportColumn<Provider>[] = [
    { key: 'name', header: 'Nom' },
    { key: 'type', header: 'Type', format: (v) => PROVIDER_TYPES[v as string]?.label || String(v) },
    { key: 'licenseNo', header: 'N° Licence' },
    { key: 'speciality', header: 'Spécialité' },
    { key: 'address', header: 'Adresse' },
    { key: 'city', header: 'Ville' },
    { key: 'phone', header: 'Téléphone' },
    { key: 'email', header: 'Email' },
    { key: 'isActive', header: 'Actif', format: (v) => v ? 'Oui' : 'Non' },
  ];

  const handleExportCSV = async () => {
    setIsExporting(true);
    try {
      const response = await apiClient.get<Provider[]>('/providers?limit=10000');
      if (!response.success) throw new Error(response.error?.message);
      const allData = Array.isArray(response.data) ? response.data : [];
      const csv = toCSV(allData, exportColumns);
      downloadCSV(csv, 'praticiens');
      toast({ title: `${allData.length} praticiens exportés`, variant: 'success' });
    } catch {
      toast({ title: "Erreur lors de l'export", variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteProvider.mutateAsync(deleteConfirm.id);
      setDeleteConfirm(null);
      toast({ title: 'Praticien supprimé', variant: 'success' });
    } catch {
      toast({ title: 'Erreur lors de la suppression', variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    try {
      for (const id of selectedIds) {
        await deleteProvider.mutateAsync(id);
      }
      toast({ title: `${selectedIds.size} praticien(s) supprimé(s)`, variant: 'success' });
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
    } catch {
      toast({ title: 'Erreur lors de la suppression groupée', variant: 'destructive' });
    }
  };

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map((p) => p.id)));
  };

  const columns = [
    ...(canDelete ? [{
      key: 'select',
      header: filtered.length > 0 ? (
        <input
          type="checkbox"
          checked={selectedIds.size === filtered.length}
          onChange={toggleSelectAll}
          className="h-4 w-4 rounded border-gray-300"
        />
      ) : null,
      render: (item: Provider) => (
        <input
          type="checkbox"
          checked={selectedIds.has(item.id)}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { e.stopPropagation(); toggleSelect(item.id); }}
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
    }] : []),
    {
      key: 'praticien',
      header: 'Praticien',
      render: (item: Provider) => (
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium text-white ${getAvatarColor(item.name)}`}>
            {getInitials(item.name)}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{item.name}</p>
            <p className="text-xs text-gray-400">{item.speciality || '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (item: Provider) => {
        const info = PROVIDER_TYPES[item.type] || { label: item.type, color: 'bg-gray-100 text-gray-800' };
        return <Badge className={info.color}>{info.label}</Badge>;
      },
    },
    {
      key: 'licenseNo',
      header: 'N° Licence / MF',
      render: (item: Provider) => (
        <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-700">
          {item.licenseNo || '—'}
        </span>
      ),
    },
    {
      key: 'location',
      header: 'Localisation',
      render: (item: Provider) => (
        <div>
          <p className="text-sm text-gray-700">{item.city || '—'}</p>
          <p className="text-xs text-gray-400 truncate max-w-[180px]">{item.address || ''}</p>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (item: Provider) => (
        <div>
          <p className="text-sm text-gray-700">{item.phone || '—'}</p>
          {item.email && <p className="text-xs text-gray-400">{item.email}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (item: Provider) => (
        <Badge variant={item.isActive ? 'default' : 'destructive'} className={item.isActive ? 'bg-green-100 text-green-800' : ''}>
          {item.isActive ? 'Actif' : 'Inactif'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: Provider) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/providers/${item.id}`); }}>
            <Eye className="w-4 h-4" />
          </Button>
          {canDelete && (
            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item); }}>
              <Trash2 className="w-4 h-4" />
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
          <p className="text-lg font-medium text-gray-900">Acces refuse</p>
          <p className="text-sm text-gray-500 mt-1">Vous n'avez pas la permission de consulter cette page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FloatingHelp
        title="Aide - Praticiens"
        subtitle="Gestion des prestataires de santé conventionnés"
        tips={[
          {
            icon: <Handshake className="h-4 w-4 text-blue-500" />,
            title: "Conventionnement",
            desc: "Un praticien conventionné a un accord avec l'assureur sur les tarifs de remboursement. Vérifiez le statut avant toute PEC.",
          },
          {
            icon: <Stethoscope className="h-4 w-4 text-green-500" />,
            title: "Types de prestataires",
            desc: "Pharmacie, médecin, labo, clinique, dentiste, opticien, kinésithérapeute — chaque type a ses propres barèmes de remboursement.",
          },
          {
            icon: <FileSpreadsheet className="h-4 w-4 text-purple-500" />,
            title: "Import en masse",
            desc: "Utilisez l'import CSV pour ajouter plusieurs praticiens d'un coup. Le fichier doit contenir : nom, type, licence, ville, téléphone.",
          },
        ]}
      />
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Praticiens</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gérer les praticiens de santé conventionnés
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {canDelete && selectedIds.size > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={deleteProvider.isPending}
            >
              <Trash2 className="w-4 h-4" /> Supprimer ({selectedIds.size})
            </Button>
          )}
          {canExport && (
            <Button
              variant="outline"
              onClick={handleExportCSV}
              disabled={isExporting}
              className="gap-2"
            >
              <Download className="w-4 h-4" />{" "}
              {isExporting ? "Export..." : "Exporter CSV"}
            </Button>
          )}
          {canCreate && (
            <Button
              variant="outline"
              onClick={() => navigate("/providers/import")}
              className="gap-2"
            >
              <Upload className="w-4 h-4" /> Import CSV
            </Button>
          )}
          {canCreate && <Button
            className="gap-2 bg-slate-900 hover:bg-[#19355d]"
            onClick={() => navigate("/providers/new")}
          >
            <Plus className="w-4 h-4" /> Nouveau praticien
          </Button>}
        </div>
      </div>

      {/* Filters + Total */}
      <div className="flex flex-col md:flex-row items-stretch gap-4">
        <div className="flex flex-1 flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
            }}
            className="space-y-4"
          >
            {/* Search bar + Rechercher + Filtres toggle */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Rechercher par nom, licence, ville..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-10 pl-10 pr-4 rounded-xl bg-[#f3f4f5] text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
                className="rounded-xl bg-[#f3f4f5]  focus:outline-none  transition-all"
              >
                <Filter className="h-4 w-4 mr-2" />
                Filtres
                {(typeFilter || specialityFilter || cityFilter || statusFilter || search) && (
                  <Badge variant="secondary" className="ml-2">
                    {(typeFilter ? 1 : 0) + (specialityFilter ? 1 : 0) + (cityFilter ? 1 : 0) + (statusFilter ? 1 : 0) + (search ? 1 : 0)}
                  </Badge>
                )}
              </Button>
            </div>

            {/* Expandable filters */}
            {showFilters && (
              <div className="flex flex-wrap gap-3 pt-4 border-t">
                {/* Type */}
                <FilterDropdown
                  label="Type"
                  value={typeFilter ? (PROVIDER_TYPES[typeFilter]?.label ?? typeFilter) : 'Tous les types'}
                  open={typeDropdownOpen}
                  onToggle={() => setTypeDropdownOpen(!typeDropdownOpen)}
                  onClose={() => setTypeDropdownOpen(false)}
                  menuWidth="w-48"
                >
                  <FilterOption selected={!typeFilter} onClick={() => { setTypeFilter(undefined); setPage(1); setTypeDropdownOpen(false); }}>Tous les types</FilterOption>
                  {Object.entries(PROVIDER_TYPES).map(([key, { label }]) => (
                    <FilterOption key={key} selected={typeFilter === key} onClick={() => { setTypeFilter(key); setPage(1); setTypeDropdownOpen(false); }}>{label}</FilterOption>
                  ))}
                </FilterDropdown>

                {/* Spécialité */}
                <FilterDropdown
                  label="Spécialité"
                  value={specialityFilter || 'Toutes'}
                  open={specialityDropdownOpen}
                  onToggle={() => setSpecialityDropdownOpen(!specialityDropdownOpen)}
                  onClose={() => setSpecialityDropdownOpen(false)}
                  menuWidth="w-56"
                >
                  <FilterOption selected={!specialityFilter} onClick={() => { setSpecialityFilter(undefined); setPage(1); setSpecialityDropdownOpen(false); }}>Toutes spécialités</FilterOption>
                  {SPECIALITES_PROVIDER.map((s) => (
                    <FilterOption key={s} selected={specialityFilter === s} onClick={() => { setSpecialityFilter(s); setPage(1); setSpecialityDropdownOpen(false); }}>{s}</FilterOption>
                  ))}
                </FilterDropdown>

                {/* Ville */}
                <FilterDropdown
                  label="Ville"
                  value={cityFilter || 'Toutes'}
                  open={cityDropdownOpen}
                  onToggle={() => setCityDropdownOpen(!cityDropdownOpen)}
                  onClose={() => setCityDropdownOpen(false)}
                  menuWidth="w-48"
                >
                  <FilterOption selected={!cityFilter} onClick={() => { setCityFilter(undefined); setPage(1); setCityDropdownOpen(false); }}>Toutes villes</FilterOption>
                  {VILLES_TUNISIE.map((v) => (
                    <FilterOption key={v} selected={cityFilter === v} onClick={() => { setCityFilter(v); setPage(1); setCityDropdownOpen(false); }}>{v}</FilterOption>
                  ))}
                </FilterDropdown>

                {/* Statut */}
                <FilterDropdown
                  label="Statut"
                  value={statusFilter === 'active' ? 'Actif' : statusFilter === 'inactive' ? 'Inactif' : 'Tous'}
                  open={statusDropdownOpen}
                  onToggle={() => setStatusDropdownOpen(!statusDropdownOpen)}
                  onClose={() => setStatusDropdownOpen(false)}
                  menuWidth="w-40"
                >
                  <FilterOption selected={!statusFilter} onClick={() => { setStatusFilter(undefined); setPage(1); setStatusDropdownOpen(false); }}>Tous</FilterOption>
                  <FilterOption selected={statusFilter === 'active'} onClick={() => { setStatusFilter('active'); setPage(1); setStatusDropdownOpen(false); }}>Actif</FilterOption>
                  <FilterOption selected={statusFilter === 'inactive'} onClick={() => { setStatusFilter('inactive'); setPage(1); setStatusDropdownOpen(false); }}>Inactif</FilterOption>
                </FilterDropdown>

                {/* Effacer */}
                {(typeFilter || specialityFilter || cityFilter || statusFilter || search) && (
                  <button
                    type="button"
                    onClick={() => {
                      setTypeFilter(undefined);
                      setSpecialityFilter(undefined);
                      setCityFilter(undefined);
                      setStatusFilter(undefined);
                      setSearch("");
                      setPage(1);
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <X className="h-4 w-4" />
                    Effacer filtres
                  </button>
                )}
              </div>
            )}
          </form>
        </div>

        {/* Total card */}
        <div className="flex items-center gap-4 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 px-6 py-4 md:py-0 text-white shadow-sm shrink-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white">
              Total Praticiens
            </p>
            <p className="text-2xl font-bold text-[30px]">
              {total.toLocaleString("fr-TN")}
            </p>
          </div>
          <Stethoscope className="w-8 h-8 text-white ml-auto" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={isLoading}
          emptyMessage="Aucun praticien trouvé"
          onRowClick={(item) => navigate(`/providers/${item.id}`)}
          pagination={{
            page,
            limit: 20,
            total: search ? filtered.length : total,
            onPageChange: setPage,
          }}
        />
      </div>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le praticien</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer{" "}
              <strong>{deleteConfirm?.name}</strong> ? Cette action est
              irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteProvider.isPending ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation */}
      <AlertDialog
        open={bulkDeleteConfirm}
        onOpenChange={() => setBulkDeleteConfirm(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suppression en masse</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer{" "}
              <strong>{selectedIds.size}</strong> praticien(s) ? Cette action est
              irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteProvider.isPending ? "Suppression..." : `Supprimer (${selectedIds.size})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}

export default ProvidersPage;
