/**
 * FilePreview Component
 *
 * Reusable component to preview uploaded files (images, PDFs, CSVs)
 * Supports both File objects and URLs
 */
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Eye,
  Download,
  X,
  FileText,
  FileImage,
  FileSpreadsheet,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ExternalLink,
} from 'lucide-react';

interface FilePreviewProps {
  file?: File | null;
  url?: string;
  fileName?: string;
  onRemove?: () => void;
  showRemove?: boolean;
  compact?: boolean;
  className?: string;
}

interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file?: File | null;
  url?: string;
  fileName?: string;
}

// Get file type from file or URL
function getFileType(file?: File | null, url?: string, fileName?: string): 'image' | 'pdf' | 'csv' | 'unknown' {
  const name = file?.name || fileName || url || '';
  const type = file?.type || '';

  if (type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(name)) {
    return 'image';
  }
  if (type === 'application/pdf' || /\.pdf$/i.test(name)) {
    return 'pdf';
  }
  if (type === 'text/csv' || /\.csv$/i.test(name)) {
    return 'csv';
  }
  return 'unknown';
}

// Get icon for file type
function getFileIcon(fileType: string) {
  switch (fileType) {
    case 'image':
      return FileImage;
    case 'pdf':
      return FileText;
    case 'csv':
      return FileSpreadsheet;
    default:
      return FileText;
  }
}

