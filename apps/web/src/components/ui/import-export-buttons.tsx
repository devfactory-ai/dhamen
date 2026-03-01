/**
 * ImportExportButtons - Reusable component for import/export functionality
 */
import { Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ImportExportButtonsProps {
  onImport?: () => void;
  onExportCSV?: () => void;
  onExportExcel?: () => void;
  showImport?: boolean;
  showExport?: boolean;
  importLabel?: string;
  exportLabel?: string;
  isExporting?: boolean;
}

export function ImportExportButtons({
  onImport,
  onExportCSV,
  onExportExcel,
  showImport = true,
  showExport = true,
  importLabel = 'Import CSV',
  exportLabel = 'Exporter',
  isExporting = false,
}: ImportExportButtonsProps) {
  return (
    <div className="flex gap-2">
      {showImport && onImport && (
        <Button variant="outline" onClick={onImport}>
          <Upload className="mr-2 h-4 w-4" />
          {importLabel}
        </Button>
      )}
      {showExport && (onExportCSV || onExportExcel) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={isExporting}>
              <Download className="mr-2 h-4 w-4" />
              {isExporting ? 'Export...' : exportLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onExportCSV && (
              <DropdownMenuItem onClick={onExportCSV}>
                Exporter en CSV
              </DropdownMenuItem>
            )}
            {onExportExcel && (
              <DropdownMenuItem onClick={onExportExcel}>
                Exporter en Excel
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
