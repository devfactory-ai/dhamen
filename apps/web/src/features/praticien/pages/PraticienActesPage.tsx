import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, FileText, Search, Filter, Clock } from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { FilterDropdown, FilterOption } from '@/components/ui/filter-dropdown';
import { usePraticienActes, usePraticienStats, type PraticienActe } from '../hooks/usePraticien';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';

const STATUS_OPTIONS = [
  { value: 'all' as const, label: 'Tous', color: null },
  { value: 'pending' as const, label: 'En attente', color: 'bg-amber-400' },
  { value: 'submitted' as const, label: 'Soumis', color: 'bg-blue-400' },
  { value: 'processing' as const, label: 'En traitement', color: 'bg-amber-500' },
  { value: 'approved' as const, label: 'Approuvé', color: 'bg-emerald-500' },
  { value: 'paid' as const, label: 'Payé', color: 'bg-emerald-400' },
  { value: 'rejected' as const, label: 'Rejeté', color: 'bg-red-400' },
  { value: 'in_batch' as const, label: 'En lot', color: 'bg-orange-400' },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: 'Brouillon', color: 'bg-gray-100 text-gray-700' },
  scan_uploaded: { label: 'Scan envoyé', color: 'bg-blue-50 text-blue-700' },
  paper_received: { label: 'Reçu', color: 'bg-blue-50 text-blue-700' },
  paper_incomplete: { label: 'Incomplet', color: 'bg-amber-50 text-amber-700' },
  paper_complete: { label: 'Complet', color: 'bg-blue-50 text-blue-700' },
  processing: { label: 'En traitement', color: 'bg-amber-50 text-amber-700' },
  approved: { label: 'Approuvé', color: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Rejeté', color: 'bg-red-50 text-red-700' },
  paid: { label: 'Payé', color: 'bg-emerald-50 text-emerald-700' },
  submitted: { label: 'Soumis', color: 'bg-blue-50 text-blue-700' },
  in_batch: { label: 'En lot', color: 'bg-orange-50 text-orange-700' },
  pending: { label: 'En attente', color: 'bg-amber-50 text-amber-700' },
};

const CARE_TYPE_LABELS: Record<string, string> = {
  pharmacy: 'Pharmacie',
  consultation: 'Consultation',
  lab: 'Laboratoire',
  hospital: 'Hospitalisation',
  hospitalization: 'Hospitalisation',
  dental: 'Dentaire',
  optical: 'Optique',
};

const ROLE_CONFIG: Record<string, { title: string; subtitle: string }> = {
  PHARMACIST: {
    title: 'Mes dispensations',
    subtitle: 'Consultez l\u2019historique de vos dispensations et leur statut de remboursement',
  },
  DOCTOR: {
    title: 'Mes consultations',
    subtitle: 'Consultez l\u2019historique de vos consultations et leur statut de remboursement',
  },
  LAB_MANAGER: {
    title: 'Mes analyses',
    subtitle: 'Consultez l\u2019historique de vos analyses et leur statut de remboursement',
  },
  CLINIC_ADMIN: {
    title: 'Mes hospitalisations',
    subtitle: 'Consultez l\u2019historique de vos hospitalisations et leur statut de remboursement',
  },
};

const BASE_PATH = '/praticien';

function formatAmount(amount: number): string {
  return (amount / 1000).toFixed(3) + ' TND';
}

const avatarColors = ['bg-blue-600', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500'];
function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}
function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
}

