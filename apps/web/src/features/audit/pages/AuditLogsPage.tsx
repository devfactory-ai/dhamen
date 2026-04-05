/**
 * Audit Logs Page
 *
 * Advanced audit log search and compliance reporting
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  Filter,
  Download,
  FileText,
  Shield,
  Clock,
  User,
  Activity,
  AlertCircle,
  CheckCircle,
  XCircle,
  ChevronDown,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { PageHeader } from '../../../components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Input } from '../../../components/ui/input';
import { FilterDropdown, FilterOption } from '../../../components/ui/filter-dropdown';
import { apiClient } from '../../../lib/api-client';

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
  result: 'success' | 'failure';
  errorMessage?: string;
  duration?: number;
  criticality?: string;
}

// Criticality badge config
const CRITICALITY_CONFIG: Record<string, { label: string; className: string }> = {
  critique: { label: 'Critique', className: 'bg-red-100 text-red-700 border-red-200' },
  haute: { label: 'Haute', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  moyenne: { label: 'Moyenne', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  normale: { label: 'Normale', className: 'bg-green-100 text-green-700 border-green-200' },
};

// Module grouping for entity types
const MODULE_OPTIONS = [
  { value: '', label: 'Tous les modules' },
  { value: 'bulletin_de_soins', label: 'Bulletins' },
  { value: 'provider', label: 'Praticiens' },
  { value: 'adherent', label: 'Adhérents' },
  { value: 'contract', label: 'Contrats' },
  { value: 'user', label: 'Utilisateurs' },
  { value: 'claim', label: 'PEC' },
  { value: 'payment', label: 'Paiements' },
];

interface AuditStats {
  totalEntries: number;
  byAction: { action: string; count: number }[];
  byEntityType: { entityType: string; count: number }[];
  byUser: { userId: string; userName: string; count: number }[];
  byResult: { result: string; count: number }[];
  byDay: { date: string; count: number }[];
  avgDuration: number;
  errorRate: number;
}

export function AuditLogsPage() {
  const [searchText, setSearchText] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [selectedEntityType, setSelectedEntityType] = useState<string>('');
  const [selectedResult, setSelectedResult] = useState<string>('');
  const [selectedModule, setSelectedModule] = useState<string>('');
  const [selectedCriticality, setSelectedCriticality] = useState<string>('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [actionDropdownOpen, setActionDropdownOpen] = useState(false);
  const [entityTypeDropdownOpen, setEntityTypeDropdownOpen] = useState(false);
  const [resultDropdownOpen, setResultDropdownOpen] = useState(false);
  const [moduleDropdownOpen, setModuleDropdownOpen] = useState(false);
  const [criticalityDropdownOpen, setCriticalityDropdownOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const limit = 20;

  // Fetch audit logs
  const { data: logsData, isLoading } = useQuery({
    queryKey: ['audit', 'logs', searchText, selectedAction, selectedEntityType, selectedResult, selectedModule, selectedCriticality, sortOrder, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: (page * limit).toString(),
      });

      if (searchText) params.append('search', searchText);
      if (selectedAction) params.append('action', selectedAction);
      if (selectedModule) params.append('entityType', selectedModule);
      else if (selectedEntityType) params.append('entityType', selectedEntityType);
      if (selectedResult) params.append('result', selectedResult);
      if (selectedCriticality) params.append('criticality', selectedCriticality);
      params.append('sortBy', 'timestamp');
      params.append('sortOrder', sortOrder);

      const response = await apiClient.get<{
        success: boolean;
        data: AuditEntry[];
        meta: { total: number; hasMore: boolean };
      }>(`/audit/logs?${params.toString()}`);

      return response;
    },
  });

  // Fetch audit stats
  const { data: statsData } = useQuery({
    queryKey: ['audit', 'stats'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: AuditStats }>(
        '/audit/stats'
      );
      return response.data;
    },
  });

  // Fetch action types
  const { data: actionsData } = useQuery({
    queryKey: ['audit', 'actions'],
    queryFn: async () => {
      const response = await apiClient.get<{
        success: boolean;
        data: { code: string; category: string; label: string }[];
      }>('/audit/actions');
      return response.data;
    },
  });

  // Fetch entity types
  const { data: entityTypesData } = useQuery({
    queryKey: ['audit', 'entity-types'],
    queryFn: async () => {
      const response = await apiClient.get<{
        success: boolean;
        data: { code: string; label: string }[];
      }>('/audit/entity-types');
      return response.data;
    },
  });

  const logs = logsData?.data || [];
  const totalLogs = logsData?.meta?.total || 0;
  const stats = statsData;
  const actions = actionsData || [];
  const entityTypes = entityTypesData || [];

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('fr-TN', {
      dateStyle: 'short',
      timeStyle: 'medium',
    });
  };

  const getActionBadgeVariant = (action: string): 'default' | 'success' | 'warning' | 'error' | 'secondary' => {
    if (action.includes('DELETE') || action.includes('REJECT') || action.includes('FAILED')) {
      return 'error';
    }
    if (action.includes('CREATE') || action.includes('APPROVE')) {
      return 'success';
    }
    if (action.includes('UPDATE') || action.includes('REVIEW')) {
      return 'warning';
    }
    return 'default';
  };

  const getActionLabel = (action: string) => {
    const found = actions.find((a: { code: string }) => a.code === action);
    return found?.label || action;
  };

  const getEntityTypeLabel = (entityType: string) => {
    const found = entityTypes.find((e: { code: string }) => e.code === entityType);
    return found?.label || entityType;
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams({ format: 'csv' });
      if (searchText) params.append('search', searchText);
      if (selectedAction) params.append('action', selectedAction);
      if (selectedModule) params.append('entityType', selectedModule);
      else if (selectedEntityType) params.append('entityType', selectedEntityType);
      if (selectedResult) params.append('result', selectedResult);
      if (selectedCriticality) params.append('criticality', selectedCriticality);

      const response = await apiClient.get(
        `/audit/export?${params.toString()}`,
        { responseType: 'blob' }
      );

      const url = window.URL.createObjectURL(new Blob([response as unknown as BlobPart]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal d'Audit"
        description="Historique complet des activités et actions système"
        icon={<Shield className="h-6 w-6" />}
        actions={
          <button
            onClick={handleExport}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Download className="h-4 w-4 mr-2" />
            Exporter
          </button>
        }
      />

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Total Événements</p>
                  <p className="text-2xl font-bold">{stats.totalEntries.toLocaleString()}</p>
                </div>
                <Activity className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Taux d'Erreur</p>
                  <p className="text-2xl font-bold">{stats.errorRate.toFixed(2)}%</p>
                </div>
                <AlertCircle className={`h-8 w-8 ${stats.errorRate > 5 ? 'text-red-500' : 'text-green-500'}`} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Temps Moyen</p>
                  <p className="text-2xl font-bold">{stats.avgDuration.toFixed(0)}ms</p>
                </div>
                <Clock className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Utilisateurs Actifs</p>
                  <p className="text-2xl font-bold">{stats.byUser.length}</p>
                </div>
                <User className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Rechercher..."
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setPage(0);
                  }}
                  className="pl-10"
                />
              </div>
            </div>

            <FilterDropdown
              label="Action"
              value={selectedAction ? (actions.find((a: { code: string; label: string }) => a.code === selectedAction)?.label || selectedAction) : 'Toutes les actions'}
              open={actionDropdownOpen}
              onToggle={() => setActionDropdownOpen(!actionDropdownOpen)}
              onClose={() => setActionDropdownOpen(false)}
              menuWidth="w-56"
            >
              <FilterOption selected={!selectedAction} onClick={() => { setSelectedAction(''); setPage(0); setActionDropdownOpen(false); }}>Toutes les actions</FilterOption>
              {actions.map((action: { code: string; category: string; label: string }) => (
                <FilterOption key={action.code} selected={selectedAction === action.code} onClick={() => { setSelectedAction(action.code); setPage(0); setActionDropdownOpen(false); }}>{action.label}</FilterOption>
              ))}
            </FilterDropdown>

            <FilterDropdown
              label="Type"
              value={selectedEntityType ? (entityTypes.find((t: { code: string; label: string }) => t.code === selectedEntityType)?.label || selectedEntityType) : 'Tous les types'}
              open={entityTypeDropdownOpen}
              onToggle={() => setEntityTypeDropdownOpen(!entityTypeDropdownOpen)}
              onClose={() => setEntityTypeDropdownOpen(false)}
              menuWidth="w-48"
            >
              <FilterOption selected={!selectedEntityType} onClick={() => { setSelectedEntityType(''); setPage(0); setEntityTypeDropdownOpen(false); }}>Tous les types</FilterOption>
              {entityTypes.map((type: { code: string; label: string }) => (
                <FilterOption key={type.code} selected={selectedEntityType === type.code} onClick={() => { setSelectedEntityType(type.code); setPage(0); setEntityTypeDropdownOpen(false); }}>{type.label}</FilterOption>
              ))}
            </FilterDropdown>

            <FilterDropdown
              label="Résultat"
              value={selectedResult === 'success' ? 'Succès' : selectedResult === 'failure' ? 'Échec' : 'Tous les résultats'}
              open={resultDropdownOpen}
              onToggle={() => setResultDropdownOpen(!resultDropdownOpen)}
              onClose={() => setResultDropdownOpen(false)}
              menuWidth="w-48"
            >
              <FilterOption selected={!selectedResult} onClick={() => { setSelectedResult(''); setPage(0); setResultDropdownOpen(false); }}>Tous les résultats</FilterOption>
              <FilterOption selected={selectedResult === 'success'} onClick={() => { setSelectedResult('success'); setPage(0); setResultDropdownOpen(false); }}>Succès</FilterOption>
              <FilterOption selected={selectedResult === 'failure'} onClick={() => { setSelectedResult('failure'); setPage(0); setResultDropdownOpen(false); }}>Échec</FilterOption>
            </FilterDropdown>

            <FilterDropdown
              label="Module"
              value={MODULE_OPTIONS.find((o) => o.value === selectedModule)?.label || 'Tous les modules'}
              open={moduleDropdownOpen}
              onToggle={() => setModuleDropdownOpen(!moduleDropdownOpen)}
              onClose={() => setModuleDropdownOpen(false)}
              menuWidth="w-48"
            >
              {MODULE_OPTIONS.map((opt) => (
                <FilterOption key={opt.value} selected={selectedModule === opt.value} onClick={() => { setSelectedModule(opt.value); setPage(0); setModuleDropdownOpen(false); }}>{opt.label}</FilterOption>
              ))}
            </FilterDropdown>

            <FilterDropdown
              label="Criticité"
              value={selectedCriticality ? ({ critique: 'Critique', haute: 'Haute', moyenne: 'Moyenne', normale: 'Normale' }[selectedCriticality] || selectedCriticality) : 'Toutes criticités'}
              open={criticalityDropdownOpen}
              onToggle={() => setCriticalityDropdownOpen(!criticalityDropdownOpen)}
              onClose={() => setCriticalityDropdownOpen(false)}
              menuWidth="w-48"
            >
              <FilterOption selected={!selectedCriticality} onClick={() => { setSelectedCriticality(''); setPage(0); setCriticalityDropdownOpen(false); }}>Toutes criticités</FilterOption>
              <FilterOption selected={selectedCriticality === 'critique'} onClick={() => { setSelectedCriticality('critique'); setPage(0); setCriticalityDropdownOpen(false); }}>Critique</FilterOption>
              <FilterOption selected={selectedCriticality === 'haute'} onClick={() => { setSelectedCriticality('haute'); setPage(0); setCriticalityDropdownOpen(false); }}>Haute</FilterOption>
              <FilterOption selected={selectedCriticality === 'moyenne'} onClick={() => { setSelectedCriticality('moyenne'); setPage(0); setCriticalityDropdownOpen(false); }}>Moyenne</FilterOption>
              <FilterOption selected={selectedCriticality === 'normale'} onClick={() => { setSelectedCriticality('normale'); setPage(0); setCriticalityDropdownOpen(false); }}>Normale</FilterOption>
            </FilterDropdown>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between w-full">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Événements
              <span className="text-sm font-normal text-gray-500">
                ({totalLogs.toLocaleString()} résultats)
              </span>
            </CardTitle>
            <button
              onClick={() => { setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc'); setPage(0); }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              title={sortOrder === 'desc' ? 'Plus récent en premier' : 'Plus ancien en premier'}
            >
              {sortOrder === 'desc' ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
              {sortOrder === 'desc' ? 'Plus récent' : 'Plus ancien'}
            </button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse flex items-center gap-4 py-3">
                  <div className="h-4 bg-gray-200 rounded w-32" />
                  <div className="h-4 bg-gray-200 rounded w-24" />
                  <div className="h-4 bg-gray-200 rounded w-48" />
                  <div className="flex-1" />
                  <div className="h-4 bg-gray-200 rounded w-16" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log: AuditEntry) => (
                <div
                  key={log.id}
                  className="border rounded-lg overflow-hidden"
                >
                  <div
                    className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}
                  >
                    <div className="flex items-center gap-2 min-w-[180px]">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span className="text-sm text-gray-600">
                        {formatDate(log.timestamp)}
                      </span>
                    </div>

                    <Badge variant={getActionBadgeVariant(log.action)}>
                      {getActionLabel(log.action)}
                    </Badge>

                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">
                        {getEntityTypeLabel(log.entityType)}
                      </span>
                      {log.entityName && (
                        <span className="text-sm text-gray-500 ml-2">
                          ({log.entityName})
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <User className="h-4 w-4" />
                      {log.userName || log.userId}
                    </div>

                    {log.criticality && CRITICALITY_CONFIG[log.criticality] && (
                      <Badge className={`text-[10px] px-1.5 py-0 ${CRITICALITY_CONFIG[log.criticality].className}`}>
                        {CRITICALITY_CONFIG[log.criticality].label}
                      </Badge>
                    )}

                    {log.result === 'success' ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}

                    <ChevronDown
                      className={`h-5 w-5 text-gray-400 transition-transform ${
                        expandedRow === log.id ? 'rotate-180' : ''
                      }`}
                    />
                  </div>

                  {expandedRow === log.id && (
                    <div className="bg-gray-50 p-4 border-t">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium">ID Événement:</span>
                          <span className="ml-2 font-mono text-gray-600">{log.id}</span>
                        </div>
                        <div>
                          <span className="font-medium">ID Entité:</span>
                          <span className="ml-2 font-mono text-gray-600">{log.entityId}</span>
                        </div>
                        <div>
                          <span className="font-medium">Rôle:</span>
                          <span className="ml-2">{log.userRole}</span>
                        </div>
                        {log.ipAddress && (
                          <div>
                            <span className="font-medium">Adresse IP:</span>
                            <span className="ml-2 font-mono">{log.ipAddress}</span>
                          </div>
                        )}
                        {log.duration && (
                          <div>
                            <span className="font-medium">Durée:</span>
                            <span className="ml-2">{log.duration}ms</span>
                          </div>
                        )}
                        {log.errorMessage && (
                          <div className="col-span-2">
                            <span className="font-medium text-red-600">Erreur:</span>
                            <span className="ml-2 text-red-600">{log.errorMessage}</span>
                          </div>
                        )}
                        {Object.keys(log.details || {}).length > 0 && (
                          <div className="col-span-2">
                            <span className="font-medium">Détails:</span>
                            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-auto max-h-32">
                              {JSON.stringify(log.details, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {logs.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  Aucun événement trouvé
                </div>
              )}
            </div>
          )}

          {/* Pagination */}
          {totalLogs > limit && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <span className="text-sm text-gray-500">
                Affichage {page * limit + 1} - {Math.min((page + 1) * limit, totalLogs)} sur{' '}
                {totalLogs}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                >
                  Précédent
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={(page + 1) * limit >= totalLogs}
                  className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity by Day Chart */}
      {stats && stats.byDay.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Activité Journalière</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-32 flex items-end gap-1">
              {stats.byDay.slice(-30).map((day: { date: string; count: number }, i: number) => {
                const maxCount = Math.max(...stats.byDay.map((d: { count: number }) => d.count), 1);
                const height = (day.count / maxCount) * 100;
                return (
                  <div
                    key={i}
                    className="flex-1 bg-primary/30 hover:bg-primary/50 transition-colors rounded-t"
                    style={{ height: `${height}%` }}
                    title={`${day.date}: ${day.count} événements`}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>{stats.byDay[0]?.date}</span>
              <span>{stats.byDay[stats.byDay.length - 1]?.date}</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
