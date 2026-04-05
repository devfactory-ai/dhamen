import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
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
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FilePreviewList } from '@/components/ui/file-preview';
import { apiClient, API_BASE_URL } from '@/lib/api-client';
import { toast } from 'sonner';
import {
  FileText,
  Upload,
  Download,
  Printer,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Eye,
  FileImage,
  Stethoscope,
  Pill,
  FlaskConical,
  Building2,
  AlertCircle,
  Package,
  Timer,
  CheckCircle2,
  Circle,
  Info,
  Calendar,
  X,
  Send,
  FileDown,
  ChevronRight,
  User,
} from 'lucide-react';

// Types for bulletin workflow
type BulletinStatus =
  | 'scan_uploaded'      // Scan soumis, en attente du papier
  | 'paper_received'     // Papier reçu, en verification
  | 'paper_incomplete'   // Papier reçu mais scan incomplet - 15j
  | 'paper_complete'     // Papier reçu et complet - 2j
  | 'processing'         // En traitement
  | 'approved'           // Approuvé, en attente de paiement
  | 'pending_payment'    // Paiement en cours
  | 'reimbursed'         // Rembourse
  | 'rejected';          // Rejete

interface BulletinSoins {
  id: string;
  bulletin_number: string;
  bulletin_date: string;
  provider_name: string;
  provider_specialty: string;
  care_type: string;
  care_description: string;
  total_amount: number;
  reimbursed_amount: number;
  status: BulletinStatus;
  submission_date: string;
  paper_received_date: string | null;
  processing_date: string | null;
  reimbursement_date: string | null;
  estimated_reimbursement_date: string | null;
  rejection_reason: string | null;
  scan_url: string;
  // Payment workflow fields
  approved_date: string | null;
  approved_by: string | null;
  approved_amount: number | null;
  payment_reference: string | null;
  payment_method: string | null;
  payment_date: string | null;
  payment_notes: string | null;
  beneficiary_first_name: string;
  beneficiary_last_name: string;
  beneficiary_relationship: string;
  missing_documents: string[] | null;
}

interface BulletinStats {
  total: number;
  scan_uploaded: number;
  paper_received: number;
  processing: number;
  approved: number;
  pending_payment: number;
  reimbursed: number;
  rejected: number;
  total_amount: number;
  total_reimbursed: number;
  awaiting_payment_amount: number;
}

const statusConfig: Record<BulletinStatus, {
  label: string;
  icon: typeof Clock;
  variant: 'default' | 'secondary' | 'success' | 'destructive' | 'warning' | 'outline';
  color: string;
  description: string;
  step: number;
}> = {
  scan_uploaded: {
    label: 'Scan soumis',
    icon: Upload,
    variant: 'secondary',
    color: 'text-yellow-600',
    description: 'En attente de reception du bulletin papier',
    step: 1
  },
  paper_received: {
    label: 'Papier reçu',
    icon: Package,
    variant: 'default',
    color: 'text-blue-600',
    description: 'Bulletin papier reçu, en verification',
    step: 2
  },
  paper_incomplete: {
    label: 'Dossier incomplet',
    icon: AlertCircle,
    variant: 'warning',
    color: 'text-orange-600',
    description: 'Documents manquants - délai 15 jours',
    step: 2
  },
  paper_complete: {
    label: 'Dossier complet',
    icon: CheckCircle,
    variant: 'success',
    color: 'text-green-600',
    description: 'Dossier complet - délai 2 jours',
    step: 3
  },
  processing: {
    label: 'En traitement',
    icon: Loader2,
    variant: 'default',
    color: 'text-blue-600',
    description: 'Remboursement en cours de traitement',
    step: 4
  },
  approved: {
    label: 'Approuvé',
    icon: CheckCircle,
    variant: 'success',
    color: 'text-emerald-600',
    description: 'Dossier validé - en attente de paiement',
    step: 5
  },
  pending_payment: {
    label: 'Paiement en cours',
    icon: Clock,
    variant: 'warning',
    color: 'text-amber-600',
    description: 'Paiement en cours de traitement',
    step: 6
  },
  reimbursed: {
    label: 'Remboursé',
    icon: CheckCircle2,
    variant: 'success',
    color: 'text-green-600',
    description: 'Remboursement effectué',
    step: 7
  },
  rejected: {
    label: 'Rejeté',
    icon: XCircle,
    variant: 'destructive',
    color: 'text-red-600',
    description: 'Demande rejetée',
    step: 0
  },
};

const careTypeConfig = {
  consultation: { label: 'Consultation', icon: Stethoscope },
  pharmacy: { label: 'Pharmacie', icon: Pill },
  lab: { label: 'Analyses', icon: FlaskConical },
  hospital: { label: 'Hospitalisation', icon: Building2 },
};

