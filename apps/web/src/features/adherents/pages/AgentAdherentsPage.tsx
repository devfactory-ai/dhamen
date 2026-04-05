import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/data-table';
import { FilterDropdown, FilterOption } from '@/components/ui/filter-dropdown';
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
import { Users, Eye, UserPlus, Pencil, Trash2, Download, Upload, AlertCircle } from 'lucide-react';
import { useAgentContext } from '@/features/agent/stores/agent-context';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useCompanies } from '@/features/agent/hooks/use-companies';
import {
  useAdherents,
  useDeleteAdherent,
  useBulkDeleteAdherents,
} from '../hooks/useAdherents';
import { usePermissions } from '@/hooks/usePermissions';

// --- Types ---

interface AgentAdherent {
  id: string;
  matricule: string | null;
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  gender: string | null;
  email: string | null;
  city: string | null;
  companyId: string | null;
  companyName: string | null;
  plafondGlobal: number | null;
  plafondConsomme: number | null;
  ayantsDroitJson: string | null;
  isActive: boolean;
  dossierComplet: boolean;
  createdAt: string;
}

// --- Helpers ---

function formatAmount(amount: number | null): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 0 }).format(amount / 1000) + ' DT';
}

function getIncompleteReason(adherent: AgentAdherent): string {
  const missing: string[] = [];
  if (!adherent.dateOfBirth) missing.push('Date de naissance');
  if (!adherent.email) missing.push('Email');
  if (!adherent.companyId) missing.push('Entreprise');
  if (missing.length === 0) missing.push('Informations manquantes');
  return `Manquant: ${missing.join(', ')}`;
}

// --- Main Page ---

