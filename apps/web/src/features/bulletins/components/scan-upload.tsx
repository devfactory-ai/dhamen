import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useBulletinScanUpload, getBulletinScanUrl } from '@/hooks/use-bulletin-scan';
import { Upload, FileImage, FileText, Download, Loader2, X, Replace } from 'lucide-react';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

interface ScanUploadProps {
  bulletinId: string;
  existingScanUrl?: string | null;
  existingScanFilename?: string | null;
  onUploadComplete?: () => void;
}

export function ScanUpload({ bulletinId, existingScanUrl, existingScanFilename, onUploadComplete }: ScanUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useBulletinScanUpload();

  const validateAndUpload = useCallback((file: File) => {
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Format non supporte. Formats acceptes : JPEG, PNG, PDF');
      return;
    }

    if (file.size > MAX_SIZE) {
      setError('Le fichier ne doit pas depasser 10 Mo');
      return;
    }

    uploadMutation.mutate(
      { bulletinId, file },
      { onSuccess: () => onUploadComplete?.() }
    );
  }, [bulletinId, uploadMutation, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) validateAndUpload(file);
  }, [validateAndUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) validateAndUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [validateAndUpload]);

  const handleDownload = () => {
    window.open(getBulletinScanUrl(bulletinId), '_blank');
  };

  const isPdf = existingScanFilename?.toLowerCase().endsWith('.pdf');

  // Show existing scan
  if (existingScanUrl && !uploadMutation.isPending) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isPdf ? (
                <FileText className="h-8 w-8 text-red-500" />
              ) : (
                <FileImage className="h-8 w-8 text-blue-500" />
              )}
              <div>
                <p className="text-sm font-medium">{existingScanFilename || 'Scan'}</p>
                <p className="text-xs text-muted-foreground">Scan attache</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleDownload}>
                <Download className="mr-1 h-3 w-3" />
                Voir
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
              >
                <Replace className="mr-1 h-3 w-3" />
                Remplacer
              </Button>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.pdf"
            className="hidden"
            onChange={handleFileSelect}
          />
        </CardContent>
      </Card>
    );
  }

  // Upload zone
  return (
    <Card className="border-dashed">
      <CardContent className="pt-4">
        <div
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer ${
            dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm text-muted-foreground">Upload en cours...</p>
            </>
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm font-medium">Ajouter un scan</p>
              <p className="text-xs text-muted-foreground mt-1">
                Glissez un fichier ou cliquez pour selectionner (JPEG, PNG, PDF - max 10 Mo)
              </p>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf"
          className="hidden"
          onChange={handleFileSelect}
        />
        {error && (
          <p className="text-sm text-destructive mt-2">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}
