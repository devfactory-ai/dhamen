import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, RotateCcw, Eye, ArrowDown, ArrowUp, Search, Filter, Clock, Shield } from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';
import { FilterDropdown, FilterOption } from '@/components/ui/filter-dropdown';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { apiClient } from '@/lib/api-client';
import { usePermissions } from '@/hooks/usePermissions';

const ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Connexion',
  LOGOUT: 'Déconnexion',
  LOGIN_FAILED: 'Connexion échouée',
  PASSWORD_CHANGE: 'Changement mot de passe',
  MFA_ENABLE: 'MFA activé',
  MFA_VERIFY: 'MFA vérifié',
  CREATE: 'Création',
  READ: 'Lecture',
  UPDATE: 'Modification',
  DELETE: 'Suppression',
  RESTORE: 'Restauration',
  PERMANENT_DELETE: 'Suppression définitive',
  CLAIM_SUBMIT: 'PEC soumise',
  CLAIM_APPROVE: 'PEC approuvée',
  CLAIM_REJECT: 'PEC rejetée',
  ELIGIBILITY_CHECK: 'Vérification éligibilité',
  CONVENTION_UPDATE: 'Convention modifiée',
  RECONCILIATION_RUN: 'Réconciliation',
  EXPORT_DATA: 'Export données',
  IMPORT_DATA: 'Import données',
  BULK_OPERATION: 'Opération en masse',
  // Legacy action codes from logAudit middleware
  'auth.login': 'Connexion',
  'auth.login.failed': 'Connexion échouée',
  'auth.logout': 'Déconnexion',
  'auth.mfa.verified': 'MFA vérifié',
  'auth.verify_password.success': 'Mot de passe vérifié',
  'auth.verify_password.failed': 'Mot de passe échoué',
  'user.created': 'Utilisateur créé',
  'user.updated': 'Utilisateur modifié',
  'user.deleted': 'Utilisateur supprimé',
  'user.deactivated': 'Utilisateur désactivé',
  'role.permissions.updated': 'Permissions modifiées',
  'role.protected.permissions.updated': 'Permissions protégées modifiées',
  'role.permissions.password_failed': 'MDP permissions échoué',
  'role.created': 'Rôle créé',
  'role.deleted': 'Rôle supprimé',
  'role.statut.changed': 'Statut rôle modifié',
  'bulletin.created': 'Bulletin créé',
  'bulletin.updated': 'Bulletin modifié',
  'bulletin.validated': 'Bulletin validé',
  'bulletin.approved': 'Bulletin approuvé',
  'bulletin.rejected': 'Bulletin rejeté',
};

const ENTITY_TYPE_LABELS: Record<string, string> = {
  user: 'Utilisateur',
  role: 'Rôle',
  adherent: 'Adhérent',
  provider: 'Praticien',
  insurer: 'Assureur',
  contract: 'Contrat',
  claim: 'PEC',
  bulletin: 'Bulletin',
  company: 'Entreprise',
  batch: 'Lot',
  convention: 'Convention',
  session: 'Session',
};

const RESULT_COLORS: Record<string, string> = {
  success: 'bg-emerald-100 text-emerald-700',
  failure: 'bg-red-100 text-red-700',
};

interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName?: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  entityName?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  result: 'success' | 'failure';
  errorMessage?: string;
  duration?: number;
  changes?: { field: string; oldValue: unknown; newValue: unknown }[];
}

interface AuditLogsResponse {
  data: AuditEntry[];
  meta: {
    total: number;
    hasMore: boolean;
    limit: number;
    offset: number;
  };
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}

