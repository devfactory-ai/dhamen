import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FilePreviewList } from '@/components/ui/file-preview';
import { apiClient } from '@/lib/api-client';
import { useAgentContext } from '@/features/agent/stores/agent-context';
import { useSearchAdherents, type AdherentSearchResult } from '@/features/adherents/hooks/useAdherents';
import { toast } from 'sonner';
import { useBulletinValidation } from '@/hooks/use-bulletin-validation';
import { ScanUpload } from '@/features/bulletins/components/scan-upload';
import {
  FileText,
  Upload,
  Download,
  Clock,
  CheckCircle,
  Loader2,
  Eye,
  FileImage,
  Stethoscope,
  Pill,
  FlaskConical,
  Building2,
  Plus,
  Trash2,
  FileSpreadsheet,
  Send,
  Package,
  Calendar,
  User,
  Search,
  FolderPlus,
  Check,
  AlertTriangle,
  Ban,
  Info,
  CheckCircle2,
} from 'lucide-react';

// Types
interface BulletinSaisie {
  id: string;
  bulletin_number: string;
  bulletin_date: string;
  adherent_matricule: string;
  adherent_first_name: string;
  adherent_last_name: string;
  adherent_national_id: string;
  beneficiary_name: string | null;
  beneficiary_relationship: string | null;
  provider_name: string;
  provider_specialty: string;
  care_type: string;
  care_description: string;
  total_amount: number;
  reimbursed_amount: number | null;
  scan_url: string | null;
  batch_id: string | null;
  batch_name: string | null;
  created_at: string;
  status: 'draft' | 'in_batch' | 'exported' | 'soumis' | 'en_examen' | 'approuve' | 'rejete' | 'paye';
}

interface BulletinActeDetail {
  id: string;
  code: string;
  label: string;
  amount: number;
  taux_remboursement: number | null;
  montant_rembourse: number | null;
  remboursement_brut: number | null;
  plafond_depasse: number | null;
}

interface BulletinDetail extends BulletinSaisie {
  actes?: BulletinActeDetail[];
  plafond_global?: number | null;
  plafond_consomme?: number | null;
  plafond_consomme_avant?: number | null;
}