// Blank bulletin templates for download
const BULLETIN_TEMPLATES = [
  {
    id: 'consultation',
    title: 'Bulletin Consultation',
    description: 'Pour les consultations médicales',
    icon: Stethoscope,
    filename: 'bulletin_consultation.pdf',
  },
  {
    id: 'pharmacy',
    title: 'Bulletin Pharmacie',
    description: 'Pour les achats en pharmacie',
    icon: Pill,
    filename: 'bulletin_pharmacie.pdf',
  },
  {
    id: 'lab',
    title: 'Bulletin Analyses',
    description: 'Pour les analyses de laboratoire',
    icon: FlaskConical,
    filename: 'bulletin_analyses.pdf',
  },
  {
    id: 'hospital',
    title: 'Bulletin Hospitalisation',
    description: 'Pour les séjours hospitaliers',
    icon: Building2,
    filename: 'bulletin_hospitalisation.pdf',
  },
  {
    id: 'universal',
    title: 'Bulletin Universel',
    description: 'Formulaire multi-usage',
    icon: FileText,
    filename: 'bulletin_universel.pdf',
  },
];

interface AdherentProfile {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  matricule: string;
  address?: string;
  phone?: string;
}

// Form schema for bulletin submission
const bulletinFormSchema = z.object({
  care_type: z.enum(['consultation', 'pharmacy', 'lab', 'hospital']),
  bulletin_date: z.string().min(1, 'Date requise'),
  provider_name: z.string().min(2, 'Nom du praticien requis'),
  provider_specialty: z.string().optional(),
  total_amount: z.number().min(0.01, 'Montant requis'),
  care_description: z.string().optional(),
  beneficiary_type: z.enum(['self', 'beneficiary']),
  beneficiary_first_name: z.string().optional(),
  beneficiary_last_name: z.string().optional(),
  beneficiary_relationship: z.string().optional(),
});

type BulletinFormData = z.infer<typeof bulletinFormSchema>;

