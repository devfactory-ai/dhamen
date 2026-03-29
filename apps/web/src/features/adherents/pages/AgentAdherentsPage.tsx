import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Users, Eye, UserPlus, Pencil, Trash2, Download, AlertCircle } from 'lucide-react';
import { useAgentContext } from '@/features/agent/stores/agent-context';
// import { useCompanies } from '@/features/agent/hooks/use-companies';
import {
  useAdherents,
  useDeleteAdherent,
  useBulkDeleteAdherents,
} from '../hooks/useAdherents';

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

// --- Main Page ---

export function AgentAdherentsPage() {
  const navigate = useNavigate();
  const { selectedCompany } = useAgentContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'incomplete'>('all');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const statusDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!statusDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusDropdownOpen]);
  // const [companyFilter, setCompanyFilter] = useState<string | undefined>(selectedCompany?.id);
  // const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  // Dialogs
  const [deleteConfirm, setDeleteConfirm] = useState<AgentAdherent | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // const { data: companiesList } = useCompanies();
  const effectiveCompanyId = selectedCompany?.id; // companyFilter — TODO: rétablir le filtre entreprise
  const isActiveParam = statusFilter === 'active' ? 'true' as const : statusFilter === 'inactive' ? 'false' as const : undefined;
  const dossierCompletParam = statusFilter === 'incomplete' ? 'false' as const : undefined;
  const { data, isLoading } = useAdherents(page, 20, search || undefined, effectiveCompanyId, isActiveParam, dossierCompletParam);
  const { data: totalData } = useAdherents(1, 1, undefined, effectiveCompanyId);
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
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={adherents.length > 0 && selectedIds.size === adherents.length}
          onChange={toggleSelectAll}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
      render: (item: AgentAdherent) => (
        <input
          type="checkbox"
          checked={selectedIds.has(item.id)}
          onChange={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300"
        />
      ),
    },
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
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 border-amber-300 text-amber-700 gap-0.5">
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
    {
      key: 'companyName',
      header: 'Entreprise',
      render: (item: AgentAdherent) => <span className="text-sm text-gray-700">{item.companyName || '—'}</span>,
    },
    {
      key: 'plafond',
      header: 'Consommation Plafond',
      render: (item: AgentAdherent) => {
        const global = Number(item.plafondGlobal) || 0;
        const consomme = Number(item.plafondConsomme) || 0;
        const pct = global > 0 ? Math.round((consomme / global) * 100) : 0;
        const barColor = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-blue-500' : 'bg-blue-500';
        return (
          <div className="w-40">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-medium text-gray-900">{formatAmount(consomme)}</span>
              <span className="text-gray-400">/ {formatAmount(global)}</span>
              <span className={`font-semibold ${pct > 80 ? 'text-red-500' : 'text-blue-600'}`}>{pct}%</span>
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
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); navigate(`/adherents/agent/${item.id}/edit`); }}><Pencil className="w-4 h-4" /></Button>
          <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700" onClick={(e) => { e.stopPropagation(); setDeleteConfirm(item); }}><Trash2 className="w-4 h-4" /></Button>
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

  return (
    <div className="space-y-6">
      {/* Header: title + buttons */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Liste des Adhérents
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Gerez votre base de donnees d'assures et leurs plafonds de
            consommation.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
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
          <Button
            className="gap-2 bg-slate-900 hover:bg-[#19355d]"
            onClick={() => navigate("/adherents/agent/new")}
            disabled={!selectedCompany}
          >
            <UserPlus className="w-4 h-4" /> Nouvel Adhérent
          </Button>
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
            <div className="relative shrink-0" ref={statusDropdownRef}>
              <button
                type="button"
                onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
                className="flex items-center gap-2 w-full sm:w-auto px-4 py-3 bg-[#f3f4f5] rounded-xl hover:bg-gray-200/70 transition-colors cursor-pointer"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Statut</span>
                <span className="text-sm font-medium text-gray-900">
                  {statusFilter === "all" ? "Tous" : statusFilter === "active" ? "Actifs" : statusFilter === "inactive" ? "Inactifs" : "Incomplets"}
                </span>
                <svg className={`w-3.5 h-3.5 text-gray-400 ml-auto sm:ml-1 transition-transform ${statusDropdownOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 9-7 7-7-7" />
                </svg>
              </button>
              {statusDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-full sm:w-48 py-1 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 z-50">
                  {([
                    { value: "all" as const, label: "Tous", color: null },
                    { value: "active" as const, label: "Actifs", color: "bg-emerald-500" },
                    { value: "inactive" as const, label: "Inactifs", color: "bg-red-400" },
                    { value: "incomplete" as const, label: "Dossier incomplet", color: "bg-amber-400" },
                  ]).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => { setStatusFilter(opt.value); setStatusDropdownOpen(false); setPage(1); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 ${statusFilter === opt.value ? "text-blue-600 font-semibold bg-blue-50/50" : "text-gray-700"}`}
                    >
                      {opt.color && <span className={`w-2 h-2 rounded-full ${opt.color}`} />}
                      {opt.label}
                      {statusFilter === opt.value && (
                        <svg className="w-4 h-4 ml-auto text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Entreprise dropdown — TODO: rétablir quand le filtre sera prêt
            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => { setCompanyDropdownOpen(!companyDropdownOpen); setStatusDropdownOpen(false); }}
                onBlur={() => setTimeout(() => setCompanyDropdownOpen(false), 150)}
                className="flex items-center gap-2 w-full sm:w-auto px-4 py-3 bg-[#f3f4f5] rounded-xl hover:bg-gray-200/70 transition-colors cursor-pointer"
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Entreprise</span>
                <span className="text-sm font-medium text-gray-900 truncate max-w-[140px]">
                  {selectedCompanyName || "Toutes"}
                </span>
                <svg className={`w-3.5 h-3.5 text-gray-400 ml-auto sm:ml-1 transition-transform ${companyDropdownOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 9-7 7-7-7" />
                </svg>
              </button>
              {companyDropdownOpen && (
                <div className="absolute top-full right-0 sm:left-0 mt-1 w-64 max-h-72 overflow-y-auto py-1 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 z-50">
                  <button
                    type="button"
                    onClick={() => { setCompanyFilter(undefined); setCompanyDropdownOpen(false); setPage(1); }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 ${!companyFilter ? "text-blue-600 font-semibold bg-blue-50/50" : "text-gray-700"}`}
                  >
                    Toutes les entreprises
                    {!companyFilter && (
                      <svg className="w-4 h-4 ml-auto text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                    )}
                  </button>
                  {(companiesList ?? []).map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => { setCompanyFilter(c.id); setCompanyDropdownOpen(false); setPage(1); }}
                      className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 ${companyFilter === c.id ? "text-blue-600 font-semibold bg-blue-50/50" : "text-gray-700"}`}
                    >
                      <span className="truncate">{c.name}</span>
                      {companyFilter === c.id && (
                        <svg className="w-4 h-4 ml-auto shrink-0 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m4.5 12.75 6 6 9-13.5" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            */}
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