const bulletinStatusConfig: Record<string, { label: string; variant: 'secondary' | 'default' | 'outline' | 'destructive'; className?: string }> = {
  draft: { label: 'Brouillon', variant: 'secondary' },
  in_batch: { label: 'Dans un lot', variant: 'default' },
  exported: { label: 'Exporte', variant: 'outline' },
  approved: { label: 'Valide', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  soumis: { label: 'Soumis', variant: 'default' },
  en_examen: { label: 'En examen', variant: 'default', className: 'bg-yellow-500 hover:bg-yellow-600' },
  approuve: { label: 'Approuve', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  rejete: { label: 'Rejete', variant: 'destructive' },
  paye: { label: 'Paye', variant: 'default', className: 'bg-emerald-700 hover:bg-emerald-800' },
};

interface Batch {
  id: string;
  name: string;
  created_at: string;
  bulletins_count: number;
  total_amount: number;
  status: 'open' | 'closed' | 'exported';
  exported_at: string | null;
}

const careTypeConfig = {
  consultation: { label: 'Consultation', icon: Stethoscope },
  pharmacy: { label: 'Pharmacie', icon: Pill },
  lab: { label: 'Analyses', icon: FlaskConical },
  hospital: { label: 'Hospitalisation', icon: Building2 },
};

// Form schema
const acteFormSchema = z.object({
  code: z.string().optional(),
  label: z.string().min(1, 'Libelle requis'),
  amount: z.number().positive('Montant > 0'),
});

const bulletinFormSchema = z.object({
  bulletin_date: z.string().min(1, 'Date requise'),
  adherent_matricule: z.string().min(1, 'Matricule requis'),
  adherent_first_name: z.string().min(2, 'Prenom requis'),
  adherent_last_name: z.string().min(2, 'Nom requis'),
  adherent_national_id: z.string().min(8, 'CIN requis'),
  adherent_email: z.string().email('Email invalide').optional().or(z.literal('')),
  beneficiary_name: z.string().optional(),
  beneficiary_relationship: z.string().optional(),
  provider_name: z.string().min(2, 'Nom du praticien requis'),
  provider_specialty: z.string().optional(),
  care_type: z.enum(['consultation', 'pharmacy', 'lab', 'hospital']),
  care_description: z.string().optional(),
  actes: z.array(acteFormSchema).min(1, 'Au moins un acte requis'),
});

type BulletinFormData = z.infer<typeof bulletinFormSchema>;

interface ActeReferentiel {
  id: string;
  code: string;
  label: string;
  taux_remboursement: number;
  plafond_acte: number | null;
}

export function BulletinsSaisiePage() {
  const queryClient = useQueryClient();
  const { selectedCompany, selectedBatch } = useAgentContext();
  const [activeTab, setActiveTab] = useState('saisie');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBulletins, setSelectedBulletins] = useState<string[]>([]);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportBatch, setExportBatch] = useState<Batch | null>(null);
  const [newBatchName, setNewBatchName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [adherentSearch, setAdherentSearch] = useState('');
  const [showAdherentDropdown, setShowAdherentDropdown] = useState(false);
  const [selectedAdherentInfo, setSelectedAdherentInfo] = useState<AdherentSearchResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showValidateDialog, setShowValidateDialog] = useState(false);
  const [validateBulletinTarget, setValidateBulletinTarget] = useState<BulletinDetail | null>(null);
  const [validateNotes, setValidateNotes] = useState('');
  const validateMutation = useBulletinValidation();

  const { data: adherentResults } = useSearchAdherents(adherentSearch);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    control,
    formState: { errors },
  } = useForm<BulletinFormData>({
    resolver: zodResolver(bulletinFormSchema),
    defaultValues: {
      care_type: 'consultation',
      bulletin_date: new Date().toISOString().split('T')[0],
      actes: [{ code: '', label: '', amount: 0 }],
    },
  });

  const { fields: actesFields, append: appendActe, remove: removeActe } = useFieldArray({
    control,
    name: 'actes',
  });

  const selectedCareType = watch('care_type');
  const watchedActes = watch('actes');
  const actesTotal = (watchedActes || []).reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  // Fetch bulletins (drafts and in_batch) for current batch
  const { data: bulletinsData, isLoading: loadingBulletins } = useQuery({
    queryKey: ['agent-bulletins', selectedBatch?.id, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('status', 'draft,in_batch');
      if (selectedBatch) params.append('batchId', selectedBatch.id);
      if (searchQuery) params.append('search', searchQuery);

      const response = await apiClient.get<BulletinSaisie[]>(`/bulletins-soins/agent?${params}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data || [];
    },
  });

  // Fetch batches for the selected company
  const { data: batchesData, isLoading: loadingBatches } = useQuery({
    queryKey: ['agent-batches', selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany) return [];
      const response = await apiClient.get<Batch[]>(`/bulletins-soins/agent/batches?companyId=${selectedCompany.id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data || [];
    },
    enabled: !!selectedCompany,
  });

  // Fetch actes referentiel
  const { data: actesReferentiel } = useQuery({
    queryKey: ['actes-referentiel'],
    queryFn: async () => {
      const response = await apiClient.get<ActeReferentiel[]>('/bulletins-soins/agent/actes-referentiel');
      if (!response.success) throw new Error(response.error?.message);
      return response.data || [];
    },
  });

  // Submit bulletin mutation
  const submitMutation = useMutation({
    mutationFn: async (data: { formData: BulletinFormData; files: File[] }) => {
      const form = new FormData();

      Object.entries(data.formData).forEach(([key, value]) => {
        if (key === 'actes') return; // handled separately
        if (value !== undefined && value !== '') {
          form.append(key, String(value));
        }
      });

      // Send actes as JSON array
      form.append('actes', JSON.stringify(data.formData.actes));

      // Attach batch_id from agent context
      if (selectedBatch) {
        form.append('batch_id', selectedBatch.id);
      }

      data.files.forEach((file, index) => {
        form.append(`scan_${index}`, file);
      });

      const token = localStorage.getItem('accessToken');
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || '/api/v1'}/bulletins-soins/agent/create`,
        {
          method: 'POST',
          body: form,
          credentials: 'include',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Erreur lors de la saisie');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-bulletins'] });
      toast.success('Bulletin saisi avec succes!');
      reset();
      setSelectedFiles([]);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la saisie');
    },
  });

  // Create batch mutation
  const createBatchMutation = useMutation({
    mutationFn: async (data: { name: string; bulletinIds: string[] }) => {
      const response = await apiClient.post('/bulletins-soins/batches', data);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-bulletins'] });
      queryClient.invalidateQueries({ queryKey: ['agent-batches'] });
      toast.success('Lot cree avec succes!');
      setShowBatchDialog(false);
      setSelectedBulletins([]);
      setNewBatchName('');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la creation du lot');
    },
  });

  // Export batch mutation
  const exportBatchMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || '/api/v1'}/bulletins-soins/batches/${batchId}/export`,
        {
          method: 'GET',
          credentials: 'include',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error?.message || 'Erreur lors de l\'export');
      }

      // Get the CSV content
      const csvContent = await response.text();
      return { csvContent, batchName: exportBatch?.name || 'lot' };
    },
    onSuccess: ({ csvContent, batchName }) => {
      // Create and download the CSV file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `${batchName}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      queryClient.invalidateQueries({ queryKey: ['agent-batches'] });
      toast.success('Export CSV telecharge!');
      setShowExportDialog(false);
      setExportBatch(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de l\'export');
    },
  });

  // Delete bulletin mutation
  const deleteMutation = useMutation({
    mutationFn: async (bulletinId: string) => {
      const response = await apiClient.delete(`/bulletins-soins/agent/${bulletinId}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-bulletins'] });
      toast.success('Bulletin supprime');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la suppression');
    },
  });

  // View bulletin detail
  const [viewBulletin, setViewBulletin] = useState<BulletinDetail | null>(null);
  const [deleteBulletinId, setDeleteBulletinId] = useState<string | null>(null);

  const fetchBulletinDetail = async (id: string) => {
    const response = await apiClient.get<BulletinDetail>(`/bulletins-soins/agent/${id}`);
    if (response.success) {
      setViewBulletin(response.data);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const isValidType = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'].includes(file.type);
      const isValidSize = file.size <= 10 * 1024 * 1024;
      return isValidType && isValidSize;
    });

    if (validFiles.length !== files.length) {
      toast.error('Certains fichiers ont ete ignores (format ou taille invalide)');
    }

    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmitForm = async (data: BulletinFormData) => {
    if (selectedFiles.length === 0) {
      toast.error('Veuillez ajouter au moins un scan du bulletin');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitMutation.mutateAsync({ formData: data, files: selectedFiles });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleBulletin = (id: string) => {
    setSelectedBulletins(prev =>
      prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const draftBulletins = (bulletinsData || []).filter(b => b.status === 'draft');
    if (selectedBulletins.length === draftBulletins.length) {
      setSelectedBulletins([]);
    } else {
      setSelectedBulletins(draftBulletins.map(b => b.id));
    }
  };

  const handleCreateBatch = () => {
    if (!newBatchName.trim()) {
      toast.error('Veuillez entrer un nom pour le lot');
      return;
    }
    createBatchMutation.mutate({
      name: newBatchName.trim(),
      bulletinIds: selectedBulletins,
    });
  };

  const handleExportBatch = (batch: Batch) => {
    setExportBatch(batch);
    setShowExportDialog(true);
  };

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-TN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(amount) + ' DT';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('fr-TN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const bulletinColumns = [
    {
      key: 'select',
      header: '',
      render: (row: BulletinSaisie) => (
        row.status === 'draft' ? (
          <input
            type="checkbox"
            checked={selectedBulletins.includes(row.id)}
            onChange={() => handleToggleBulletin(row.id)}
            className="h-4 w-4 rounded border-gray-300"
          />
        ) : null
      ),
    },
    {
      key: 'bulletin',
      header: 'Bulletin',
      render: (row: BulletinSaisie) => (
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-gray-400" />
          <div>
            <p className="font-mono text-sm font-medium">{row.bulletin_number || 'Brouillon'}</p>
            <p className="text-xs text-muted-foreground">{formatDate(row.bulletin_date)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'adherent',
      header: 'Adherent',
      render: (row: BulletinSaisie) => (
        <div>
          <p className="font-medium">{row.adherent_first_name} {row.adherent_last_name}</p>
          <p className="text-xs text-muted-foreground font-mono">{row.adherent_matricule}</p>
        </div>
      ),
    },
    {
      key: 'care_type',
      header: 'Type',
      render: (row: BulletinSaisie) => {
        const config = careTypeConfig[row.care_type as keyof typeof careTypeConfig] || careTypeConfig.consultation;
        const Icon = config.icon;
        return (
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{config.label}</span>
          </div>
        );
      },
    },
    {
      key: 'amount',
      header: 'Montant',
      render: (row: BulletinSaisie) => (
        <p className="font-medium text-right">{formatAmount(row.total_amount)}</p>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row: BulletinSaisie) => (
        <Badge variant={row.status === 'draft' ? 'secondary' : row.status === 'in_batch' ? 'default' : 'outline'}>
          {row.status === 'draft' ? 'Brouillon' : row.status === 'in_batch' ? `Lot: ${row.batch_name}` : 'Exporte'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: BulletinSaisie) => (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => fetchBulletinDetail(row.id)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {['draft', 'in_batch'].includes(row.status) && (
            <Button
              size="sm"
              variant="default"
              className="bg-green-600 hover:bg-green-700"
              title="Valider le bulletin"
              onClick={async () => {
                const response = await apiClient.get<BulletinDetail>(`/bulletins-soins/agent/${row.id}`);
                if (response.success && response.data) {
                  setValidateBulletinTarget(response.data);
                  setShowValidateDialog(true);
                }
              }}
            >
              <CheckCircle2 className="h-4 w-4" />
            </Button>
          )}
          {row.status !== 'exported' && (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => setDeleteBulletinId(row.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const batchColumns = [
    {
      key: 'name',
      header: 'Nom du lot',
      render: (row: Batch) => (
        <div className="flex items-center gap-3">
          <Package className="h-5 w-5 text-blue-500" />
          <div>
            <p className="font-medium">{row.name}</p>
            <p className="text-xs text-muted-foreground">{formatDate(row.created_at)}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'count',
      header: 'Bulletins',
      render: (row: Batch) => (
        <p className="font-medium">{row.bulletins_count}</p>
      ),
    },
    {
      key: 'total',
      header: 'Montant total',
      render: (row: Batch) => (
        <p className="font-medium">{formatAmount(row.total_amount)}</p>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (row: Batch) => (
        <Badge variant={row.status === 'open' ? 'default' : row.status === 'exported' ? 'outline' : 'secondary'}>
          {row.status === 'open' ? 'Ouvert' : row.status === 'exported' ? 'Exporte' : 'Ferme'}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row: Batch) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleExportBatch(row)}
            className="gap-1"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      ),
    },
  ];

  const draftCount = (bulletinsData || []).filter(b => b.status === 'draft').length;
  const totalAmount = (bulletinsData || []).reduce((sum, b) => sum + b.total_amount, 0);

  return (
    <div className="space-y-6">
      {/* Agent context banner */}
      {selectedCompany && selectedBatch && (
        <div className="flex items-center justify-between rounded-lg border bg-blue-50 border-blue-200 px-4 py-3">
          <div className="flex items-center gap-4 text-sm">
            <span className="font-medium text-blue-900">
              Entreprise : <span className="text-blue-700">{selectedCompany.name}</span>
            </span>
            <span className="text-blue-300">|</span>
            <span className="font-medium text-blue-900">
              Lot : <span className="text-blue-700">{selectedBatch.name}</span>
            </span>
          </div>
          <a
            href="/select-context"
            className="text-sm font-medium text-blue-600 underline hover:text-blue-800"
          >
            Changer
          </a>
        </div>
      )}

      <PageHeader
        title="Saisie des Bulletins de Soins"
        description="Scannez et saisissez les bulletins recus, puis exportez par lot"
        action={
          <div className="flex gap-2">
            {selectedBulletins.length > 0 && (
              <Button onClick={() => setShowBatchDialog(true)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                Creer un lot ({selectedBulletins.length})
              </Button>
            )}
          </div>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{draftCount}</p>
                <p className="text-sm text-muted-foreground">Brouillons</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <Package className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{(batchesData || []).filter(b => b.status === 'open').length}</p>
                <p className="text-sm text-muted-foreground">Lots ouverts</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-100">
                <FileSpreadsheet className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{(batchesData || []).filter(b => b.status === 'exported').length}</p>
                <p className="text-sm text-muted-foreground">Lots exportes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <CardContent className="pt-6">
            <div>
              <p className="text-2xl font-bold text-blue-700">{formatAmount(totalAmount)}</p>
              <p className="text-sm text-blue-600">Montant total saisi</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="saisie">Nouveau bulletin</TabsTrigger>
          <TabsTrigger value="liste">Liste des bulletins ({(bulletinsData || []).length})</TabsTrigger>
          <TabsTrigger value="lots">Gestion des lots ({(batchesData || []).length})</TabsTrigger>
        </TabsList>

        {/* Tab: Saisie */}
        <TabsContent value="saisie">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Saisir un nouveau bulletin
                  </CardTitle>
                  <CardDescription>
                    Scannez le bulletin puis renseignez les informations
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-6">
                    {/* Scan upload */}
                    <div className="space-y-2">
                      <Label>Scan du bulletin *</Label>
                      {selectedFiles.length > 0 ? (
                        <div className="space-y-3">
                          <FilePreviewList
                            files={selectedFiles}
                            onRemove={handleRemoveFile}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Upload className="h-4 w-4 mr-2" />
                            Ajouter un autre fichier
                          </Button>
                        </div>
                      ) : (
                        <div
                          className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <FileImage className="h-10 w-10 text-muted-foreground/50 mb-2" />
                          <p className="font-medium text-sm">Scanner ou deposer le bulletin</p>
                          <p className="text-xs text-muted-foreground">PDF, JPG, PNG (max 10 Mo)</p>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        multiple
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </div>

                    {/* Date */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Date du bulletin *</Label>
                        <Input type="date" {...register('bulletin_date')} />
                        {errors.bulletin_date && (
                          <p className="text-sm text-destructive">{errors.bulletin_date.message}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Type de soin *</Label>
                        <Select
                          value={selectedCareType}
                          onValueChange={(v) => setValue('care_type', v as 'consultation' | 'pharmacy' | 'lab' | 'hospital')}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="consultation">Consultation</SelectItem>
                            <SelectItem value="pharmacy">Pharmacie</SelectItem>
                            <SelectItem value="lab">Analyses</SelectItem>
                            <SelectItem value="hospital">Hospitalisation</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Adherent info */}
                    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                      <h4 className="font-medium flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Informations Adherent
                      </h4>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2 relative">
                          <Label>Matricule *</Label>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <Input
                              {...register('adherent_matricule')}
                              placeholder="Rechercher par nom ou matricule..."
                              className="pl-9"
                              onChange={(e) => {
                                register('adherent_matricule').onChange(e);
                                setAdherentSearch(e.target.value);
                                setShowAdherentDropdown(true);
                                if (!e.target.value) setSelectedAdherentInfo(null);
                              }}
                              onFocus={() => adherentSearch.length >= 2 && setShowAdherentDropdown(true)}
                              onBlur={() => setTimeout(() => setShowAdherentDropdown(false), 200)}
                            />
                          </div>
                          {showAdherentDropdown && adherentResults && adherentResults.length > 0 && (
                            <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {adherentResults.map((a) => (
                                <button
                                  key={a.id}
                                  type="button"
                                  className="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm border-b last:border-0"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setValue('adherent_matricule', a.matricule || '');
                                    setValue('adherent_last_name', a.lastName || '');
                                    setValue('adherent_first_name', a.firstName || '');
                                    setValue('adherent_email', a.email || '');
                                    setAdherentSearch('');
                                    setShowAdherentDropdown(false);
                                    setSelectedAdherentInfo(a);
                                  }}
                                >
                                  <span className="font-medium">{a.firstName} {a.lastName}</span>
                                  <span className="text-gray-400 ml-2 font-mono text-xs">{a.matricule}</span>
                                  {a.companyName && <span className="text-gray-400 ml-2 text-xs">— {a.companyName}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                          {selectedAdherentInfo && (
                            <div className="text-xs text-green-600 flex items-center gap-1 mt-1">
                              <Check className="w-3 h-3" />
                              {selectedAdherentInfo.firstName} {selectedAdherentInfo.lastName}
                              {selectedAdherentInfo.plafondGlobal != null && (
                                <span className="text-gray-400 ml-1">
                                  — Plafond restant : {new Intl.NumberFormat('fr-TN', { maximumFractionDigits: 0 }).format(
                                    ((selectedAdherentInfo.plafondGlobal || 0) - (selectedAdherentInfo.plafondConsomme || 0)) / 1000
                                  )} DT
                                </span>
                              )}
                            </div>
                          )}
                          {errors.adherent_matricule && (
                            <p className="text-sm text-destructive">{errors.adherent_matricule.message}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>CIN *</Label>
                          <Input {...register('adherent_national_id')} placeholder="12345678" />
                          {errors.adherent_national_id && (
                            <p className="text-sm text-destructive">{errors.adherent_national_id.message}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Nom *</Label>
                          <Input {...register('adherent_last_name')} />
                          {errors.adherent_last_name && (
                            <p className="text-sm text-destructive">{errors.adherent_last_name.message}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Prenom *</Label>
                          <Input {...register('adherent_first_name')} />
                          {errors.adherent_first_name && (
                            <p className="text-sm text-destructive">{errors.adherent_first_name.message}</p>
                          )}
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Email adherent</Label>
                          <Input {...register('adherent_email')} type="email" placeholder="adherent@email.tn" />
                          {errors.adherent_email && (
                            <p className="text-sm text-destructive">{errors.adherent_email.message}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Nom du beneficiaire (si different)</Label>
                          <Input {...register('beneficiary_name')} />
                        </div>
                        <div className="space-y-2">
                          <Label>Lien de parente</Label>
                          <Select onValueChange={(v) => setValue('beneficiary_relationship', v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Choisir..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="spouse">Conjoint(e)</SelectItem>
                              <SelectItem value="child">Enfant</SelectItem>
                              <SelectItem value="parent">Parent</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Provider info */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Nom du praticien *</Label>
                        <Input {...register('provider_name')} placeholder="Dr. Mohamed Ali" />
                        {errors.provider_name && (
                          <p className="text-sm text-destructive">{errors.provider_name.message}</p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <Label>Specialite</Label>
                        <Input {...register('provider_specialty')} placeholder="Generaliste, Cardiologue..." />
                      </div>
                    </div>

                    {/* Actes medicaux */}
                    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium flex items-center gap-2">
                          <FileText className="h-4 w-4" />
                          Actes medicaux *
                        </h4>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => appendActe({ code: '', label: '', amount: 0 })}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Ajouter un acte
                        </Button>
                      </div>

                      {errors.actes?.root && (
                        <p className="text-sm text-destructive">{errors.actes.root.message}</p>
                      )}

                      {actesFields.map((field, index) => (
                        <div key={field.id} className="flex items-start gap-2">
                          <div className="flex-1">
                            <Select
                              value={watch(`actes.${index}.code`) || ''}
                              onValueChange={(value) => {
                                const ref = actesReferentiel?.find((a) => a.code === value);
                                if (ref) {
                                  setValue(`actes.${index}.code`, ref.code);
                                  setValue(`actes.${index}.label`, ref.label);
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selectionner un acte" />
                              </SelectTrigger>
                              <SelectContent>
                                {actesReferentiel?.map((acte) => (
                                  <SelectItem key={acte.code} value={acte.code}>
                                    <span className="font-mono text-xs mr-2">{acte.code}</span>
                                    {acte.label}
                                    <span className="text-muted-foreground ml-2">({Math.round(acte.taux_remboursement * 100)}%)</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {errors.actes?.[index]?.label && (
                              <p className="text-xs text-destructive mt-1">{errors.actes[index].label?.message}</p>
                            )}
                          </div>
                          <div className="w-32">
                            <Input
                              type="number"
                              step="0.001"
                              {...register(`actes.${index}.amount`, { valueAsNumber: true })}
                              placeholder="Montant"
                            />
                            {errors.actes?.[index]?.amount && (
                              <p className="text-xs text-destructive mt-1">{errors.actes[index].amount?.message}</p>
                            )}
                          </div>
                          {actesFields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeActe(index)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}

                      <div className="flex justify-end border-t pt-3">
                        <p className="text-lg font-bold">
                          Total : {formatAmount(actesTotal)}
                        </p>
                      </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                      <Label>Description des soins</Label>
                      <Textarea
                        {...register('care_description')}
                        placeholder="Ex: Consultation + analyses sanguines"
                        rows={2}
                      />
                    </div>

                    <Button type="submit" className="w-full" disabled={isSubmitting || selectedFiles.length === 0}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Enregistrement...
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Enregistrer le bulletin
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Info panel */}
            <div className="space-y-4">
              <Card className="bg-blue-50 border-blue-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-blue-900">Workflow</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-blue-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-200 text-blue-800 text-xs font-bold">1</div>
                    <span>Scanner le bulletin papier</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-200 text-blue-800 text-xs font-bold">2</div>
                    <span>Saisir les informations</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-200 text-blue-800 text-xs font-bold">3</div>
                    <span>Regrouper en lot</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-200 text-blue-800 text-xs font-bold">4</div>
                    <span>Exporter en CSV</span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Raccourcis clavier</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-1">
                  <p><kbd className="px-1 bg-gray-100 rounded">Tab</kbd> Champ suivant</p>
                  <p><kbd className="px-1 bg-gray-100 rounded">Ctrl+S</kbd> Enregistrer</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Tab: Liste */}
        <TabsContent value="liste" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher par nom, matricule..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
                {selectedBulletins.length > 0 && (
                  <Button onClick={() => setShowBatchDialog(true)}>
                    <FolderPlus className="mr-2 h-4 w-4" />
                    Creer un lot ({selectedBulletins.length})
                  </Button>
                )}
              </div>
              <DataTable
                columns={bulletinColumns}
                data={bulletinsData || []}
                isLoading={loadingBulletins}
                emptyMessage="Aucun bulletin saisi"
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Lots */}
        <TabsContent value="lots" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <DataTable
                columns={batchColumns}
                data={batchesData || []}
                isLoading={loadingBatches}
                emptyMessage="Aucun lot cree"
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Batch Dialog */}
      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Creer un nouveau lot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom du lot</Label>
              <Input
                value={newBatchName}
                onChange={(e) => setNewBatchName(e.target.value)}
                placeholder={`Lot_${new Date().toISOString().split('T')[0]}`}
              />
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-sm font-medium">{selectedBulletins.length} bulletins selectionnes</p>
              <p className="text-sm text-muted-foreground">
                Montant total: {formatAmount(
                  (bulletinsData || [])
                    .filter(b => selectedBulletins.includes(b.id))
                    .reduce((sum, b) => sum + b.total_amount, 0)
                )}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchDialog(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreateBatch} disabled={createBatchMutation.isPending}>
              {createBatchMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creation...
                </>
              ) : (
                <>
                  <FolderPlus className="mr-2 h-4 w-4" />
                  Creer le lot
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <AlertDialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exporter le lot en CSV</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous exporter le lot "{exportBatch?.name}" ?
              <br />
              <span className="font-medium">{exportBatch?.bulletins_count} bulletins</span> pour un total de <span className="font-medium">{formatAmount(exportBatch?.total_amount || 0)}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => exportBatch && exportBatchMutation.mutate(exportBatch.id)}
              disabled={exportBatchMutation.isPending}
            >
              {exportBatchMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Export...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Telecharger CSV
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulletin Detail Dialog */}
      <Dialog open={!!viewBulletin} onOpenChange={() => setViewBulletin(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Bulletin {viewBulletin?.bulletin_number}
            </DialogTitle>
          </DialogHeader>
          {viewBulletin && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">{formatDate(viewBulletin.bulletin_date)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">{careTypeConfig[viewBulletin.care_type as keyof typeof careTypeConfig]?.label || viewBulletin.care_type}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Adherent</p>
                  <p className="font-medium">{viewBulletin.adherent_first_name} {viewBulletin.adherent_last_name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{viewBulletin.adherent_matricule}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Praticien</p>
                  <p className="font-medium">{viewBulletin.provider_name}</p>
                </div>
              </div>

              {/* Actes medicaux */}
              {viewBulletin.actes && viewBulletin.actes.length > 0 && (
                <div className="space-y-2">
                  <p className="font-medium text-sm">Actes medicaux</p>
                  <div className="rounded-md border divide-y">
                    {viewBulletin.actes.map((acte) => {
                      const isLimited = acte.plafond_depasse === 1 && (acte.montant_rembourse || 0) > 0;
                      const isExhausted = acte.plafond_depasse === 1 && (acte.montant_rembourse || 0) === 0 && (acte.remboursement_brut || 0) > 0;
                      const isUnreferenced = acte.taux_remboursement === 0 || acte.taux_remboursement == null;
                      return (
                        <div key={acte.id} className="p-3 space-y-1.5">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-sm">{acte.label}</p>
                              <p className="text-xs text-muted-foreground font-mono">{acte.code || 'Sans code'}</p>
                            </div>
                            {isExhausted && <Badge variant="destructive" className="text-xs shrink-0">Plafond epuise</Badge>}
                            {isLimited && <Badge className="text-xs bg-orange-500 hover:bg-orange-600 shrink-0">Limite par plafond</Badge>}
                            {isUnreferenced && <Badge variant="secondary" className="text-xs shrink-0">Non reference</Badge>}
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-xs">
                            <div>
                              <p className="text-muted-foreground">Montant</p>
                              <p className="font-medium">{formatAmount(acte.amount)}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Taux</p>
                              <p className="font-medium">{acte.taux_remboursement != null ? `${Math.round(acte.taux_remboursement * 100)}%` : '-'}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Remb. brut</p>
                              <p className="font-medium">{acte.remboursement_brut != null ? formatAmount(acte.remboursement_brut) : '-'}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Rembourse</p>
                              <p className={`font-bold ${isExhausted ? 'text-destructive' : isLimited ? 'text-orange-500' : 'text-green-600'}`}>
                                {acte.montant_rembourse != null ? formatAmount(acte.montant_rembourse) : '-'}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TASK-012: alertes cas limites */}
              {(() => {
                const actes = viewBulletin.actes || [];
                const exhaustedCount = actes.filter((a) => a.plafond_depasse === 1 && (a.montant_rembourse || 0) === 0 && (a.remboursement_brut || 0) > 0).length;
                const limitedCount = actes.filter((a) => a.plafond_depasse === 1 && (a.montant_rembourse || 0) > 0).length;
                const unreferencedCount = actes.filter((a) => a.taux_remboursement === 0 || a.taux_remboursement == null).length;
                const plafondAvant = viewBulletin.plafond_consomme_avant ?? 0;
                const plafondGlobal = viewBulletin.plafond_global ?? 0;
                const plafondEpuiseAvant = plafondGlobal > 0 && plafondAvant >= plafondGlobal;

                return (
                  <div className="space-y-2">
                    {plafondEpuiseAvant && (
                      <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
                        <Ban className="h-4 w-4 shrink-0" />
                        <span>Plafond annuel epuise — aucun remboursement possible</span>
                      </div>
                    )}
                    {limitedCount > 0 && !plafondEpuiseAvant && (
                      <div className="flex items-center gap-2 rounded-md border border-orange-300 bg-orange-50 p-2 text-sm text-orange-700">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>Remboursement limite par le plafond sur {limitedCount} acte{limitedCount > 1 ? 's' : ''}</span>
                      </div>
                    )}
                    {exhaustedCount > 0 && !plafondEpuiseAvant && (
                      <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>{exhaustedCount} acte{exhaustedCount > 1 ? 's' : ''} non rembourse{exhaustedCount > 1 ? 's' : ''} — plafond atteint</span>
                      </div>
                    )}
                    {unreferencedCount > 0 && (
                      <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2 text-sm text-muted-foreground">
                        <Info className="h-4 w-4 shrink-0" />
                        <span>{unreferencedCount} acte{unreferencedCount > 1 ? 's' : ''} non reference{unreferencedCount > 1 ? 's' : ''} — taux 0%</span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* TASK-013: totaux detailles */}
              {viewBulletin.actes && viewBulletin.actes.length > 0 && (
                <div className="rounded-md border bg-muted/20 p-3 space-y-1 text-sm">
                  {(() => {
                    const totalDeclare = viewBulletin.total_amount || 0;
                    const totalBrut = (viewBulletin.actes || []).reduce((s, a) => s + (a.remboursement_brut || 0), 0);
                    const totalFinal = viewBulletin.reimbursed_amount || 0;
                    const reduction = totalBrut - totalFinal;
                    return (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Montant declare total</span>
                          <span className="font-medium">{formatAmount(totalDeclare)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Remboursement brut total</span>
                          <span className="font-medium">{formatAmount(totalBrut)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-1">
                          <span className="font-medium">Remboursement final total</span>
                          <span className="font-bold text-green-600">{formatAmount(totalFinal)}</span>
                        </div>
                        {reduction > 0 && (
                          <div className="flex justify-between text-destructive">
                            <span className="text-xs">Reduction plafond</span>
                            <span className="text-xs font-medium">-{formatAmount(reduction)}</span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Plafond avec impact bulletin */}
              {viewBulletin.plafond_global != null && viewBulletin.plafond_global > 0 && (
                <div className="rounded-md border bg-muted/10 p-3 space-y-2.5">
                  <div className="flex justify-between items-center">
                    <p className="font-medium text-sm">Plafond annuel adherent</p>
                    {viewBulletin.plafond_consomme != null && viewBulletin.plafond_consomme >= viewBulletin.plafond_global && (
                      <Badge variant="destructive" className="text-xs">Plafond atteint</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Plafond global</span>
                      <span className="font-medium">{formatAmount(viewBulletin.plafond_global)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Avant ce bulletin</span>
                      <span className="font-medium">{formatAmount(viewBulletin.plafond_consomme_avant ?? 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Ce bulletin</span>
                      <span className="font-medium text-blue-600">+{formatAmount(viewBulletin.reimbursed_amount || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Restant</span>
                      <span className="font-bold text-green-600">{formatAmount(viewBulletin.plafond_global - (viewBulletin.plafond_consomme || 0))}</span>
                    </div>
                  </div>
                  {/* Segmented progress bar */}
                  <div className="w-full bg-muted rounded-full h-2 flex overflow-hidden">
                    <div
                      className="h-2 bg-gray-400"
                      style={{ width: `${Math.min(100, ((viewBulletin.plafond_consomme_avant ?? 0) / viewBulletin.plafond_global) * 100)}%` }}
                    />
                    <div
                      className={`h-2 ${(viewBulletin.plafond_consomme || 0) >= viewBulletin.plafond_global ? 'bg-orange-500' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(100 - ((viewBulletin.plafond_consomme_avant ?? 0) / viewBulletin.plafond_global) * 100, ((viewBulletin.reimbursed_amount || 0) / viewBulletin.plafond_global) * 100)}%` }}
                    />
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" /> Avant</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Ce bulletin</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted inline-block border" /> Restant</span>
                  </div>
                </div>
              )}

              {/* Scan upload */}
              <ScanUpload
                bulletinId={viewBulletin.id}
                existingScanUrl={viewBulletin.scan_url}
                existingScanFilename={viewBulletin.scan_url ? viewBulletin.scan_url.split('/').pop() : null}
                onUploadComplete={() => fetchBulletinDetail(viewBulletin.id)}
              />

              {/* Status badge + actions */}
              <div className="flex justify-between items-center pt-2 border-t">
                {(() => {
                  const cfg = bulletinStatusConfig[viewBulletin.status] || { label: viewBulletin.status, variant: 'outline' as const };
                  return <Badge variant={cfg.variant} className={cfg.className}>{cfg.label}</Badge>;
                })()}
                {['draft', 'in_batch'].includes(viewBulletin.status) && (
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      setValidateBulletinTarget(viewBulletin);
                      setShowValidateDialog(true);
                    }}
                  >
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Valider le bulletin
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Validate confirmation dialog */}
      <AlertDialog open={showValidateDialog} onOpenChange={(open) => {
        if (!open) {
          setShowValidateDialog(false);
          setValidateBulletinTarget(null);
          setValidateNotes('');
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Valider le bulletin</AlertDialogTitle>
            <AlertDialogDescription>
              Confirmez la validation du bulletin {validateBulletinTarget?.bulletin_number}. Le remboursement sera enregistre definitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {validateBulletinTarget && (
            <div className="py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Adherent</p>
                  <p className="font-medium">{validateBulletinTarget.adherent_first_name} {validateBulletinTarget.adherent_last_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Montant declare</p>
                  <p className="font-medium">{validateBulletinTarget.total_amount?.toFixed(3)} TND</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Actes</p>
                  <p className="font-medium">{validateBulletinTarget.actes?.length || 0} acte(s)</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Montant rembourse</p>
                  <p className="font-medium text-green-600">{(validateBulletinTarget.reimbursed_amount || 0).toFixed(3)} TND</p>
                </div>
              </div>
              <div>
                <Label className="text-sm">Notes (optionnel)</Label>
                <Textarea
                  value={validateNotes}
                  onChange={(e) => setValidateNotes(e.target.value)}
                  placeholder="Notes de validation..."
                  className="mt-1"
                  rows={2}
                />
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <Button
              onClick={(e) => {
                e.preventDefault();
                if (!validateBulletinTarget) return;
                validateMutation.mutate({
                  id: validateBulletinTarget.id,
                  reimbursed_amount: validateBulletinTarget.reimbursed_amount || validateBulletinTarget.total_amount || 0,
                  notes: validateNotes || undefined,
                }, {
                  onSuccess: () => {
                    setShowValidateDialog(false);
                    setValidateBulletinTarget(null);
                    setValidateNotes('');
                    setViewBulletin(null);
                  },
                });
              }}
              disabled={validateMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {validateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Validation...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Valider
                </>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation popup */}
      <AlertDialog open={!!deleteBulletinId} onOpenChange={(open) => !open && setDeleteBulletinId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce bulletin ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le bulletin sera définitivement supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteBulletinId) {
                  deleteMutation.mutate(deleteBulletinId);
                  setDeleteBulletinId(null);
                }
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default BulletinsSaisiePage;
