import { useState, useRef } from 'react';
import { cn } from '@/lib/utils';
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
import { useAdherentFamille } from '@/features/agent/hooks/use-adherent-famille';
import { useAdherentPlafonds } from '@/features/agent/hooks/use-adherent-plafonds';
import { FamilleTable } from '@/features/agent/adherents/components/FamilleTable';
import { PlafondsCard } from '@/features/agent/adherents/components/PlafondsCard';
import { ScanUpload } from '@/features/bulletins/components/scan-upload';
import { ActeSelector } from '@/features/agent/bulletins/components/ActeSelector';
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
  ScanSearch,
  ThumbsUp,
  ThumbsDown,
  MessageSquare,
  X,
} from 'lucide-react';

// --- OCR Feedback types ---
interface OcrFeedbackState {
  /** Raw donnees_ia from OCR API — sent back as-is for feedback */
  donneesIa: Record<string, unknown>;
  /** Whether the feedback panel is visible */
  visible: boolean;
}

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
  ref_prof_sant: z.string().min(1, 'Matricule fiscale requis'),
  nom_prof_sant: z.string().min(2, 'Nom du praticien requis'),
  care_description: z.string().optional(),
  cod_msgr: z.string().optional(),
  lib_msgr: z.string().optional(),
});

const bulletinFormSchema = z.object({
  bulletin_number: z.string().min(1, 'Numero de bulletin requis'),
  bulletin_date: z.string().min(1, 'Date requise'),
  adherent_matricule: z.string().min(1, 'Matricule requis'),
  adherent_first_name: z.string().min(2, 'Prenom requis'),
  adherent_last_name: z.string().min(2, 'Nom requis'),
  adherent_contract_number: z.string().optional(),
  adherent_national_id: z.string().optional().or(z.literal('')),
  adherent_email: z.string().email('Email invalide').optional().or(z.literal('')),
  adherent_address: z.string().optional(),
  beneficiary_name: z.string().optional(),
  care_type: z.enum(['consultation', 'pharmacy', 'lab', 'hospital']),
  actes: z.array(acteFormSchema).min(1, 'Au moins un acte requis'),
});

type BulletinFormData = z.infer<typeof bulletinFormSchema>;

// Map OCR nature_acte to referentiel codes (C1, C2, PH1, etc.)
const NATURE_ACTE_MAPPINGS: { keywords: string[]; code: string; label: string }[] = [
  { keywords: ['generaliste', 'medecin general', 'medecin de famille'], code: 'C1', label: 'Consultation généraliste' },
  { keywords: ['specialiste', 'psychiatr', 'cardiologue', 'dermatologue', 'gynecologue', 'gyneco', 'orl', 'pneumologue', 'gastro', 'neurologue', 'urologue', 'endocrinologue', 'ophtalmologue', 'rhumatologue', 'nephrologue', 'oncologue', 'allergologue'], code: 'C2', label: 'Consultation spécialiste' },
  { keywords: ['professeur', 'prof '], code: 'C3', label: 'Consultation professeur' },
  { keywords: ['pharmacie', 'medicament', 'pharmaceut'], code: 'PH1', label: 'Frais pharmaceutiques' },
  { keywords: ['analyse', 'biolog', 'sang', 'labo', 'bilan'], code: 'AN', label: 'Analyses biologiques' },
  { keywords: ['radio', 'radiograph', 'radiologie'], code: 'R', label: 'Radiologie' },
  { keywords: ['echograph', 'echo'], code: 'E', label: 'Échographie' },
  { keywords: ['scanner', 'irm', 'imagerie'], code: 'TS', label: 'Traitements spéciaux (scanner/IRM)' },
  { keywords: ['dentaire', 'dent', 'dentist'], code: 'SD', label: 'Soins et prothèses dentaires' },
  { keywords: ['kine', 'physiother', 'reeducation'], code: 'PC', label: 'Pratiques courantes' },
  { keywords: ['clinique', 'hospitalisation'], code: 'CL', label: 'Hospitalisation clinique' },
  { keywords: ['hopital'], code: 'HP', label: 'Hospitalisation hôpital' },
  { keywords: ['chirurg', 'operation', 'bloc'], code: 'FCH', label: 'Frais chirurgicaux' },
  { keywords: ['optique', 'lunettes', 'verres'], code: 'OPT', label: 'Optique (monture + verres)' },
  { keywords: ['accouchement', 'maternite'], code: 'ACC', label: 'Accouchement' },
  { keywords: ['orthodont'], code: 'ODF', label: 'Soins orthodontiques' },
];