export function AuditLogsPage() {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission('audit_logs', 'read');
  const canExport = hasPermission('audit_logs', 'list');

  const [page, setPage] = useState(1);
  const limit = 25;
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [detailLog, setDetailLog] = useState<AuditEntry | null>(null);

  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [entityTypeDropdownOpen, setEntityTypeDropdownOpen] = useState(false);

  const ENTITY_TYPE_OPTIONS = [
    { value: '', label: 'Tous' },
    ...Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => ({ value, label })),
  ];

  const offset = (page - 1) * limit;

  const { data, isLoading } = useQuery<AuditLogsResponse>({
    queryKey: ['audit-logs', page, search, entityType, dateFrom, dateTo, sortOrder],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      params.set('sortBy', 'timestamp');
      params.set('sortOrder', sortOrder);
      if (search) params.set('search', search);
      if (entityType) params.set('entityType', entityType);
      if (dateFrom) params.set('startDate', dateFrom);
      if (dateTo) params.set('endDate', dateTo);

      const res = await apiClient.get<AuditEntry[]>(
        `/audit/logs?${params.toString()}`
      );
      if (!res.success) throw new Error(res.error?.message || 'Erreur de chargement');
      // API returns { success, data: AuditEntry[], meta: { total, hasMore, limit, offset } }
      const raw = res as unknown as { success: boolean; data: AuditEntry[]; meta: { total: number; hasMore: boolean; limit: number; offset: number } };
      return { data: raw.data, meta: raw.meta };
    },
    enabled: canRead,
  });

  const logs: AuditEntry[] = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const hasFilters = search || entityType || dateFrom || dateTo;

  const resetFilters = () => {
    setSearch('');
    setEntityType('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      params.set('format', 'csv');
      if (search) params.set('searchText', search);
      if (entityType) params.set('entityType', entityType);
      if (dateFrom) params.set('startDate', dateFrom);
      if (dateTo) params.set('endDate', dateTo);

      const res = await apiClient.get<Blob>(
        `/audit/export?${params.toString()}`,
        { responseType: 'blob' }
      );

      const blob = res instanceof Blob ? res : new Blob([JSON.stringify(res)], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      // Silent
    } finally {
      setIsExporting(false);
    }
  };

  const columns = [
    {
      key: 'timestamp',
      header: (
        <button
          onClick={() => { setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); setPage(1); }}
          className="inline-flex items-center gap-1 hover:text-gray-900 transition-colors"
        >
          Date
          {sortOrder === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
        </button>
      ),
      render: (row: AuditEntry) => (
        <span className="text-sm text-gray-600 whitespace-nowrap">{formatDate(row.timestamp)}</span>
      ),
    },
    {
      key: 'userName',
      header: 'Utilisateur',
      render: (row: AuditEntry) => (
        <div>
          <p className="text-sm font-medium text-gray-900">{row.userName || '—'}</p>
          {row.userRole && (
            <p className="text-xs text-gray-400">{row.userRole}</p>
          )}
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row: AuditEntry) => (
        <Badge
          variant="outline"
          className={row.result === 'failure' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}
        >
          {ACTION_LABELS[row.action] || row.action}
        </Badge>
      ),
    },
    {
      key: 'entityType',
      header: 'Type',
      render: (row: AuditEntry) => (
        <span className="text-sm text-gray-600">
          {ENTITY_TYPE_LABELS[row.entityType] || row.entityType}
        </span>
      ),
    },
    {
      key: 'entityId',
      header: 'Entité',
      render: (row: AuditEntry) => (
        <span className="text-sm text-gray-500 font-mono truncate max-w-[140px] block" title={row.entityId}>
          {row.entityName || (row.entityId ? `${row.entityId.slice(0, 12)}...` : '—')}
        </span>
      ),
    },
    {
      key: 'result',
      header: 'Résultat',
      render: (row: AuditEntry) => (
        <Badge variant="outline" className={RESULT_COLORS[row.result] || 'bg-gray-100 text-gray-700'}>
          {row.result === 'success' ? 'Succès' : 'Échec'}
        </Badge>
      ),
    },
    {
      key: 'ipAddress',
      header: 'IP',
      render: (row: AuditEntry) => (
        <span className="text-sm text-gray-500">{row.ipAddress || '—'}</span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: AuditEntry) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDetailLog(row)}
          title="Voir les détails"
        >
          <Eye className="w-4 h-4" />
        </Button>
      ),
    },
  ];

  if (!canRead) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">Accès refusé</p>
          <p className="text-sm text-gray-500 mt-1">Vous n'avez pas la permission de consulter les journaux d'audit.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Journaux d'audit</h1>
          <p className="mt-1 text-sm text-gray-500">
            Historique de toutes les actions effectuées sur la plateforme
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={resetFilters}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Réinitialiser
            </Button>
          )}
          {canExport && (
            <Button variant="outline" onClick={handleExport} disabled={isExporting}>
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? 'Export...' : 'Exporter CSV'}
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2">
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
                placeholder="Rechercher par utilisateur, action, entité..."
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

            {/* Entity type dropdown */}
            <FilterDropdown
              label="Type"
              value={ENTITY_TYPE_OPTIONS.find(o => o.value === entityType)?.label || 'Tous'}
              open={entityTypeDropdownOpen}
              onToggle={() => setEntityTypeDropdownOpen(!entityTypeDropdownOpen)}
              onClose={() => setEntityTypeDropdownOpen(false)}
              menuWidth="w-52"
            >
              {ENTITY_TYPE_OPTIONS.map((opt) => (
                <FilterOption
                  key={opt.value}
                  selected={entityType === opt.value}
                  onClick={() => { setEntityType(opt.value); setEntityTypeDropdownOpen(false); setPage(1); }}
                >
                  {opt.label}
                </FilterOption>
              ))}
            </FilterDropdown>
          </div>

          {/* Date filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 shrink-0">Du</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="h-11 px-3 rounded-xl bg-[#f3f4f5] text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400 shrink-0">Au</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="h-11 px-3 rounded-xl bg-[#f3f4f5] text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <DataTable
          columns={columns}
          data={logs}
          isLoading={isLoading}
          emptyMessage="Aucun journal d'audit trouvé"
          pagination={{
            page,
            limit,
            total,
            onPageChange: setPage,
          }}
        />
      </div>

      {/* Detail modal */}
      {detailLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 !mt-0">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Détails de l'action</h3>
              <button
                type="button"
                onClick={() => setDetailLog(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-[120px_1fr] gap-y-2 gap-x-3 text-sm">
                <span className="text-gray-500 font-medium">Date</span>
                <span className="text-gray-900">{formatDate(detailLog.timestamp)}</span>

                <span className="text-gray-500 font-medium">Utilisateur</span>
                <span className="text-gray-900">{detailLog.userName || detailLog.userId || '—'}</span>

                <span className="text-gray-500 font-medium">Rôle</span>
                <span className="text-gray-900">{detailLog.userRole || '—'}</span>

                <span className="text-gray-500 font-medium">Action</span>
                <span className="text-gray-900">{ACTION_LABELS[detailLog.action] || detailLog.action}</span>

                <span className="text-gray-500 font-medium">Code</span>
                <span className="text-gray-900 font-mono text-xs">{detailLog.action}</span>

                <span className="text-gray-500 font-medium">Type entité</span>
                <span className="text-gray-900">{ENTITY_TYPE_LABELS[detailLog.entityType] || detailLog.entityType}</span>

                <span className="text-gray-500 font-medium">Entité</span>
                <span className="text-gray-900 font-mono text-xs break-all">{detailLog.entityName || detailLog.entityId}</span>

                <span className="text-gray-500 font-medium">Résultat</span>
                <Badge variant="outline" className={RESULT_COLORS[detailLog.result] || ''}>
                  {detailLog.result === 'success' ? 'Succès' : 'Échec'}
                </Badge>

                {detailLog.errorMessage && (
                  <>
                    <span className="text-gray-500 font-medium">Erreur</span>
                    <span className="text-red-600 text-xs">{detailLog.errorMessage}</span>
                  </>
                )}

                {detailLog.duration != null && (
                  <>
                    <span className="text-gray-500 font-medium">Durée</span>
                    <span className="text-gray-900">{detailLog.duration}ms</span>
                  </>
                )}

                <span className="text-gray-500 font-medium">Adresse IP</span>
                <span className="text-gray-900">{detailLog.ipAddress || '—'}</span>

                <span className="text-gray-500 font-medium">User Agent</span>
                <span className="text-gray-900 text-xs break-all">{detailLog.userAgent || '—'}</span>
              </div>

              {detailLog.details && Object.keys(detailLog.details).length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Détails</h4>
                  <pre className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(detailLog.details, null, 2)}
                  </pre>
                </div>
              )}

              {detailLog.changes && detailLog.changes.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Modifications</h4>
                  <div className="space-y-2">
                    {detailLog.changes.map((change, i) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-3 text-xs">
                        <span className="font-medium text-gray-700">{change.field}</span>
                        <div className="mt-1 flex gap-2">
                          <span className="text-red-500 line-through">{String(change.oldValue ?? '—')}</span>
                          <span className="text-gray-400">&rarr;</span>
                          <span className="text-emerald-600">{String(change.newValue ?? '—')}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <Button variant="outline" onClick={() => setDetailLog(null)}>
                Fermer
              </Button>
            </div>
          </div>
        </div>
      )}
    <FloatingHelp
      title="Journaux d'audit"
      tips={[
        { icon: <Search className="h-4 w-4 text-blue-500" />, title: "Recherche", desc: "Recherchez par utilisateur, action ou entité." },
        { icon: <Filter className="h-4 w-4 text-purple-500" />, title: "Filtres", desc: "Filtrez par type d'entité et par plage de dates." },
        { icon: <Clock className="h-4 w-4 text-green-500" />, title: "Chronologie", desc: "Triez les logs du plus récent au plus ancien et inversement." },
        { icon: <Shield className="h-4 w-4 text-orange-500" />, title: "Traçabilité", desc: "Chaque action est enregistrée pour assurer la conformité." },
      ]}
    />
    </div>
  );
}

export default AuditLogsPage;