export function AgentAdherentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const isHR = user?.role === 'HR';
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('adherents', 'create');
  const canUpdate = hasPermission('adherents', 'update');
  const canDelete = hasPermission('adherents', 'delete');
  const { selectedCompany } = useAgentContext();
  const isIndividualMode = !isHR && selectedCompany?.id === '__INDIVIDUAL__';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'incomplete'>('all');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [companyFilter, setCompanyFilter] = useState<string | undefined>(undefined);
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);

  // Dialogs
  const [deleteConfirm, setDeleteConfirm] = useState<AgentAdherent | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const { data: companiesList } = useCompanies();
  const effectiveCompanyId = isHR ? (user?.companyId ?? undefined) : isAdmin ? companyFilter : selectedCompany?.id;
  const selectedCompanyName = companyFilter
    ? companiesList?.find((c: { id: string; name: string }) => c.id === companyFilter)?.name
    : undefined;
  const isActiveParam = statusFilter === 'active' ? 'true' as const : statusFilter === 'inactive' ? 'false' as const : undefined;
  const dossierCompletParam = statusFilter === 'incomplete' ? 'false' as const : undefined;
  const contractTypeParam = isIndividualMode ? 'individual' as const : undefined;
  const { data, isLoading } = useAdherents(page, 20, search || undefined, effectiveCompanyId, isActiveParam, dossierCompletParam, contractTypeParam);
  const { data: totalData } = useAdherents(1, 1, undefined, effectiveCompanyId, undefined, undefined, contractTypeParam);
  // const selectedCompanyName = companyFilter
  //   ? companiesList?.find((c) => c.id === companyFilter)?.name ?? selectedCompany?.name
  //   : undefined;
  const deleteMutation = useDeleteAdherent();
  const bulkDeleteMutation = useBulkDeleteAdherents();

  const adherents: AgentAdherent[] = (data?.data as unknown as AgentAdherent[]) ?? [];
  const meta = data?.meta;

  const totalAdherents = totalData?.meta?.total ?? 0;
  const filteredTotal = meta?.total ?? 0;

  // --- Helpers for table ---
  function getInitials(first: string, last: string) {
    return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
  }
  const avatarColors = ['bg-blue-600', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500'];
  function getAvatarColor(name: string) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return avatarColors[Math.abs(hash) % avatarColors.length];
  }

  // --- Selection helpers ---
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === adherents.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(adherents.map((a) => a.id)));
    }
  };

  // --- Columns ---
  const columns = [
    ...(canDelete ? [{
      key: 'select',
      header: adherents.length > 0 ? (
        <input
          type="checkbox"
          checked={selectedIds.size === adherents.length}
          onChange={toggleSelectAll}
          className="h-4 w-4 rounded border-gray-300"
        />
      ) : null,
      render: (item: AgentAdherent) => (
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
      key: 'matricule',
      header: 'Matricule',
      render: (item: AgentAdherent) => (
        <span className="inline-flex rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white">
          #{item.matricule || '—'}
        </span>
      ),
    },
    {
      key: 'adherent',
      header: 'Adhérent',
      render: (item: AgentAdherent) => (
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium text-white ${getAvatarColor(item.firstName + item.lastName)}`}>
            {getInitials(item.firstName, item.lastName)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-900">{item.firstName} {item.lastName}</p>
              {!item.dossierComplet && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 bg-amber-50 border-amber-300 text-amber-700 gap-0.5 cursor-help"
                  title={getIncompleteReason(item)}
                >
                  <AlertCircle className="w-2.5 h-2.5" />
                  Dossier incomplet
                </Badge>
              )}
            </div>
            <p className="text-xs text-gray-400">{item.email || '—'}</p>
          </div>
        </div>
      ),
    },
    // Hide enterprise column for HR (they only see their own company)
    ...(!isHR ? [{
      key: 'companyName',
      header: 'Entreprise',
      render: (item: AgentAdherent) => <span className="text-sm text-gray-700">{item.companyName || '—'}</span>,
    }] : []),
    {
      key: 'plafond',
      header: 'Consommation Plafond',
      render: (item: AgentAdherent) => {
        const global = Number(item.plafondGlobal) || 0;
        const consomme = Number(item.plafondConsomme) || 0;

        // No ceiling configured → show "— / Illimité"
        if (global === 0) {
          return (
            <div className="w-40">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-gray-900">{consomme > 0 ? formatAmount(consomme) : '—'}</span>
                <span className="text-gray-400">/ Illimité</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 mt-1.5" />
            </div>
          );
        }

        const pct = Math.round((consomme / global) * 100);
        const barColor = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-blue-500';
        return (
          <div className="w-40">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-gray-900">{formatAmount(consomme)}</span>
              <span className="text-gray-400">/ {formatAmount(global)}</span>
              <span className={`font-semibold ${pct > 80 ? 'text-red-500' : pct > 50 ? 'text-amber-600' : 'text-blue-600'}`}>{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
              <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item: AgentAdherent) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/adherents/agent/${item.id}`); }}><Eye className="w-4 h-4" /></Button>
          {canUpdate && (
            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/adherents/agent/${item.id}/edit`); }}><Pencil className="w-4 h-4" /></Button>
          )}
          {canDelete && (
            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item); }}><Trash2 className="w-4 h-4" /></Button>
          )}
        </div>
      ),
    },
  ];


  async function handleDelete() {
    if (!deleteConfirm) return;
    try {
      await deleteMutation.mutateAsync(deleteConfirm.id);
      setDeleteConfirm(null);
      selectedIds.delete(deleteConfirm.id);
      setSelectedIds(new Set(selectedIds));
      // deletion successful
    } catch { /* handled by mutation */ }
  }

  async function handleBulkDelete() {
    try {
      await bulkDeleteMutation.mutateAsync(Array.from(selectedIds));
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
    } catch { /* handled by mutation */ }
  }

  // Pagination
  const pageSize = 20;

  // BR-007: HR user must have a company assigned
  if (isHR && !user?.companyId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
        <p className="text-lg font-semibold text-gray-900">Aucune entreprise associée</p>
        <p className="mt-1 text-sm text-gray-500">Votre compte n'est associé à aucune entreprise. Contactez votre administrateur.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header: title + buttons */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isHR
              ? `Adhérents de ${user?.companyName || 'votre entreprise'}`
              : isIndividualMode ? 'Adhérents Individuels' : 'Liste des Adhérents'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isHR
              ? 'Gérez les adhérents de votre entreprise.'
              : isIndividualMode
                ? 'Adhérents avec contrats individuels (sans entreprise).'
                : 'Gérez votre base de données d\'assures et leurs plafonds de consommation.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {selectedIds.size > 0 && canDelete && (
            <Button
              variant="outline"
              className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
              onClick={() => setBulkDeleteConfirm(true)}
              disabled={bulkDeleteMutation.isPending}
            >
              <Trash2 className="w-4 h-4" />
              Supprimer ({selectedIds.size})
            </Button>
          )}
          {canCreate && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => navigate('/adherents/import')}
            >
              <Upload className="w-4 h-4" /> Importer CSV
            </Button>
          )}
          <Button
            variant="outline"
            className="gap-2"
            onClick={async () => {
              try {
                const token = localStorage.getItem("accessToken");
                const params = new URLSearchParams();
                if (effectiveCompanyId)
                  params.set("companyId", effectiveCompanyId);
                if (search) params.set("search", search);
                const url = `${import.meta.env.VITE_API_URL || "/api/v1"}/adherents/export?${params}`;
                const res = await fetch(url, {
                  headers: {
                    Authorization: `Bearer ${token}`,
                    "X-Tenant-Code": localStorage.getItem("tenantCode") || "",
                  },
                });
                if (!res.ok) throw new Error("Erreur export");
                const blob = await res.blob();
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = `adherents_${new Date().toISOString().slice(0, 10)}.csv`;
                a.click();
                URL.revokeObjectURL(a.href);
              } catch {
                alert("Erreur lors de l'export CSV");
              }
            }}
          >
            <Download className="w-4 h-4" /> Exporter CSV
          </Button>
          {canCreate && (
            <Button
              className="gap-2 bg-slate-900 hover:bg-[#19355d]"
              onClick={() => navigate(isIndividualMode ? "/adherents/agent/new?type=individual" : "/adherents/agent/new")}
              disabled={!isAdmin && !isHR && !selectedCompany}
            >
              <UserPlus className="w-4 h-4" /> Nouvel Adhérent
            </Button>
          )}
        </div>
      </div>

      {/* Filters bar + Total card */}
      <div className="flex flex-col lg:flex-row items-stretch gap-4">
        {/* Filters */}
        <div className="flex-1 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Search */}
            <div className="relative flex-1 min-w-0">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="w-[18px] h-[18px] text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Rechercher par nom, matricule..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full h-11 pl-11 pr-10 rounded-xl bg-[#f3f4f5] text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
              />
              {search && (
                <button type="button" onClick={() => { setSearch(""); setPage(1); }} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Statut dropdown */}
            <FilterDropdown
              label="Statut"
              value={statusFilter === "all" ? "Tous" : statusFilter === "active" ? "Actifs" : statusFilter === "inactive" ? "Inactifs" : "Incomplets"}
              open={statusDropdownOpen}
              onToggle={() => setStatusDropdownOpen(!statusDropdownOpen)}
              onClose={() => setStatusDropdownOpen(false)}
            >
              {([
                { value: "all" as const, label: "Tous", color: null },
                { value: "active" as const, label: "Actifs", color: "bg-emerald-500" },
                { value: "inactive" as const, label: "Inactifs", color: "bg-red-400" },
                { value: "incomplete" as const, label: "Dossier incomplet", color: "bg-amber-400" },
              ]).map((opt) => (
                <FilterOption
                  key={opt.value}
                  selected={statusFilter === opt.value}
                  onClick={() => { setStatusFilter(opt.value); setStatusDropdownOpen(false); setPage(1); }}
                  color={opt.color ?? undefined}
                >
                  {opt.label}
                </FilterOption>
              ))}
            </FilterDropdown>

            {/* Entreprise dropdown — ADMIN only (hidden for HR) */}
            {isAdmin && !isHR && (
            <FilterDropdown
              label="Entreprise"
              value={selectedCompanyName || "Toutes"}
              open={companyDropdownOpen}
              onToggle={() => { setCompanyDropdownOpen(!companyDropdownOpen); setStatusDropdownOpen(false); }}
              onClose={() => setCompanyDropdownOpen(false)}
              menuWidth="w-64"
            >
              <FilterOption
                selected={!companyFilter}
                onClick={() => { setCompanyFilter(undefined); setCompanyDropdownOpen(false); setPage(1); }}
              >
                Toutes les entreprises
              </FilterOption>
              {(companiesList ?? []).map((c: { id: string; name: string }) => (
                <FilterOption
                  key={c.id}
                  selected={companyFilter === c.id}
                  onClick={() => { setCompanyFilter(c.id); setCompanyDropdownOpen(false); setPage(1); }}
                >
                  <span className="truncate">{c.name}</span>
                </FilterOption>
              ))}
            </FilterDropdown>
            )}
          </div>
        </div>

        {/* Total card */}
        <div className="flex items-center gap-4 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 px-6 py-4 lg:py-0 text-white shadow-sm shrink-0">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white">
              Total Adhérents
            </p>
            <p className="text-2xl font-bold">
              {totalAdherents.toLocaleString("fr-TN")}
            </p>
          </div>
          <Users className="w-8 h-8 text-white ml-auto" />
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={adherents}
          isLoading={isLoading}
          emptyMessage="Aucun adherent trouve"
          emptyStateType="adherents"
          onRowClick={(item) => {
            navigate(`/adherents/agent/${item.id}`);
          }}
          pagination={
            meta
              ? {
                  page,
                  limit: pageSize,
                  total: filteredTotal,
                  onPageChange: setPage,
                }
              : undefined
          }
        />
      </div>

      {/* === Delete Confirmation === */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'adhérent</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer{" "}
              <strong>
                {deleteConfirm?.firstName} {deleteConfirm?.lastName}
              </strong>
              {deleteConfirm?.matricule && (
                <> (matricule: {deleteConfirm.matricule})</>
              )}{" "}
              ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* === Bulk Delete Confirmation === */}
      <AlertDialog
        open={bulkDeleteConfirm}
        onOpenChange={() => setBulkDeleteConfirm(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suppression multiple</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer <strong>{selectedIds.size}</strong>{" "}
              adhérent(s) sélectionné(s) ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBulkDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {bulkDeleteMutation.isPending
                ? "Suppression..."
                : `Supprimer (${selectedIds.size})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