export function PraticienActesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('claims', 'read');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: actesData, isLoading } = usePraticienActes(page, 20, statusFilter);
  const { data: stats } = usePraticienStats();

  const role = user?.role || '';
  const config = ROLE_CONFIG[role] || { title: 'Mes actes', subtitle: 'Consultez l\u2019historique de vos actes et leur statut de remboursement' };

  if (!canRead) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">Accès refusé</p>
          <p className="text-sm text-gray-500 mt-1">Vous n'avez pas la permission de consulter les actes.</p>
        </div>
      </div>
    );
  }

  // Client-side search filtering
  const allActes = actesData?.data ?? [];
  const actes = search
    ? allActes.filter((a) => {
        const term = search.toLowerCase();
        return (
          a.bulletinNumber?.toLowerCase().includes(term) ||
          a.adherentName?.toLowerCase().includes(term) ||
          a.companyName?.toLowerCase().includes(term) ||
          a.adherentNationalId?.toLowerCase().includes(term)
        );
      })
    : allActes;
  const meta = actesData?.meta;

  const statusLabel = STATUS_OPTIONS.find(o => o.value === statusFilter)?.label || 'Tous';

  const columns = [
    {
      key: 'bulletinNumber',
      header: 'Référence',
      render: (a: PraticienActe) => (
        <span className="inline-flex rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white">
          {a.bulletinNumber || '\u2014'}
        </span>
      ),
    },
    {
      key: 'adherentName',
      header: 'Adhérent',
      render: (a: PraticienActe) => {
        const name = a.adherentName || '\u2014';
        return (
          <div className="flex items-center gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-full text-xs font-medium text-white ${getAvatarColor(name)}`}>
              {getInitials(name)}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{name}</p>
              {a.companyName && a.companyName !== '\u2014' && (
                <p className="text-xs text-gray-400">{a.companyName}</p>
              )}
            </div>
          </div>
        );
      },
    },
    {
      key: 'careType',
      header: 'Type',
      render: (a: PraticienActe) => (
        <span className="text-sm text-gray-700">{CARE_TYPE_LABELS[a.careType] ?? a.careType ?? '\u2014'}</span>
      ),
    },
    {
      key: 'totalAmount',
      header: 'Montant',
      render: (a: PraticienActe) => (
        <div>
          <p className="text-sm font-semibold text-gray-900">{a.totalAmount != null ? formatAmount(a.totalAmount) : '\u2014'}</p>
          {a.reimbursedAmount != null && a.reimbursedAmount > 0 && (
            <p className="text-xs text-emerald-600">Remb. {formatAmount(a.reimbursedAmount)}</p>
          )}
        </div>
      ),
    },
    {
      key: 'careDate',
      header: 'Date',
      render: (a: PraticienActe) => {
        const d = a.careDate || a.createdAt;
        return <span className="text-sm text-gray-500">{d ? new Date(d).toLocaleDateString('fr-TN') : '\u2014'}</span>;
      },
    },
    {
      key: 'status',
      header: 'Statut',
      render: (a: PraticienActe) => {
        const s = STATUS_LABELS[a.status] ?? { label: a.status, color: 'bg-gray-100 text-gray-700' };
        return (
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${s.color}`}>
            {s.label}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (a: PraticienActe) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => { e.stopPropagation(); navigate(`${BASE_PATH}/actes/${a.id}`); }}
        >
          <Eye className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{config.title}</h1>
        <p className="mt-1 text-sm text-gray-500">{config.subtitle}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-sm text-gray-500">Total</p>
            <p className="text-2xl font-bold">{stats?.totalActes ?? 0}</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
            <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-500">En attente</p>
            <p className="text-2xl font-bold text-amber-600">{stats?.enAttente ?? 0}</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
            <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-500">Approuvés</p>
            <p className="text-2xl font-bold text-emerald-600">{stats?.approuves ?? 0}</p>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
            <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <div>
            <p className="text-sm text-gray-500">Rejetés</p>
            <p className="text-2xl font-bold text-red-600">{stats?.rejetes ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Filter bar + Total card — same style as AgentAdherentsPage */}
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
                placeholder="Rechercher par référence, adhérent..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full h-11 pl-11 pr-10 rounded-xl bg-[#f3f4f5] text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
              />
              {search && (
                <button type="button" onClick={() => { setSearch(''); setPage(1); }} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Status dropdown */}
            <FilterDropdown
              label="Statut"
              value={statusLabel}
              open={statusDropdownOpen}
              onToggle={() => setStatusDropdownOpen(!statusDropdownOpen)}
              onClose={() => setStatusDropdownOpen(false)}
            >
              {STATUS_OPTIONS.map((opt) => (
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
          </div>
        </div>

      
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={actes}
          isLoading={isLoading}
          emptyMessage="Aucun acte trouvé"
          emptyStateType="claims"
          searchTerm={search}
          onRowClick={(a) => navigate(`${BASE_PATH}/actes/${a.id}`)}
          pagination={!search && meta ? {
            page,
            limit: meta.limit || 20,
            total: meta.total || 0,
            onPageChange: setPage,
          } : undefined}
        />
      </div>

      <FloatingHelp
        title="Mes actes"
        tips={[
          { icon: <Search className="h-4 w-4 text-blue-500" />, title: "Recherche", desc: "Recherchez par référence de bulletin, nom d'adhérent ou entreprise." },
          { icon: <Filter className="h-4 w-4 text-purple-500" />, title: "Filtrer par statut", desc: "Utilisez le filtre pour afficher uniquement les actes en attente, approuvés ou rejetés." },
          { icon: <Eye className="h-4 w-4 text-green-500" />, title: "Détails de l'acte", desc: "Cliquez sur un acte pour consulter le détail et le statut de remboursement." },
          { icon: <Clock className="h-4 w-4 text-orange-500" />, title: "Suivi des remboursements", desc: "Suivez l'état de vos remboursements depuis les indicateurs en haut de page." },
        ]}
      />
    </div>
  );
}

export default PraticienActesPage;