function mapNatureActeToCode(natureActe: string): { code: string; label: string } | null {
  const text = natureActe.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const mapping of NATURE_ACTE_MAPPINGS) {
    if (mapping.keywords.some((kw) => text.includes(kw))) {
      return { code: mapping.code, label: mapping.label };
    }
  }
  return null;
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
  const [showExportDetailDialog, setShowExportDetailDialog] = useState(false);
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [ocrFeedback, setOcrFeedback] = useState<OcrFeedbackState | null>(null);
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [feedbackErrors, setFeedbackErrors] = useState<string[]>([]);
  const [feedbackComment, setFeedbackComment] = useState('');

  const { data: adherentResults } = useSearchAdherents(adherentSearch);
  const { data: familleData } = useAdherentFamille(selectedAdherentInfo?.id);
  const { data: plafondsData } = useAdherentPlafonds(selectedAdherentInfo?.id);

  // Extract pharmacy plafond (FA0003 = Frais pharmaceutiques) from adherent plafonds
  const plafondPharma = plafondsData?.parFamille?.find(
    (p) => p.familleCode === 'FA0003'
  );
  const plafondPharmaChronique = plafondsData?.parFamille?.find(
    (p) => p.familleCode === 'FA0003' && p.typeMaladie === 'chronique'
  );
  const plafondPharmaOrdinaire = plafondsData?.parFamille?.find(
    (p) => p.familleCode === 'FA0003' && p.typeMaladie === 'ordinaire'
  );
  const [selectedMedicationFamily, setSelectedMedicationFamily] = useState<string>('');

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
      actes: [{ code: '', label: '', amount: 0, ref_prof_sant: '', nom_prof_sant: '', care_description: '', cod_msgr: '', lib_msgr: '' }],
    },
  });

  const { fields: actesFields, append: appendActe, remove: removeActe } = useFieldArray({
    control,
    name: 'actes',
  });

  const selectedCareType = watch('care_type');
  const watchedActes = watch('actes');
  const actesTotal = (watchedActes || []).reduce((sum, a) => sum + (Number(a.amount) || 0), 0);

  // Fetch medication families for pharmacy care type
  const { data: medicationFamilies } = useQuery({
    queryKey: ['medication-families'],
    queryFn: async () => {
      const response = await apiClient.get<{ families: { id: string; code: string; name: string }[] }>('/medications/families');
      if (!response.success) return [];
      return response.data?.families || [];
    },
    enabled: selectedCareType === 'pharmacy',
  });

  // Fetch medications filtered by family
  const { data: medications } = useQuery({
    queryKey: ['medications', selectedMedicationFamily],
    queryFn: async () => {
      const params: Record<string, string> = { limit: '200' };
      if (selectedMedicationFamily && selectedMedicationFamily !== 'all') {
        params.familyId = selectedMedicationFamily;
      }
      const response = await apiClient.get<{
        id: string;
        code_pct: string;
        dci: string;
        brand_name: string;
        dosage: string;
        form: string;
        family_name: string;
        price_public: number;
        is_generic: number;
        is_reimbursable: number;
        reimbursement_rate: number;
      }[]>('/medications', { params });
      if (!response.success) return [];
      // apiClient may return data directly as array or wrapped
      const raw = response as unknown as { data: unknown };
      return Array.isArray(raw.data) ? raw.data : [];
    },
    enabled: selectedCareType === 'pharmacy',
  });

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
      setSelectedAdherentInfo(null);
      setAdherentSearch('');
      setShowAdherentDropdown(false);
      setSelectedMedicationFamily('');
      setActiveTab('liste');
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
    mutationFn: async ({ batchId, force = false }: { batchId: string; force?: boolean }) => {
      const token = localStorage.getItem('accessToken');
      const qs = force ? '?force=true' : '';
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || '/api/v1'}/bulletins-soins/agent/batches/${batchId}/export${qs}`,
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

      // Extract filename from Content-Disposition
      const disposition = response.headers.get('Content-Disposition');
      let filename = `dhamen_lot_${batchId}_${new Date().toISOString().slice(0, 10)}.csv`;
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) {
          filename = match[1];
        }
      }

      const csvContent = await response.text();
      return { csvContent, filename };
    },
    onSuccess: ({ csvContent, filename }) => {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      queryClient.invalidateQueries({ queryKey: ['agent-batches'] });
      queryClient.invalidateQueries({ queryKey: ['agent-bulletins'] });
      toast.success('Export CSV telecharge!');
      setShowExportDialog(false);
      setExportBatch(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de l\'export');
    },
  });

  // Export batch detail mutation (bordereau detaille)
  const exportDetailMutation = useMutation({
    mutationFn: async ({ batchId }: { batchId: string }) => {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || '/api/v1'}/bulletins-soins/agent/batches/${batchId}/export-detail`,
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
        throw new Error(error.error?.message || 'Erreur lors de l\'export detaille');
      }

      // Extract filename from Content-Disposition
      const disposition = response.headers.get('Content-Disposition');
      let filename = `dhamen_detail_${batchId}_${new Date().toISOString().slice(0, 10)}.csv`;
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match?.[1]) {
          filename = match[1];
        }
      }

      const csvContent = await response.text();
      return { csvContent, filename };
    },
    onSuccess: ({ csvContent, filename }) => {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success('Export detaille telecharge!');
      setShowExportDetailDialog(false);
      setExportBatch(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erreur lors de l\'export detaille');
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

  const analyzeWithOCR = async () => {
    if (selectedFiles.length === 0) return;
    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append('files', file);
      }

      // OCR API: Cloudflare Worker endpoint
      const ocrBase = (import.meta.env.VITE_OCR_API_URL || 'https://ocr-api-bh-assurance-dev.yassine-techini.workers.dev').replace(/\/+$/, '');
      const ocrApiUrl = `${ocrBase}/analyse-bulletin`;
      const res = await fetch(ocrApiUrl, {
        method: 'POST',
        headers: { 'accept': 'application/json' },
        body: formData,
      });

      if (!res.ok) throw new Error(`Erreur OCR: ${res.status}`);

      const result = await res.json();
      console.log('[OCR] Raw API response:', JSON.stringify(result, null, 2));

      // Handle multiple response formats:
      // New API: { success, donnees_ia: { infos_adherent, volet_medical } }
      // Alt API: { success, resultat: { infos_adherent, volet_medical } }
      // Old API: { raw_response: "```json\n{...}\n```" }
      // Backend proxy: { success, data: { infos_adherent, volet_medical } }
      let parsed = result.donnees_ia || result.resultat || result.data || result;

      if (typeof result.raw_response === 'string') {
        const jsonMatch = result.raw_response.match(/```json\s*([\s\S]*?)\s*```/);
        if (jsonMatch?.[1]) {
          parsed = JSON.parse(jsonMatch[1]);
        }
      }

      const info = parsed?.infos_adherent;
      const actes = parsed?.volet_medical;

      // Store raw OCR result for feedback panel
      setOcrFeedback({
        donneesIa: { infos_adherent: info || {}, volet_medical: actes || [] },
        visible: true,
      });
      setFeedbackErrors([]);
      setFeedbackComment('');

      // Auto-fill bulletin number (can be at top level or in infos_adherent)
      const numeroBulletin = parsed?.numero_bulletin || info?.numero_bulletin;
      if (numeroBulletin) {
        setValue('bulletin_number', numeroBulletin);
      }

      // Auto-fill adherent fields
      if (info) {
        if (info.nom_prenom) {
          const parts = info.nom_prenom.trim().split(/\s+/);
          if (parts.length >= 2) {
            setValue('adherent_last_name', parts[0]!);
            setValue('adherent_first_name', parts.slice(1).join(' '));
          }
        }
        const matriculeRaw = [info.numero_adherent, info.numero_contrat]
          .find((v) => v && v !== 'illisible');
        if (matriculeRaw) {
          const matricule = matriculeRaw.replace(/\s+/g, '');
          setValue('adherent_matricule', matricule);
          setAdherentSearch(matricule);
        }
        if (info.numero_contrat && info.numero_contrat !== 'illisible') {
          setValue('adherent_contract_number', info.numero_contrat.replace(/\s+/g, ''));
        }
        if (info.date_signature) {
          const dateParts = info.date_signature.split(/[.\/]/);
          if (dateParts.length === 3) {
            const year = dateParts[2]!.length === 2 ? `20${dateParts[2]}` : dateParts[2];
            setValue('bulletin_date', `${year}-${dateParts[1]}-${dateParts[0]}`);
          }
        }
        if (info.adresse) {
          setValue('adherent_address', info.adresse);
        }
        // Map beneficiaire_coche -> lien de parente (TASK-006)
        if (info.beneficiaire_coche) {
          const benef = info.beneficiaire_coche.toLowerCase().trim();
          if (benef.includes('conjoint')) {
            setValue('beneficiary_relationship' as keyof BulletinFormData, 'spouse');
          } else if (benef.includes('enfant')) {
            setValue('beneficiary_relationship' as keyof BulletinFormData, 'child');
          } else if (benef.includes('parent') || benef.includes('ascendant')) {
            setValue('beneficiary_relationship' as keyof BulletinFormData, 'parent');
          }
        }
      }

      // Auto-fill care type from first acte's type_soin
      if (Array.isArray(actes) && actes.length > 0 && actes[0]?.type_soin) {
        const typeSoin = actes[0].type_soin.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (typeSoin.includes('pharmac') || typeSoin.includes('medicament')) {
          setValue('care_type', 'pharmacy');
        } else if (typeSoin.includes('labo') || typeSoin.includes('analyse') || typeSoin.includes('biolog')) {
          setValue('care_type', 'lab');
        } else if (typeSoin.includes('hosp') || typeSoin.includes('clinique')) {
          setValue('care_type', 'hospital');
        } else {
          setValue('care_type', 'consultation');
        }
      }

      // Auto-fill actes with enriched codes from backend (TASK-003)
      if (Array.isArray(actes) && actes.length > 0) {
        const currentActes = watch('actes');
        while (currentActes.length > 1) {
          removeActe(currentActes.length - 1);
        }

        // Detect if care type is pharmacy (from the OCR type_soin we just set)
        const detectedCareType = watch('care_type');
        const isPharmacy = detectedCareType === 'pharmacy';

        actes.forEach((acte: Record<string, string | null>, i: number) => {
          const rawMontant = (acte.montant_facture || acte.montant_honoraires || '0')
            .replace(/[^\d.,]/g, '')
            .replace(',', '.');
          const montant = parseFloat(rawMontant) || 0;

          // For pharmacy: don't set code (user must select medication from list)
          // For other types: use backend-enriched codes or local mapping
          const mapped = acte.nature_acte ? mapNatureActeToCode(acte.nature_acte) : null;
          const code = isPharmacy ? '' : (acte.matched_code || mapped?.code || '');
          const label = isPharmacy ? (acte.nature_acte || '') : (acte.matched_label || mapped?.label || acte.nature_acte || '');

          // Keep nature_acte from OCR as care_description (e.g. "Psychiatrie")
          const natureActeOriginal = acte.nature_acte || '';

          if (i === 0) {
            setValue('actes.0.code', code);
            setValue('actes.0.label', label);
            setValue('actes.0.amount', montant);
            setValue('actes.0.nom_prof_sant', acte.nom_praticien || '');
            setValue('actes.0.ref_prof_sant', acte.matricule_fiscale || '');
            if (natureActeOriginal && !isPharmacy) {
              setValue('actes.0.care_description', natureActeOriginal);
            }
          } else {
            appendActe({
              code,
              label,
              amount: montant,
              nom_prof_sant: acte.nom_praticien || '',
              ref_prof_sant: acte.matricule_fiscale || '',
              cod_msgr: '',
              lib_msgr: natureActeOriginal && !isPharmacy ? '' : '',
              care_description: !isPharmacy ? natureActeOriginal : '',
            });
          }
        });
      }

      toast.success('Analyse terminee — champs remplis automatiquement. Verifiez puis envoyez votre feedback.');
    } catch (error) {
      console.error('OCR analysis error:', error);
      toast.error('Erreur lors de l\'analyse du bulletin');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- OCR Feedback handlers ---
  const sendOcrFeedback = async (statut: 'valide' | 'invalide' | 'partiellement_valide') => {
    if (!ocrFeedback) return;
    setIsSendingFeedback(true);
    const ocrBase = (import.meta.env.VITE_OCR_API_URL || 'https://ocr-api-bh-assurance-dev.yassine-techini.workers.dev').replace(/\/+$/, '');
    try {
      const res = await fetch(`${ocrBase}/valider-bulletin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'accept': 'application/json' },
        body: JSON.stringify({
          donnees_ia: ocrFeedback.donneesIa,
          metadata_validation: {
            statut_validation: statut,
            erreurs_signalees: feedbackErrors,
            commentaires_correction: feedbackComment,
          },
        }),
      });
      if (res.ok) {
        toast.success('Feedback OCR envoye avec succes');
      } else {
        toast.error('Erreur lors de l\'envoi du feedback');
      }
    } catch {
      toast.error('Erreur reseau lors de l\'envoi du feedback');
    } finally {
      setIsSendingFeedback(false);
      setOcrFeedback(null);
      setFeedbackErrors([]);
      setFeedbackComment('');
    }
  };

  const toggleFeedbackError = (fieldLabel: string) => {
    setFeedbackErrors((prev) =>
      prev.includes(fieldLabel) ? prev.filter((e) => e !== fieldLabel) : [...prev, fieldLabel]
    );
  };

  const onSubmitForm = async (data: BulletinFormData) => {
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

  const handleExportDetailBatch = (batch: Batch) => {
    setExportBatch(batch);
    setShowExportDetailDialog(true);
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
            disabled={!row.bulletins_count}
            className="gap-1"
          >
            <FileSpreadsheet className="h-4 w-4" />
            {row.status === 'exported' ? 'Re-exporter' : 'Export recap'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleExportDetailBatch(row)}
            disabled={!row.bulletins_count}
            className="gap-1"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Export detaille
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
          {!selectedBatch || selectedBatch.status === 'exported' ? (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center gap-4 py-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                    <AlertTriangle className="h-7 w-7 text-amber-600" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-lg font-semibold text-amber-900">
                      {selectedBatch?.status === 'exported' ? 'Lot deja exporte' : 'Aucun lot selectionne'}
                    </h3>
                    <p className="text-sm text-amber-700 max-w-md">
                      {selectedBatch?.status === 'exported'
                        ? 'Le lot actuel a ete exporte. Veuillez creer un nouveau lot pour continuer la saisie.'
                        : 'Vous devez selectionner une entreprise et creer un lot avant de pouvoir saisir un bulletin.'}
                    </p>
                  </div>
                  <Button className="mt-2" onClick={() => { setActiveTab('lots'); setShowBatchDialog(true); }}>
                    <FolderPlus className="mr-2 h-4 w-4" />
                    Creer un nouveau lot
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
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
                      <Label>Scan du bulletin</Label>
                      {selectedFiles.length > 0 ? (
                        <div className="space-y-3">
                          <FilePreviewList
                            files={selectedFiles}
                            onRemove={handleRemoveFile}
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              <Upload className="h-4 w-4 mr-2" />
                              Ajouter un fichier
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={analyzeWithOCR}
                              disabled={isAnalyzing}
                            >
                              {isAnalyzing ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Analyse en cours...
                                </>
                              ) : (
                                <>
                                  <ScanSearch className="h-4 w-4 mr-2" />
                                  Analyser avec IA
                                </>
                              )}
                            </Button>
                          </div>
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

                    {/* OCR Feedback Panel — shown after IA analysis, form is already filled */}
                    {ocrFeedback?.visible && (() => {
                      const adh = (ocrFeedback.donneesIa.infos_adherent || {}) as Record<string, string>;
                      const actes = (ocrFeedback.donneesIa.volet_medical || []) as Record<string, string>[];
                      const adhFields: [string, string][] = [
                        ['Nom/prenom', adh.nom_prenom],
                        ['N° adherent', adh.numero_adherent],
                        ['N° contrat', adh.numero_contrat],
                        ['N° bulletin', adh.numero_bulletin],
                        ['Adresse', adh.adresse],
                        ['Beneficiaire', adh.beneficiaire_coche],
                        ['Nom beneficiaire', adh.nom_beneficiaire],
                        ['Date signature', adh.date_signature],
                      ].filter(([, v]) => v && v.trim() !== '') as [string, string][];

                      const acteFieldLabels: Record<string, string> = {
                        type_soin: 'Type de soin',
                        date_acte: 'Date acte',
                        nature_acte: 'Nature acte',
                        montant_honoraires: 'Montant honoraires',
                        montant_facture: 'Montant facture',
                        nom_praticien: 'Praticien',
                        matricule_fiscale: 'Matricule fiscale',
                      };

                      return (
                      <div className="rounded-lg border-2 border-amber-300 bg-amber-50/50 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-amber-900 flex items-center gap-2">
                            <MessageSquare className="h-5 w-5" />
                            Feedback extraction IA
                          </h4>
                          <button
                            type="button"
                            onClick={() => setOcrFeedback(null)}
                            className="text-amber-400 hover:text-amber-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="text-sm text-amber-700">
                          Voici les donnees extraites. Cliquez sur un champ pour le signaler comme incorrect.
                        </p>

                        {/* Adherent extracted fields */}
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            Informations adherent
                          </p>
                          <div className="grid gap-1.5">
                            {adhFields.map(([label, value]) => (
                              <button
                                key={label}
                                type="button"
                                onClick={() => toggleFeedbackError(label)}
                                className={cn(
                                  'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-left transition-colors w-full',
                                  feedbackErrors.includes(label)
                                    ? 'bg-red-50 border-red-300'
                                    : 'bg-white border-gray-200 hover:border-amber-300'
                                )}
                              >
                                <span className="w-28 shrink-0 text-xs text-muted-foreground">{label}</span>
                                <span className={cn('flex-1 font-medium', feedbackErrors.includes(label) && 'line-through text-red-400')}>
                                  {value}
                                </span>
                                {feedbackErrors.includes(label)
                                  ? <ThumbsDown className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                  : <ThumbsUp className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Actes extracted fields */}
                        {actes.length > 0 && (
                          <div className="space-y-1.5">
                            <p className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                              <Stethoscope className="h-3.5 w-3.5" />
                              Volet medical
                            </p>
                            {actes.map((acte, acteIdx) => (
                              <div key={acteIdx} className="rounded-md border border-gray-200 bg-white p-2 space-y-1.5">
                                {acteIdx > 0 && <p className="text-[10px] text-muted-foreground">Acte {acteIdx + 1}</p>}
                                <div className="grid gap-1">
                                  {Object.entries(acteFieldLabels).map(([key, fieldLabel]) => {
                                    const val = acte[key];
                                    if (!val || val.trim() === '') return null;
                                    const errorKey = `acte${acteIdx}_${fieldLabel}`;
                                    return (
                                      <button
                                        key={key}
                                        type="button"
                                        onClick={() => toggleFeedbackError(errorKey)}
                                        className={cn(
                                          'flex items-center gap-2 rounded border px-2.5 py-1 text-sm text-left transition-colors w-full',
                                          feedbackErrors.includes(errorKey)
                                            ? 'bg-red-50 border-red-300'
                                            : 'bg-gray-50 border-gray-100 hover:border-amber-300'
                                        )}
                                      >
                                        <span className="w-28 shrink-0 text-xs text-muted-foreground">{fieldLabel}</span>
                                        <span className={cn('flex-1 font-medium', feedbackErrors.includes(errorKey) && 'line-through text-red-400')}>
                                          {val}
                                        </span>
                                        {feedbackErrors.includes(errorKey)
                                          ? <ThumbsDown className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                          : <ThumbsUp className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Comment */}
                        <Textarea
                          placeholder="Commentaire de correction (optionnel) — ex: le nom est inverse, le montant est 50 et non 500..."
                          value={feedbackComment}
                          onChange={(e) => setFeedbackComment(e.target.value)}
                          rows={2}
                          className="text-sm"
                        />

                        {/* Actions */}
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => sendOcrFeedback(feedbackErrors.length === 0 ? 'valide' : 'partiellement_valide')}
                            disabled={isSendingFeedback}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            {isSendingFeedback ? (
                              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <ThumbsUp className="mr-1.5 h-3.5 w-3.5" />
                            )}
                            {feedbackErrors.length === 0 ? 'Tout est correct' : `Valider avec ${feedbackErrors.length} erreur(s)`}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => sendOcrFeedback('invalide')}
                            disabled={isSendingFeedback}
                            className="border-red-300 text-red-600 hover:bg-red-50"
                          >
                            <ThumbsDown className="mr-1.5 h-3.5 w-3.5" />
                            Tout est faux
                          </Button>
                        </div>
                      </div>
                      );
                    })()}

                    {/* Numero + Date */}
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="space-y-2">
                        <Label>N° bulletin *</Label>
                        <Input {...register('bulletin_number')} placeholder="Ex: BS-2026-001" />
                        {errors.bulletin_number && (
                          <p className="text-sm text-destructive">{errors.bulletin_number.message}</p>
                        )}
                      </div>
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
                      {selectedCareType === 'pharmacy' && (
                        <div className="space-y-2">
                          <Label>Famille therapeutique</Label>
                          <Select
                            value={selectedMedicationFamily || undefined}
                            onValueChange={setSelectedMedicationFamily}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Toutes les familles" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">Toutes les familles</SelectItem>
                              {(medicationFamilies || []).map((f) => (
                                <SelectItem key={f.id} value={f.id}>
                                  {f.code} - {f.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      {selectedCareType === 'pharmacy' && selectedAdherentInfo && (
                        <div className="rounded-md border px-3 py-2 text-xs space-y-1 bg-blue-50/50">
                          <p className="font-medium text-blue-800 flex items-center gap-1">
                            <Pill className="h-3.5 w-3.5" />
                            Remboursement Frais Pharmaceutiques
                          </p>
                          {plafondPharmaOrdinaire ? (
                            <div className="flex justify-between text-blue-700">
                              <span>Maladie ordinaire : {Math.round((plafondPharmaOrdinaire.montantConsomme / 1000) * 1000) / 1000} / {(plafondPharmaOrdinaire.montantPlafond / 1000).toFixed(3)} DT</span>
                              <span className={plafondPharmaOrdinaire.pourcentageConsomme >= 80 ? 'text-red-600 font-semibold' : ''}>
                                Restant : {(plafondPharmaOrdinaire.montantRestant / 1000).toFixed(3)} DT
                              </span>
                            </div>
                          ) : plafondPharma ? (
                            <div className="flex justify-between text-blue-700">
                              <span>Consomme : {(plafondPharma.montantConsomme / 1000).toFixed(3)} / {(plafondPharma.montantPlafond / 1000).toFixed(3)} DT</span>
                              <span className={plafondPharma.pourcentageConsomme >= 80 ? 'text-red-600 font-semibold' : ''}>
                                Restant : {(plafondPharma.montantRestant / 1000).toFixed(3)} DT
                              </span>
                            </div>
                          ) : (
                            <p className="text-gray-500">Aucun plafond pharma configure</p>
                          )}
                          {plafondPharmaChronique && (
                            <div className="flex justify-between text-orange-700">
                              <span>Maladie chronique : {(plafondPharmaChronique.montantConsomme / 1000).toFixed(3)} / {(plafondPharmaChronique.montantPlafond / 1000).toFixed(3)} DT</span>
                              <span className={plafondPharmaChronique.pourcentageConsomme >= 80 ? 'text-red-600 font-semibold' : ''}>
                                Restant : {(plafondPharmaChronique.montantRestant / 1000).toFixed(3)} DT
                              </span>
                            </div>
                          )}
                        </div>
                      )}
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
                          {showAdherentDropdown && adherentSearch.length >= 2 && adherentResults && adherentResults.length === 0 && !selectedAdherentInfo && (
                            <div className="absolute z-50 w-full mt-1 bg-white border border-red-200 rounded-lg shadow-lg px-3 py-2">
                              <p className="text-sm text-red-600 flex items-center gap-1.5">
                                <Ban className="w-3.5 h-3.5" />
                                Aucun adherent trouve avec cette matricule
                              </p>
                            </div>
                          )}
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
                                  {a.contractType && (
                                    <span className="ml-2 text-xs text-blue-500">
                                      [{a.contractType === 'individual' ? 'Individuel' : a.contractType === 'family' ? 'Famille' : 'Groupe'}]
                                    </span>
                                  )}
                                </button>
                              ))}
                            </div>
                          )}
                          {selectedAdherentInfo && (
                            <div className="text-xs text-green-600 flex items-center gap-1 mt-1">
                              <Check className="w-3 h-3" />
                              {selectedAdherentInfo.firstName} {selectedAdherentInfo.lastName}
                              {selectedAdherentInfo.contractType && (
                                <Badge variant="outline" className="ml-1 text-[10px] px-1.5 py-0">
                                  {selectedAdherentInfo.contractType === 'individual' ? 'Individuel' :
                                   selectedAdherentInfo.contractType === 'family' ? 'Famille' : 'Groupe'}
                                </Badge>
                              )}
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
                          <Label>N° Contrat</Label>
                          <Input {...register('adherent_contract_number')} placeholder="N° contrat assurance" />
                        </div>
                        <div className="space-y-2">
                          <Label>CIN</Label>
                          <Input {...register('adherent_national_id')} placeholder="12345678" />
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
                      <div className="space-y-2">
                        <Label>Adresse</Label>
                        <Input {...register('adherent_address')} placeholder="Adresse de l'adherent" />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Email adherent</Label>
                          <Input {...register('adherent_email')} type="email" placeholder="adherent@email.tn" />
                          {errors.adherent_email && (
                            <p className="text-sm text-destructive">{errors.adherent_email.message}</p>
                          )}
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          {selectedAdherentInfo && familleData && (familleData.conjoint || familleData.enfants.length > 0) && (
                            <>
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  id="is_ayant_droit"
                                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  checked={!!watch('beneficiary_name')}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      // Set a placeholder to show the family members list
                                      const first = familleData?.conjoint || familleData?.enfants?.[0];
                                      if (first) setValue('beneficiary_name', `${first.firstName} ${first.lastName}`);
                                    } else {
                                      setValue('beneficiary_name', '');
                                    }
                                  }}
                                />
                                <Label htmlFor="is_ayant_droit" className="cursor-pointer">Soins pour un ayant droit</Label>
                              </div>
                              {watch('beneficiary_name') !== '' && watch('beneficiary_name') !== undefined && (
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {familleData.conjoint && (
                                    <button
                                      type="button"
                                      onClick={() => setValue('beneficiary_name', `${familleData.conjoint!.firstName} ${familleData.conjoint!.lastName}`)}
                                      className={cn(
                                        'px-3 py-1.5 rounded-lg border text-sm transition-colors',
                                        watch('beneficiary_name') === `${familleData.conjoint.firstName} ${familleData.conjoint.lastName}`
                                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                                          : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                                      )}
                                    >
                                      {familleData.conjoint.firstName} {familleData.conjoint.lastName}
                                      <span className="ml-1 text-xs text-gray-400">Conjoint(e)</span>
                                    </button>
                                  )}
                                  {familleData.enfants.map((enfant) => (
                                    <button
                                      key={enfant.id}
                                      type="button"
                                      onClick={() => setValue('beneficiary_name', `${enfant.firstName} ${enfant.lastName}`)}
                                      className={cn(
                                        'px-3 py-1.5 rounded-lg border text-sm transition-colors',
                                        watch('beneficiary_name') === `${enfant.firstName} ${enfant.lastName}`
                                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                                          : 'border-gray-200 hover:bg-gray-50 text-gray-700'
                                      )}
                                    >
                                      {enfant.firstName} {enfant.lastName}
                                      <span className="ml-1 text-xs text-gray-400">Enfant</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actes medicaux */}
                    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium flex items-center gap-2">
                          {selectedCareType === 'pharmacy' ? <Pill className="h-4 w-4" /> :
                           selectedCareType === 'consultation' ? <Stethoscope className="h-4 w-4" /> :
                           selectedCareType === 'lab' ? <FlaskConical className="h-4 w-4" /> :
                           <Building2 className="h-4 w-4" />}
                          {selectedCareType === 'pharmacy' ? 'Medicaments *' :
                           selectedCareType === 'consultation' ? 'Consultations / Visites *' :
                           selectedCareType === 'lab' ? 'Analyses *' :
                           'Frais d\'hospitalisation *'}
                        </h4>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => appendActe({ code: '', label: '', amount: 0, ref_prof_sant: '', nom_prof_sant: '', care_description: '', cod_msgr: '', lib_msgr: '' })}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Ajouter un acte
                        </Button>
                      </div>

                      {errors.actes?.root && (
                        <p className="text-sm text-destructive">{errors.actes.root.message}</p>
                      )}

                      {actesFields.map((field, index) => (
                        <div key={field.id} className="space-y-2 rounded-md border bg-background p-3">
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              {selectedCareType === 'pharmacy' ? (
                                <Select
                                  value={watch(`actes.${index}.code`) || undefined}
                                  onValueChange={(codePct) => {
                                    const med = (medications || []).find((m) => m.code_pct === codePct);
                                    if (med) {
                                      setValue(`actes.${index}.code`, med.code_pct);
                                      const reimbLabel = med.is_reimbursable ? `[R ${Math.round((med.reimbursement_rate || 0.7) * 100)}%]` : '[NR]';
                                      setValue(`actes.${index}.label`, `${med.brand_name} - ${med.dci} ${med.dosage || ''} ${med.form || ''} ${reimbLabel}`.trim());
                                      if (med.price_public) {
                                        setValue(`actes.${index}.amount`, med.price_public / 1000);
                                      }
                                    }
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selectionner un medicament" />
                                  </SelectTrigger>
                                  <SelectContent className="max-h-80 overflow-y-auto" position="popper" sideOffset={4}>
                                    {(medications || []).map((med) => (
                                      <SelectItem key={med.id} value={med.code_pct}>
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium">{med.brand_name}</span>
                                          <span className="text-xs text-muted-foreground">{med.dci}</span>
                                          {med.dosage && <span className="text-xs text-muted-foreground">- {med.dosage}</span>}
                                          {med.is_generic ? <span className="text-[10px] px-1 bg-blue-100 text-blue-700 rounded">GEN</span> : null}
                                          {med.is_reimbursable ? (
                                            <span className="text-[10px] px-1 bg-green-100 text-green-700 rounded">
                                              R {Math.round((med.reimbursement_rate || 0.7) * 100)}%
                                            </span>
                                          ) : (
                                            <span className="text-[10px] px-1 bg-red-100 text-red-600 rounded">Non remb.</span>
                                          )}
                                        </div>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <ActeSelector
                                  value={watch(`actes.${index}.code`) || ''}
                                  onChange={(code, acte) => {
                                    setValue(`actes.${index}.code`, code);
                                    setValue(`actes.${index}.label`, acte.label);
                                  }}
                                />
                              )}
                              {errors.actes?.[index]?.label && (
                                <p className="text-xs text-destructive mt-1">{errors.actes[index].label?.message}</p>
                              )}
                              {selectedCareType === 'pharmacy' && watch(`actes.${index}.code`) && (() => {
                                const selectedMed = (medications || []).find((m) => m.code_pct === watch(`actes.${index}.code`));
                                if (!selectedMed) return null;
                                const amount = watch(`actes.${index}.amount`) || 0;
                                if (selectedMed.is_reimbursable) {
                                  const taux = selectedMed.reimbursement_rate || 0.7;
                                  const montantRembourse = amount * taux;
                                  const ticketModerateur = amount - montantRembourse;
                                  return (
                                    <div className="mt-1 flex items-center gap-3 text-[11px]">
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-700 rounded border border-green-200">
                                        <CheckCircle2 className="h-3 w-3" />
                                        Remboursable {Math.round(taux * 100)}%
                                      </span>
                                      {amount > 0 && (
                                        <>
                                          <span className="text-gray-500">PEC : {montantRembourse.toFixed(3)} DT</span>
                                          <span className="text-gray-500">TM : {ticketModerateur.toFixed(3)} DT</span>
                                        </>
                                      )}
                                    </div>
                                  );
                                }
                                return (
                                  <div className="mt-1 flex items-center gap-1 text-[11px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded border border-red-200 w-fit">
                                    <Ban className="h-3 w-3" />
                                    Non remboursable — a la charge de l'adherent
                                  </div>
                                );
                              })()}
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
                          {/* Champs specifiques par type de soin */}
                          {selectedCareType === 'pharmacy' ? (
                            <>
                              {/* Pharmacie: pharmacien + quantite */}
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div>
                                  <Label className="text-xs font-medium">Pharmacien *</Label>
                                  <Input
                                    {...register(`actes.${index}.nom_prof_sant`)}
                                    placeholder="Nom de la pharmacie"
                                    className="h-8 text-sm"
                                  />
                                  {errors.actes?.[index]?.nom_prof_sant && (
                                    <p className="text-xs text-destructive mt-1">{errors.actes[index].nom_prof_sant?.message}</p>
                                  )}
                                </div>
                                <div>
                                  <Label className="text-xs font-medium">Matricule fiscale *</Label>
                                  <Input
                                    {...register(`actes.${index}.ref_prof_sant`)}
                                    placeholder="Matricule fiscale pharmacie"
                                    className="h-8 text-sm"
                                  />
                                  {errors.actes?.[index]?.ref_prof_sant && (
                                    <p className="text-xs text-destructive mt-1">{errors.actes[index].ref_prof_sant?.message}</p>
                                  )}
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Observation</Label>
                                <Input
                                  {...register(`actes.${index}.lib_msgr`)}
                                  placeholder="Observation (ex: ordonnance n°...)"
                                  className="h-8 text-sm"
                                />
                              </div>
                            </>
                          ) : selectedCareType === 'consultation' ? (
                            <>
                              {/* Consultation: medecin */}
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div>
                                  <Label className="text-xs font-medium">Medecin *</Label>
                                  <Input
                                    {...register(`actes.${index}.nom_prof_sant`)}
                                    placeholder="Dr. Mohamed Ali"
                                    className="h-8 text-sm"
                                  />
                                  {errors.actes?.[index]?.nom_prof_sant && (
                                    <p className="text-xs text-destructive mt-1">{errors.actes[index].nom_prof_sant?.message}</p>
                                  )}
                                </div>
                                <div>
                                  <Label className="text-xs font-medium">Matricule fiscale *</Label>
                                  <Input
                                    {...register(`actes.${index}.ref_prof_sant`)}
                                    placeholder="Matricule fiscale du medecin"
                                    className="h-8 text-sm"
                                  />
                                  {errors.actes?.[index]?.ref_prof_sant && (
                                    <p className="text-xs text-destructive mt-1">{errors.actes[index].ref_prof_sant?.message}</p>
                                  )}
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Description de soins</Label>
                                <Input
                                  {...register(`actes.${index}.care_description`)}
                                  placeholder="Motif de consultation"
                                  className="h-8 text-sm"
                                />
                              </div>
                            </>
                          ) : selectedCareType === 'lab' ? (
                            <>
                              {/* Analyses: laboratoire */}
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div>
                                  <Label className="text-xs font-medium">Laboratoire *</Label>
                                  <Input
                                    {...register(`actes.${index}.nom_prof_sant`)}
                                    placeholder="Nom du laboratoire"
                                    className="h-8 text-sm"
                                  />
                                  {errors.actes?.[index]?.nom_prof_sant && (
                                    <p className="text-xs text-destructive mt-1">{errors.actes[index].nom_prof_sant?.message}</p>
                                  )}
                                </div>
                                <div>
                                  <Label className="text-xs font-medium">Matricule fiscale *</Label>
                                  <Input
                                    {...register(`actes.${index}.ref_prof_sant`)}
                                    placeholder="Matricule fiscale du labo"
                                    className="h-8 text-sm"
                                  />
                                  {errors.actes?.[index]?.ref_prof_sant && (
                                    <p className="text-xs text-destructive mt-1">{errors.actes[index].ref_prof_sant?.message}</p>
                                  )}
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground">Prescription medicale</Label>
                                <Input
                                  {...register(`actes.${index}.care_description`)}
                                  placeholder="Ref. ordonnance ou prescription"
                                  className="h-8 text-sm"
                                />
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Hospitalisation: clinique/hopital */}
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div>
                                  <Label className="text-xs font-medium">Etablissement *</Label>
                                  <Input
                                    {...register(`actes.${index}.nom_prof_sant`)}
                                    placeholder="Clinique / Hopital"
                                    className="h-8 text-sm"
                                  />
                                  {errors.actes?.[index]?.nom_prof_sant && (
                                    <p className="text-xs text-destructive mt-1">{errors.actes[index].nom_prof_sant?.message}</p>
                                  )}
                                </div>
                                <div>
                                  <Label className="text-xs font-medium">Matricule fiscale *</Label>
                                  <Input
                                    {...register(`actes.${index}.ref_prof_sant`)}
                                    placeholder="Matricule fiscale etablissement"
                                    className="h-8 text-sm"
                                  />
                                  {errors.actes?.[index]?.ref_prof_sant && (
                                    <p className="text-xs text-destructive mt-1">{errors.actes[index].ref_prof_sant?.message}</p>
                                  )}
                                </div>
                              </div>
                              <div className="grid gap-2 sm:grid-cols-2">
                                <div>
                                  <Label className="text-xs text-muted-foreground">Description du sejour</Label>
                                  <Input
                                    {...register(`actes.${index}.care_description`)}
                                    placeholder="Motif d'hospitalisation"
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-muted-foreground">Observation</Label>
                                  <Input
                                    {...register(`actes.${index}.lib_msgr`)}
                                    placeholder="Observation"
                                    className="h-8 text-sm"
                                  />
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      ))}

                      <div className="flex justify-end border-t pt-3">
                        <p className="text-lg font-bold">
                          Total : {formatAmount(actesTotal)}
                        </p>
                      </div>
                    </div>

                    <Button type="submit" className="w-full" disabled={isSubmitting}>
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

              {selectedAdherentInfo && plafondsData && (
                <PlafondsCard
                  global={plafondsData.global}
                  parFamille={plafondsData.parFamille}
                  totalConsomme={plafondsData.totalConsomme}
                  totalPlafond={plafondsData.totalPlafond}
                />
              )}

              {selectedAdherentInfo && familleData && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Famille</CardTitle>
                    <CardDescription className="text-xs">
                      Adherent principal et ayants droit
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <FamilleTable
                      principal={familleData.principal}
                      conjoint={familleData.conjoint}
                      enfants={familleData.enfants}
                    />
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
          )}
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
            <AlertDialogTitle>
              {exportBatch?.status === 'exported' ? 'Re-exporter le lot en CSV' : 'Exporter le lot en CSV'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {exportBatch?.status === 'exported' ? (
                <>Ce lot a deja ete exporte. Voulez-vous re-exporter "{exportBatch?.name}" ?</>
              ) : (
                <>Voulez-vous exporter le lot "{exportBatch?.name}" ?</>
              )}
              <br />
              <span className="font-medium">{exportBatch?.bulletins_count} bulletins</span> pour un total de <span className="font-medium">{formatAmount(exportBatch?.total_amount || 0)}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => exportBatch && exportBatchMutation.mutate({
                batchId: exportBatch.id,
                force: exportBatch.status === 'exported',
              })}
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
                  {exportBatch?.status === 'exported' ? 'Re-exporter CSV' : 'Telecharger CSV'}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Export Detail Dialog */}
      <AlertDialog open={showExportDetailDialog} onOpenChange={setShowExportDetailDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Exporter le bordereau detaille
            </AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous telecharger le bordereau detaille du lot "{exportBatch?.name}" ?
              <br />
              Ce fichier contient toutes les lignes d&apos;actes avec les codes, montants engages et rembourses.
              <br />
              <span className="font-medium">{exportBatch?.bulletins_count} bulletins</span> pour un total de <span className="font-medium">{formatAmount(exportBatch?.total_amount || 0)}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => exportBatch && exportDetailMutation.mutate({
                batchId: exportBatch.id,
              })}
              disabled={exportDetailMutation.isPending}
            >
              {exportDetailMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Export...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Telecharger detaille
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
                  <p className="font-medium">{viewBulletin.provider_name || '—'}</p>
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
