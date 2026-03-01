/**
 * SoinFlow Documents Management Page
 *
 * Upload, view, OCR process, and manage documents
 */
import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  Download,
  Eye,
  Trash2,
  FileText,
  Image,
  Loader2,
  Search,
  Filter,
  ScanLine,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useDemandeDocuments,
  useUploadDocument,
  useOcrDocument,
  useDeleteDocument,
  downloadDocument,
  getDocumentPreviewUrl,
  formatFileSize,
  isImageFile,
  isPdfFile,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_ICONS,
  type SanteDocument,
  type OcrResult,
} from '../hooks/useDocuments';
import { useToast } from '@/stores/toast';

const OCR_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: 'En attente', color: 'bg-gray-100 text-gray-800', icon: <Clock className="h-3 w-3" /> },
  processing: { label: 'Traitement...', color: 'bg-blue-100 text-blue-800', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  completed: { label: 'Terminé', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-3 w-3" /> },
  failed: { label: 'Échec', color: 'bg-red-100 text-red-800', icon: <XCircle className="h-3 w-3" /> },
};

export function SanteDocumentsPage() {
  const [selectedDemandeId, setSelectedDemandeId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedDocument, setSelectedDocument] = useState<SanteDocument | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showOcrDialog, setShowOcrDialog] = useState(false);

  const { toast } = useToast();
  const { data: documents, isLoading, refetch } = useDemandeDocuments(selectedDemandeId || null);
  const uploadMutation = useUploadDocument();
  const ocrMutation = useOcrDocument();
  const deleteMutation = useDeleteDocument();

  // Filter documents
  const filteredDocuments = documents?.filter((doc) => {
    if (typeFilter !== 'all' && doc.typeDocument !== typeFilter) return false;
    if (searchQuery && !doc.nomFichier.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }) || [];

  const handleUpload = async (file: File, typeDocument: string) => {
    if (!selectedDemandeId) {
      toast({ title: 'Erreur', description: 'Veuillez sélectionner une demande', variant: 'destructive' });
      return;
    }

    try {
      await uploadMutation.mutateAsync({ file, demandeId: selectedDemandeId, typeDocument });
      toast({ title: 'Document uploade', variant: 'success' });
      setShowUploadDialog(false);
      refetch();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Erreur d\'upload',
        variant: 'destructive',
      });
    }
  };

  const handleOcr = async (documentId: string) => {
    try {
      const result = await ocrMutation.mutateAsync(documentId);
      toast({ title: 'OCR termine', description: `Confiance: ${result?.confidence}%`, variant: 'success' });
      refetch();
    } catch (error) {
      toast({
        title: 'Erreur OCR',
        description: error instanceof Error ? error.message : 'Erreur inconnue',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm('Supprimer ce document ?')) return;

    try {
      await deleteMutation.mutateAsync(documentId);
      toast({ title: 'Document supprime', variant: 'success' });
      refetch();
    } catch (error) {
      toast({
        title: 'Erreur',
        description: error instanceof Error ? error.message : 'Erreur de suppression',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = async (doc: SanteDocument) => {
    try {
      await downloadDocument(doc.id, doc.nomFichier);
    } catch (error) {
      toast({
        title: 'Erreur',
        description: 'Erreur lors du telechargement',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestion Documents"
        description="Upload, OCR et gestion des documents de demandes"
      />

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="demande">Demande</Label>
              <Input
                id="demande"
                placeholder="Entrez l'ID de la demande..."
                value={selectedDemandeId}
                onChange={(e) => setSelectedDemandeId(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="search">Recherche</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search"
                  className="pl-10"
                  placeholder="Nom du fichier..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="w-48">
              <Label htmlFor="type">Type</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tous les types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les types</SelectItem>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={() => setShowUploadDialog(true)} disabled={!selectedDemandeId}>
                <Upload className="h-4 w-4 mr-2" />
                Uploader
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Documents Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !selectedDemandeId ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Entrez l'ID d'une demande pour voir ses documents
          </CardContent>
        </Card>
      ) : filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucun document trouvé
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredDocuments.map((doc) => (
            <DocumentCard
              key={doc.id}
              document={doc}
              onPreview={() => {
                setSelectedDocument(doc);
                setShowPreviewDialog(true);
              }}
              onDownload={() => handleDownload(doc)}
              onOcr={() => handleOcr(doc.id)}
              onDelete={() => handleDelete(doc.id)}
              onViewOcr={() => {
                setSelectedDocument(doc);
                setShowOcrDialog(true);
              }}
              isOcrLoading={ocrMutation.isPending && ocrMutation.variables === doc.id}
            />
          ))}
        </div>
      )}

      {/* Upload Dialog */}
      <UploadDialog
        open={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onUpload={handleUpload}
        isLoading={uploadMutation.isPending}
      />

      {/* Preview Dialog */}
      <PreviewDialog
        open={showPreviewDialog}
        onClose={() => setShowPreviewDialog(false)}
        document={selectedDocument}
      />

      {/* OCR Result Dialog */}
      <OcrResultDialog
        open={showOcrDialog}
        onClose={() => setShowOcrDialog(false)}
        document={selectedDocument}
      />
    </div>
  );
}

// Document Card Component
function DocumentCard({
  document,
  onPreview,
  onDownload,
  onOcr,
  onDelete,
  onViewOcr,
  isOcrLoading,
}: {
  document: SanteDocument;
  onPreview: () => void;
  onDownload: () => void;
  onOcr: () => void;
  onDelete: () => void;
  onViewOcr: () => void;
  isOcrLoading: boolean;
}) {
  const isImage = isImageFile(document.mimeType);
  const isPdf = isPdfFile(document.mimeType);
  const ocrStatus = document.ocrStatus;

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      {/* Preview Thumbnail */}
      <div className="aspect-[4/3] bg-muted flex items-center justify-center relative">
        {isImage ? (
          <img
            src={getDocumentPreviewUrl(document.id)}
            alt={document.nomFichier}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <div className={`flex flex-col items-center justify-center ${isImage ? 'hidden' : ''}`}>
          {isPdf ? (
            <FileText className="h-16 w-16 text-red-500" />
          ) : isImage ? (
            <Image className="h-16 w-16 text-blue-500" />
          ) : (
            <FileText className="h-16 w-16 text-gray-400" />
          )}
          <span className="text-xs text-muted-foreground mt-2">{document.mimeType}</span>
        </div>
        {/* Type Badge */}
        <Badge className="absolute top-2 left-2" variant="secondary">
          {DOCUMENT_TYPE_ICONS[document.typeDocument] || '📎'} {DOCUMENT_TYPE_LABELS[document.typeDocument] || document.typeDocument}
        </Badge>
      </div>

      <CardContent className="p-4">
        <h3 className="font-medium truncate" title={document.nomFichier}>
          {document.nomFichier}
        </h3>
        <p className="text-sm text-muted-foreground">
          {formatFileSize(document.tailleOctets)}
        </p>

        {/* OCR Status */}
        {ocrStatus && (
          <div className="mt-2">
            <Badge className={`${OCR_STATUS_CONFIG[ocrStatus]?.color} text-xs`}>
              {OCR_STATUS_CONFIG[ocrStatus]?.icon}
              <span className="ml-1">{OCR_STATUS_CONFIG[ocrStatus]?.label}</span>
            </Badge>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-1 mt-3">
          <Button variant="outline" size="sm" onClick={onPreview}>
            <Eye className="h-3 w-3" />
          </Button>
          <Button variant="outline" size="sm" onClick={onDownload}>
            <Download className="h-3 w-3" />
          </Button>
          {(isImage || isPdf) && ocrStatus !== 'completed' && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOcr}
              disabled={isOcrLoading || ocrStatus === 'processing'}
            >
              {isOcrLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ScanLine className="h-3 w-3" />
              )}
            </Button>
          )}
          {ocrStatus === 'completed' && (
            <Button variant="outline" size="sm" onClick={onViewOcr}>
              <CheckCircle className="h-3 w-3 text-green-600" />
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onDelete} className="text-red-600 hover:text-red-700">
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Upload Dialog Component
function UploadDialog({
  open,
  onClose,
  onUpload,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File, typeDocument: string) => void;
  isLoading: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [typeDocument, setTypeDocument] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleSubmit = () => {
    if (file && typeDocument) {
      onUpload(file, typeDocument);
      setFile(null);
      setTypeDocument('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Uploader un document</DialogTitle>
          <DialogDescription>
            Formats acceptes: JPEG, PNG, WebP, PDF (max 10MB)
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Type de document</Label>
            <Select value={typeDocument} onValueChange={setTypeDocument}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionnez le type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {DOCUMENT_TYPE_ICONS[value]} {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive ? 'border-primary bg-primary/5' : 'border-muted'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])}
            />
            {file ? (
              <div>
                <FileText className="h-12 w-12 mx-auto text-primary" />
                <p className="mt-2 font-medium">{file.name}</p>
                <p className="text-sm text-muted-foreground">{formatFileSize(file.size)}</p>
                <Button variant="link" size="sm" onClick={() => setFile(null)}>
                  Changer
                </Button>
              </div>
            ) : (
              <div>
                <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                <p className="mt-2">Glissez un fichier ici ou</p>
                <Button variant="link" onClick={() => inputRef.current?.click()}>
                  parcourir
                </Button>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!file || !typeDocument || isLoading}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Uploader
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Preview Dialog Component
function PreviewDialog({
  open,
  onClose,
  document,
}: {
  open: boolean;
  onClose: () => void;
  document: SanteDocument | null;
}) {
  if (!document) return null;

  const isImage = isImageFile(document.mimeType);
  const previewUrl = getDocumentPreviewUrl(document.id);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{document.nomFichier}</DialogTitle>
          <DialogDescription>
            {DOCUMENT_TYPE_LABELS[document.typeDocument]} - {formatFileSize(document.tailleOctets)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center bg-muted rounded-lg p-4 min-h-96">
          {isImage ? (
            <img src={previewUrl} alt={document.nomFichier} className="max-w-full max-h-[60vh] object-contain" />
          ) : (
            <iframe src={previewUrl} className="w-full h-[60vh]" title={document.nomFichier} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// OCR Result Dialog Component
function OcrResultDialog({
  open,
  onClose,
  document,
}: {
  open: boolean;
  onClose: () => void;
  document: SanteDocument | null;
}) {
  if (!document || !document.ocrResultJson) return null;

  let ocrResult: OcrResult | null = null;
  try {
    ocrResult = JSON.parse(document.ocrResultJson);
  } catch {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Résultats OCR</DialogTitle>
          <DialogDescription>
            Confiance: {ocrResult?.confidence}%
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-lg font-bold text-green-800">
              Montant Total: {((ocrResult?.montantTotal || 0) / 1000).toFixed(3)} TND
            </p>
          </div>

          {ocrResult?.lignes && ocrResult.lignes.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Lignes détectées:</h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left">Code</th>
                      <th className="px-3 py-2 text-left">Designation</th>
                      <th className="px-3 py-2 text-right">Qte</th>
                      <th className="px-3 py-2 text-right">P.U.</th>
                      <th className="px-3 py-2 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ocrResult.lignes.map((ligne, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{ligne.code}</td>
                        <td className="px-3 py-2">{ligne.designation}</td>
                        <td className="px-3 py-2 text-right">{ligne.quantité}</td>
                        <td className="px-3 py-2 text-right font-mono">{(ligne.prixUnitaire / 1000).toFixed(3)}</td>
                        <td className="px-3 py-2 text-right font-mono">{(ligne.montant / 1000).toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SanteDocumentsPage;
