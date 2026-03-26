import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table';
import { Button } from './button';
import { SkeletonTable } from './skeleton';
import { EmptyState, SearchEmptyState, ErrorEmptyState } from './empty-state';

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
}

type EmptyStateType = 'no-data' | 'no-results' | 'error' | 'adherents' | 'providers' | 'claims' | 'contracts' | 'cards' | 'documents';

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  emptyStateType?: EmptyStateType;
  searchTerm?: string;
  onClearSearch?: () => void;
  onRetry?: () => void;
  onRowClick?: (item: T) => void;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  className?: string;
}

export function DataTable<T extends { id: string }>({
  columns,
  data,
  isLoading,
  isError,
  errorMessage,
  emptyMessage = 'Aucune donnée',
  emptyIcon,
  emptyStateType = 'no-data',
  searchTerm,
  onClearSearch,
  onRetry,
  onRowClick,
  pagination,
  className,
}: DataTableProps<T>) {
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.limit) : 1;

  if (isLoading) {
    return <SkeletonTable rows={pagination?.limit ?? 5} columns={columns.length} />;
  }

  if (isError) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
        <ErrorEmptyState message={errorMessage} onRetry={onRetry} />
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className ?? ''}`}>
      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50/80 hover:bg-gray-50/80">
              {columns.map((column) => (
                <TableHead
                  key={column.key}
                  className={`text-xs font-semibold text-gray-600 uppercase tracking-wider ${column.className || ''}`}
                >
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-48 p-0">
                  {searchTerm ? (
                    <SearchEmptyState searchTerm={searchTerm} onClear={onClearSearch} />
                  ) : (
                    <EmptyState
                      type={emptyStateType}
                      title={emptyMessage}
                      size="sm"
                      icon={emptyIcon ? undefined : undefined}
                    />
                  )}
                </TableCell>
              </TableRow>
            ) : (
              data.map((item, index) => (
                <TableRow
                  key={item.id}
                  className={`
                    ${onRowClick ? 'cursor-pointer hover:bg-blue-50/50' : 'hover:bg-gray-50/50'}
                    ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}
                    transition-colors duration-150
                  `}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map((column) => (
                    <TableCell key={column.key} className={`py-4 ${column.className || ''}`}>
                      {column.render
                        ? column.render(item)
                        : (item as Record<string, unknown>)[column.key]?.toString() ?? '-'}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-gray-500 text-sm">
            Affichage de <span className="font-medium text-gray-700">{((pagination.page - 1) * pagination.limit) + 1}</span> à{' '}
            <span className="font-medium text-gray-700">{Math.min(pagination.page * pagination.limit, pagination.total)}</span> sur{' '}
            <span className="font-medium text-gray-700">{pagination.total}</span> résultats
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(1)}
              disabled={pagination.page <= 1}
              className="hidden sm:flex"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Précédent</span>
            </Button>

            <div className="flex items-center gap-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (pagination.page <= 3) {
                  pageNum = i + 1;
                } else if (pagination.page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = pagination.page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => pagination.onPageChange(pageNum)}
                    className={`
                      w-8 h-8 rounded-lg text-sm font-medium transition-all
                      ${pagination.page === pageNum
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-gray-600 hover:bg-gray-100'
                      }
                    `}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              className="gap-1"
            >
              <span className="hidden sm:inline">Suivant</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => pagination.onPageChange(totalPages)}
              disabled={pagination.page >= totalPages}
              className="hidden sm:flex"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
