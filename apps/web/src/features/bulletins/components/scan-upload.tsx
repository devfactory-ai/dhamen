import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, FileImage, FileText, Download, Loader2, Trash2, Plus } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

interface BulletinFile {
  id: string;
  file_index: number;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: string | null;
  legacy_scan_url?: boolean;
}

interface ScanUploadProps {
  bulletinId: string;
  onUploadComplete?: () => void;
  readOnly?: boolean;
}

export function ScanUpload({ bulletinId, onUploadComplete, readOnly }: ScanUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Fetch files list
  const { data: files, isLoading } = useQuery({
    queryKey: ['bulletin-files', bulletinId],
    queryFn: async () => {
      const res = await apiClient.get<BulletinFile[]>(`/bulletins-soins/agent/${bulletinId}/files`);
      if (!res.success) return [];
      return (res.data || []) as BulletinFile[];
    },
    enabled: !!bulletinId,
    staleTime: 30_000,
  });

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('scan', file);
      const res = await apiClient.upload(`/bulletins-soins/agent/${bulletinId}/upload-scan`, formData);
      if (!res.success) throw new Error(res.error?.message || 'Erreur upload');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bulletin-files', bulletinId] });
      queryClient.invalidateQueries({ queryKey: ['agent-bulletins'] });
      toast.success('Fichier ajouté');
      onUploadComplete?.();
    },
    onError: (err: Error) => toast.error(err.message || "Erreur lors de l'upload"),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const res = await apiClient.delete(`/bulletins-soins/agent/${bulletinId}/files/${fileId}`);
      if (!res.success) throw new Error(res.error?.message || 'Erreur suppression');
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bulletin-files', bulletinId] });
      queryClient.invalidateQueries({ queryKey: ['agent-bulletins'] });
      toast.success('Fichier supprimé');
      onUploadComplete?.();
    },
    onError: (err: Error) => toast.error(err.message || 'Erreur lors de la suppression'),
  });

  const validateAndUpload = useCallback((fileList: FileList | File[]) => {
    setError(null);
    const filesToUpload = Array.from(fileList);
    for (const file of filesToUpload) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setError('Format non supporté. Formats acceptés : JPEG, PNG, PDF');
        return;
      }
      if (file.size > MAX_SIZE) {
        setError('Le fichier ne doit pas dépasser 10 Mo');
        return;
      }
    }
    for (const file of filesToUpload) {
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) validateAndUpload(e.dataTransfer.files);
  }, [validateAndUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) validateAndUpload(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [validateAndUpload]);

  const handleDownload = async (fileId: string, _fileName: string | null) => {
    try {
      const response = await apiClient.get<Blob>(
        `/bulletins-soins/agent/${bulletinId}/files/${fileId}/download`,
        { responseType: 'blob' }
      );
      if (response.success && response.data) {
        const url = URL.createObjectURL(response.data);
        window.open(url, '_blank');
      }
    } catch {
      toast.error('Erreur lors du téléchargement');
    }
  };

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  const isPdf = (name: string | null) => name?.toLowerCase().endsWith('.pdf');
  const fileList = files || [];

  return (
    <Card className="border-dashed">
      <CardContent className="pt-4 space-y-3">
        {/* Files list */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement...
          </div>
        ) : fileList.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase">
              Fichiers attachés ({fileList.length})
            </p>
            {fileList.map((f) => (
              <div key={f.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                  {isPdf(f.file_name) ? (
                    <FileText className="h-5 w-5 text-red-500 shrink-0" />
                  ) : (
                    <FileImage className="h-5 w-5 text-blue-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.file_name || 'Scan'}</p>
                    {f.file_size && (
                      <p className="text-[11px] text-muted-foreground">{formatSize(f.file_size)}</p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => handleDownload(f.id, f.file_name)}
                    title="Voir / Télécharger"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {!readOnly && !f.legacy_scan_url && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => {
                        if (confirm(`Supprimer "${f.file_name}" ?`)) {
                          deleteMutation.mutate(f.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      title="Supprimer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Upload zone */}
        {!readOnly && (
          <>
            <div
              className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-4 transition-colors cursor-pointer ${
                dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-primary mb-1" />
                  <p className="text-xs text-muted-foreground">Upload en cours...</p>
                </>
              ) : (
                <>
                  {fileList.length > 0 ? (
                    <div className="flex items-center gap-1.5 text-sm text-blue-600 font-medium">
                      <Plus className="h-4 w-4" />
                      Ajouter un fichier
                    </div>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                      <p className="text-sm font-medium">Ajouter un scan</p>
                    </>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    JPEG, PNG, PDF — max 10 Mo
                  </p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.pdf"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </>
        )}

        {/* No files, read-only */}
        {readOnly && fileList.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground text-center py-2">Aucun fichier attaché</p>
        )}
      </CardContent>
    </Card>
  );
}
