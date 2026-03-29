import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Users, Eye, FileText, UserPlus, Pencil, Trash2, Download, AlertCircle } from 'lucide-react';
import { useAgentContext } from '@/features/agent/stores/agent-context';
import {
  useAdherents,
  useAdherentBulletins,
  useDeleteAdherent,
  useBulkDeleteAdherents,
  type AdherentBulletin,
} from '../hooks/useAdherents';

// --- Constants ---

const bulletinStatusConfig: Record<string, { label: string; variant: 'secondary' | 'default' | 'outline' | 'destructive'; className?: string }> = {
  draft: { label: 'Brouillon', variant: 'secondary' },
  in_batch: { label: 'Dans un lot', variant: 'default' },
  exported: { label: 'Exporté', variant: 'outline' },
  soumis: { label: 'Soumis', variant: 'default' },
  en_examen: { label: 'En examen', variant: 'default', className: 'bg-yellow-500 hover:bg-yellow-600' },
  approuve: { label: 'Approuvé', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  rejete: { label: 'Rejeté', variant: 'destructive' },
  paye: { label: 'Payé', variant: 'default', className: 'bg-emerald-700 hover:bg-emerald-800' },
};


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

function formatDate(date: string | null): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-TN');
}


// --- Sub-components ---

function BulletinHistory({ adherentId }: { adherentId: string }) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdherentBulletins(adherentId, page, 5);
  const bulletins: AdherentBulletin[] = data?.data ?? [];
  const meta = data?.meta;

  if (isLoading) return <p className="text-sm text-gray-400 py-4">Chargement...</p>;
  if (!bulletins.length) {
    return (
      <div className="text-center py-6 text-gray-400">
        <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Aucun bulletin de soins</p>
      </div>
    );
  }

  const totalDeclared = bulletins.reduce((s, b) => s + (Number(b.declaredAmount) || 0), 0);
  const totalReimbursed = bulletins.reduce((s, b) => s + (Number(b.reimbursedAmount) || 0), 0);

  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-gray-500">
            <th className="py-2">Date</th><th>Statut</th><th className="text-right">Déclaré</th><th className="text-right">Remboursé</th><th className="text-right">Actes</th>
          </tr>
        </thead>
        <tbody>
          {bulletins.map((b) => {
            const cfg = bulletinStatusConfig[b.status] || { label: b.status, variant: 'outline' as const };
            return (
              <tr key={b.id} className="border-b last:border-0">
                <td className="py-2">{formatDate(b.dateSoins)}</td>
                <td><Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge></td>
                <td className="text-right">{formatAmount(b.declaredAmount)}</td>
                <td className="text-right font-medium">{formatAmount(b.reimbursedAmount)}</td>
                <td className="text-right">{b.actesCount}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t font-medium text-sm">
            <td colSpan={2} className="py-2">Total</td>
            <td className="text-right">{formatAmount(totalDeclared)}</td>
            <td className="text-right">{formatAmount(totalReimbursed)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      {meta && meta.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-3">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Précédent</Button>
          <span className="text-xs text-gray-500 self-center">{page} / {meta.totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>Suivant</Button>
        </div>
      )}
    </div>
  );
}


// --- Main Page ---

export function AgentAdherentsPage() {
  const navigate = useNavigate();
  const { selectedCompany } = useAgentContext();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [viewAdherent, setViewAdherent] = useState<AgentAdherent | null>(null);
  const [showBulletins, setShowBulletins] = useState(false);

  // Dialogs
  const [deleteConfirm, setDeleteConfirm] = useState<AgentAdherent | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const { data, isLoading } = useAdherents(page, 20, search || undefined, selectedCompany?.id);
  const { data: totalData } = useAdherents(1, 1, undefined, selectedCompany?.id);
  const deleteMutation = useDeleteAdherent();
  const bulkDeleteMutation = useBulkDeleteAdherents();

  const allAdherents: AgentAdherent[] = (data?.data as unknown as AgentAdherent[]) ?? [];
  const meta = data?.meta;

  // Apply status filter client-side
  const adherents = statusFilter === 'all'
    ? allAdherents
    : allAdherents.filter((a) => statusFilter === 'active' ? a.isActive : !a.isActive);

  const totalAdherents = totalData?.meta?.total ?? 0;
  const filteredTotal = statusFilter === 'all' ? (meta?.total ?? 0) : adherents.length;

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
          <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setViewAdherent(item); setShowBulletins(false); }}><Eye className="w-4 h-4" /></Button>
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
      if (viewAdherent?.id === deleteConfirm.id) setViewAdherent(null);
    } catch { /* handled by mutation */ }
  }

  async function handleBulkDelete() {
    try {
      await bulkDeleteMutation.mutateAsync(Array.from(selectedIds));
      setSelectedIds(new Set());
      setBulkDeleteConfirm(false);
    } catch { /* handled by mutation */ }
  }

  // --- Detail dialog helpers ---
  let ayantsDroit: { nom: string; prenom: string; lien: string }[] = [];
  if (viewAdherent?.ayantsDroitJson) {
    try { ayantsDroit = JSON.parse(viewAdherent.ayantsDroitJson); } catch { /* ignore */ }
  }
  const plafondGlobal = Number(viewAdherent?.plafondGlobal) || 0;
  const plafondConsomme = Number(viewAdherent?.plafondConsomme) || 0;
  const plafondRestant = Math.max(0, plafondGlobal - plafondConsomme);
  const plafondPct = plafondGlobal > 0 ? Math.round((plafondConsomme / plafondGlobal) * 100) : 0;

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
                if (selectedCompany?.id)
                  params.set("companyId", selectedCompany.id);
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

      {/* Filters bar + Total card — same height via stretch */}
      <div className="flex flex-col md:flex-row items-stretch gap-4">
        {/* Filters */}
        <div className="flex flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
          {/* Search */}
          <div className="relative flex-1 min-w-0">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
              <svg
                className="w-[18px] h-[18px] text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Rechercher par nom, matricule, entreprise..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-11 pl-11 pr-10 rounded-xl bg-[#f3f4f5] text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
          {/* Statut dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
              onBlur={() => setTimeout(() => setStatusDropdownOpen(false), 150)}
              className="flex items-center gap-2 px-5 py-3 bg-[#f3f4f5] rounded-xl hover:bg-gray-200/70 transition-colors cursor-pointer"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Statut
              </span>
              <span className="text-sm font-medium text-gray-900">
                {statusFilter === "all"
                  ? "Tous"
                  : statusFilter === "active"
                    ? "Actifs"
                    : "Inactifs"}
              </span>
              <svg
                className={`w-3.5 h-3.5 text-gray-400 ml-1 transition-transform ${statusDropdownOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="m19 9-7 7-7-7"
                />
              </svg>
            </button>
            {statusDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-44 py-1 bg-white rounded-xl shadow-xl shadow-gray-200/50 border border-gray-100 z-50 animate-in fade-in slide-in-from-top-1">
                {[
                  { value: "all" as const, label: "Tous", color: null },
                  {
                    value: "active" as const,
                    label: "Actifs",
                    color: "bg-emerald-500",
                  },
                  {
                    value: "inactive" as const,
                    label: "Inactifs",
                    color: "bg-red-400",
                  },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(opt.value);
                      setStatusDropdownOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 ${statusFilter === opt.value ? "text-blue-600 font-semibold bg-blue-50/50" : "text-gray-700"}`}
                  >
                    {opt.color && (
                      <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                    )}
                    {opt.label}
                    {statusFilter === opt.value && (
                      <svg
                        className="w-4 h-4 ml-auto text-blue-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="m4.5 12.75 6 6 9-13.5"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Entreprise dropdown */}
          <div className="relative group/entreprise">
            <button
              type="button"
              className="flex items-center gap-2 px-5 py-3 bg-[#f3f4f5] rounded-xl hover:bg-gray-200/70 transition-colors cursor-pointer"
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Entreprise
              </span>
              <span className="text-sm font-medium text-gray-900">
                {selectedCompany?.name || "Toutes"}
              </span>
              <svg
                className="w-3.5 h-3.5 text-gray-400 ml-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="m19 9-7 7-7-7"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Total card — dark with red accent */}
        <div className="flex items-center gap-4 rounded-xl bg-gradient-to-br from-slate-700 to-slate-900 px-6 text-white shadow-sm">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white">
              Total Adhérents
            </p>
            <p className="text-2xl font-bold text-[30px]">
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
            setViewAdherent(item);
            setShowBulletins(false);
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

      {/* === Detail Dialog === */}
      <Dialog open={!!viewAdherent} onOpenChange={() => setViewAdherent(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              {viewAdherent?.firstName} {viewAdherent?.lastName}
              {viewAdherent?.matricule && (
                <Badge variant="outline" className="font-mono text-xs ml-2">
                  {viewAdherent.matricule}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {viewAdherent && (
            <div className="space-y-5">
              {/* Alerte dossier incomplet */}
              {!viewAdherent.dossierComplet && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">
                      Dossier incomplet
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      Cet adhérent a été créé automatiquement lors de l'import
                      d'un bulletin. Veuillez compléter ses informations (CIN,
                      date de naissance, adresse, etc.).
                    </p>
                  </div>
                </div>
              )}

              {/* Actions rapides */}
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setViewAdherent(null);
                    navigate(`/adherents/agent/${viewAdherent.id}/edit`);
                  }}
                >
                  <Pencil className="w-4 h-4 mr-1" /> Modifier
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => {
                    setViewAdherent(null);
                    setDeleteConfirm(viewAdherent);
                  }}
                >
                  <Trash2 className="w-4 h-4 mr-1" /> Supprimer
                </Button>
              </div>

              {/* Informations */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Informations
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Nom complet</span>
                    <p className="font-medium">
                      {viewAdherent.firstName} {viewAdherent.lastName}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Date de naissance</span>
                    <p className="font-medium">
                      {formatDate(viewAdherent.dateOfBirth)}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Sexe</span>
                    <p className="font-medium">
                      {viewAdherent.gender === "M"
                        ? "Masculin"
                        : viewAdherent.gender === "F"
                          ? "Féminin"
                          : "—"}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Email</span>
                    <p className="font-medium">{viewAdherent.email || "—"}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Ville</span>
                    <p className="font-medium">{viewAdherent.city || "—"}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Matricule</span>
                    <p className="font-medium font-mono">
                      {viewAdherent.matricule || "—"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Entreprise */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Entreprise
                </h3>
                <p className="text-sm font-medium">
                  {viewAdherent.companyName || "—"}
                </p>
              </div>

              {/* Plafond */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Plafond annuel
                </h3>
                <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-gray-500 text-xs">Global</p>
                    <p className="font-semibold">
                      {formatAmount(plafondGlobal)}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-gray-500 text-xs">Consommé</p>
                    <p className="font-semibold text-orange-600">
                      {formatAmount(plafondConsomme)}
                    </p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <p className="text-gray-500 text-xs">Restant</p>
                    <p className="font-semibold text-green-600">
                      {formatAmount(plafondRestant)}
                    </p>
                  </div>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${plafondPct > 80 ? "bg-red-500" : plafondPct > 50 ? "bg-orange-400" : "bg-green-500"}`}
                    style={{ width: `${Math.min(plafondPct, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1 text-right">
                  {plafondPct}% consommé
                </p>
              </div>

              {/* Ayants droit */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Ayants droit
                </h3>
                {ayantsDroit.length > 0 ? (
                  <div className="space-y-2">
                    {ayantsDroit.map((ad, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
                      >
                        <span className="font-medium">
                          {ad.prenom} {ad.nom}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {ad.lien}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Aucun ayant droit</p>
                )}
              </div>

              {/* Historique bulletins */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-700">
                    Historique bulletins
                  </h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowBulletins(!showBulletins)}
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    {showBulletins ? "Masquer" : "Afficher"}
                  </Button>
                </div>
                {showBulletins && (
                  <BulletinHistory adherentId={viewAdherent.id} />
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