// Progress Timeline Component
function BulletinProgressTimeline({ bulletin }: { bulletin: BulletinSoins }) {
  const steps = [
    { id: 1, label: 'Scan soumis', date: bulletin.submission_date },
    { id: 2, label: 'Papier reçu', date: bulletin.paper_received_date },
    { id: 3, label: 'Dossier vérifié', date: bulletin.status === 'paper_complete' || bulletin.status === 'paper_incomplete' ? bulletin.paper_received_date : null },
    { id: 4, label: 'En traitement', date: bulletin.processing_date },
    { id: 5, label: 'Approuvé', date: bulletin.approved_date },
    { id: 6, label: 'Paiement', date: bulletin.status === 'pending_payment' ? bulletin.approved_date : null },
    { id: 7, label: 'Remboursé', date: bulletin.reimbursement_date || bulletin.payment_date },
  ];

  const currentStep = statusConfig[bulletin.status]?.step || 0;
  const isRejected = bulletin.status === 'rejected';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-6">
        {steps.map((step, index) => (
          <div key={step.id} className="flex flex-col items-center flex-1">
            <div className="flex items-center w-full">
              <div className={`
                flex items-center justify-center w-8 h-8 rounded-full border-2
                ${isRejected && currentStep === 0 ? 'border-red-500 bg-red-50' :
                  step.id < currentStep ? 'border-green-500 bg-green-500 text-white' :
                  step.id === currentStep ? 'border-primary bg-primary text-white' :
                  'border-gray-300 bg-white text-gray-400'}
              `}>
                {isRejected && step.id === 1 ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : step.id < currentStep ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <span className="text-sm font-medium">{step.id}</span>
                )}
              </div>
              {index < steps.length - 1 && (
                <div className={`h-0.5 flex-1 mx-2 ${step.id < currentStep ? 'bg-green-500' : 'bg-gray-200'}`} />
              )}
            </div>
            <span className={`text-xs mt-2 text-center ${step.id <= currentStep ? 'text-foreground' : 'text-muted-foreground'}`}>
              {step.label}
            </span>
            {step.date && (
              <span className="text-xs text-muted-foreground">
                {new Date(step.date).toLocaleDateString('fr-TN')}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Estimated Delay Component
function EstimatedDelay({ bulletin }: { bulletin: BulletinSoins }) {
  if (bulletin.status === 'reimbursed' || bulletin.status === 'rejected') {
    return null;
  }

  const getDelayInfo = () => {
    switch (bulletin.status) {
      case 'scan_uploaded':
        return {
          message: "En attente de reception du bulletin papier original",
          delay: "Delai de remboursement: 2 jours apres reception du papier complet",
          icon: Clock,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50 border-yellow-200',
        };
      case 'paper_received':
        return {
          message: "Bulletin papier reçu, verification en cours",
          delay: "Delai estime: verification sous 24h",
          icon: Package,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50 border-blue-200',
        };
      case 'paper_incomplete':
        return {
          message: "Dossier incomplet - documents manquants détectés",
          delay: "Delai de remboursement: 15 jours ouvrables",
          icon: AlertCircle,
          color: 'text-orange-600',
          bgColor: 'bg-orange-50 border-orange-200',
        };
      case 'paper_complete':
        return {
          message: "Dossier complet - traitement prioritaire",
          delay: "Delai de remboursement: 2 jours ouvrables",
          icon: CheckCircle,
          color: 'text-green-600',
          bgColor: 'bg-green-50 border-green-200',
        };
      case 'processing':
        return {
          message: "Remboursement en cours de traitement",
          delay: bulletin.estimated_reimbursement_date
            ? `Date estimee: ${new Date(bulletin.estimated_reimbursement_date).toLocaleDateString('fr-TN')}`
            : "Traitement en cours",
          icon: Loader2,
          color: 'text-blue-600',
          bgColor: 'bg-blue-50 border-blue-200',
        };
      case 'approved':
        return {
          message: "Dossier validé - en attente de paiement",
          delay: `Montant approuvé: ${bulletin.approved_amount?.toFixed(2) || bulletin.reimbursed_amount?.toFixed(2) || '0.00'} TND`,
          icon: CheckCircle,
          color: 'text-emerald-600',
          bgColor: 'bg-emerald-50 border-emerald-200',
        };
      case 'pending_payment':
        return {
          message: "Paiement en cours de traitement",
          delay: bulletin.payment_method
            ? `Mode: ${bulletin.payment_method === 'bank_transfer' ? 'Virement bancaire' : bulletin.payment_method === 'check' ? 'Chèque' : bulletin.payment_method}`
            : "Le paiement sera effectué sous 48h",
          icon: Clock,
          color: 'text-amber-600',
          bgColor: 'bg-amber-50 border-amber-200',
        };
      default:
        return null;
    }
  };

  const info = getDelayInfo();
  if (!info) return null;

  const Icon = info.icon;

  return (
    <div className={`rounded-lg border p-4 ${info.bgColor}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 ${info.color} ${bulletin.status === 'processing' ? 'animate-spin' : ''}`} />
        <div>
          <p className={`font-medium ${info.color}`}>{info.message}</p>
          <p className="text-sm text-muted-foreground mt-1">{info.delay}</p>
          {bulletin.status === 'paper_incomplete' && bulletin.missing_documents && (
            <div className="mt-2">
              <p className="text-sm font-medium text-orange-800">Documents manquants:</p>
              <ul className="text-sm text-orange-700 list-disc list-inside">
                {bulletin.missing_documents.map((doc, i) => (
                  <li key={i}>{doc}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AdhérentBulletinsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [careTypeFilter, setCareTypeFilter] = useState<string>('all');
  const [selectedBulletin, setSelectedBulletin] = useState<BulletinSoins | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('list');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Download modal state
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<typeof BULLETIN_TEMPLATES[0] | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<BulletinFormData>({
    resolver: zodResolver(bulletinFormSchema),
    defaultValues: {
      care_type: 'consultation',
      beneficiary_type: 'self',
    },
  });

  const beneficiaryType = watch('beneficiary_type');
  const selectedCareType = watch('care_type');

  // Fetch bulletins
  const { data: bulletinsData, isLoading } = useQuery({
    queryKey: ['adhérent-bulletins', statusFilter, careTypeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter && statusFilter !== 'all') params.append('status', statusFilter);
      if (careTypeFilter && careTypeFilter !== 'all') params.append('care_type', careTypeFilter);

      const url = `/bulletins-soins/me${params.toString() ? `?${params}` : ''}`;
      const response = await apiClient.get<BulletinSoins[]>(url);
      if (!response.success) throw new Error(response.error?.message);
      // API returns { success, data: [...], meta: {...} }
      // We need to return { data: [...], meta: {...} }
      return {
        data: response.data || [],
        meta: (response as { meta?: { total: number } }).meta || { total: 0 },
      };
    },
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['adhérent-bulletins-stats'],
    queryFn: async () => {
      const response = await apiClient.get<BulletinStats>('/bulletins-soins/me/stats');
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
  });

  // Fetch adherent profile for pre-filled bulletins
  const { data: adherentProfile } = useQuery({
    queryKey: ['adherent-profile'],
    queryFn: async () => {
      const response = await apiClient.get<AdherentProfile>('/sante/profil/me');
      if (!response.success) return null;
      return response.data;
    },
    retry: false,
  });

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (data: { formData: BulletinFormData; files: File[] }) => {
      const form = new FormData();

      // Append form fields
      Object.entries(data.formData).forEach(([key, value]) => {
        if (value !== undefined && value !== '') {
          form.append(key, String(value));
        }
      });

      // Append files
      data.files.forEach((file, index) => {
        form.append(`scan_${index}`, file);
      });

      const token = localStorage.getItem('accessToken');
      const response = await fetch(
        `${API_BASE_URL}/bulletins-soins/submit`,
        {
          method: 'POST',
          body: form,
          credentials: 'include',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      // Check content type before parsing
      const contentType = response.headers.get('content-type');
      const isJson = contentType?.includes('application/json');

      if (!response.ok) {
        if (isJson) {
          const error = await response.json();
          throw new Error(error.error?.message || 'Erreur lors de la soumission');
        }
        throw new Error(`Erreur ${response.status}: ${response.statusText}`);
      }

      // Return parsed JSON or empty object if no content
      if (isJson && response.status !== 204) {
        return response.json();
      }
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adhérent-bulletins'] });
      queryClient.invalidateQueries({ queryKey: ['adhérent-bulletins-stats'] });
      toast.success('Bulletin soumis avec succès!');
      reset();
      setSelectedFiles([]);
      setActiveTab('list');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de la soumission');
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(file => {
      const isValidType = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'].includes(file.type);
      const isValidSize = file.size <= 10 * 1024 * 1024; // 10MB
      return isValidType && isValidSize;
    });

    if (validFiles.length !== files.length) {
      toast.error('Certains fichiers ont été ignorés (format ou taille invalide)');
    }

    setSelectedFiles(prev => [...prev, ...validFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Download bulletin (blank or pre-filled)
  const handleDownloadBulletin = async (mode: 'blank' | 'prefilled') => {
    if (!selectedTemplate) return;

    try {
      setIsDownloading(true);

      // Build URL with optional pre-fill parameters
      let pdfUrl = `${API_BASE_URL}/bulletins-soins/templates/${selectedTemplate.filename}`;

      if (mode === 'prefilled' && adherentProfile) {
        const params = new URLSearchParams({
          prefill: 'true',
          firstName: adherentProfile.first_name || '',
          lastName: adherentProfile.last_name || '',
          dateOfBirth: adherentProfile.date_of_birth || '',
          matricule: adherentProfile.matricule || '',
          address: adherentProfile.address || '',
          phone: adherentProfile.phone || '',
        });
        pdfUrl += `?${params.toString()}`;
      }

      // Open PDF in new tab for download/print
      window.open(pdfUrl, '_blank');
      toast.success('Bulletin téléchargé avec succès');
      setSelectedTemplate(null);
      setShowDownloadModal(false);
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Erreur lors du téléchargement');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleViewScan = (bulletin: BulletinSoins) => {
    if (bulletin.scan_url) {
      window.open(`/api/v1/bulletins-soins/me/${bulletin.id}/scan`, '_blank');
    }
  };

  const onSubmitForm = async (data: BulletinFormData) => {
    if (selectedFiles.length === 0) {
      toast.error('Veuillez ajouter au moins un scan ou photo du bulletin');
      return;
    }

    setIsSubmitting(true);
    try {
      await submitMutation.mutateAsync({ formData: data, files: selectedFiles });
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns = [
    {
      key: 'bulletin_number',
      header: 'N Bulletin',
      cell: (row: BulletinSoins) => (
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="font-mono text-sm">{row.bulletin_number}</span>
        </div>
      ),
    },
    {
      key: 'bulletin_date',
      header: 'Date',
      cell: (row: BulletinSoins) => new Date(row.bulletin_date).toLocaleDateString('fr-TN'),
    },
    {
      key: 'care_type',
      header: 'Type de soin',
      cell: (row: BulletinSoins) => {
        const config = careTypeConfig[row.care_type as keyof typeof careTypeConfig] || careTypeConfig.consultation;
        const Icon = config.icon;
        return (
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span>{config.label}</span>
          </div>
        );
      },
    },
    {
      key: 'provider_name',
      header: 'Praticien',
      cell: (row: BulletinSoins) => (
        <div>
          <p className="font-medium">{row.provider_name || '-'}</p>
          {row.provider_specialty && (
            <p className="text-xs text-muted-foreground">{row.provider_specialty}</p>
          )}
        </div>
      ),
    },
    {
      key: 'total_amount',
      header: 'Montant',
      cell: (row: BulletinSoins) => (
        <div className="text-right">
          <p className="font-medium">{row.total_amount?.toFixed(2) || '0.00'} TND</p>
          {row.reimbursed_amount > 0 && (
            <p className="text-xs text-green-600">
              +{row.reimbursed_amount.toFixed(2)} TND
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      cell: (row: BulletinSoins) => {
        const config = statusConfig[row.status];
        const Icon = config.icon;
        return (
          <div className="flex flex-col gap-1">
            <Badge variant={config.variant as 'default' | 'secondary' | 'destructive' | 'outline'} className="gap-1 w-fit">
              <Icon className={`h-3 w-3 ${row.status === 'processing' ? 'animate-spin' : ''}`} />
              {config.label}
            </Badge>
            {(row.status === 'paper_complete' || row.status === 'paper_incomplete') && (
              <span className="text-xs text-muted-foreground">
                {row.status === 'paper_complete' ? 'Delai: 2j' : 'Delai: 15j'}
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      cell: (row: BulletinSoins) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setSelectedBulletin(row);
              setShowDetailsDialog(true);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {row.scan_url && (
            <Button size="sm" variant="ghost" onClick={() => handleViewScan(row)}>
              <FileImage className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const pendingCount = (stats?.scan_uploaded || 0) + (stats?.paper_received || 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes Bulletins de Soins"
        description="Soumettez vos bulletins et suivez l'état de vos remboursements"
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowDownloadModal(true)}>
              <Download className="mr-2 h-4 w-4" />
              Télécharger bulletin
            </Button>
            <Button onClick={() => setActiveTab('submit')}>
              <Upload className="mr-2 h-4 w-4" />
              Soumettre un bulletin
            </Button>
          </div>
        }
      />

      {/* Info Banner */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">Comment fonctionne le remboursement?</p>
              <p className="text-sm text-blue-700 mt-1">
                1. Soumettez votre scan ou photo du bulletin rempli par votre praticien<br />
                2. Envoyez le bulletin papier original par courrier<br />
                3. <strong>Dossier complet = remboursement sous 2 jours</strong> | <strong>Documents manquants = 15 jours</strong>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100">
                <FileText className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
                <p className="text-sm text-muted-foreground">Total bulletins</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-100">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingCount}</p>
                <p className="text-sm text-muted-foreground">En attente</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{(stats?.approved || 0) + (stats?.pending_payment || 0)}</p>
                <p className="text-sm text-muted-foreground">En paiement</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats?.reimbursed || 0}</p>
                <p className="text-sm text-muted-foreground">Remboursés</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardContent className="pt-6">
            <div>
              <p className="text-2xl font-bold text-green-700">
                {stats?.total_reimbursed?.toFixed(2) || '0.00'} TND
              </p>
              <p className="text-sm text-green-600">Total rembourse</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">Liste des bulletins</TabsTrigger>
          <TabsTrigger value="submit">Soumettre un bulletin</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-4">
                <div className="w-48">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tous les statuts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les statuts</SelectItem>
                      <SelectItem value="scan_uploaded">Scan soumis</SelectItem>
                      <SelectItem value="paper_received">Papier reçu</SelectItem>
                      <SelectItem value="paper_incomplete">Dossier incomplet</SelectItem>
                      <SelectItem value="paper_complete">Dossier complet</SelectItem>
                      <SelectItem value="processing">En traitement</SelectItem>
                      <SelectItem value="approved">Approuvé</SelectItem>
                      <SelectItem value="pending_payment">Paiement en cours</SelectItem>
                      <SelectItem value="reimbursed">Remboursé</SelectItem>
                      <SelectItem value="rejected">Rejeté</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-48">
                  <Select value={careTypeFilter} onValueChange={setCareTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Type de soin" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les types</SelectItem>
                      <SelectItem value="consultation">Consultation</SelectItem>
                      <SelectItem value="pharmacy">Pharmacie</SelectItem>
                      <SelectItem value="lab">Analyses</SelectItem>
                      <SelectItem value="hospital">Hospitalisation</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="pt-6">
              <DataTable
                columns={columns}
                data={bulletinsData?.data || []}
                isLoading={isLoading}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="submit">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Form */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Upload className="h-5 w-5" />
                    Soumettre un bulletin de soins
                  </CardTitle>
                  <CardDescription>
                    Remplissez les informations et ajoutez le scan de votre bulletin
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-6">
                    {/* File Upload */}
                    <div className="space-y-2">
                      <Label>Scan ou photo du bulletin *</Label>
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
                          className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 transition-colors"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <FileImage className="h-12 w-12 text-muted-foreground/50 mb-3" />
                          <p className="font-medium">Deposez votre bulletin scanne ici</p>
                          <p className="text-sm text-muted-foreground">
                            PDF, JPG, PNG (max 10 Mo)
                          </p>
                          <Button type="button" className="mt-4" variant="outline">
                            <Upload className="mr-2 h-4 w-4" />
                            Choisir un fichier
                          </Button>
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

                    {/* Care Type */}
                    <div className="grid gap-4 sm:grid-cols-2">
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
                            <SelectItem value="consultation">
                              <div className="flex items-center gap-2">
                                <Stethoscope className="h-4 w-4" />
                                Consultation
                              </div>
                            </SelectItem>
                            <SelectItem value="pharmacy">
                              <div className="flex items-center gap-2">
                                <Pill className="h-4 w-4" />
                                Pharmacie
                              </div>
                            </SelectItem>
                            <SelectItem value="lab">
                              <div className="flex items-center gap-2">
                                <FlaskConical className="h-4 w-4" />
                                Analyses
                              </div>
                            </SelectItem>
                            <SelectItem value="hospital">
                              <div className="flex items-center gap-2">
                                <Building2 className="h-4 w-4" />
                                Hospitalisation
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Date du bulletin *</Label>
                        <Input type="date" max={new Date().toISOString().split('T')[0]} {...register('bulletin_date')} />
                        {errors.bulletin_date && (
                          <p className="text-sm text-destructive">{errors.bulletin_date.message}</p>
                        )}
                      </div>
                    </div>

                    {/* Provider Info */}
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Nom du praticien *</Label>
                        <Input {...register('provider_name')} placeholder="Dr. Mohamed Ali" />
                        {errors.provider_name && (
                          <p className="text-sm text-destructive">{errors.provider_name.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>Spécialité</Label>
                        <Input {...register('provider_specialty')} placeholder="Généraliste, Cardiologue..." />
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="space-y-2">
                      <Label>Montant total (TND) *</Label>
                      <Input
                        type="number"
                        step="0.01"
                        {...register('total_amount', { valueAsNumber: true })}
                        placeholder="150.00"
                      />
                      {errors.total_amount && (
                        <p className="text-sm text-destructive">{errors.total_amount.message}</p>
                      )}
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                      <Label>Description des soins (optionnel)</Label>
                      <Textarea
                        {...register('care_description')}
                        placeholder="Ex: Consultation + analyses sanguines"
                        rows={2}
                      />
                    </div>

                    {/* Beneficiary */}
                    <div className="space-y-4">
                      <Label>Bénéficiaire</Label>
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            value="self"
                            {...register('beneficiary_type')}
                            className="h-4 w-4"
                          />
                          <span>Moi-meme</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            value="beneficiary"
                            {...register('beneficiary_type')}
                            className="h-4 w-4"
                          />
                          <span>Un ayant-droit</span>
                        </label>
                      </div>

                      {beneficiaryType === 'beneficiary' && (
                        <div className="grid gap-4 sm:grid-cols-3 p-4 border rounded-lg bg-muted/50">
                          <div className="space-y-2">
                            <Label>Prénom</Label>
                            <Input {...register('beneficiary_first_name')} />
                          </div>
                          <div className="space-y-2">
                            <Label>Nom</Label>
                            <Input {...register('beneficiary_last_name')} />
                          </div>
                          <div className="space-y-2">
                            <Label>Lien</Label>
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
                      )}
                    </div>

                    {/* Submit */}
                    <Button type="submit" className="w-full" disabled={isSubmitting || selectedFiles.length === 0}>
                      {isSubmitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Soumission en cours...
                        </>
                      ) : (
                        <>
                          <Send className="mr-2 h-4 w-4" />
                          Soumettre le bulletin
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Info Panel */}
            <div className="space-y-4">
              <Card className="bg-amber-50 border-amber-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base text-amber-900 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Important
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-amber-800 space-y-3">
                  <p>
                    Apres soumission du scan, vous devez <strong>envoyer le bulletin papier original</strong> par courrier a:
                  </p>
                  <div className="bg-white/50 p-3 rounded border border-amber-300">
                    <p className="font-medium">Dhamen - Service Remboursements</p>
                    <p>Centre Urbain Nord</p>
                    <p>1082 Tunis, Tunisie</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Timer className="h-5 w-5" />
                    Delais de remboursement
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-green-50 border border-green-200">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium text-green-800">Dossier complet</p>
                      <p className="text-sm text-green-700">2 jours ouvrables</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-orange-50 border border-orange-200">
                    <AlertCircle className="h-5 w-5 text-orange-600" />
                    <div>
                      <p className="font-medium text-orange-800">Documents manquants</p>
                      <p className="text-sm text-orange-700">15 jours ouvrables</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Documents requis</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="text-sm space-y-2">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Bulletin de soins rempli et signe
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Ordonnance medicale (si applicable)
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Factures et tickets de caisse
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      Résultats d'analyses (si applicable)
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Details du bulletin {selectedBulletin?.bulletin_number}
            </DialogTitle>
          </DialogHeader>
          {selectedBulletin && (
            <div className="space-y-6">
              {/* Progress Timeline */}
              <div className="p-4 border rounded-lg bg-muted/30">
                <p className="text-sm font-medium mb-4">Suivi de votre demande</p>
                <BulletinProgressTimeline bulletin={selectedBulletin} />
              </div>

              {/* Estimated Delay */}
              <EstimatedDelay bulletin={selectedBulletin} />

              {/* Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">N Bulletin</p>
                  <p className="font-mono font-medium">{selectedBulletin.bulletin_number}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date du bulletin</p>
                  <p className="font-medium">
                    {new Date(selectedBulletin.bulletin_date).toLocaleDateString('fr-TN')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Praticien</p>
                  <p className="font-medium">{selectedBulletin.provider_name || '-'}</p>
                  {selectedBulletin.provider_specialty && (
                    <p className="text-sm text-muted-foreground">{selectedBulletin.provider_specialty}</p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Type de soin</p>
                  <p className="font-medium">
                    {careTypeConfig[selectedBulletin.care_type as keyof typeof careTypeConfig]?.label || selectedBulletin.care_type}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Montant total</p>
                  <p className="font-medium">{selectedBulletin.total_amount?.toFixed(2) || '0.00'} TND</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Montant rembourse</p>
                  <p className="font-medium text-green-600">
                    {selectedBulletin.reimbursed_amount?.toFixed(2) || '0.00'} TND
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Date de soumission</p>
                  <p className="font-medium">
                    {new Date(selectedBulletin.submission_date).toLocaleDateString('fr-TN')}
                  </p>
                </div>
                {selectedBulletin.estimated_reimbursement_date && (
                  <div>
                    <p className="text-sm text-muted-foreground">Date estimee de remboursement</p>
                    <p className="font-medium text-green-600">
                      {new Date(selectedBulletin.estimated_reimbursement_date).toLocaleDateString('fr-TN')}
                    </p>
                  </div>
                )}
              </div>

              {selectedBulletin.care_description && (
                <div>
                  <p className="text-sm text-muted-foreground">Description</p>
                  <p className="mt-1">{selectedBulletin.care_description}</p>
                </div>
              )}

              <div className="flex items-center gap-2 pt-4 border-t">
                <span className="text-sm text-muted-foreground">Statut actuel:</span>
                <Badge variant={statusConfig[selectedBulletin.status].variant as 'default' | 'secondary' | 'destructive' | 'outline'}>
                  {statusConfig[selectedBulletin.status].label}
                </Badge>
              </div>

              {selectedBulletin.rejection_reason && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-sm font-medium text-red-800">Motif du rejet</p>
                  <p className="text-sm text-red-700">{selectedBulletin.rejection_reason}</p>
                </div>
              )}

              {/* Payment Information */}
              {(selectedBulletin.status === 'approved' || selectedBulletin.status === 'pending_payment' || selectedBulletin.status === 'reimbursed') && (
                <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                  <p className="text-sm font-medium text-green-800 mb-3">Informations de paiement</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    {selectedBulletin.approved_amount && (
                      <div>
                        <p className="text-green-600">Montant approuvé</p>
                        <p className="font-medium text-green-800">{selectedBulletin.approved_amount.toFixed(2)} TND</p>
                      </div>
                    )}
                    {selectedBulletin.approved_date && (
                      <div>
                        <p className="text-green-600">Date d'approbation</p>
                        <p className="font-medium text-green-800">{new Date(selectedBulletin.approved_date).toLocaleDateString('fr-TN')}</p>
                      </div>
                    )}
                    {selectedBulletin.payment_method && (
                      <div>
                        <p className="text-green-600">Mode de paiement</p>
                        <p className="font-medium text-green-800">
                          {selectedBulletin.payment_method === 'bank_transfer' ? 'Virement bancaire' :
                           selectedBulletin.payment_method === 'check' ? 'Chèque' :
                           selectedBulletin.payment_method === 'cash' ? 'Espèces' :
                           selectedBulletin.payment_method === 'mobile_payment' ? 'Paiement mobile' :
                           selectedBulletin.payment_method}
                        </p>
                      </div>
                    )}
                    {selectedBulletin.payment_reference && (
                      <div>
                        <p className="text-green-600">Référence</p>
                        <p className="font-mono font-medium text-green-800">{selectedBulletin.payment_reference}</p>
                      </div>
                    )}
                    {selectedBulletin.payment_date && (
                      <div>
                        <p className="text-green-600">Date de paiement</p>
                        <p className="font-medium text-green-800">{new Date(selectedBulletin.payment_date).toLocaleDateString('fr-TN')}</p>
                      </div>
                    )}
                  </div>
                  {selectedBulletin.payment_notes && (
                    <div className="mt-3 pt-3 border-t border-green-200">
                      <p className="text-green-600">Notes</p>
                      <p className="text-green-800">{selectedBulletin.payment_notes}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-4">
                {selectedBulletin.scan_url && (
                  <Button variant="outline" onClick={() => handleViewScan(selectedBulletin)}>
                    <FileImage className="mr-2 h-4 w-4" />
                    Voir le scan
                  </Button>
                )}
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Télécharger
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Download Bulletins Modal */}
      <Dialog open={showDownloadModal} onOpenChange={(open) => {
        setShowDownloadModal(open);
        if (!open) setSelectedTemplate(null);
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDown className="h-5 w-5" />
              Télécharger un bulletin vierge
            </DialogTitle>
          </DialogHeader>

          {!selectedTemplate ? (
            <div className="space-y-4">
              {/* Info Banner */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
                <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                <p className="text-sm text-blue-700">
                  Choisissez le type de bulletin à télécharger. Vous pourrez ensuite choisir entre un bulletin vierge ou pré-rempli avec vos informations.
                </p>
              </div>

              {/* Template List */}
              <div className="space-y-2">
                {BULLETIN_TEMPLATES.map((template) => {
                  const Icon = template.icon;
                  return (
                    <button
                      key={template.id}
                      onClick={() => setSelectedTemplate(template)}
                      className="w-full flex items-center gap-4 p-4 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-left"
                    >
                      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
                        <Icon className="h-6 w-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{template.title}</p>
                        <p className="text-sm text-muted-foreground">{template.description}</p>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground" />
                    </button>
                  );
                })}
              </div>

              {/* Tips */}
              <div className="rounded-lg bg-green-50 border border-green-200 p-4 space-y-2">
                <p className="text-sm font-medium text-green-800 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Conseils
                </p>
                <ul className="text-sm text-green-700 space-y-1">
                  <li>• Imprimez en format A4</li>
                  <li>• Remplissez lisiblement au stylo noir</li>
                  <li>• Faites signer et cacheter par le praticien</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Back Button */}
              <button
                onClick={() => setSelectedTemplate(null)}
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                ← Retour aux types
              </button>

              {/* Selected Template */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
                {(() => {
                  const Icon = selectedTemplate.icon;
                  return <Icon className="h-8 w-8 text-primary" />;
                })()}
                <div>
                  <p className="font-medium">{selectedTemplate.title}</p>
                  <p className="text-sm text-muted-foreground">{selectedTemplate.description}</p>
                </div>
              </div>

              <p className="text-sm font-medium">Choisissez le format :</p>

              {/* Option 1: Blank */}
              <button
                onClick={() => handleDownloadBulletin('blank')}
                disabled={isDownloading}
                className="w-full flex items-center gap-4 p-4 rounded-lg border hover:border-primary hover:bg-primary/5 transition-colors text-left"
              >
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-100">
                  <FileText className="h-6 w-6 text-gray-600" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Bulletin Vierge</p>
                  <p className="text-sm text-muted-foreground">Sans informations pré-remplies</p>
                </div>
                {isDownloading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <Download className="h-5 w-5 text-primary" />
                )}
              </button>

              {/* Option 2: Pre-filled */}
              <button
                onClick={() => handleDownloadBulletin('prefilled')}
                disabled={isDownloading || !adherentProfile}
                className="w-full flex flex-col gap-3 p-4 rounded-lg border-2 border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/20">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Bulletin Pré-rempli</p>
                    <p className="text-sm text-muted-foreground">Vos informations déjà complétées</p>
                  </div>
                  {isDownloading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  ) : (
                    <Download className="h-5 w-5 text-primary" />
                  )}
                </div>

                {adherentProfile ? (
                  <div className="ml-16 pl-4 border-l-2 border-primary/20 space-y-1 text-sm">
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">Nom:</span> {adherentProfile.last_name} {adherentProfile.first_name}
                    </p>
                    <p className="text-muted-foreground">
                      <span className="font-medium text-foreground">Matricule:</span> {adherentProfile.matricule}
                    </p>
                    {adherentProfile.date_of_birth && (
                      <p className="text-muted-foreground">
                        <span className="font-medium text-foreground">Date de naissance:</span> {new Date(adherentProfile.date_of_birth).toLocaleDateString('fr-TN')}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="ml-16 text-sm text-amber-600 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Profil non disponible - Veuillez compléter votre profil
                  </div>
                )}
              </button>

              <div className="text-center text-sm text-muted-foreground">
                ✨ Recommandé : Pré-rempli pour gagner du temps
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdhérentBulletinsPage;