// Preview Dialog Component
function PreviewDialog({ open, onOpenChange, file, url, fileName }: PreviewDialogProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [csvData, setCsvData] = useState<string[][] | null>(null);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);

  const fileType = getFileType(file, url, fileName);
  const displayName = file?.name || fileName || 'Document';

  useEffect(() => {
    if (!open) {
      setZoom(100);
      setRotation(0);
      return;
    }

    if (url) {
      setPreviewUrl(url);
      return;
    }

    if (file) {
      if (fileType === 'csv') {
        // Parse CSV file
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target?.result as string;
          const lines = text.split('\n').slice(0, 20); // First 20 lines
          const parsed = lines.map(line =>
            line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
          );
          setCsvData(parsed);
        };
        reader.readAsText(file);
      } else {
        // Create blob URL for images and PDFs
        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
      }
    }
  }, [file, url, open, fileType]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const handleDownload = () => {
    if (url) {
      window.open(url, '_blank');
    } else if (file) {
      const objectUrl = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(objectUrl);
    }
  };

  const handleOpenExternal = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center justify-between pr-8">
            <span className="truncate">{displayName}</span>
            <div className="flex items-center gap-2">
              {fileType === 'image' && (
                <>
                  <Button variant="ghost" size="icon" onClick={handleZoomOut} title="Zoom -">
                    <ZoomOut className="h-4 w-4" />
                  </Button>
                  <span className="text-sm text-muted-foreground w-12 text-center">{zoom}%</span>
                  <Button variant="ghost" size="icon" onClick={handleZoomIn} title="Zoom +">
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={handleRotate} title="Rotation">
                    <RotateCw className="h-4 w-4" />
                  </Button>
                </>
              )}
              <Button variant="ghost" size="icon" onClick={handleOpenExternal} title="Ouvrir">
                <ExternalLink className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={handleDownload} title="Télécharger">
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto min-h-0">
          {fileType === 'image' && previewUrl && (
            <div className="flex items-center justify-center p-4 bg-muted/30 rounded-lg min-h-[400px]">
              <img
                src={previewUrl}
                alt={displayName}
                className="max-w-full max-h-full object-contain transition-transform"
                style={{
                  transform: `scale(${zoom / 100}) rotate(${rotation}deg)`,
                }}
              />
            </div>
          )}

          {fileType === 'pdf' && previewUrl && (
            <div className="w-full h-[600px] bg-muted/30 rounded-lg overflow-hidden">
              <iframe
                src={`${previewUrl}#toolbar=0`}
                className="w-full h-full border-0"
                title={displayName}
              />
            </div>
          )}

          {fileType === 'csv' && csvData && (
            <div className="overflow-auto max-h-[500px] border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    {csvData[0]?.map((header, i) => (
                      <th key={i} className="px-3 py-2 text-left font-medium border-b">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvData.slice(1).map((row, rowIndex) => (
                    <tr key={rowIndex} className="border-b hover:bg-muted/50">
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="px-3 py-2 truncate max-w-[200px]">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {csvData.length >= 20 && (
                <p className="text-center text-sm text-muted-foreground py-2 bg-muted">
                  Affichage des 20 premières lignes...
                </p>
              )}
            </div>
          )}

          {fileType === 'unknown' && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileText className="h-16 w-16 mb-4" />
              <p>Apercu non disponible pour ce type de fichier</p>
              <Button variant="outline" className="mt-4" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Télécharger le fichier
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Main FilePreview Component
export function FilePreview({
  file,
  url,
  fileName,
  onRemove,
  showRemove = true,
  compact = false,
  className = '',
}: FilePreviewProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  const fileType = getFileType(file, url, fileName);
  const FileIcon = getFileIcon(fileType);
  const displayName = file?.name || fileName || 'Document';
  const fileSize = file?.size;

  // Generate thumbnail for images
  useEffect(() => {
    if (fileType === 'image') {
      if (url) {
        setThumbnailUrl(url);
      } else if (file) {
        const objectUrl = URL.createObjectURL(file);
        setThumbnailUrl(objectUrl);
        return () => URL.revokeObjectURL(objectUrl);
      }
    }
  }, [file, url, fileType]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
  };

  if (compact) {
    return (
      <>
        <div className={`flex items-center gap-2 p-2 border rounded-lg bg-muted/50 ${className}`}>
          {fileType === 'image' && thumbnailUrl ? (
            <img src={thumbnailUrl} alt="" className="h-8 w-8 object-cover rounded" />
          ) : (
            <FileIcon className="h-5 w-5 text-muted-foreground" />
          )}
          <span className="text-sm truncate flex-1">{displayName}</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowPreview(true)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
          {showRemove && onRemove && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <PreviewDialog
          open={showPreview}
          onOpenChange={setShowPreview}
          file={file}
          url={url}
          fileName={fileName}
        />
      </>
    );
  }

  return (
    <>
      <div className={`flex items-center justify-between p-3 border rounded-lg bg-muted/50 ${className}`}>
        <div className="flex items-center gap-3 min-w-0">
          {fileType === 'image' && thumbnailUrl ? (
            <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              <img src={thumbnailUrl} alt="" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className={`
              flex h-12 w-12 items-center justify-center rounded-lg flex-shrink-0
              ${fileType === 'pdf' ? 'bg-red-100' : fileType === 'csv' ? 'bg-green-100' : 'bg-gray-100'}
            `}>
              <FileIcon className={`h-6 w-6 ${
                fileType === 'pdf' ? 'text-red-600' : fileType === 'csv' ? 'text-green-600' : 'text-gray-600'
              }`} />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{displayName}</p>
            {fileSize && (
              <p className="text-xs text-muted-foreground">{formatFileSize(fileSize)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview(true)}
            className="gap-1"
          >
            <Eye className="h-4 w-4" />
            Voir
          </Button>
          {showRemove && onRemove && (
            <Button variant="ghost" size="icon" onClick={onRemove}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <PreviewDialog
        open={showPreview}
        onOpenChange={setShowPreview}
        file={file}
        url={url}
        fileName={fileName}
      />
    </>
  );
}

// Multi-file preview list
interface FilePreviewListProps {
  files: File[];
  onRemove?: (index: number) => void;
  compact?: boolean;
}

export function FilePreviewList({ files, onRemove, compact = false }: FilePreviewListProps) {
  return (
    <div className="space-y-2">
      {files.map((file, index) => (
        <FilePreview
          key={`${file.name}-${index}`}
          file={file}
          onRemove={onRemove ? () => onRemove(index) : undefined}
          showRemove={!!onRemove}
          compact={compact}
        />
      ))}
    </div>
  );
}

export default FilePreview;
