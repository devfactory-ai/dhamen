import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useDropdownPortal } from '@/hooks/useDropdownPortal';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FilterDropdown, FilterOption } from '@/components/ui/filter-dropdown';
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
import { Tabs, TabsContent } from '@/components/ui/tabs';
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
import { usePermissions } from '@/hooks/usePermissions';
import { ActeSelector } from '@/features/agent/bulletins/components/ActeSelector';
import { MedicationAutocomplete } from '@/features/bulletins/components/medication-autocomplete';
import { MfLookupInput } from '@/features/bulletins/components/mf-lookup-input';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import {
  FileText,
  Upload,
  Download,
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
  Package,
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
  ChevronLeft,
  ChevronRight,
  XCircle,
  UserPlus,
  Heart,
  Baby,
  Lock,
  ClipboardList,
  ShieldCheck,
} from 'lucide-react';
import { FloatingHelp } from '@/components/ui/floating-help';


// --- OCR Feedback types ---
interface OcrFeedbackState {
  /** Raw donnees_ia from OCR API — sent back as-is for feedback */
  donneesIa: Record<string, unknown>;
  /** Whether the feedback panel is visible */
  visible: boolean;
}

/** Single bulletin parsed from OCR (one item in donnees_ia array) */
interface OcrBulletinItem {
  infos_adherent: Record<string, unknown>;
  volet_medical: Array<Record<string, unknown>>;
  numero_bulletin?: string;
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
  status: 'draft' | 'in_batch' | 'exported' | 'soumis' | 'en_examen' | 'approuve' | 'rejete' | 'paye' | 'approved' | 'rejected';
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
  approved: { label: 'Validé', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  rejected: { label: 'Rejeté', variant: 'destructive' },
  soumis: { label: 'Soumis', variant: 'default' },
  en_examen: { label: 'En examen', variant: 'default', className: 'bg-yellow-500 hover:bg-yellow-600' },
  approuve: { label: 'Approuvé', variant: 'default', className: 'bg-green-600 hover:bg-green-700' },
  rejete: { label: 'Rejeté', variant: 'destructive' },
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
  code: z.string().optional().or(z.literal('')),
  label: z.string().min(1, 'Libelle requis'),
  amount: z.number().positive('Montant > 0'),
  ref_prof_sant: z.string().min(1, 'Matricule fiscale du praticien requis'),
  nom_prof_sant: z.string().optional().or(z.literal('')),
  provider_id: z.string().optional(),
  care_type: z.enum(['consultation', 'pharmacy', 'lab', 'hospital']),
  care_description: z.string().optional(),
  cod_msgr: z.string().optional(),
  lib_msgr: z.string().optional(),
});

const bulletinFormSchema = z.object({
  bulletin_number: z.string().min(1, 'Numéro de bulletin requis'),
  bulletin_date: z.string().min(1, 'Date requise'),
  adherent_matricule: z.string().min(1, 'Matricule requis'),
  adherent_first_name: z.string().optional().or(z.literal('')),
  adherent_last_name: z.string().optional().or(z.literal('')),
  adherent_contract_number: z.string().optional(),
  adherent_national_id: z.string().optional().or(z.literal('')),
  adherent_email: z.string().email('Email invalide').optional().or(z.literal('')),
  adherent_address: z.string().optional(),
  adherent_date_of_birth: z.string().optional().or(z.literal('')),
  beneficiary_name: z.string().optional(),
  beneficiary_id: z.string().optional(),
  beneficiary_relationship: z.enum(['self', 'spouse', 'child']).optional(),
  beneficiary_email: z.string().email('Email invalide').optional().or(z.literal('')),
  beneficiary_address: z.string().optional().or(z.literal('')),
  beneficiary_date_of_birth: z.string().optional().or(z.literal('')),
  care_type: z.enum(['consultation', 'pharmacy', 'lab', 'hospital']).optional(),
  actes: z.array(acteFormSchema).min(1, 'Au moins un acte requis'),
});

type BulletinFormData = z.infer<typeof bulletinFormSchema>;

// Map OCR nature_acte to referentiel codes (C1, C2, PH1, etc.)
const NATURE_ACTE_MAPPINGS: { keywords: string[]; code: string; label: string }[] = [
  { keywords: ['generaliste', 'médecin général', 'médecin de famille'], code: 'C1', label: 'Consultation généraliste' },
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
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission('bulletins_soins', 'create');
  const canUpdate = hasPermission('bulletins_soins', 'update');
  const canDelete = hasPermission('bulletins_soins', 'delete');

  const queryClient = useQueryClient();
  const { selectedCompany, selectedBatch, setBatch } = useAgentContext();
  const [searchParams] = useSearchParams();
  const initialTab = useMemo(() => searchParams.get('tab') || 'saisie', []);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBulletins, setSelectedBulletins] = useState<string[]>([]);
  const [bulkDeleteBulletinConfirm, setBulkDeleteBulletinConfirm] = useState(false);
  const [bulkDeleteBatchConfirm, setBulkDeleteBatchConfirm] = useState(false);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showExportDetailDialog, setShowExportDetailDialog] = useState(false);
  const [exportBatch, setExportBatch] = useState<Batch | null>(null);
  const [newBatchName, setNewBatchName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [batchSearch, setBatchSearch] = useState("");
  const [batchStatusFilter, setBatchStatusFilter] = useState("all");
  const [batchStatusDropdownOpen, setBatchStatusDropdownOpen] = useState(false);
  const [batchPage, setBatchPage] = useState(1);
  const BATCH_PAGE_SIZE = 10;
  const isIndividualMode = selectedCompany?.id === '__INDIVIDUAL__';
  const [adherentSearch, setAdherentSearch] = useState("");
  const [showAdherentDropdown, setShowAdherentDropdown] = useState(false);
  const adherentDropdownVisible = showAdherentDropdown && adherentSearch.length >= 2;
  const { triggerRef: adherentPortalRef, position: adherentPortalPos } = useDropdownPortal(adherentDropdownVisible);
  const [selectedAdherentInfo, setSelectedAdherentInfo] =
    useState<AdherentSearchResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showValidateDialog, setShowValidateDialog] = useState(false);
  const [validateBulletinTarget, setValidateBulletinTarget] =
    useState<BulletinDetail | null>(null);
  const [validateNotes, setValidateNotes] = useState("");
  const validateMutation = useBulletinValidation();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [bulletinNumberFromOcr, setBulletinNumberFromOcr] = useState(false);
  const [showScanPreview, setShowScanPreview] = useState(false);
  const [ocrFeedback, setOcrFeedback] = useState<OcrFeedbackState | null>(null);
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [feedbackErrors, setFeedbackErrors] = useState<string[]>([]);
  const [feedbackComment, setFeedbackComment] = useState("");

  // Multi-bulletin OCR state
  const [ocrBulletins, setOcrBulletins] = useState<OcrBulletinItem[]>([]);
  const [activeBulletinIndex, setActiveBulletinIndex] = useState(0);
  const [savedBulletinIndices, setSavedBulletinIndices] = useState<Set<number>>(new Set());
  /** Snapshot of form data for each saved bulletin (for readonly display) */
  const [savedBulletinSnapshots, setSavedBulletinSnapshots] = useState<Record<number, BulletinFormData>>({});
  /** Whether the active bulletin is in readonly mode (already saved) */
  const isActiveBulletinSaved = savedBulletinIndices.has(activeBulletinIndex);
  /** State for adding ayant droit inline */
  const [isAddingAyantDroit, setIsAddingAyantDroit] = useState(false);
  const [ayantDroitForm, setAyantDroitForm] = useState<{
    firstName: string; lastName: string; dateOfBirth: string; email: string; gender: string;
  }>({ firstName: '', lastName: '', dateOfBirth: '', email: '', gender: '' });

  const { data: adherentResults } = useSearchAdherents(adherentSearch);
  const { data: familleData } = useAdherentFamille(selectedAdherentInfo?.id);
  const { data: plafondsData } = useAdherentPlafonds(selectedAdherentInfo?.id);

  // Auto-select adherent when search results contain an exact matricule match
  useEffect(() => {
    if (!adherentResults || selectedAdherentInfo) return;
    const matricule = watch("adherent_matricule");
    if (!matricule) return;
    const match = (adherentResults as AdherentSearchResult[] | undefined)?.find(
      (a) => a.matricule === matricule,
    );
    if (match) {
      setSelectedAdherentInfo(match);
      setValue("adherent_first_name", match.firstName || "");
      setValue("adherent_last_name", match.lastName || "");
      if (match.email) setValue("adherent_email", match.email);
      // Auto-select "self" as default bénéficiaire when adherent is found
      if (!watch("beneficiary_relationship")) {
        setValue("beneficiary_relationship", "self");
      }
      setShowAdherentDropdown(false);
    }
  }, [adherentResults]);

  // Extract pharmacy plafond (FA0003 = Frais pharmaceutiques) from adherent plafonds
  const plafondPharma = plafondsData?.parFamille?.find(
    (p) => p.familleCode === "FA0003",
  );
  const plafondPharmaChronique = plafondsData?.parFamille?.find(
    (p) => p.familleCode === "FA0003" && p.typeMaladie === "chronique",
  );
  const plafondPharmaOrdinaire = plafondsData?.parFamille?.find(
    (p) => p.familleCode === "FA0003" && p.typeMaladie === "ordinaire",
  );
  const [selectedMedicationFamily, setSelectedMedicationFamily] =
    useState<string>("");
  const [mfStatuses, setMfStatuses] = useState<
    Record<
      number,
      import("@/features/bulletins/components/mf-lookup-input").MfStatus
    >
  >({});

  // State for inline adherent registration
  const [isRegisteringAdherent, setIsRegisteringAdherent] = useState(false);

  // State for newly registered practitioners popup
  const [newPractitioners, setNewPractitioners] = useState<string[]>([]);
  const [showNewPractitionersDialog, setShowNewPractitionersDialog] =
    useState(false);

  // OCR-extracted praticien info per acte (from tampon/stamp analysis)
  const [ocrPraticienInfos, setOcrPraticienInfos] = useState<
    Record<
      number,
      {
        nom: string;
        mf: string;
        specialite?: string;
        adresse?: string;
        telephone?: string;
      }
    >
  >({});
  // Checkbox: auto-register new praticien on submit (per acte index)
  const [autoRegisterPraticien, setAutoRegisterPraticien] = useState<
    Record<number, boolean>
  >({});

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
      bulletin_date: new Date().toISOString().split("T")[0],
      actes: [
        {
          code: "",
          label: "",
          amount: 0,
          ref_prof_sant: "",
          nom_prof_sant: "",
          care_type: "consultation" as const,
          care_description: "",
          cod_msgr: "",
          lib_msgr: "",
        },
      ],
    },
  });

  const {
    fields: actesFields,
    append: appendActe,
    remove: removeActe,
  } = useFieldArray({
    control,
    name: "actes",
  });

  const watchedActes = watch("actes");
  const actesTotal = (watchedActes || []).reduce(
    (sum, a) => sum + (Number(a.amount) || 0),
    0,
  );

  // Pre-fill ayantDroitForm from OCR-detected beneficiary name
  const watchedBenefName = watch("beneficiary_name");
  useEffect(() => {
    if (watchedBenefName && selectedAdherentInfo) {
      const parts = watchedBenefName.trim().split(/\s+/);
      if (parts.length >= 2) {
        setAyantDroitForm((prev) => ({
          ...prev,
          lastName: parts[0]!,
          firstName: parts.slice(1).join(" "),
        }));
      } else if (parts.length === 1) {
        setAyantDroitForm((prev) => ({ ...prev, firstName: parts[0]!, lastName: '' }));
      }
    }
  }, [watchedBenefName, selectedAdherentInfo]);

  // Estimate reimbursement in real-time
  const watchedMatricule = watch("adherent_matricule");
  const watchedBulletinDate = watch("bulletin_date");
  const estimateKey = JSON.stringify((watchedActes || []).map(a => ({ code: a.code, amount: Number(a.amount) || 0, care_type: a.care_type })));
  const { data: estimateData } = useQuery({
    queryKey: ['estimate-reimbursement', watchedMatricule, watchedBulletinDate, estimateKey],
    queryFn: async () => {
      const actes = (watchedActes || []).filter(a => a.code && Number(a.amount) > 0).map(a => ({ code: a.code, amount: Number(a.amount), care_type: a.care_type }));
      if (!actes.length) return null;
      const res = await apiClient.post<{ reimbursed_amount: number | null; details: Array<{ code: string; reimbursed: number }>; warning?: string }>('/bulletins-soins/agent/estimate', {
        adherent_matricule: watchedMatricule,
        bulletin_date: watchedBulletinDate,
        actes,
      });
      return res.success ? res.data : null;
    },
    enabled: !!watchedMatricule && watchedMatricule.length >= 2 && actesTotal > 0 && !!watchedBulletinDate,
    staleTime: 5000,
  });
  const estimatedReimbursement = estimateData?.reimbursed_amount;

  // care_type is now per-acte; derive "primary" care type from first acte for medication families query
  const selectedCareType = watchedActes?.[0]?.care_type || "consultation";
  // Check if any acte is pharmacy type (for medication families fetch)
  const hasPharmacyActe = watchedActes?.some((a) => a.care_type === "pharmacy");

  // Check if any MF is invalid or errored — blocks submit
  // Allowed (non-blocking) statuses: 'found', 'registered', 'not_found', 'forced', 'idle' (not yet checked)
  // Blocking statuses: 'loading' (in progress), 'invalid', 'error'
  const MF_BLOCKING_STATUSES: import("@/features/bulletins/components/mf-lookup-input").MfStatus[] =
    ["loading", "invalid", "error"];
  const hasMfBlocking =
    watchedActes?.length > 0 &&
    watchedActes.some((_a, idx) => {
      const mfValue = _a?.ref_prof_sant?.trim();
      if (!mfValue) return true; // MF vide = bloquant
      const status = mfStatuses[idx];
      return status && MF_BLOCKING_STATUSES.includes(status);
    });
  const mfBlockingReason = (() => {
    if (!hasMfBlocking) return null;
    // Check if any acte has empty MF
    if (watchedActes?.some((_a) => !_a?.ref_prof_sant?.trim()))
      return "Matricule fiscale du praticien requis";
    const statuses = watchedActes?.map((_a, idx) => mfStatuses[idx]);
    if (statuses?.some((s) => s === "invalid"))
      return "Matricule fiscale invalide";
    if (statuses?.some((s) => s === "error"))
      return "Erreur de vérification MF";
    if (statuses?.some((s) => s === "loading"))
      return "Vérification MF en cours...";
    return "Matricule fiscale requis";
  })();

  // Check if beneficiary selection is invalid (conjoint/enfant selected but not registered)
  // Only block when adherent IS identified but family member is missing
  const watchedBeneficiaryRel = watch("beneficiary_relationship");
  const hasBeneficiaryBlocking = (() => {
    if (!selectedAdherentInfo) return false; // Don't block when adherent not identified
    if (watchedBeneficiaryRel === "spouse" && !familleData?.conjoint)
      return true;
    if (
      watchedBeneficiaryRel === "child" &&
      (!familleData?.enfants || familleData.enfants.length === 0)
    )
      return true;
    return false;
  })();

  // Fetch medication families for pharmacy care type
  const { data: medicationFamilies } = useQuery({
    queryKey: ["medication-families"],
    queryFn: async () => {
      const response = await apiClient.get<{
        families: { id: string; code: string; name: string }[];
      }>("/medications/families");
      if (!response.success) return [];
      return response.data?.families || [];
    },
    enabled: !!hasPharmacyActe,
  });

  // Fetch bulletins (drafts and in_batch) for current batch & company
  const { data: bulletinsData, isLoading: loadingBulletins } = useQuery({
    queryKey: ["agent-bulletins", selectedCompany?.id, selectedBatch?.id, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("status", "draft,in_batch,approved,rejected");
      if (selectedCompany) params.append("companyId", selectedCompany.id);
      if (selectedBatch) params.append("batchId", selectedBatch.id);
      if (searchQuery) params.append("search", searchQuery);

      const response = await apiClient.get<BulletinSaisie[]>(
        `/bulletins-soins/agent?${params}`,
      );
      if (!response.success) throw new Error(response.error?.message);
      return response.data || [];
    },
    enabled: !!selectedCompany,
  });

  // Fetch batches for the selected company (paginated)
  const { data: batchesResponse, isLoading: loadingBatches } = useQuery({
    queryKey: [
      "agent-batches",
      selectedCompany?.id,
      batchStatusFilter,
      batchSearch,
      batchPage,
    ],
    queryFn: async () => {
      if (!selectedCompany)
        return {
          data: [] as Batch[],
          meta: { page: 1, limit: BATCH_PAGE_SIZE, total: 0, totalPages: 1 },
        };
      const params = new URLSearchParams({
        companyId: selectedCompany.id,
        status: batchStatusFilter,
        page: String(batchPage),
        limit: String(BATCH_PAGE_SIZE),
      });
      if (batchSearch) params.append("search", batchSearch);
      const response = await apiClient.get<Batch[]>(
        `/bulletins-soins/agent/batches?${params.toString()}`,
      );
      if (!response.success) throw new Error(response.error?.message);
      return {
        data: (response.data || []) as Batch[],
        meta: (
          response as unknown as {
            meta?: {
              page: number;
              limit: number;
              total: number;
              totalPages: number;
            };
          }
        ).meta || { page: 1, limit: BATCH_PAGE_SIZE, total: 0, totalPages: 1 },
      };
    },
    enabled: !!selectedCompany,
  });
  const batchesData = batchesResponse?.data || [];
  const batchesMeta = batchesResponse?.meta || {
    page: 1,
    limit: BATCH_PAGE_SIZE,
    total: 0,
    totalPages: 1,
  };

  // Submit bulletin mutation
  const submitMutation = useMutation({
    mutationFn: async (data: { formData: BulletinFormData; files: File[] }) => {
      const form = new FormData();

      Object.entries(data.formData).forEach(([key, value]) => {
        if (key === "actes") return; // handled separately
        if (value !== undefined && value !== "") {
          form.append(key, String(value));
        }
      });

      // Send actes as JSON array
      form.append("actes", JSON.stringify(data.formData.actes));

      // Attach batch_id and company_id from agent context
      if (selectedBatch) {
        form.append("batch_id", selectedBatch.id);
      }
      if (selectedCompany) {
        form.append("company_id", selectedCompany.id);
      }

      data.files.forEach((file, index) => {
        form.append(`scan_${index}`, file);
      });

      const result = await apiClient.upload<{ warnings?: string[] }>('/bulletins-soins/agent/create', form);
      if (!result.success) {
        throw new Error(result.error?.message || "Erreur lors de la saisie");
      }
      return { success: result.success, data: result.data };
    },
    onSuccess: (result: { success: boolean; data?: { warnings?: string[] } }) => {
      queryClient.invalidateQueries({ queryKey: ["agent-bulletins"] });
      const responseWarnings = result?.data?.warnings;

      // Multi-bulletin mode: mark current as saved and auto-advance
      if (ocrBulletins.length > 1) {
        // Snapshot current form data for readonly display
        const currentFormData = watch();
        setSavedBulletinSnapshots((prev) => ({ ...prev, [activeBulletinIndex]: { ...currentFormData } as BulletinFormData }));

        const newSaved = new Set(savedBulletinIndices);
        newSaved.add(activeBulletinIndex);
        setSavedBulletinIndices(newSaved);

        // Find next unsaved bulletin
        const nextUnsaved = ocrBulletins.findIndex((_, i) => i !== activeBulletinIndex && !newSaved.has(i));

        if (nextUnsaved !== -1) {
          if (responseWarnings && responseWarnings.length > 0) {
            toast.warning(responseWarnings[0] || "Attention: remboursement approximatif");
          } else {
            toast.success(`Bulletin ${activeBulletinIndex + 1}/${ocrBulletins.length} enregistré — passage au suivant`);
          }
          // Auto-switch to next unsaved bulletin
          handleSwitchBulletin(nextUnsaved);
          return;
        }

        // All bulletins saved
        toast.success(`Tous les ${ocrBulletins.length} bulletins ont été enregistrés !`);
      } else {
        if (responseWarnings && responseWarnings.length > 0) {
          toast.warning(responseWarnings[0] || "Attention: remboursement approximatif");
        } else {
          toast.success("Bulletin saisi avec succès!");
        }
      }

      // Full cleanup
      reset();
      setSelectedFiles([]);
      setSelectedAdherentInfo(null);
      setAdherentSearch("");
      setShowAdherentDropdown(false);
      setSelectedMedicationFamily("");
      setOcrFeedback(null);
      setMfStatuses({});
      setOcrPraticienInfos({});
      setAutoRegisterPraticien({});
      setFeedbackErrors([]);
      setFeedbackComment("");
      setOcrBulletins([]);
      setSavedBulletinIndices(new Set());
      setSavedBulletinSnapshots({});
      setActiveBulletinIndex(0);
      setActiveTab("liste");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erreur lors de la saisie");
    },
  });

  // Create batch mutation
  const createBatchMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      bulletinIds: string[];
      companyId: string;
    }): Promise<{
      id: string;
      name: string;
      companyId: string;
      status: string;
    }> => {
      const response = await apiClient.post(
        "/bulletins-soins/agent/batches",
        data,
      );
      if (!response.success) throw new Error(response.error?.message);
      return response.data as {
        id: string;
        name: string;
        companyId: string;
        status: string;
      };
    },
    onSuccess: (data: {
      id: string;
      name: string;
      companyId: string;
      status: string;
    }) => {
      queryClient.invalidateQueries({ queryKey: ["agent-bulletins"] });
      queryClient.invalidateQueries({ queryKey: ["agent-batches"] });
      // Set the newly created batch as active and switch to saisie tab
      setBatch({
        id: data.id,
        name: data.name,
        companyId: data.companyId,
        status: data.status,
      });
      toast.success(
        "Lot créé avec succès ! Vous pouvez maintenant saisir des bulletins.",
      );
      setShowBatchDialog(false);
      setSelectedBulletins([]);
      setNewBatchName("");
      setActiveTab("saisie");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erreur lors de la creation du lot");
    },
  });

  // Export batch mutation
  const exportBatchMutation = useMutation({
    mutationFn: async ({
      batchId,
      force = false,
    }: {
      batchId: string;
      force?: boolean;
    }) => {
      const res = await apiClient.get<Blob>(
        `/bulletins-soins/agent/batches/${batchId}/export${force ? '?force=true' : ''}`,
        { responseType: 'blob' },
      );
      if (!res.success || !res.data) {
        throw new Error("Erreur lors de l'export");
      }

      const filename = `dhamen_lot_${batchId}_${new Date().toISOString().slice(0, 10)}.csv`;
      const csvContent = await res.data.text();
      return { csvContent, filename };
    },
    onSuccess: ({ csvContent, filename }) => {
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      queryClient.invalidateQueries({ queryKey: ["agent-batches"] });
      queryClient.invalidateQueries({ queryKey: ["agent-bulletins"] });
      toast.success("Export CSV téléchargé !");
      setShowExportDialog(false);
      setExportBatch(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erreur lors de l'export");
    },
  });

  // Export batch detail mutation (bordereau detaille)
  const exportDetailMutation = useMutation({
    mutationFn: async ({ batchId }: { batchId: string }) => {
      const res = await apiClient.get<Blob>(
        `/bulletins-soins/agent/batches/${batchId}/export-detail`,
        { responseType: 'blob' },
      );
      if (!res.success || !res.data) {
        throw new Error("Erreur lors de l'export detaille");
      }

      const filename = `dhamen_detail_${batchId}_${new Date().toISOString().slice(0, 10)}.csv`;
      const csvContent = await res.data.text();
      return { csvContent, filename };
    },
    onSuccess: ({ csvContent, filename }) => {
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success("Export détaillé téléchargé !");
      setShowExportDetailDialog(false);
      setExportBatch(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erreur lors de l'export détaillé");
    },
  });

  const invalidateAllBulletinQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-bulletins"] });
    queryClient.invalidateQueries({ queryKey: ["agent-bulletins"] });
    queryClient.invalidateQueries({ queryKey: ["agent-batches"] });
    queryClient.invalidateQueries({ queryKey: ["bulletins-validation"] });
    queryClient.invalidateQueries({ queryKey: ["bulletins-validation-stats"] });
    queryClient.invalidateQueries({ queryKey: ["bulletins-history"] });
    queryClient.invalidateQueries({ queryKey: ["bulletins-payments"] });
    queryClient.invalidateQueries({ queryKey: ["bulletins-payment-stats"] });
    queryClient.invalidateQueries({ queryKey: ["recent-bulletins"] });
    queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    queryClient.invalidateQueries({ queryKey: ["hr-recent-bulletins"] });
    queryClient.invalidateQueries({ queryKey: ["adhérent-bulletins"] });
    queryClient.invalidateQueries({ queryKey: ["adhérent-bulletins-stats"] });
    queryClient.invalidateQueries({ queryKey: ["batch-bulletins"] });
  };

  // Delete bulletin mutation
  const deleteMutation = useMutation({
    mutationFn: async (bulletinId: string) => {
      const response = await apiClient.delete(
        `/bulletins-soins/agent/${bulletinId}`,
      );
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: () => {
      invalidateAllBulletinQueries();
      toast.success("Bulletin supprimé");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erreur lors de la suppression");
    },
  });

  // Bulk delete bulletins
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiClient.post<{ deleted: number }>(
        "/bulletins-soins/agent/bulk-delete",
        { ids },
      );
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: (data) => {
      invalidateAllBulletinQueries();
      toast.success(`${data?.deleted || 0} bulletin(s) supprimé(s)`);
      setSelectedBulletins([]);
    },
    onError: (error: Error) =>
      toast.error(error.message || "Erreur lors de la suppression"),
  });

  // Bulk delete batches
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const bulkDeleteBatchesMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiClient.post<{ deleted: number }>(
        "/bulletins-soins/agent/bulk-delete-batches",
        { ids },
      );
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    onSuccess: (data) => {
      invalidateAllBulletinQueries();
      // Always reset active batch — it may have been deleted
      setBatch(null);
      toast.success(`${data?.deleted || 0} lot(s) supprimé(s)`);
      setSelectedBatches([]);
    },
    onError: (error: Error) =>
      toast.error(error.message || "Erreur lors de la suppression"),
  });

  // View bulletin detail
  const [viewBulletin, setViewBulletin] = useState<BulletinDetail | null>(null);
  const [deleteBulletinId, setDeleteBulletinId] = useState<string | null>(null);

  const fetchBulletinDetail = async (id: string) => {
    const response = await apiClient.get<BulletinDetail>(
      `/bulletins-soins/agent/${id}`,
    );
    if (response.success) {
      setViewBulletin(response.data);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      const isValidType = [
        "application/pdf",
        "image/jpeg",
        "image/png",
        "image/jpg",
      ].includes(file.type);
      const isValidSize = file.size <= 10 * 1024 * 1024;
      return isValidType && isValidSize;
    });

    if (validFiles.length !== files.length) {
      toast.error(
        "Certains fichiers ont été ignorés (format ou taille invalide)",
      );
    }

    // Reset form fields when uploading new files
    reset({
      care_type: watch("care_type"),
      bulletin_date: new Date().toISOString().split("T")[0],
      bulletin_number: "",
      adherent_matricule: "",
      adherent_first_name: "",
      adherent_last_name: "",
      adherent_national_id: "",
      adherent_contract_number: "",
      adherent_email: "",
      adherent_address: "",
      beneficiary_name: "",
      actes: [
        {
          code: "",
          label: "",
          amount: 0,
          ref_prof_sant: "",
          nom_prof_sant: "",
          care_description: "",
          cod_msgr: "",
          lib_msgr: "",
        },
      ],
    });
    setSelectedAdherentInfo(null);
    setOcrFeedback(null);
    setOcrPraticienInfos({});
    setAutoRegisterPraticien({});
    setMfStatuses({});
    setSelectedFiles(validFiles);
    // Reset input value so re-selecting the same files triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveFile = (index: number) => {
    const remaining = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(remaining);
    // Reset form fields when all files are removed
    if (remaining.length === 0) {
      reset({
        care_type: watch("care_type"),
        bulletin_date: new Date().toISOString().split("T")[0],
        bulletin_number: "",
        adherent_matricule: "",
        adherent_first_name: "",
        adherent_last_name: "",
        adherent_national_id: "",
        adherent_contract_number: "",
        adherent_email: "",
        adherent_address: "",
        beneficiary_name: "",
        actes: [
          {
            code: "",
            label: "",
            amount: 0,
            ref_prof_sant: "",
            nom_prof_sant: "",
            care_description: "",
            cod_msgr: "",
            lib_msgr: "",
          },
        ],
      });
      setSelectedAdherentInfo(null);
      setOcrFeedback(null);
      setOcrPraticienInfos({});
      setAutoRegisterPraticien({});
      setMfStatuses({});
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const analyzeWithOCR = async () => {
    if (selectedFiles.length === 0) return;
    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append("files", file);
      }

      // OCR API: Cloudflare Worker endpoint
      const ocrBase = (
        import.meta.env.VITE_OCR_API_URL ||
        "https://ocr-api-bh-assurance-dev.yassine-techini.workers.dev"
      ).replace(/\/+$/, "");
      const ocrApiUrl = `${ocrBase}/analyse-bulletin`;
      const res = await fetch(ocrApiUrl, {
        method: "POST",
        headers: { accept: "application/json" },
        body: formData,
      });

      if (!res.ok) throw new Error(`Erreur OCR: ${res.status}`);

      const result = await res.json();
      console.log("[OCR] Raw API response:", JSON.stringify(result, null, 2));

      // Handle multiple response formats:
      // New API (multi): { success, donnees_ia: [ { infos_adherent, volet_medical }, ... ] }
      // New API (single): { success, donnees_ia: { infos_adherent, volet_medical } }
      // Alt API: { success, resultat: { infos_adherent, volet_medical } }
      // Old API: { raw_response: "```json\n{...}\n```" }
      // Backend proxy: { success, data: { infos_adherent, volet_medical } }
      let rawParsed =
        result.donnees_ia || result.resultat || result.data || result;

      if (typeof result.raw_response === "string") {
        const jsonMatch = result.raw_response.match(
          /```json\s*([\s\S]*?)\s*```/,
        );
        if (jsonMatch?.[1]) {
          rawParsed = JSON.parse(jsonMatch[1]);
        }
      }

      // Normalize to array of bulletins
      const bulletinsArray: OcrBulletinItem[] = Array.isArray(rawParsed)
        ? rawParsed.map((item: Record<string, unknown>) => ({
            infos_adherent: (item.infos_adherent || {}) as Record<string, unknown>,
            volet_medical: (item.volet_medical || []) as Array<Record<string, unknown>>,
            numero_bulletin: (item.numero_bulletin as string) || (item.infos_adherent as Record<string, unknown>)?.numero_bulletin as string | undefined,
          }))
        : [{
            infos_adherent: (rawParsed?.infos_adherent || {}) as Record<string, unknown>,
            volet_medical: (rawParsed?.volet_medical || []) as Array<Record<string, unknown>>,
            numero_bulletin: rawParsed?.numero_bulletin || rawParsed?.infos_adherent?.numero_bulletin,
          }];

      // Store all bulletins for multi-bulletin navigation
      setOcrBulletins(bulletinsArray);
      setActiveBulletinIndex(0);
      setSavedBulletinIndices(new Set());
      setSavedBulletinSnapshots({});

      // Use first bulletin for initial form fill
      const parsed = bulletinsArray[0]!;
      const info = parsed.infos_adherent as Record<string, string>;
      const actes = parsed.volet_medical as Array<Record<string, string | null>>;

      // Store raw OCR result for feedback panel
      setOcrFeedback({
        donneesIa: { infos_adherent: info || {}, volet_medical: actes || [] },
        visible: true,
      });
      setFeedbackErrors([]);
      setFeedbackComment("");

      // Auto-fill bulletin number (can be at top level or in infos_adherent)
      const numeroBulletin = parsed?.numero_bulletin || info?.numero_bulletin;
      if (numeroBulletin) {
        setValue("bulletin_number", numeroBulletin);
        setBulletinNumberFromOcr(true);
      } else {
        setBulletinNumberFromOcr(false);
      }

      // Auto-fill adherent fields
      if (info) {
        if (info.nom_prenom) {
          const parts = info.nom_prenom.trim().split(/\s+/);
          if (parts.length >= 2) {
            setValue("adherent_last_name", parts[0]!);
            setValue("adherent_first_name", parts.slice(1).join(" "));
          }
        }
        const matriculeRaw = [info.numero_adherent, info.numero_contrat].find(
          (v) => v && v !== "illisible",
        );
        if (matriculeRaw) {
          const matricule = matriculeRaw.replace(/\s+/g, "");
          setValue("adherent_matricule", matricule);
          setAdherentSearch(matricule);
        }
        if (info.numero_contrat && info.numero_contrat !== "illisible") {
          setValue(
            "adherent_contract_number",
            info.numero_contrat.replace(/\s+/g, ""),
          );
        }
        if (info.date_signature) {
          const dateParts = info.date_signature.split(/[.\/]/);
          if (dateParts.length === 3) {
            const year =
              dateParts[2]!.length === 2 ? `20${dateParts[2]}` : dateParts[2];
            setValue(
              "bulletin_date",
              `${year}-${dateParts[1]}-${dateParts[0]}`,
            );
          }
        }
        if (info.adresse) {
          setValue("adherent_address", info.adresse);
        }
        // Map beneficiaire_coche -> lien de parente (TASK-006)
        if (info.beneficiaire_coche) {
          const benef = info.beneficiaire_coche.toLowerCase().trim();
          if (benef.includes("conjoint")) {
            setValue(
              "beneficiary_relationship" as keyof BulletinFormData,
              "spouse",
            );
          } else if (benef.includes("enfant")) {
            setValue(
              "beneficiary_relationship" as keyof BulletinFormData,
              "child",
            );
          } else if (benef.includes("parent") || benef.includes("ascendant")) {
            setValue(
              "beneficiary_relationship" as keyof BulletinFormData,
              "parent",
            );
          } else if (benef.includes("adh") || benef.includes("assur") || benef.includes("lui-m") || benef.includes("elle-m")) {
            setValue(
              "beneficiary_relationship" as keyof BulletinFormData,
              "self",
            );
          }
        }
        // Default to "self" if no beneficiaire detected from OCR
        if (!info.beneficiaire_coche) {
          setValue("beneficiary_relationship" as keyof BulletinFormData, "self");
        }
        // Fill beneficiary name from OCR
        if (info.nom_beneficiaire) {
          setValue("beneficiary_name", info.nom_beneficiaire.trim());
        }
      }

      // Helper: detect care_type from OCR type_soin string
      const detectCareType = (
        typeSoin?: string | null,
      ): "consultation" | "pharmacy" | "lab" | "hospital" => {
        if (!typeSoin) return "consultation";
        const ts = typeSoin
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        if (ts.includes("pharmac") || ts.includes("medicament"))
          return "pharmacy";
        if (
          ts.includes("labo") ||
          ts.includes("analyse") ||
          ts.includes("biolog")
        )
          return "lab";
        if (ts.includes("hosp") || ts.includes("clinique")) return "hospital";
        return "consultation";
      };

      // Auto-fill global care type from first acte's type_soin
      if (Array.isArray(actes) && actes.length > 0 && actes[0]?.type_soin) {
        setValue("care_type", detectCareType(actes[0].type_soin));
      }

      // Auto-fill actes with enriched codes from backend (TASK-003)
      if (Array.isArray(actes) && actes.length > 0) {
        const currentActes = watch("actes");
        while (currentActes.length > 1) {
          removeActe(currentActes.length - 1);
        }

        actes.forEach((acte: Record<string, string | null>, i: number) => {
          // Detect care_type per acte from its own type_soin
          const acteCareType = detectCareType(acte.type_soin);
          const isPharmacy = acteCareType === "pharmacy";
          const rawMontant = (
            acte.montant_facture ||
            acte.montant_honoraires ||
            "0"
          )
            .replace(/[^\d.,]/g, "")
            .replace(",", ".");
          const montant = parseFloat(rawMontant) || 0;

          // For pharmacy: use OCR-matched medication if available, otherwise leave empty
          // For other types: use backend-enriched codes or local mapping
          const mapped = acte.nature_acte
            ? mapNatureActeToCode(acte.nature_acte)
            : null;
          const matchedMed = acte.matched_medication as
            | {
                code_pct?: string;
                brand_name?: string;
                dci?: string;
                dosage?: string;
                form?: string;
                price_public?: number;
                reimbursement_rate?: number;
              }
            | undefined;

          let code: string;
          let label: string;
          let autoAmount: number | null = null;

          if (isPharmacy && matchedMed) {
            code = matchedMed.code_pct || "";
            const reimbLabel = matchedMed.reimbursement_rate
              ? `[R ${Math.round(matchedMed.reimbursement_rate * 100)}%]`
              : "[NR]";
            label =
              `${matchedMed.brand_name || ""} - ${matchedMed.dci || ""} ${matchedMed.dosage || ""} ${matchedMed.form || ""} ${reimbLabel}`.trim();
            if (matchedMed.price_public) {
              autoAmount = matchedMed.price_public / 1000;
            }
          } else if (isPharmacy) {
            code = "";
            label = acte.nature_acte || "";
          } else {
            code = acte.matched_code || mapped?.code || "";
            label =
              acte.matched_label || mapped?.label || acte.nature_acte || "";
          }

          // Keep nature_acte from OCR as care_description (e.g. "Psychiatrie")
          const natureActeOriginal = acte.nature_acte || "";

          // Use OCR-matched amount or fallback to extracted montant
          const finalAmount = isPharmacy && autoAmount ? autoAmount : montant;

          // MF: use enriched provider name if available, fallback to OCR raw
          const mfProvider = acte.mf_provider as
            | { name?: string; speciality?: string; address?: string }
            | undefined;
          const nomPraticien = mfProvider?.name || acte.nom_praticien || "";
          const refProfSant =
            (acte.mf_extracted as string) || acte.matricule_fiscale || "";

          // Store OCR-extracted praticien info for display when MF not found in DB
          if (refProfSant || nomPraticien) {
            setOcrPraticienInfos((prev) => ({
              ...prev,
              [i]: {
                nom: nomPraticien,
                mf: refProfSant,
                specialite:
                  mfProvider?.speciality ||
                  (acte.specialite as string) ||
                  natureActeOriginal ||
                  undefined,
                adresse:
                  (acte.adresse_praticien as string) ||
                  mfProvider?.address ||
                  undefined,
                telephone: (acte.telephone_praticien as string) || undefined,
              },
            }));
            // Auto-register will be determined by MfLookupInput status callback
            // Don't pre-set to true — the MF lookup may find the provider in DB
          }

          if (i === 0) {
            setValue("actes.0.code", code);
            setValue("actes.0.label", label);
            setValue("actes.0.amount", finalAmount);
            setValue("actes.0.nom_prof_sant", nomPraticien);
            setValue("actes.0.ref_prof_sant", refProfSant);
            setValue("actes.0.care_type", acteCareType);
            if (natureActeOriginal && !isPharmacy) {
              setValue("actes.0.care_description", natureActeOriginal);
            }
          } else {
            appendActe({
              code,
              label,
              amount: finalAmount,
              nom_prof_sant: nomPraticien,
              ref_prof_sant: refProfSant,
              care_type: acteCareType,
              cod_msgr: "",
              lib_msgr: "",
              care_description: !isPharmacy ? natureActeOriginal : "",
            });
          }
        });
      }

      toast.success(
        bulletinsArray.length > 1
          ? `${bulletinsArray.length} bulletins détectés — naviguez entre eux ci-dessus`
          : "Analyse terminée — champs remplis automatiquement. Vérifiez puis envoyez votre feedback.",
      );
    } catch (error) {
      console.error("OCR analysis error:", error);
      toast.error("Erreur lors de l'analyse du bulletin");
    } finally {
      setIsAnalyzing(false);
    }
  };

  /** Switch to a different OCR-analyzed bulletin and fill the form */
  const handleSwitchBulletin = (index: number) => {
    if (index < 0 || index >= ocrBulletins.length || index === activeBulletinIndex) return;

    // If switching to a saved bulletin, just update the index (detail view handles display)
    if (savedBulletinIndices.has(index)) {
      setActiveBulletinIndex(index);
      return;
    }

    const bulletin = ocrBulletins[index]!;
    const info = bulletin.infos_adherent as Record<string, string>;
    const actes = bulletin.volet_medical as Array<Record<string, string | null>>;

    // Full reset to clear ALL fields from previous bulletin
    reset({
      bulletin_number: "",
      bulletin_date: new Date().toISOString().split("T")[0],
      adherent_matricule: "",
      adherent_first_name: "",
      adherent_last_name: "",
      adherent_national_id: "",
      adherent_contract_number: "",
      adherent_email: "",
      adherent_address: "",
      adherent_date_of_birth: "",
      beneficiary_name: "",
      beneficiary_id: "",
      beneficiary_relationship: undefined,
      beneficiary_email: "",
      beneficiary_address: "",
      beneficiary_date_of_birth: "",
      care_type: undefined,
      actes: [{ code: "", label: "", amount: 0, ref_prof_sant: "", nom_prof_sant: "", care_type: "consultation" as const, care_description: "", cod_msgr: "", lib_msgr: "" }],
    });
    setSelectedAdherentInfo(null);
    setAdherentSearch("");
    setOcrPraticienInfos({});
    setMfStatuses({});
    setActiveBulletinIndex(index);

    // Update feedback panel
    setOcrFeedback({
      donneesIa: { infos_adherent: info || {}, volet_medical: actes || [] },
      visible: true,
    });

    // Auto-fill bulletin number
    const numeroBulletin = bulletin.numero_bulletin || info?.numero_bulletin;
    if (numeroBulletin) {
      setValue("bulletin_number", numeroBulletin);
      setBulletinNumberFromOcr(true);
    } else {
      setBulletinNumberFromOcr(false);
    }

    // Auto-fill adherent fields
    if (info) {
      if (info.nom_prenom) {
        const parts = info.nom_prenom.trim().split(/\s+/);
        if (parts.length >= 2) {
          setValue("adherent_last_name", parts[0]!);
          setValue("adherent_first_name", parts.slice(1).join(" "));
        }
      }
      const matriculeRaw = [info.numero_adherent, info.numero_contrat].find((v) => v && v !== "illisible");
      if (matriculeRaw) {
        const matricule = matriculeRaw.replace(/\s+/g, "");
        setValue("adherent_matricule", matricule);
        setAdherentSearch(matricule);
      }
      if (info.numero_contrat && info.numero_contrat !== "illisible") {
        setValue("adherent_contract_number", info.numero_contrat.replace(/\s+/g, ""));
      }
      if (info.date_signature) {
        const dateParts = info.date_signature.split(/[.\/]/);
        if (dateParts.length === 3) {
          const year = dateParts[2]!.length === 2 ? `20${dateParts[2]}` : dateParts[2];
          setValue("bulletin_date", `${year}-${dateParts[1]}-${dateParts[0]}`);
        }
      }
      if (info.beneficiaire_coche) {
        const benef = info.beneficiaire_coche.toLowerCase().trim();
        if (benef.includes("conjoint")) setValue("beneficiary_relationship" as keyof BulletinFormData, "spouse");
        else if (benef.includes("enfant")) setValue("beneficiary_relationship" as keyof BulletinFormData, "child");
        else if (benef.includes("parent") || benef.includes("ascendant")) setValue("beneficiary_relationship" as keyof BulletinFormData, "parent");
        else if (benef.includes("adh") || benef.includes("assur")) setValue("beneficiary_relationship" as keyof BulletinFormData, "self");
      } else {
        setValue("beneficiary_relationship" as keyof BulletinFormData, "self");
      }
      if (info.nom_beneficiaire) setValue("beneficiary_name", info.nom_beneficiaire.trim());
    }

    // Care type from first acte
    const detectCareType = (typeSoin?: string | null): "consultation" | "pharmacy" | "lab" | "hospital" => {
      if (!typeSoin) return "consultation";
      const ts = typeSoin.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (ts.includes("pharmac") || ts.includes("medicament")) return "pharmacy";
      if (ts.includes("labo") || ts.includes("analyse") || ts.includes("biolog")) return "lab";
      if (ts.includes("hosp") || ts.includes("clinique")) return "hospital";
      return "consultation";
    };

    if (Array.isArray(actes) && actes.length > 0 && actes[0]?.type_soin) {
      setValue("care_type", detectCareType(actes[0].type_soin));
    }

    // Fill actes
    if (Array.isArray(actes) && actes.length > 0) {
      actes.forEach((acte, i) => {
        const acteCareType = detectCareType(acte.type_soin);
        const isPharmacy = acteCareType === "pharmacy";
        const rawMontant = (acte.montant_facture || acte.montant_honoraires || "0")!.replace(/[^\d.,]/g, "").replace(",", ".");
        const montant = parseFloat(rawMontant) || 0;
        const mapped = acte.nature_acte ? mapNatureActeToCode(acte.nature_acte) : null;
        const code = acte.matched_code || mapped?.code || "";
        const label = acte.matched_label || mapped?.label || acte.nature_acte || "";
        const nomPraticien = acte.nom_praticien || "";
        const refProfSant = (acte.mf_extracted as string) || acte.matricule_fiscale || "";

        if (refProfSant || nomPraticien) {
          setOcrPraticienInfos((prev) => ({ ...prev, [i]: { nom: nomPraticien, mf: refProfSant, specialite: acte.nature_acte || undefined } }));
        }

        if (i === 0) {
          setValue("actes.0.code", code);
          setValue("actes.0.label", label);
          setValue("actes.0.amount", isPharmacy ? montant : montant);
          setValue("actes.0.nom_prof_sant", nomPraticien);
          setValue("actes.0.ref_prof_sant", refProfSant);
          setValue("actes.0.care_type", acteCareType);
          if (acte.nature_acte && !isPharmacy) setValue("actes.0.care_description", acte.nature_acte);
        } else {
          appendActe({ code, label, amount: montant, nom_prof_sant: nomPraticien, ref_prof_sant: refProfSant, care_type: acteCareType, cod_msgr: "", lib_msgr: "", care_description: !isPharmacy ? (acte.nature_acte || "") : "" });
        }
      });
    }
  };

  // --- OCR Feedback handlers ---
  const sendOcrFeedback = async (
    statut: "valide" | "invalide" | "partiellement_valide",
  ) => {
    if (!ocrFeedback) return;
    setIsSendingFeedback(true);
    const ocrBase = (
      import.meta.env.VITE_OCR_API_URL ||
      "https://ocr-api-bh-assurance-dev.yassine-techini.workers.dev"
    ).replace(/\/+$/, "");
    try {
      const res = await fetch(`${ocrBase}/valider-bulletin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
        },
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
        toast.success("Feedback OCR envoyé avec succès");
      } else {
        toast.error("Erreur lors de l'envoi du feedback");
      }
    } catch {
      toast.error("Erreur reseau lors de l'envoi du feedback");
    } finally {
      setIsSendingFeedback(false);
      setOcrFeedback(null);
      setFeedbackErrors([]);
      setFeedbackComment("");
    }
  };

  const toggleFeedbackError = (fieldLabel: string) => {
    setFeedbackErrors((prev) =>
      prev.includes(fieldLabel)
        ? prev.filter((e) => e !== fieldLabel)
        : [...prev, fieldLabel],
    );
  };

  const handleRegisterAdherent = async () => {
    const matricule = watch("adherent_matricule");
    const firstName = watch("adherent_first_name");
    const lastName = watch("adherent_last_name");
    const dateOfBirth = watch("adherent_date_of_birth");

    if (!firstName || !lastName) {
      toast.error(
        "Nom et prénom sont obligatoires pour enregistrer l'adhérent",
      );
      return;
    }
    if (!dateOfBirth) {
      toast.error(
        "Date de naissance est obligatoire pour enregistrer l'adhérent",
      );
      return;
    }

    setIsRegisteringAdherent(true);
    try {
      const result = await apiClient.post<{ id: string; matricule?: string }>(
        "/adherents",
        {
          firstName,
          lastName,
          dateOfBirth,
          matricule: matricule || undefined,
          nationalId: watch("adherent_national_id") || undefined,
          email: watch("adherent_email") || undefined,
          address: watch("adherent_address") || undefined,
          companyId: selectedCompany?.id || undefined,
        },
      );
      if (result.success && result.data) {
        toast.success("Adhérent enregistré avec succès");
        if (result.data.matricule) {
          setValue("adherent_matricule", result.data.matricule);
        }
        // Refresh adherent search to pick up the new record
        setAdherentSearch(matricule || lastName);
        setShowAdherentDropdown(true);
        queryClient.invalidateQueries({ queryKey: ["adherents"] });
      } else if (!result.success) {
        toast.error(result.error?.message || "Erreur lors de l'enregistrement");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur réseau";
      toast.error(msg);
    } finally {
      setIsRegisteringAdherent(false);
    }
  };

  /** Add ayant droit (conjoint or enfant) to an already-registered adherent */
  const handleAddAyantDroit = async (lienParente: 'C' | 'E') => {
    if (!selectedAdherentInfo?.id) return;
    const { firstName, lastName, dateOfBirth, email, gender } = ayantDroitForm;
    if (!firstName || !lastName || !dateOfBirth) {
      toast.error("Nom, prénom et date de naissance sont requis");
      return;
    }
    setIsAddingAyantDroit(true);
    try {
      const result = await apiClient.post<{
        id: string; matricule: string; firstName: string; lastName: string; codeType: string;
      }>(`/adherents/${selectedAdherentInfo.id}/add-ayant-droit`, {
        lienParente,
        firstName,
        lastName,
        dateOfBirth,
        gender: gender || undefined,
        email: (lienParente === 'C' && email) ? email : undefined,
      });
      if (result.success && result.data) {
        toast.success(`${lienParente === 'C' ? 'Conjoint(e)' : 'Enfant'} ajouté(e) avec succès`);
        // Refresh family data
        queryClient.invalidateQueries({ queryKey: ['adherent-famille', selectedAdherentInfo.id] });
        // Auto-select as beneficiary
        setValue("beneficiary_name", `${firstName} ${lastName}`);
        setValue("beneficiary_id", result.data.id);
        // Reset form
        setAyantDroitForm({ firstName: '', lastName: '', dateOfBirth: '', email: '', gender: '' });
      } else if (!result.success) {
        toast.error(result.error?.message || "Erreur lors de l'ajout");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erreur réseau";
      toast.error(msg);
    } finally {
      setIsAddingAyantDroit(false);
    }
  };

  const onSubmitForm = async (data: BulletinFormData) => {
    // Company must be selected
    if (!selectedCompany) {
      toast.error("Veuillez sélectionner une entreprise avant d'enregistrer un bulletin.");
      return;
    }

    // Pre-submit business validations
    const validationErrors: string[] = [];

    // Warn if adherent not found, but don't block submission
    // Bulletin can be saved even with unidentified adherent

    // Bulletin date validation (only if parseable)
    const bulletinDate = new Date(data.bulletin_date);
    if (!isNaN(bulletinDate.getTime())) {
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (bulletinDate > today) {
        validationErrors.push(
          "La date du bulletin ne peut pas être dans le futur.",
        );
      }
    }

    // Total amount must be > 0
    const total = data.actes.reduce(
      (sum, a) => sum + (Number(a.amount) || 0),
      0,
    );
    if (total <= 0) {
      validationErrors.push("Le montant total doit être supérieur à 0.");
    }

    // Each non-pharmacy acte should have a valid code (pharmacy actes may not have a referentiel code)
    const actesWithoutCode = data.actes
      .map((a, i) => ({ index: i, code: a.code, careType: a.care_type }))
      .filter(
        (a) => (!a.code || a.code.trim() === "") && a.careType !== "pharmacy",
      );
    if (actesWithoutCode.length > 0) {
      validationErrors.push(
        `Acte(s) ${actesWithoutCode.map((a) => a.index + 1).join(", ")} : code acte requis (sélectionnez un acte du référentiel).`,
      );
    }

    // If beneficiary is selected (not self), name must not be empty
    if (
      data.beneficiary_relationship &&
      data.beneficiary_relationship !== "self" &&
      !data.beneficiary_name?.trim()
    ) {
      validationErrors.push("Le nom du bénéficiaire (ayant droit) est requis.");
    }

    if (validationErrors.length > 0) {
      validationErrors.forEach((err) => toast.error(err));
      return;
    }

    setIsSubmitting(true);
    try {
      // Everything is handled server-side in agent/create:
      // - Auto-create adherent if not found (dossier_complet = 0)
      // - Auto-create praticien for each acte with MF
      await submitMutation.mutateAsync({
        formData: data,
        files: selectedFiles,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleBulletin = (id: string) => {
    setSelectedBulletins((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id],
    );
  };

  const handleToggleSelectAllBulletins = () => {
    if (allDraftsSelected) {
      setSelectedBulletins((prev) =>
        prev.filter((id) => !bulletinIdsOnPage.includes(id)),
      );
    } else {
      setSelectedBulletins((prev) => [
        ...new Set([...prev, ...bulletinIdsOnPage]),
      ]);
    }
  };

  // Select-all for batches (current page)
  const batchIdsOnPage = (batchesData || []).map((b: Batch) => b.id);
  const allBatchesSelected =
    batchIdsOnPage.length > 0 &&
    batchIdsOnPage.every((id: string) => selectedBatches.includes(id));
  const someBatchesSelected = batchIdsOnPage.some((id: string) =>
    selectedBatches.includes(id),
  );

  const handleToggleSelectAllBatches = () => {
    if (allBatchesSelected) {
      setSelectedBatches((prev) =>
        prev.filter((id) => !batchIdsOnPage.includes(id)),
      );
    } else {
      setSelectedBatches((prev) => [...new Set([...prev, ...batchIdsOnPage])]);
    }
  };

  // Clear selections when company or batch changes
  useEffect(() => {
    setSelectedBulletins([]);
    setSelectedBatches([]);
  }, [selectedCompany?.id, selectedBatch?.id]);

  const handleCreateBatch = () => {
    if (!newBatchName.trim()) {
      toast.error("Veuillez entrer un nom pour le lot");
      return;
    }
    createBatchMutation.mutate({
      name: newBatchName.trim(),
      bulletinIds: selectedBulletins,
      companyId: selectedCompany!.id,
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
    return (
      new Intl.NumberFormat("fr-TN", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount) + " DT"
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("fr-TN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const draftCount = (bulletinsData || []).filter(
    (b) => b.status === "draft",
  ).length;
  const totalAmount = (bulletinsData || []).reduce(
    (sum, b) => sum + b.total_amount,
    0,
  );

  // Pagination (liste tab)
  const [listePage, setListePage] = useState(1);
  const listePageSize = 10;
  const filteredBulletins = bulletinsData || [];
  const paginatedBulletins = filteredBulletins.slice(
    (listePage - 1) * listePageSize,
    listePage * listePageSize,
  );
  // Select-all for bulletins (current page)
  const bulletinIdsOnPage = paginatedBulletins.map((b: BulletinSaisie) => b.id);
  const allDraftsSelected =
    bulletinIdsOnPage.length > 0 &&
    bulletinIdsOnPage.every((id: string) => selectedBulletins.includes(id));
  const someDraftsSelected = bulletinIdsOnPage.some((id: string) =>
    selectedBulletins.includes(id),
  );
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="grid col-span-1 md:flex md:items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Saisie des Bulletins de Soins
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Numérisez et enregistrez les actes médicaux pour le remboursement.
            Suivez les étapes pour une validation rapide.
          </p>
        </div>
        <div className="grid col-span-1 md:flex md:items-center gap-3">
          <a
            href="/bulletins/import-lot"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-medium text-white hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-orange-500/25 transition-colors"
          >
            <Upload className="h-4 w-4" />
            Importer un lot
          </a>
          {selectedBulletins.length > 0 && (
            <Button
              onClick={() => setShowBatchDialog(true)}
              className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-600/25"
            >
              <FolderPlus className="mr-2 h-4 w-4" />
              Créer un lot ({selectedBulletins.length})
            </Button>
          )}
          {!isIndividualMode && selectedCompany && (
            <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-4 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-[10px] font-bold text-white">
                {selectedCompany.name?.slice(0, 3).toUpperCase()}
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                  Entreprise active
                </p>
                <p className="text-sm font-semibold text-gray-900">
                  {selectedCompany.name}
                </p>
              </div>
            </div>
          )}
          {isIndividualMode && (
            <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5">
              <User className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wide text-blue-500">
                  Mode individuel
                </p>
                <p className="text-xs text-blue-700">Sans entreprise</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-4">
        {[
          {
            label: "Brouillons",
            value: draftCount,
            icon: FileText,
            color: "blue",
          },
          {
            label: "Lots ouverts",
            value: (batchesData || []).filter((b) => b.status === "open")
              .length,
            icon: Package,
            color: "green",
          },
          {
            label: "Lots exportés",
            value: (batchesData || []).filter((b) => b.status === "exported")
              .length,
            icon: FileSpreadsheet,
            color: "purple",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-gray-200 bg-white px-5 py-4 grid-cols-1 grid md:flex items-center gap-3"
          >
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl bg-${stat.color}-50`}
            >
              <stat.icon className={`h-5 w-5 text-${stat.color}-600`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          </div>
        ))}
        <div className="rounded-2xl bg-gradient-to-br from-gray-900 to-blue-950 px-5 py-4 text-white">
          <p className="text-2xl font-bold">{formatAmount(totalAmount)}</p>
          <p className="text-xs text-blue-200">Montant total saisi</p>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center gap-1 rounded-2xl bg-gray-100 p-1 w-full sm:w-fit">
          {[
            { value: "saisie", label: "Nouveau bulletin" },
            {
              value: "liste",
              label: `Liste des bulletins (${(bulletinsData || []).length})`,
            },
            {
              value: "lots",
              label: `Gestion des lots (${(batchesData || []).length})`,
            },
          ].map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                "rounded-xl px-5 py-2.5 text-sm font-medium transition-all",
                activeTab === tab.value
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab: Saisie */}
        <TabsContent value="saisie">
          {/* Batch selector bar — always visible */}
          {selectedCompany && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3">
              {selectedBatch && selectedBatch.status !== "exported" ? (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100">
                    <Package className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                      Lot actif
                    </p>
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {selectedBatch.name}
                    </p>
                  </div>
                  <Badge
                    variant="default"
                    className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                  >
                    Ouvert
                  </Badge>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-400 hover:text-gray-600"
                    onClick={() => setBatch(null)}
                    title="Changer de lot"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                      Lot
                    </p>
                    <p className="text-sm font-medium text-amber-700">
                      {selectedBatch?.status === "exported"
                        ? "Lot exporté — choisissez ou créez un nouveau lot"
                        : "Aucun lot sélectionné"}
                    </p>
                  </div>
                  {/* Open batches quick-select */}
                  {(() => {
                    const openBatches = (batchesData || []).filter(
                      (b) => b.status === "open",
                    );
                    if (openBatches.length > 0) {
                      return (
                        <Select
                          onValueChange={(batchId) => {
                            const batch = openBatches.find(
                              (b) => b.id === batchId,
                            );
                            if (batch) {
                              setBatch({
                                id: batch.id,
                                name: batch.name,
                                companyId: selectedCompany!.id,
                                status: batch.status,
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="w-full sm:w-[220px] rounded-xl">
                            <SelectValue placeholder="Choisir un lot ouvert" />
                          </SelectTrigger>
                          <SelectContent>
                            {openBatches.map((batch) => (
                              <SelectItem key={batch.id} value={batch.id}>
                                <span className="flex items-center gap-2">
                                  <Package className="h-3.5 w-3.5 text-emerald-500" />
                                  {batch.name}
                                  <span className="text-xs text-gray-400">
                                    ({batch.bulletins_count || 0})
                                  </span>
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      );
                    }
                    return null;
                  })()}
                  <Button
                    size="sm"
                    className="rounded-xl"
                    onClick={() => {
                      setNewBatchName("");
                      setShowBatchDialog(true);
                    }}
                  >
                    <FolderPlus className="mr-1.5 h-3.5 w-3.5" />
                    Nouveau lot
                  </Button>
                </>
              )}
            </div>
          )}

          {!selectedBatch || selectedBatch.status === "exported" ? (
            <Card className="border-gray-200 bg-gray-50">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
                    <Package className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500 max-w-md">
                    Sélectionnez un lot ouvert ou créez-en un nouveau pour commencer la saisie de bulletins.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmitForm, (formErrors) => {
                // Show validation errors from Zod schema when form is invalid
                const messages: string[] = [];
                if (formErrors.bulletin_date)
                  messages.push(`Date: ${formErrors.bulletin_date.message}`);
                if (formErrors.adherent_matricule)
                  messages.push(
                    `Matricule: ${formErrors.adherent_matricule.message}`,
                  );
                if (formErrors.actes?.root)
                  messages.push(
                    formErrors.actes.root.message || "Erreur actes",
                  );
                if (formErrors.actes && Array.isArray(formErrors.actes)) {
                  formErrors.actes.forEach((acteErr, idx) => {
                    if (acteErr?.label)
                      messages.push(
                        `Acte ${idx + 1} — libellé: ${acteErr.label.message}`,
                      );
                    if (acteErr?.amount)
                      messages.push(
                        `Acte ${idx + 1} — montant: ${acteErr.amount.message}`,
                      );
                  });
                }
                if (messages.length > 0) {
                  messages.forEach((m) => toast.error(m));
                } else {
                  toast.error("Veuillez vérifier les champs du formulaire.");
                }
              })}
            >
              {/* Multi-bulletin selector — OUTSIDE fieldset so buttons stay clickable */}
              {ocrBulletins.length > 1 && (
                <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 mb-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600 text-white text-xs font-bold">
                        {ocrBulletins.length}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {ocrBulletins.length} bulletins détectés
                        </p>
                        <p className="text-[11px] text-gray-500">
                          {savedBulletinIndices.size} enregistré{savedBulletinIndices.size !== 1 ? 's' : ''} sur {ocrBulletins.length}
                        </p>
                      </div>
                    </div>
                    {savedBulletinIndices.size === ocrBulletins.length && (
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Tous enregistrés
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {ocrBulletins.map((b, idx) => {
                      const isSaved = savedBulletinIndices.has(idx);
                      const isActive = idx === activeBulletinIndex;
                      const adhName = (b.infos_adherent?.nom_prenom as string) || `Bulletin ${idx + 1}`;
                      const numBulletin = b.numero_bulletin || (b.infos_adherent?.numero_bulletin as string);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSwitchBulletin(idx)}
                          className={cn(
                            "relative flex-shrink-0 rounded-xl border-2 p-3 text-left transition-all min-w-[180px]",
                            isActive
                              ? isSaved
                                ? "border-emerald-500 bg-emerald-50 shadow-md ring-2 ring-emerald-500/20"
                                : "border-blue-500 bg-white shadow-md ring-2 ring-blue-500/20"
                              : isSaved
                                ? "border-emerald-300 bg-emerald-50/50 hover:border-emerald-400"
                                : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm"
                          )}
                        >
                          <div className="absolute -top-1.5 -right-1.5">
                            {isSaved ? (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                                <Check className="h-3 w-3" />
                              </span>
                            ) : isActive ? (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold">
                                {idx + 1}
                              </span>
                            ) : (
                              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-gray-500 text-[10px] font-bold">
                                {idx + 1}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-semibold text-gray-900 truncate pr-4">
                            {adhName}
                          </p>
                          {numBulletin && (
                            <p className="text-[10px] text-gray-500 mt-0.5 font-mono">
                              N° {numBulletin}
                            </p>
                          )}
                          <p className="text-[10px] mt-1">
                            {(b.volet_medical?.length || 0)} acte{(b.volet_medical?.length || 0) !== 1 ? 's' : ''}
                          </p>
                          {isSaved && (
                            <Badge className="mt-1.5 text-[9px] px-1.5 py-0 bg-emerald-100 text-emerald-700 border-emerald-200">
                              Enregistré
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Detail view for saved bulletins */}
              {isActiveBulletinSaved && savedBulletinSnapshots[activeBulletinIndex] ? (() => {
                const snap = savedBulletinSnapshots[activeBulletinIndex]!;
                return (
                  <div className="space-y-4">
                    {/* Header banner */}
                    <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3">
                      <Lock className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-emerald-800">Bulletin enregistré</p>
                        <p className="text-xs text-emerald-600">Sélectionnez un bulletin non enregistré pour continuer la saisie.</p>
                      </div>
                      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 flex-shrink-0">
                        <Check className="h-3 w-3 mr-1" /> Enregistré
                      </Badge>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-3">
                      <div className="lg:col-span-2 space-y-4">
                        {/* Info bulletin */}
                        <div className="rounded-2xl border border-gray-200 bg-white p-5">
                          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-600" /> Informations du bulletin
                          </h3>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-xs text-gray-500">N° Bulletin</p>
                              <p className="font-medium text-gray-900 font-mono">{snap.bulletin_number}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Date</p>
                              <p className="font-medium text-gray-900">{snap.bulletin_date ? new Date(snap.bulletin_date).toLocaleDateString('fr-TN') : '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Matricule</p>
                              <p className="font-medium text-gray-900 font-mono">{snap.adherent_matricule}</p>
                            </div>
                          </div>
                        </div>

                        {/* Adherent info */}
                        <div className="rounded-2xl border border-gray-200 bg-white p-5">
                          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <User className="h-4 w-4 text-blue-600" /> Adhérent
                          </h3>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-xs text-gray-500">Nom</p>
                              <p className="font-medium text-gray-900">{snap.adherent_last_name || '—'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500">Prénom</p>
                              <p className="font-medium text-gray-900">{snap.adherent_first_name || '—'}</p>
                            </div>
                            {snap.adherent_email && (
                              <div>
                                <p className="text-xs text-gray-500">Email</p>
                                <p className="font-medium text-gray-900">{snap.adherent_email}</p>
                              </div>
                            )}
                            {snap.beneficiary_relationship && snap.beneficiary_relationship !== 'self' && (
                              <>
                                <div>
                                  <p className="text-xs text-gray-500">Bénéficiaire</p>
                                  <p className="font-medium text-gray-900">{snap.beneficiary_name || '—'}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500">Lien</p>
                                  <Badge variant="outline" className="text-xs">
                                    {snap.beneficiary_relationship === 'spouse' ? 'Conjoint(e)' : snap.beneficiary_relationship === 'child' ? 'Enfant' : snap.beneficiary_relationship}
                                  </Badge>
                                </div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Actes */}
                        <div className="rounded-2xl border border-gray-200 bg-white p-5">
                          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                            <Stethoscope className="h-4 w-4 text-amber-600" /> Actes ({snap.actes?.length || 0})
                          </h3>
                          <div className="space-y-2">
                            {snap.actes?.map((acte, i) => (
                              <div key={i} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    {acte.code && <Badge variant="outline" className="text-[10px] px-1.5 font-mono">{acte.code}</Badge>}
                                    <p className="text-sm font-medium text-gray-900 truncate">{acte.label}</p>
                                  </div>
                                  <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                                    {acte.nom_prof_sant && <span>Dr. {acte.nom_prof_sant}</span>}
                                    {acte.ref_prof_sant && <span className="font-mono">{acte.ref_prof_sant}</span>}
                                    <Badge variant="outline" className="text-[9px] px-1">
                                      {careTypeConfig[acte.care_type as keyof typeof careTypeConfig]?.label || acte.care_type}
                                    </Badge>
                                  </div>
                                </div>
                                <p className="text-sm font-bold text-gray-900 ml-4 whitespace-nowrap">
                                  {new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(acte.amount)} DT
                                </p>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
                            <div className="text-right">
                              <p className="text-xs text-gray-500">Total</p>
                              <p className="text-lg font-bold text-gray-900">
                                {new Intl.NumberFormat('fr-TN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(
                                  (snap.actes || []).reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
                                )} DT
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right column */}
                      <div className="space-y-4">
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/30 p-5">
                          <div className="flex items-center gap-2 mb-3">
                            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                            <p className="text-sm font-semibold text-emerald-800">Bulletin sauvegardé</p>
                          </div>
                          <p className="text-xs text-emerald-700">
                            Ce bulletin a été enregistré avec succès. Il apparaît dans la liste des bulletins.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })() : (
              /* Normal form for unsaved bulletins */
              <fieldset
                disabled={isSubmitting || isRegisteringAdherent}
                className="contents"
              >
                <div className="grid gap-6 lg:grid-cols-3">
                  {/* ===== LEFT 2 COLUMNS ===== */}
                  <div className="lg:col-span-2 space-y-6">
                    {/* Section 01: Numérisation du Bulletin */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-6">
                      <div className="flex items-center gap-3 mb-5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                          01
                        </span>
                        <h2 className="text-lg font-semibold text-gray-900">
                          Numérisation du Bulletin
                        </h2>
                      </div>
                      <div className="space-y-4">
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
                                className="rounded-xl"
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                Ajouter un fichier
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={analyzeWithOCR}
                                disabled={isAnalyzing}
                                className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
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
                            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 px-6 py-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            <Upload className="h-10 w-10 text-gray-400 mb-3" />
                            <p className="font-semibold text-sm text-gray-700">
                              Glissez-déposez le scan ici
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              Ou parcourez vos fichiers (PDF, JPG, PNG)
                            </p>
                            <button
                              type="button"
                              className="mt-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-xs font-semibold text-white hover:from-blue-700 hover:to-blue-800 transition-all"
                            >
                              Sélectionner un fichier
                            </button>
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

                        {/* OCR Feedback Panel */}
                        {ocrFeedback?.visible &&
                          (() => {
                            const adh = (ocrFeedback.donneesIa.infos_adherent ||
                              {}) as Record<string, string>;
                            const actes = (ocrFeedback.donneesIa
                              .volet_medical || []) as Record<string, string>[];
                            const adhFields: [string, string][] = [
                              ["Nom/prenom", adh.nom_prenom],
                              ["N° adherent", adh.numero_adherent],
                              ["N° contrat", adh.numero_contrat],
                              ["N° bulletin", adh.numero_bulletin],
                              ["Adresse", adh.adresse],
                              ["Beneficiaire", adh.beneficiaire_coche],
                              ["Nom beneficiaire", adh.nom_beneficiaire],
                              ["Date signature", adh.date_signature],
                            ].filter(([, v]) => v && v.trim() !== "") as [
                              string,
                              string,
                            ][];

                            const acteFieldLabels: Record<string, string> = {
                              type_soin: "Type de soin",
                              date_acte: "Date acte",
                              nature_acte: "Nature acte",
                              montant_honoraires: "Montant honoraires",
                              montant_facture: "Montant facture",
                              nom_praticien: "Praticien",
                              matricule_fiscale: "Matricule fiscale",
                            };

                            return (
                              <div className="rounded-xl border-2 border-amber-300 bg-amber-50/50 p-4 space-y-3">
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
                                  Voici les données extraites. Cliquez sur un
                                  champ pour le signaler comme incorrect.
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
                                        onClick={() =>
                                          toggleFeedbackError(label)
                                        }
                                        className={cn(
                                          "flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm text-left transition-colors w-full",
                                          feedbackErrors.includes(label)
                                            ? "bg-red-50 border-red-300"
                                            : "bg-white border-gray-200 hover:border-amber-300",
                                        )}
                                      >
                                        <span className="w-28 shrink-0 text-xs text-gray-500">
                                          {label}
                                        </span>
                                        <span
                                          className={cn(
                                            "flex-1 font-medium",
                                            feedbackErrors.includes(label) &&
                                              "line-through text-red-400",
                                          )}
                                        >
                                          {value}
                                        </span>
                                        {feedbackErrors.includes(label) ? (
                                          <ThumbsDown className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                        ) : (
                                          <ThumbsUp className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                        )}
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
                                      <div
                                        key={acteIdx}
                                        className="rounded-md border border-gray-200 bg-white p-2 space-y-1.5"
                                      >
                                        {acteIdx > 0 && (
                                          <p className="text-[10px] text-gray-500">
                                            Acte {acteIdx + 1}
                                          </p>
                                        )}
                                        <div className="grid gap-1">
                                          {Object.entries(acteFieldLabels).map(
                                            ([key, fieldLabel]) => {
                                              const val = acte[key];
                                              if (!val || val.trim() === "")
                                                return null;
                                              const errorKey = `acte${acteIdx}_${fieldLabel}`;
                                              return (
                                                <button
                                                  key={key}
                                                  type="button"
                                                  onClick={() =>
                                                    toggleFeedbackError(
                                                      errorKey,
                                                    )
                                                  }
                                                  className={cn(
                                                    "flex items-center gap-2 rounded border px-2.5 py-1 text-sm text-left transition-colors w-full",
                                                    feedbackErrors.includes(
                                                      errorKey,
                                                    )
                                                      ? "bg-red-50 border-red-300"
                                                      : "bg-gray-50 border-gray-100 hover:border-amber-300",
                                                  )}
                                                >
                                                  <span className="w-28 shrink-0 text-xs text-gray-500">
                                                    {fieldLabel}
                                                  </span>
                                                  <span
                                                    className={cn(
                                                      "flex-1 font-medium",
                                                      feedbackErrors.includes(
                                                        errorKey,
                                                      ) &&
                                                        "line-through text-red-400",
                                                    )}
                                                  >
                                                    {val}
                                                  </span>
                                                  {feedbackErrors.includes(
                                                    errorKey,
                                                  ) ? (
                                                    <ThumbsDown className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                                  ) : (
                                                    <ThumbsUp className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                                  )}
                                                </button>
                                              );
                                            },
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Comment */}
                                <Textarea
                                  placeholder="Commentaire de correction (optionnel) — ex: le nom est inverse, le montant est 50 et non 500..."
                                  value={feedbackComment}
                                  onChange={(e) =>
                                    setFeedbackComment(e.target.value)
                                  }
                                  rows={2}
                                  className="text-sm rounded-xl"
                                />

                                {/* Actions */}
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() =>
                                      sendOcrFeedback(
                                        feedbackErrors.length === 0
                                          ? "valide"
                                          : "partiellement_valide",
                                      )
                                    }
                                    disabled={isSendingFeedback}
                                    className="bg-green-600 hover:bg-green-700 rounded-xl"
                                  >
                                    {isSendingFeedback ? (
                                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <ThumbsUp className="mr-1.5 h-3.5 w-3.5" />
                                    )}
                                    {feedbackErrors.length === 0
                                      ? "Tout est correct"
                                      : `Valider avec ${feedbackErrors.length} erreur(s)`}
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => sendOcrFeedback("invalide")}
                                    disabled={isSendingFeedback}
                                    className="border-red-300 text-red-600 hover:bg-red-50 rounded-xl"
                                  >
                                    <ThumbsDown className="mr-1.5 h-3.5 w-3.5" />
                                    Tout est faux
                                  </Button>
                                </div>
                              </div>
                            );
                          })()}
                      </div>
                    </div>

                    {/* Section 02 + 03 side by side */}
                    <div className="grid gap-6 lg:grid-cols-2">
                      {/* Section 02: Infos Générales */}
                      <div className="rounded-2xl border border-gray-200 bg-white p-6">
                        <div className="flex items-center gap-3 mb-5">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                            02
                          </span>
                          <h2 className="text-lg font-semibold text-gray-900">
                            Infos Générales
                          </h2>
                        </div>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label className="text-sm text-gray-700">
                              Numéro du bulletin *
                              <InfoTooltip text="Identifiant unique du bulletin de soins. Format recommandé : BS-AAAA-XXX. Si vous laissez ce champ vide, un numéro sera généré automatiquement." />
                            </Label>
                            <div className="relative">
                              <Input
                                {...register("bulletin_number")}
                                placeholder="Ex: BS-2026-001"
                                className="rounded-xl pr-24"
                              />
                              {watch("bulletin_number") &&
                              bulletinNumberFromOcr ? (
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded flex items-center gap-1">
                                  <ScanSearch className="h-3 w-3" />
                                  Détecté par IA
                                </span>
                              ) : null}
                            </div>
                            {errors.bulletin_number && (
                              <p className="text-sm text-destructive">
                                {errors.bulletin_number.message}
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm text-gray-700">
                              Date du bulletin *
                            </Label>
                            <Input
                              type="date"
                              {...register("bulletin_date")}
                              max={new Date().toISOString().split("T")[0]}
                              className="rounded-xl"
                            />
                            {errors.bulletin_date && (
                              <p className="text-sm text-destructive">
                                {errors.bulletin_date.message}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Section 03: don */}
                      <div className="rounded-2xl border border-gray-200 bg-white p-6">
                        <div className="flex items-center gap-3 mb-5">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                            03
                          </span>
                          <h2 className="text-lg font-semibold text-gray-900">
                            Adhérent
                          </h2>
                        </div>
                        <div className="space-y-4">
                          {/* Matricule search */}
                          <div className="space-y-2 relative" ref={adherentPortalRef}>
                            <Label className="text-sm text-gray-700">
                              Matricule *
                              <InfoTooltip text="Tapez le nom, prénom ou numéro de matricule de l'adhérent. La liste des résultats s'affichera automatiquement. La couverture sera vérifiée en temps réel." />
                            </Label>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                              <Input
                                value={adherentSearch}
                                placeholder="Rechercher par nom ou matricule..."
                                className="pl-9 rounded-xl"
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setAdherentSearch(val);
                                  setValue("adherent_matricule", val);
                                  setShowAdherentDropdown(true);
                                  // Reset all adherent/beneficiary info when matricule changes
                                  setSelectedAdherentInfo(null);
                                  setValue("adherent_first_name", "");
                                  setValue("adherent_last_name", "");
                                  setValue("adherent_email", "");
                                  setValue("adherent_national_id", "");
                                  setValue("adherent_contract_number", "");
                                  setValue("adherent_address", "");
                                  setValue(
                                    "beneficiary_relationship",
                                    undefined,
                                  );
                                  setValue("beneficiary_name", "");
                                  setValue("beneficiary_id", "");
                                }}
                                onFocus={() =>
                                  adherentSearch.length >= 2 &&
                                  setShowAdherentDropdown(true)
                                }
                                onBlur={() =>
                                  setTimeout(
                                    () => setShowAdherentDropdown(false),
                                    200,
                                  )
                                }
                              />
                            </div>
                            {adherentDropdownVisible &&
                              adherentResults &&
                              adherentResults.length === 0 &&
                              !selectedAdherentInfo && adherentPortalPos && createPortal(
                                <div className="fixed z-[9999] bg-white border border-red-200 rounded-lg shadow-lg px-3 py-2" style={{ top: adherentPortalPos.top, left: adherentPortalPos.left, width: adherentPortalPos.width }}>
                                  <p className="text-sm text-red-600 flex items-center gap-1.5">
                                    <Ban className="w-3.5 h-3.5" />
                                    Aucun adherent trouve avec cette matricule
                                  </p>
                                </div>,
                                document.body
                              )}
                            {adherentDropdownVisible &&
                              adherentResults &&
                              adherentResults.length > 0 && adherentPortalPos && createPortal(
                                <div className="fixed z-[9999] bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto" style={{ top: adherentPortalPos.top, left: adherentPortalPos.left, width: adherentPortalPos.width }}>
                                  {adherentResults.map((a) => (
                                    <button
                                      key={a.id}
                                      type="button"
                                      className="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm border-b last:border-0"
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        const matriculeVal = a.matricule || "";
                                        setValue(
                                          "adherent_matricule",
                                          matriculeVal,
                                          { shouldValidate: true, shouldDirty: true },
                                        );
                                        setValue(
                                          "adherent_last_name",
                                          a.lastName || "",
                                        );
                                        setValue(
                                          "adherent_first_name",
                                          a.firstName || "",
                                        );
                                        setValue(
                                          "adherent_email",
                                          a.email || "",
                                        );
                                        // Auto-select "self" as default bénéficiaire
                                        setValue("beneficiary_relationship", "self");
                                        setAdherentSearch(matriculeVal);
                                        setShowAdherentDropdown(false);
                                        setSelectedAdherentInfo(a);
                                      }}
                                    >
                                      <span className="font-medium">
                                        {a.firstName} {a.lastName}
                                      </span>
                                      <span className="text-gray-400 ml-2 font-mono text-xs">
                                        {a.matricule}
                                      </span>
                                      {a.companyName && (
                                        <span className="text-gray-400 ml-2 text-xs">
                                          -- {a.companyName}
                                        </span>
                                      )}
                                      {a.contractType && (
                                        <span className="ml-2 text-xs text-blue-500">
                                          [
                                          {a.contractType === "individual"
                                            ? "Individuel"
                                            : a.contractType === "family"
                                              ? "Famille"
                                              : "Groupe"}
                                          ]
                                        </span>
                                      )}
                                    </button>
                                  ))}
                                </div>,
                                document.body
                              )}
                            {errors.adherent_matricule && (
                              <p className="text-sm text-destructive">
                                {errors.adherent_matricule.message}
                              </p>
                            )}
                          </div>

                          {/* Bénéficiaire des soins — cases à cocher (toujours visibles) */}
                          <div className="space-y-3">
                            <Label className="text-sm font-medium text-gray-700">
                              Bénéficiaire des soins
                            </Label>
                            <div className="flex flex-wrap gap-3">
                              {/* Case Adhérent */}
                              <label
                                className={cn(
                                  "flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-colors",
                                  !watch("beneficiary_relationship") ||
                                    watch("beneficiary_relationship") === "self"
                                    ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                                    : "border-gray-200 hover:bg-gray-50 text-gray-700",
                                )}
                              >
                                <input
                                  type="radio"
                                  name="beneficiary_selection"
                                  className="h-4 w-4 text-blue-600 border-gray-300"
                                  checked={
                                    !watch("beneficiary_relationship") ||
                                    watch("beneficiary_relationship") === "self"
                                  }
                                  onChange={() => {
                                    setValue(
                                      "beneficiary_relationship",
                                      "self",
                                    );
                                    setValue("beneficiary_name", "");
                                    setValue("beneficiary_id", "");
                                  }}
                                />
                                <User className="h-4 w-4" />
                                <span className="text-sm">Adhérent</span>
                              </label>

                              {/* Case Conjoint */}
                              <label
                                className={cn(
                                  "flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-colors",
                                  watch("beneficiary_relationship") === "spouse"
                                    ? "border-purple-500 bg-purple-50 text-purple-700 font-medium"
                                    : "border-gray-200 hover:bg-gray-50 text-gray-700",
                                )}
                              >
                                <input
                                  type="radio"
                                  name="beneficiary_selection"
                                  className="h-4 w-4 text-purple-600 border-gray-300"
                                  checked={
                                    watch("beneficiary_relationship") ===
                                    "spouse"
                                  }
                                  onChange={() => {
                                    setValue(
                                      "beneficiary_relationship",
                                      "spouse",
                                    );
                                    if (familleData?.conjoint) {
                                      setValue(
                                        "beneficiary_name",
                                        `${familleData.conjoint.firstName} ${familleData.conjoint.lastName}`,
                                      );
                                      setValue(
                                        "beneficiary_id",
                                        familleData.conjoint.id,
                                      );
                                    }
                                  }}
                                />
                                <span className="text-sm">Conjoint(e)</span>
                              </label>

                              {/* Case Enfant */}
                              <label
                                className={cn(
                                  "flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-colors",
                                  watch("beneficiary_relationship") === "child"
                                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-medium"
                                    : "border-gray-200 hover:bg-gray-50 text-gray-700",
                                )}
                              >
                                <input
                                  type="radio"
                                  name="beneficiary_selection"
                                  className="h-4 w-4 text-emerald-600 border-gray-300"
                                  checked={
                                    watch("beneficiary_relationship") ===
                                    "child"
                                  }
                                  onChange={() => {
                                    setValue(
                                      "beneficiary_relationship",
                                      "child",
                                    );
                                    const firstEnfant =
                                      familleData?.enfants?.[0];
                                    if (firstEnfant) {
                                      setValue(
                                        "beneficiary_name",
                                        `${firstEnfant.firstName} ${firstEnfant.lastName}`,
                                      );
                                      setValue(
                                        "beneficiary_id",
                                        firstEnfant.id,
                                      );
                                    }
                                  }}
                                />
                                <span className="text-sm">Enfant</span>
                              </label>
                            </div>

                            {/* === ADHÉRENT sélectionné === */}
                            {(!watch("beneficiary_relationship") ||
                              watch("beneficiary_relationship") === "self") &&
                              (selectedAdherentInfo ? (
                                <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 space-y-3">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                                      {(
                                        selectedAdherentInfo.firstName?.[0] ||
                                        ""
                                      ).toUpperCase()}
                                      {(
                                        selectedAdherentInfo.lastName?.[0] || ""
                                      ).toUpperCase()}
                                    </div>
                                    <div className="flex-1">
                                      <p className="font-semibold text-sm text-gray-900">
                                        {selectedAdherentInfo.firstName}{" "}
                                        {selectedAdherentInfo.lastName}
                                      </p>
                                      <p className="text-xs text-gray-500 font-mono">
                                        {selectedAdherentInfo.matricule}
                                      </p>
                                    </div>
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0 bg-green-50 border-green-200 text-green-700"
                                    >
                                      <Check className="w-2.5 h-2.5 mr-0.5" />
                                      Actif
                                    </Badge>
                                  </div>
                                  <div className="grid grid-cols-1 gap-2 text-xs">
                                    {selectedAdherentInfo.email && (
                                      <div>
                                        <p className="text-gray-500">Email</p>
                                        <p className="text-gray-700">
                                          {selectedAdherentInfo.email}
                                        </p>
                                      </div>
                                    )}
                                    {selectedAdherentInfo.plafondGlobal !=
                                      null && (
                                      <div className='flex flex-col'>
                                        <p className="text-gray-500">
                                          Plafond restant
                                        </p>
                                        <p className="font-medium text-gray-700">
                                          {new Intl.NumberFormat("fr-TN", {
                                            maximumFractionDigits: 0,
                                          }).format(
                                            ((selectedAdherentInfo.plafondGlobal ||
                                              0) -
                                              (selectedAdherentInfo.plafondConsomme ||
                                                0)) /
                                              1000,
                                          )}{" "}
                                          DT
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : watch("adherent_matricule") ? (
                                <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4 space-y-3">
                                  <div className="flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                                    <p className="text-sm font-medium text-amber-800">
                                      Adhérent non identifié
                                    </p>
                                  </div>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">
                                        Nom
                                      </Label>
                                      <Input
                                        {...register("adherent_last_name")}
                                        placeholder="Nom"
                                        className="rounded-xl text-sm"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">
                                        Prénom
                                      </Label>
                                      <Input
                                        {...register("adherent_first_name")}
                                        placeholder="Prénom"
                                        className="rounded-xl text-sm"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">
                                        Date de naissance
                                      </Label>
                                      <Input
                                        type="date"
                                        {...register("adherent_date_of_birth")}
                                        className="rounded-xl text-sm"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">
                                        N° Contrat
                                      </Label>
                                      <Input
                                        {...register(
                                          "adherent_contract_number",
                                        )}
                                        placeholder="N° Contrat"
                                        className="rounded-xl text-sm"
                                      />
                                    </div>
                                    <div className="space-y-1 sm:col-span-2">
                                      <Label className="text-xs text-gray-500">
                                        Email
                                      </Label>
                                      <Input
                                        type="email"
                                        {...register("adherent_email")}
                                        placeholder="email@exemple.com"
                                        className="rounded-xl text-sm"
                                      />
                                    </div>
                                    <div className="space-y-1 sm:col-span-2">
                                      <Label className="text-xs text-gray-500">
                                        Adresse
                                      </Label>
                                      <Input
                                        {...register("adherent_address")}
                                        placeholder="Adresse complète"
                                        className="rounded-xl text-sm"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-end pt-1">
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={handleRegisterAdherent}
                                      disabled={isRegisteringAdherent}
                                      className="gap-1.5"
                                    >
                                      {isRegisteringAdherent ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <UserPlus className="h-3.5 w-3.5" />
                                      )}
                                      {isRegisteringAdherent
                                        ? "Enregistrement..."
                                        : "Enregistrer l'adhérent"}
                                    </Button>
                                  </div>
                                </div>
                              ) : null)}

                            {/* === CONJOINT === */}
                            {watch("beneficiary_relationship") === "spouse" &&
                              (selectedAdherentInfo && familleData?.conjoint ? (
                                <div className="rounded-xl border border-purple-200 bg-purple-50/30 p-4 space-y-3">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-600 text-sm font-bold text-white">
                                      {(
                                        familleData.conjoint.firstName?.[0] ||
                                        ""
                                      ).toUpperCase()}
                                      {(
                                        familleData.conjoint.lastName?.[0] || ""
                                      ).toUpperCase()}
                                    </div>
                                    <div className="flex-1">
                                      <p className="font-semibold text-sm text-gray-900">
                                        {familleData.conjoint.firstName}{" "}
                                        {familleData.conjoint.lastName}
                                      </p>
                                      <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                                        Conjoint(e)
                                      </span>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    {familleData.conjoint.dateOfBirth && (
                                      <div>
                                        <p className="text-gray-500">
                                          Date de naissance
                                        </p>
                                        <p className="text-gray-700">
                                          {new Date(
                                            familleData.conjoint.dateOfBirth,
                                          ).toLocaleDateString("fr-TN")}
                                        </p>
                                      </div>
                                    )}
                                    {familleData.conjoint.email && (
                                      <div>
                                        <p className="text-gray-500">Email</p>
                                        <p className="text-gray-700">
                                          {familleData.conjoint.email}
                                        </p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ) : selectedAdherentInfo ? (
                                /* Adherent registered but conjoint NOT in family — offer to add */
                                <div className="rounded-xl border border-purple-200 bg-purple-50/30 p-4 space-y-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Heart className="h-4 w-4 text-purple-600" />
                                    <p className="text-sm font-medium text-purple-800">
                                      Conjoint(e) non enregistré(e) — ajouter aux ayants droit
                                    </p>
                                  </div>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">Prénom</Label>
                                      <Input
                                        placeholder="Prénom"
                                        className="rounded-xl text-sm"
                                        value={ayantDroitForm.firstName}
                                        onChange={(e) => setAyantDroitForm((p) => ({ ...p, firstName: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">Nom</Label>
                                      <Input
                                        placeholder="Nom"
                                        className="rounded-xl text-sm"
                                        value={ayantDroitForm.lastName}
                                        onChange={(e) => setAyantDroitForm((p) => ({ ...p, lastName: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">Date de naissance</Label>
                                      <Input
                                        type="date"
                                        className="rounded-xl text-sm"
                                        value={ayantDroitForm.dateOfBirth}
                                        onChange={(e) => setAyantDroitForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">Email</Label>
                                      <Input
                                        type="email"
                                        placeholder="email@exemple.com"
                                        className="rounded-xl text-sm"
                                        value={ayantDroitForm.email}
                                        onChange={(e) => setAyantDroitForm((p) => ({ ...p, email: e.target.value }))}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-end pt-1">
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => handleAddAyantDroit('C')}
                                      disabled={isAddingAyantDroit}
                                      className="gap-1.5 bg-purple-600 hover:bg-purple-700"
                                    >
                                      {isAddingAyantDroit ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <UserPlus className="h-3.5 w-3.5" />
                                      )}
                                      {isAddingAyantDroit ? "Ajout..." : "Ajouter comme conjoint(e)"}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                /* Adherent NOT registered — simple manual input */
                                <div className="rounded-xl border border-purple-200 bg-purple-50/30 p-4 space-y-3">
                                  <p className="text-sm font-medium text-purple-800">
                                    Saisir les informations du/de la conjoint(e)
                                  </p>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">
                                        Nom et prénom
                                      </Label>
                                      <Input
                                        placeholder="Nom et prénom"
                                        className="rounded-xl text-sm"
                                        value={watch("beneficiary_name") || ""}
                                        onChange={(e) =>
                                          setValue(
                                            "beneficiary_name",
                                            e.target.value,
                                          )
                                        }
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">
                                        Date de naissance
                                      </Label>
                                      <Input
                                        type="date"
                                        className="rounded-xl text-sm"
                                        {...register(
                                          "beneficiary_date_of_birth",
                                        )}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">
                                        Email
                                      </Label>
                                      <Input
                                        type="email"
                                        placeholder="email@exemple.com"
                                        className="rounded-xl text-sm"
                                        {...register("beneficiary_email")}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))}

                            {/* === ENFANT === */}
                            {watch("beneficiary_relationship") === "child" &&
                              (selectedAdherentInfo &&
                              familleData?.enfants &&
                              familleData.enfants.length > 0 ? (
                                <div className="space-y-2">
                                  {familleData.enfants.length > 1 && (
                                    <Label className="text-xs text-gray-500">
                                      Sélectionnez l'enfant concerné
                                    </Label>
                                  )}
                                  <div className="grid gap-2">
                                    {familleData.enfants.map((enfant) => (
                                      <label
                                        key={enfant.id}
                                        className={cn(
                                          "flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors",
                                          watch("beneficiary_id") === enfant.id
                                            ? "border-emerald-500 bg-emerald-50/50"
                                            : "border-gray-200 hover:bg-gray-50",
                                        )}
                                      >
                                        <input
                                          type="radio"
                                          name="child_selection"
                                          className="h-4 w-4 text-emerald-600 border-gray-300"
                                          checked={
                                            watch("beneficiary_id") ===
                                            enfant.id
                                          }
                                          onChange={() => {
                                            setValue(
                                              "beneficiary_name",
                                              `${enfant.firstName} ${enfant.lastName}`,
                                            );
                                            setValue(
                                              "beneficiary_id",
                                              enfant.id,
                                            );
                                          }}
                                        />
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                                          {(
                                            enfant.firstName?.[0] || ""
                                          ).toUpperCase()}
                                          {(
                                            enfant.lastName?.[0] || ""
                                          ).toUpperCase()}
                                        </div>
                                        <div className="flex-1">
                                          <p className="text-sm font-medium text-gray-900">
                                            {enfant.firstName} {enfant.lastName}
                                          </p>
                                          <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                                            {enfant.dateOfBirth && (
                                              <span>
                                                {new Date(
                                                  enfant.dateOfBirth,
                                                ).toLocaleDateString("fr-TN")}
                                              </span>
                                            )}
                                            {enfant.email && (
                                              <span>{enfant.email}</span>
                                            )}
                                          </div>
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ) : selectedAdherentInfo ? (
                                /* Adherent registered but enfant NOT in family — offer to add */
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Baby className="h-4 w-4 text-emerald-600" />
                                    <p className="text-sm font-medium text-emerald-800">
                                      Enfant non enregistré(e) — ajouter aux ayants droit
                                    </p>
                                  </div>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">Prénom</Label>
                                      <Input
                                        placeholder="Prénom"
                                        className="rounded-xl text-sm"
                                        value={ayantDroitForm.firstName}
                                        onChange={(e) => setAyantDroitForm((p) => ({ ...p, firstName: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">Nom</Label>
                                      <Input
                                        placeholder="Nom"
                                        className="rounded-xl text-sm"
                                        value={ayantDroitForm.lastName}
                                        onChange={(e) => setAyantDroitForm((p) => ({ ...p, lastName: e.target.value }))}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">Date de naissance</Label>
                                      <Input
                                        type="date"
                                        className="rounded-xl text-sm"
                                        value={ayantDroitForm.dateOfBirth}
                                        onChange={(e) => setAyantDroitForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
                                      />
                                    </div>
                                    {/* Pas de champ email pour les enfants */}
                                  </div>
                                  <div className="flex items-center justify-end pt-1">
                                    <Button
                                      type="button"
                                      size="sm"
                                      onClick={() => handleAddAyantDroit('E')}
                                      disabled={isAddingAyantDroit}
                                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                                    >
                                      {isAddingAyantDroit ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <UserPlus className="h-3.5 w-3.5" />
                                      )}
                                      {isAddingAyantDroit ? "Ajout..." : "Ajouter comme enfant"}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                /* Adherent NOT registered — simple manual input (no email for enfant) */
                                <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-3">
                                  <p className="text-sm font-medium text-emerald-800">
                                    Saisir les informations de l'enfant
                                  </p>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">
                                        Nom et prénom
                                      </Label>
                                      <Input
                                        placeholder="Nom et prénom"
                                        className="rounded-xl text-sm"
                                        value={watch("beneficiary_name") || ""}
                                        onChange={(e) =>
                                          setValue(
                                            "beneficiary_name",
                                            e.target.value,
                                          )
                                        }
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-gray-500">
                                        Date de naissance
                                      </Label>
                                      <Input
                                        type="date"
                                        className="rounded-xl text-sm"
                                        {...register(
                                          "beneficiary_date_of_birth",
                                        )}
                                      />
                                    </div>
                                    {/* Pas de champ email pour les enfants */}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 04: Détails des Actes */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-6">
                      <div className="flex items-center justify-between mb-5">
                        <div className="flex items-center gap-3">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white">
                            04
                          </span>
                          <h2 className="text-lg font-semibold text-gray-900">
                            Détails des Actes
                          </h2>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            // Copy practitioner from previous acte to reduce repetitive entry
                            const lastActe =
                              watchedActes?.[watchedActes.length - 1];
                            appendActe({
                              code: "",
                              label: "",
                              amount: 0,
                              ref_prof_sant: lastActe?.ref_prof_sant || "",
                              nom_prof_sant: lastActe?.nom_prof_sant || "",
                              provider_id: lastActe?.provider_id || undefined,
                              care_type: lastActe?.care_type || "consultation",
                              care_description: "",
                              cod_msgr: "",
                              lib_msgr: "",
                            });
                            // Copy MF status from last acte if available
                            const lastMfStatus =
                              mfStatuses[watchedActes.length - 1];
                            if (lastActe?.ref_prof_sant && lastMfStatus) {
                              setMfStatuses((prev) => ({
                                ...prev,
                                [watchedActes.length]: lastMfStatus,
                              }));
                            }
                          }}
                          className="text-sm font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                        >
                          <Plus className="h-4 w-4" />
                          Ajouter un acte
                        </button>
                      </div>

                      {errors.actes?.root && (
                        <p className="text-sm text-destructive mb-3">
                          {errors.actes.root.message}
                        </p>
                      )}

                      {/* Separator */}
                      <div className="border-b border-gray-100" />

                      <div className="divide-y divide-gray-100">
                        {actesFields.map((field, index) => {
                          const acteCareType =
                            watch(`actes.${index}.care_type`) || "consultation";
                          return (
                            <div key={field.id} className="py-4 space-y-3">
                              {/* Type de soin per acte */}
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-400 uppercase">
                                  Acte {index + 1}
                                </span>
                                <Select
                                  value={acteCareType}
                                  disabled={
                                    isSubmitting || isRegisteringAdherent
                                  }
                                  onValueChange={(v) =>
                                    setValue(
                                      `actes.${index}.care_type`,
                                      v as
                                        | "consultation"
                                        | "pharmacy"
                                        | "lab"
                                        | "hospital",
                                    )
                                  }
                                >
                                  <SelectTrigger className="w-48 h-8 rounded-lg text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="consultation">
                                      <span className="flex items-center gap-1.5">
                                        <Stethoscope className="h-3 w-3" />{" "}
                                        Consultation
                                      </span>
                                    </SelectItem>
                                    <SelectItem value="pharmacy">
                                      <span className="flex items-center gap-1.5">
                                        <Pill className="h-3 w-3" /> Pharmacie
                                      </span>
                                    </SelectItem>
                                    <SelectItem value="lab">
                                      <span className="flex items-center gap-1.5">
                                        <FlaskConical className="h-3 w-3" />{" "}
                                        Analyses
                                      </span>
                                    </SelectItem>
                                    <SelectItem value="hospital">
                                      <span className="flex items-center gap-1.5">
                                        <Building2 className="h-3 w-3" />{" "}
                                        Hospitalisation
                                      </span>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                                {actesFields.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      removeActe(index);
                                      setMfStatuses((prev) => {
                                        const next = { ...prev };
                                        delete next[index];
                                        return next;
                                      });
                                    }}
                                    className="ml-auto shrink-0 p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                )}
                              </div>

                              <div className="grid gap-3 sm:grid-cols-12 items-start">
                                {/* Practitioner / identifier */}
                                <div className="sm:col-span-3 space-y-2">
                                  <div>
                                    <Label className="text-sm text-gray-700">
                                      {acteCareType === "pharmacy"
                                        ? "Pharmacien *"
                                        : acteCareType === "consultation"
                                          ? "Médecin *"
                                          : acteCareType === "lab"
                                            ? "Laboratoire *"
                                            : "Établissement *"}
                                    </Label>
                                    <Input
                                      {...register(
                                        `actes.${index}.nom_prof_sant`,
                                      )}
                                      placeholder={
                                        acteCareType === "pharmacy"
                                          ? "Nom pharmacie"
                                          : acteCareType === "consultation"
                                            ? "Dr. Mohamed Ali"
                                            : acteCareType === "lab"
                                              ? "Nom du labo"
                                              : "Clinique / Hôpital"
                                      }
                                      className="rounded-xl text-sm"
                                    />
                                    {errors.actes?.[index]?.nom_prof_sant && (
                                      <p className="text-xs text-destructive mt-1">
                                        {
                                          errors.actes[index].nom_prof_sant
                                            ?.message
                                        }
                                      </p>
                                    )}
                                    {/* Info praticien OCR + auto-enregistrement quand MF non trouvé */}
                                    {mfStatuses[index] === "not_found" && (
                                      <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2.5 space-y-2">
                                        {/* Afficher les infos OCR du tampon si disponibles */}
                                        {ocrPraticienInfos[index] && (
                                          <div className="space-y-1">
                                            <p className="text-[11px] font-semibold text-amber-800 flex items-center gap-1">
                                              <ScanSearch className="h-3 w-3" />
                                              Informations extraites du tampon
                                            </p>
                                            <div className="grid grid-cols-1 gap-0.5 text-[11px] text-amber-700">
                                              {ocrPraticienInfos[index]
                                                ?.nom && (
                                                <p>
                                                  <span className="text-amber-500">
                                                    Nom :
                                                  </span>{" "}
                                                  {
                                                    ocrPraticienInfos[index]!
                                                      .nom
                                                  }
                                                </p>
                                              )}
                                              {ocrPraticienInfos[index]?.mf && (
                                                <p>
                                                  <span className="text-amber-500">
                                                    MF :
                                                  </span>{" "}
                                                  <span className="font-mono">
                                                    {
                                                      ocrPraticienInfos[index]!
                                                        .mf
                                                    }
                                                  </span>
                                                </p>
                                              )}
                                              {ocrPraticienInfos[index]
                                                ?.specialite && (
                                                <p>
                                                  <span className="text-amber-500">
                                                    Spécialité :
                                                  </span>{" "}
                                                  {
                                                    ocrPraticienInfos[index]!
                                                      .specialite
                                                  }
                                                </p>
                                              )}
                                              {ocrPraticienInfos[index]
                                                ?.adresse && (
                                                <p>
                                                  <span className="text-amber-500">
                                                    Adresse :
                                                  </span>{" "}
                                                  {
                                                    ocrPraticienInfos[index]!
                                                      .adresse
                                                  }
                                                </p>
                                              )}
                                              {ocrPraticienInfos[index]
                                                ?.telephone && (
                                                <p>
                                                  <span className="text-amber-500">
                                                    Tél :
                                                  </span>{" "}
                                                  {
                                                    ocrPraticienInfos[index]!
                                                      .telephone
                                                  }
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                        {/* Checkbox auto-enregistrement */}
                                        <label className="flex items-start gap-2 cursor-pointer">
                                          <input
                                            type="checkbox"
                                            checked={
                                              autoRegisterPraticien[index] ??
                                              true
                                            }
                                            onChange={(e) =>
                                              setAutoRegisterPraticien(
                                                (prev) => ({
                                                  ...prev,
                                                  [index]: e.target.checked,
                                                }),
                                              )
                                            }
                                            className="mt-0.5 h-3.5 w-3.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                                          />
                                          <span className="text-[11px] text-amber-700 leading-tight">
                                            <span className="font-semibold flex items-center gap-1">
                                              <AlertTriangle className="h-3 w-3 inline" />
                                              Ce praticien sera enregistré
                                              automatiquement
                                            </span>
                                            <span className="block text-amber-600 mt-0.5">
                                              Le praticien avec le MF{" "}
                                              <span className="font-mono">
                                                {watch(
                                                  `actes.${index}.ref_prof_sant`,
                                                )}
                                              </span>{" "}
                                              n'existe pas dans la base.
                                              {watch(
                                                `actes.${index}.nom_prof_sant`,
                                              )?.trim()
                                                ? ` Il sera créé sous le nom "${watch(`actes.${index}.nom_prof_sant`)?.trim()}".`
                                                : " Veuillez renseigner son nom ci-dessus."}
                                            </span>
                                          </span>
                                        </label>
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <Label className="text-sm text-gray-700">
                                      Matricule fiscale *
                                    </Label>
                                    <MfLookupInput
                                      value={
                                        watch(`actes.${index}.ref_prof_sant`) ||
                                        ""
                                      }
                                      onChange={(val) =>
                                        setValue(
                                          `actes.${index}.ref_prof_sant`,
                                          val,
                                        )
                                      }
                                      onProviderFound={(provider) => {
                                        // Autocomplete: fill name and provider_id from existing provider
                                        console.log("provider",provider)
                                        setValue(
                                          `actes.${index}.nom_prof_sant`,
                                          provider.name,
                                        );
                                        setValue(
                                          `actes.${index}.provider_id`,
                                          provider.id,
                                        );
                                        // Provider found — no need to auto-register
                                        setAutoRegisterPraticien((prev) => ({
                                          ...prev,
                                          [index]: false,
                                        }));
                                      }}
                                      onStatusChange={(status) => {
                                        // Clear provider_id when MF changes and provider is not found
                                        if (
                                          status !== "found" &&
                                          status !== "registered"
                                        ) {
                                          setValue(
                                            `actes.${index}.provider_id`,
                                            undefined,
                                          );
                                        }
                                        // Update auto-register state based on lookup result
                                        if (status === "not_found") {
                                          setAutoRegisterPraticien((prev) => ({
                                            ...prev,
                                            [index]: true,
                                          }));
                                        } else if (
                                          status === "found" ||
                                          status === "registered"
                                        ) {
                                          setAutoRegisterPraticien((prev) => ({
                                            ...prev,
                                            [index]: false,
                                          }));
                                        }
                                        setMfStatuses((prev) => ({
                                          ...prev,
                                          [index]: status,
                                        }));
                                      }}
                                      providerType={
                                        acteCareType === "pharmacy"
                                          ? "pharmacist"
                                          : acteCareType === "lab"
                                            ? "lab"
                                            : acteCareType === "hospital"
                                              ? "clinic"
                                              : "doctor"
                                      }
                                      error={
                                        errors.actes?.[index]?.ref_prof_sant
                                          ?.message
                                      }
                                    />
                                  </div>
                                </div>

                                {/* Acte description / selector */}
                                <div className="sm:col-span-6 space-y-2">
                                  <div>
                                    <Label className="text-sm text-gray-700">
                                      {acteCareType === "pharmacy"
                                        ? "Médicament *"
                                        : "Acte médical *"}
                                    </Label>
                                    {acteCareType === "pharmacy" ? (
                                      <MedicationAutocomplete
                                        value={
                                          watch(`actes.${index}.label`) || ""
                                        }
                                        familyId={selectedMedicationFamily}
                                        onSelect={(med) => {
                                          setValue(
                                            `actes.${index}.code`,
                                            med.code_pct || med.code_amm || "",
                                          );
                                          const reimbLabel =
                                            med.reimbursement_rate
                                              ? `[R ${Math.round(med.reimbursement_rate * 100)}%]`
                                              : "[NR]";
                                          setValue(
                                            `actes.${index}.label`,
                                            `${med.brand_name} - ${med.dci} ${med.dosage || ""} ${med.form || ""} ${reimbLabel}`.trim(),
                                          );
                                          if (med.price_public) {
                                            setValue(
                                              `actes.${index}.amount`,
                                              med.price_public / 1000,
                                            );
                                          }
                                        }}
                                      />
                                    ) : (
                                      <>
                                        <ActeSelector
                                          value={
                                            watch(`actes.${index}.code`) || ""
                                          }
                                          disabled={
                                            isSubmitting ||
                                            isRegisteringAdherent
                                          }
                                          onChange={(code, acte) => {
                                            setValue(
                                              `actes.${index}.code`,
                                              code,
                                            );
                                            setValue(
                                              `actes.${index}.label`,
                                              acte.label,
                                            );
                                          }}
                                        />
                                        {/* Libellé de l'acte — éditable, pré-rempli par OCR ou sélection */}
                                        {/* <Input
                                          {...register(`actes.${index}.label`)}
                                          placeholder="Libellé de l'acte médical"
                                          className="rounded-xl text-sm mt-1.5"
                                        /> */}
                                      </>
                                    )}
                                    {errors.actes?.[index]?.label && (
                                      <p className="text-xs text-destructive mt-1">
                                        {errors.actes[index].label?.message}
                                      </p>
                                    )}
                                  </div>
                                  {/* Reimbursement info for pharmacy */}
                                  {acteCareType === "pharmacy" &&
                                    watch(`actes.${index}.label`) &&
                                    (() => {
                                      const label =
                                        watch(`actes.${index}.label`) || "";
                                      const amount =
                                        watch(`actes.${index}.amount`) || 0;
                                      const tauxMatch =
                                        label.match(/\[R (\d+)%\]/);
                                      if (tauxMatch) {
                                        const taux =
                                          Number.parseInt(
                                            tauxMatch[1] || "70",
                                            10,
                                          ) / 100;
                                        const montantRembourse = amount * taux;
                                        const ticketModerateur =
                                          amount - montantRembourse;
                                        return (
                                          <div className="mt-1 flex items-center gap-3 text-[11px]">
                                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-green-50 text-green-700 rounded border border-green-200">
                                              <CheckCircle2 className="h-3 w-3" />
                                              Remboursable{" "}
                                              {Math.round(taux * 100)}%
                                            </span>
                                            {amount > 0 && (
                                              <>
                                                <span className="text-gray-500">
                                                  PEC :{" "}
                                                  {montantRembourse.toFixed(3)}{" "}
                                                  DT
                                                </span>
                                                <span className="text-gray-500">
                                                  TM :{" "}
                                                  {ticketModerateur.toFixed(3)}{" "}
                                                  DT
                                                </span>
                                              </>
                                            )}
                                          </div>
                                        );
                                      }
                                      if (label.includes("[NR]")) {
                                        return (
                                          <div className="mt-1 flex items-center gap-1 text-[11px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded border border-red-200 w-fit">
                                            <Ban className="h-3 w-3" />
                                            Non remboursable — à la charge de
                                            l'adhérent
                                          </div>
                                        );
                                      }
                                      return null;
                                    })()}
                                  {/* Description de soin — Textarea */}
                                  <div>
                                    <Label className="text-sm text-gray-700">
                                      {acteCareType === "pharmacy"
                                        ? "Observation"
                                        : "Description de soin"}
                                    </Label>
                                    <Textarea
                                      {...register(
                                        acteCareType === "pharmacy"
                                          ? `actes.${index}.lib_msgr`
                                          : `actes.${index}.care_description`,
                                      )}
                                      placeholder={
                                        acteCareType === "pharmacy"
                                          ? "Observation (ex: ordonnance n°...)"
                                          : acteCareType === "consultation"
                                            ? "Motif de consultation, diagnostic, observations..."
                                            : acteCareType === "lab"
                                              ? "Ref. ordonnance, analyses prescrites..."
                                              : "Motif d'hospitalisation, durée de séjour..."
                                      }
                                      rows={2}
                                      className="rounded-xl text-sm resize-none"
                                    />
                                  </div>
                                </div>

                                {/* Amount */}
                                <div className="sm:col-span-3">
                                  <Label className="text-sm text-gray-700">
                                    Montant (TND)
                                  </Label>
                                  <Input
                                    type="number"
                                    step="0.001"
                                    {...register(`actes.${index}.amount`, {
                                      valueAsNumber: true,
                                    })}
                                    placeholder="0.000"
                                    className="rounded-xl text-right"
                                  />
                                  {errors.actes?.[index]?.amount && (
                                    <p className="text-xs text-destructive mt-1">
                                      {errors.actes[index].amount?.message}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="flex justify-end border-t border-gray-100 pt-4 mt-2">
                        <p className="text-lg font-bold text-gray-900">
                          Total : {formatAmount(actesTotal)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ===== RIGHT SIDEBAR ===== */}
                  <div className="space-y-5">
                    {/* Workflow stepper */}
                    <div className="rounded-2xl bg-gradient-to-br from-gray-900 to-blue-950 p-5 text-white">
                      <p className="text-xs font-semibold uppercase tracking-wider text-gray-300 mb-4">
                        Workflow de saisie
                      </p>
                      <div className="space-y-0">
                        {[
                          {
                            label: "Numérisation réalisée",
                            done: selectedFiles.length > 0,
                          },
                          {
                            label: "Données générales",
                            done: !!(
                              watch("bulletin_number") && watch("bulletin_date")
                            ),
                          },
                          {
                            label: "Adhérent identifié",
                            done:
                              !!selectedAdherentInfo ||
                              !!(
                                watch("adherent_matricule") &&
                                watch("adherent_last_name")
                              ),
                          },
                          {
                            label: "Bénéficiaire sélectionné",
                            done:
                              !!selectedAdherentInfo &&
                              (watch("beneficiary_relationship") === "self" ||
                                !!watch("beneficiary_name")),
                          },
                          {
                            label: "Détails des actes",
                            done: (watchedActes || []).some(
                              (a) => a.label && a.amount > 0,
                            ),
                          },
                          {
                            label: "Matricules fiscales validés",
                            done:
                              !hasMfBlocking &&
                              (watchedActes || []).length > 0 &&
                              watchedActes?.every((_a, idx) =>
                                [
                                  "found",
                                  "registered",
                                  "not_found",
                                  "forced",
                                ].includes(mfStatuses[idx] || ""),
                              ),
                          },
                        ].map((step, i, arr) => (
                          <div
                            key={step.label}
                            className="flex items-start gap-3"
                          >
                            <div className="flex flex-col items-center">
                              {step.done ? (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500">
                                  <Check className="h-3.5 w-3.5 text-white" />
                                </div>
                              ) : (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-gray-500" />
                              )}
                              {i < arr.length - 1 && (
                                <div
                                  className={`w-0.5 h-6 ${step.done ? "bg-blue-500" : "bg-gray-600"}`}
                                />
                              )}
                            </div>
                            <p
                              className={`text-sm pt-0.5 ${step.done ? "text-white font-medium" : "text-gray-400"}`}
                            >
                              {step.label}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Scan preview */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                          Aperçu du scan
                        </p>
                        {selectedFiles.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setShowScanPreview(true)}
                            className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                          >
                            Agrandir
                          </button>
                        )}
                      </div>
                      {selectedFiles.length > 0 ? (
                        <div className="max-h-72 overflow-y-auto space-y-2 rounded-xl">
                          {selectedFiles.map((file, idx) => (
                            <div
                              key={idx}
                              className="rounded-xl bg-gray-100 overflow-hidden"
                            >
                              {file.type.startsWith("image/") ? (
                                <img
                                  src={URL.createObjectURL(file)}
                                  alt={`Scan ${idx + 1}`}
                                  className="w-full h-auto max-h-56 object-contain"
                                />
                              ) : (
                                <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                                  <FileText className="h-8 w-8 mb-2" />
                                  <p className="text-xs">{file.name}</p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center rounded-xl bg-gray-50 py-10 text-gray-400">
                          <FileImage className="h-8 w-8 mb-2" />
                          <p className="text-xs">Aucun scan importé</p>
                        </div>
                      )}
                    </div>

                    {/* Scan preview fullscreen dialog */}
                    <Dialog
                      open={showScanPreview}
                      onOpenChange={setShowScanPreview}
                    >
                      <DialogContent className="w-full max-w-4xl max-h-[90vh] flex flex-col">
                        <DialogHeader>
                          <DialogTitle>Aperçu des scans</DialogTitle>
                        </DialogHeader>
                        <div className="flex-1 overflow-auto space-y-4">
                          {selectedFiles.map((file, idx) => (
                            <div
                              key={idx}
                              className="rounded-xl overflow-hidden bg-gray-50"
                            >
                              {file.type.startsWith("image/") ? (
                                <img
                                  src={URL.createObjectURL(file)}
                                  alt={`Scan ${idx + 1}`}
                                  className="w-full h-auto object-contain"
                                />
                              ) : (
                                <iframe
                                  src={`${URL.createObjectURL(file)}#toolbar=0`}
                                  className="w-full h-[600px] border-0"
                                  title={file.name}
                                />
                              )}
                              <p className="text-xs text-center text-gray-500 py-2">
                                {file.name}
                              </p>
                            </div>
                          ))}
                        </div>
                      </DialogContent>
                    </Dialog>

                    {/* Total amount + reimbursement estimate */}
                    <div className="rounded-2xl border border-gray-200 bg-white p-5">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Montant déclaré</span>
                        <span className="text-lg font-bold text-gray-900">{formatAmount(actesTotal)} TND</span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                        <span className="text-xs font-semibold uppercase tracking-wider text-green-600">Total à rembourser</span>
                        <span className="text-2xl font-bold text-green-600">
                          {estimatedReimbursement != null ? formatAmount(estimatedReimbursement) : '—'}{" "}
                          <span className="text-sm font-medium text-green-500">TND</span>
                        </span>
                      </div>
                      {estimateData?.warning && (
                        <p className="text-[10px] text-amber-600 mt-1">{estimateData.warning}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1 text-center">
                        {(watchedActes || []).filter((a) => a.amount > 0).length} acte(s) médical(aux)
                      </p>
                    </div>

                    {/* Action buttons */}
                    {canCreate && <button
                      type="submit"
                      disabled={
                        isSubmitting ||
                        hasMfBlocking ||
                        hasBeneficiaryBlocking ||
                        !(
                          watchedActes?.length > 0 &&
                          watch("adherent_matricule")
                        )
                      }
                      className="w-full rounded-xl bg-gradient-to-r from-gray-900 to-blue-950 px-6 py-3.5 text-sm font-semibold text-white hover:from-gray-800 hover:to-blue-900 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />{" "}
                          Enregistrement...
                        </>
                      ) : hasBeneficiaryBlocking ? (
                        <>
                          <AlertTriangle className="h-4 w-4" />{" "}
                          {watchedBeneficiaryRel === "spouse"
                            ? "Conjoint(e) non enregistré(e)"
                            : "Aucun enfant enregistré"}
                        </>
                      ) : hasMfBlocking ? (
                        <>
                          <XCircle className="h-4 w-4" /> {mfBlockingReason}
                        </>
                      ) : (
                        <>Enregistrer le bulletin</>
                      )}
                    </button>}
                    <button
                      type="button"
                      onClick={() => {
                        reset();
                        setSelectedFiles([]);
                        setSelectedAdherentInfo(null);
                        setOcrFeedback(null);
                        setMfStatuses({});
                        setBulletinNumberFromOcr(false);
                      }}
                      className="w-full text-center text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors py-2"
                    >
                      Annuler la saisie
                    </button>

                    {/* Plafonds */}
                    {selectedAdherentInfo && plafondsData && (
                      <PlafondsCard
                        global={plafondsData.global}
                        parFamille={plafondsData.parFamille}
                        totalConsomme={plafondsData.totalConsomme}
                        totalPlafond={plafondsData.totalPlafond}
                      />
                    )}

                    {/* Famille */}
                    {selectedAdherentInfo && familleData && (
                      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                        <div className="px-5 py-3 border-b border-gray-100">
                          <p className="text-sm font-semibold text-gray-900">
                            Famille
                          </p>
                          <p className="text-xs text-gray-500">
                            Adhérent principal et ayants droit
                          </p>
                        </div>
                        <div className="p-0">
                          <FamilleTable
                            principal={familleData.principal}
                            conjoint={familleData.conjoint}
                            enfants={familleData.enfants}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </fieldset>
              )}
            </form>
          )}
        </TabsContent>

        {/* Tab: Liste */}
        <TabsContent value="liste" className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white">
            {/* Header: title + search + actions */}
            <div className="iems-start flex-col sm:flex-row flex sm:items-center justify-between px-6 py-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-900">
                Bulletins récents
              </h3>
              <div className="md:flex md:items-center gap-3 grid-cols-1 grid ">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Rechercher un dossier..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-full sm:w-64 rounded-xl border-gray-200 bg-gray-50 focus:bg-white"
                  />
                </div>
                {canDelete && selectedBulletins.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => setBulkDeleteBulletinConfirm(true)}
                      disabled={bulkDeleteMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                      Supprimer ({selectedBulletins.length})
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <DataTable
              columns={[
                ...(canDelete ? [{
                  key: "checkbox",
                  header: (
                    <input
                      type="checkbox"
                      checked={allDraftsSelected}
                      ref={(el: HTMLInputElement | null) => {
                        if (el)
                          el.indeterminate =
                            someDraftsSelected && !allDraftsSelected;
                      }}
                      onChange={handleToggleSelectAllBulletins}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      title="Sélectionner tous les brouillons"
                    />
                  ),
                  className: "w-10",
                  render: (row: BulletinSaisie) => (
                    <input
                      type="checkbox"
                      checked={selectedBulletins.includes(row.id)}
                      onChange={() => handleToggleBulletin(row.id)}
                      onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  ),
                }] : []),
                {
                  key: "bulletin_number",
                  header: "Bulletin",
                  render: (row: BulletinSaisie) => (
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {row.bulletin_number || "Brouillon"}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDate(row.bulletin_date)}
                      </p>
                    </div>
                  ),
                },
                {
                  key: "adherent",
                  header: "Adhérent",
                  render: (row: BulletinSaisie) => {
                    const initials =
                      `${(row.adherent_first_name || "")[0] || ""}${(row.adherent_last_name || "")[0] || ""}`.toUpperCase();
                    return (
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[10px] font-bold text-blue-700">
                          {initials}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {row.adherent_first_name} {row.adherent_last_name}
                          </p>
                          <p className="text-xs text-gray-400 font-mono">
                            ID: {row.adherent_matricule}
                          </p>
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: "care_type",
                  header: "Type de soins",
                  render: (row: BulletinSaisie) => {
                    const config =
                      careTypeConfig[
                        row.care_type as keyof typeof careTypeConfig
                      ] || careTypeConfig.consultation;
                    const Icon = config.icon;
                    return (
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-700">
                          {config.label}
                        </span>
                      </div>
                    );
                  },
                },
                {
                  key: "total_amount",
                  header: "Montant",
                  className: "text-right",
                  render: (row: BulletinSaisie) => (
                    <p className="text-sm font-semibold text-gray-900">
                      {formatAmount(row.total_amount)}
                    </p>
                  ),
                },
                {
                  key: "status",
                  header: "Statut",
                  className: "text-center",
                  render: (row: BulletinSaisie) => {
                    const statusConf = bulletinStatusConfig[row.status] ?? {
                      label: row.status,
                      variant: "secondary" as const,
                    };
                    return (
                      <span
                        className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
                          row.status === "draft"
                            ? "bg-gray-100 text-gray-600"
                            : row.status === "in_batch"
                              ? "bg-blue-50 text-blue-700"
                              : row.status === "approved" ||
                                  row.status === "approuve"
                                ? "bg-green-50 text-green-700"
                                : row.status === "rejected" ||
                                    row.status === "rejete"
                                  ? "bg-red-50 text-red-700"
                                  : row.status === "paye"
                                    ? "bg-emerald-50 text-emerald-700"
                                    : "bg-gray-100 text-gray-600",
                        )}
                      >
                        {statusConf.label}
                      </span>
                    );
                  },
                },
                {
                  key: "actions",
                  header: "Actions",
                  className: "text-center",
                  render: (row: BulletinSaisie) => (
                    <div
                      className="flex justify-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => fetchBulletinDetail(row.id)}
                        className="rounded-lg p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Voir le détail"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      {["draft", "in_batch"].includes(row.status) && (
                        <button
                          type="button"
                          className="rounded-lg p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors"
                          title="Valider"
                          onClick={async () => {
                            const response =
                              await apiClient.get<BulletinDetail>(
                                `/bulletins-soins/agent/${row.id}`,
                              );
                            if (response.success && response.data) {
                              setValidateBulletinTarget(response.data);
                              setShowValidateDialog(true);
                            }
                          }}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && row.status !== "exported" && (
                        <button
                          type="button"
                          onClick={() => setDeleteBulletinId(row.id)}
                          className="rounded-lg p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Supprimer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ),
                },
              ]}
              data={paginatedBulletins}
              isLoading={loadingBulletins}
              emptyMessage="Aucun bulletin saisi"
              pagination={{
                page: listePage,
                limit: listePageSize,
                total: filteredBulletins.length,
                onPageChange: setListePage,
              }}
            />
          </div>
        </TabsContent>

        {/* Tab: Lots */}
        <TabsContent value="lots" className="space-y-4">
          {/* Search & Filter bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher un lot..."
                value={batchSearch}
                onChange={(e) => {
                  setBatchSearch(e.target.value);
                  setBatchPage(1);
                }}
                className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <FilterDropdown
              label="Statut"
              value={{ all: 'Tous les statuts', open: 'Ouvert', closed: 'Fermé', exported: 'Exporté' }[batchStatusFilter] || 'Tous les statuts'}
              open={batchStatusDropdownOpen}
              onToggle={() => setBatchStatusDropdownOpen(!batchStatusDropdownOpen)}
              onClose={() => setBatchStatusDropdownOpen(false)}
              menuWidth="w-48"
            >
              <FilterOption selected={batchStatusFilter === 'all'} onClick={() => { setBatchStatusFilter('all'); setBatchPage(1); setBatchStatusDropdownOpen(false); }}>Tous les statuts</FilterOption>
              <FilterOption selected={batchStatusFilter === 'open'} onClick={() => { setBatchStatusFilter('open'); setBatchPage(1); setBatchStatusDropdownOpen(false); }}>Ouvert</FilterOption>
              <FilterOption selected={batchStatusFilter === 'closed'} onClick={() => { setBatchStatusFilter('closed'); setBatchPage(1); setBatchStatusDropdownOpen(false); }}>Fermé</FilterOption>
              <FilterOption selected={batchStatusFilter === 'exported'} onClick={() => { setBatchStatusFilter('exported'); setBatchPage(1); setBatchStatusDropdownOpen(false); }}>Exporté</FilterOption>
            </FilterDropdown>
            {canDelete && selectedBatches.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setBulkDeleteBatchConfirm(true)}
                  disabled={bulkDeleteBatchesMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer ({selectedBatches.length})
                </button>
              </>
            )}
          </div>

          <DataTable
            columns={[
              ...(canDelete && batchesData.length > 0 ? [{
                key: "checkbox",
                header: (
                  <input
                    type="checkbox"
                    checked={allBatchesSelected}
                    ref={(el: HTMLInputElement | null) => {
                      if (el)
                        el.indeterminate =
                          someBatchesSelected && !allBatchesSelected;
                    }}
                    onChange={handleToggleSelectAllBatches}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                    title="Sélectionner tous les lots"
                  />
                ),
                className: "w-10",
                render: (batch: Batch) => (
                  <input
                    type="checkbox"
                    checked={selectedBatches.includes(batch.id)}
                    onChange={() =>
                      setSelectedBatches((prev) =>
                        prev.includes(batch.id)
                          ? prev.filter((b) => b !== batch.id)
                          : [...prev, batch.id],
                      )
                    }
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                ),
              }] : []),
              {
                key: "name",
                header: "Nom du lot",
                render: (batch: Batch) => (
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50">
                      <Package className="h-4 w-4 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {batch.name}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatDate(batch.created_at)}
                      </p>
                    </div>
                  </div>
                ),
              },
              {
                key: "bulletins_count",
                header: "Bulletins",
                className: "text-center",
                render: (batch: Batch) => (
                  <p className="text-sm font-medium text-gray-900">
                    {batch.bulletins_count}
                  </p>
                ),
              },
              {
                key: "total_amount",
                header: "Montant total",
                className: "text-right",
                render: (batch: Batch) => (
                  <p className="text-sm font-semibold text-gray-900">
                    {formatAmount(batch.total_amount)}
                  </p>
                ),
              },
              {
                key: "status",
                header: "Statut",
                className: "text-center",
                render: (batch: Batch) => (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
                      batch.status === "open"
                        ? "bg-blue-50 text-blue-700"
                        : batch.status === "exported"
                          ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-600",
                    )}
                  >
                    {batch.status === "open"
                      ? "Ouvert"
                      : batch.status === "exported"
                        ? "Exporté"
                        : "Fermé"}
                  </span>
                ),
              },
              {
                key: "actions",
                header: "Actions",
                className: "text-center",
                render: (batch: Batch) => (
                  <div
                    className="flex justify-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => handleExportBatch(batch)}
                      disabled={!batch.bulletins_count}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      {batch.status === "exported"
                        ? "Re-exporter"
                        : "Export recap"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleExportDetailBatch(batch)}
                      disabled={!batch.bulletins_count}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5" />
                      Export detaillé
                    </button>
                  </div>
                ),
              },
            ]}
            data={batchesData}
            isLoading={loadingBatches}
            emptyMessage={
              batchSearch || batchStatusFilter !== "all"
                ? "Aucun lot trouvé — modifiez vos filtres"
                : "Aucun lot trouvé"
            }
            pagination={{
              page: batchPage,
              limit: batchesMeta.limit ?? 10,
              total: batchesMeta.total,
              onPageChange: setBatchPage,
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Create Batch Dialog */}
      <Dialog open={showBatchDialog} onOpenChange={setShowBatchDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer un nouveau lot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom du lot</Label>
              <Input
                value={newBatchName}
                onChange={(e) => setNewBatchName(e.target.value)}
                placeholder={`Lot_${new Date().toISOString().split("T")[0]}`}
              />
            </div>
            {selectedBulletins.length > 0 ? (
              <div className="p-3 rounded-lg bg-muted">
                <p className="text-sm font-medium">
                  {selectedBulletins.length} bulletins seront ajoutés au lot
                </p>
                <p className="text-sm text-muted-foreground">
                  Montant total:{" "}
                  {formatAmount(
                    (bulletinsData || [])
                      .filter((b) => selectedBulletins.includes(b.id))
                      .reduce((sum, b) => sum + b.total_amount, 0),
                  )}
                </p>
              </div>
            ) : (
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-100">
                <p className="text-sm text-blue-700">
                  Le lot sera créé vide. Les prochains bulletins saisis y seront ajoutés automatiquement.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleCreateBatch}
              disabled={createBatchMutation.isPending}
            >
              {createBatchMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <FolderPlus className="mr-2 h-4 w-4" />
                  Créer le lot
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      {/* New practitioners registered popup */}
      <Dialog
        open={showNewPractitionersDialog}
        onOpenChange={setShowNewPractitionersDialog}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 className="h-5 w-5" />
              Nouveau(x) praticien(s) ajouté(s)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <p className="text-sm text-gray-600">
              Les praticiens suivants ont été enregistrés automatiquement lors
              de la création du bulletin :
            </p>
            <ul className="space-y-1">
              {newPractitioners.map((name, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 text-sm font-medium text-gray-900 bg-emerald-50 rounded-lg px-3 py-2"
                >
                  <UserPlus className="h-4 w-4 text-emerald-600 shrink-0" />
                  {name}
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 mt-2">
              La vérification du matricule fiscal est en attente de validation.
            </p>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setShowNewPractitionersDialog(false)}
              className="rounded-xl"
            >
              Compris
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {exportBatch?.status === "exported"
                ? "Re-exporter le lot en CSV"
                : "Exporter le lot en CSV"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {exportBatch?.status === "exported" ? (
                <>
                  Ce lot a déjà été exporté. Voulez-vous re-exporter "
                  {exportBatch?.name}" ?
                </>
              ) : (
                <>Voulez-vous exporter le lot "{exportBatch?.name}" ?</>
              )}
              <br />
              <span className="font-medium">
                {exportBatch?.bulletins_count} bulletins
              </span>{" "}
              pour un total de{" "}
              <span className="font-medium">
                {formatAmount(exportBatch?.total_amount || 0)}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                exportBatch &&
                exportBatchMutation.mutate({
                  batchId: exportBatch.id,
                  force: exportBatch.status === "exported",
                })
              }
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
                  {exportBatch?.status === "exported"
                    ? "Re-exporter CSV"
                    : "Télécharger CSV"}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Export Detail Dialog */}
      <AlertDialog
        open={showExportDetailDialog}
        onOpenChange={setShowExportDetailDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Exporter le bordereau détaillé</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous télécharger le bordereau détaillé du lot "
              {exportBatch?.name}" ?
              <br />
              Ce fichier contient toutes les lignes d&apos;actes avec les codes,
              montants engagés et remboursés.
              <br />
              <span className="font-medium">
                {exportBatch?.bulletins_count} bulletins
              </span>{" "}
              pour un total de{" "}
              <span className="font-medium">
                {formatAmount(exportBatch?.total_amount || 0)}
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                exportBatch &&
                exportDetailMutation.mutate({
                  batchId: exportBatch.id,
                })
              }
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
                  Télécharger détaillé
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulletin Detail Dialog */}
      <Dialog open={!!viewBulletin} onOpenChange={() => setViewBulletin(null)}>
        <DialogContent className="w-full max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulletin {viewBulletin?.bulletin_number}</DialogTitle>
          </DialogHeader>
          {viewBulletin && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {formatDate(viewBulletin.bulletin_date)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">
                    {careTypeConfig[
                      viewBulletin.care_type as keyof typeof careTypeConfig
                    ]?.label || viewBulletin.care_type}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Adherent</p>
                  <p className="font-medium">
                    {viewBulletin.adherent_first_name}{" "}
                    {viewBulletin.adherent_last_name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {viewBulletin.adherent_matricule}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Praticien</p>
                  <p className="font-medium">
                    {viewBulletin.provider_name || "—"}
                  </p>
                </div>
              </div>

              {/* Actes medicaux */}
              {viewBulletin.actes && viewBulletin.actes.length > 0 && (
                <div className="space-y-2">
                  <p className="font-medium text-sm">Actes medicaux</p>
                  <div className="rounded-md border divide-y">
                    {viewBulletin.actes.map((acte) => {
                      const isLimited =
                        acte.plafond_depasse === 1 &&
                        (acte.montant_rembourse || 0) > 0;
                      const isExhausted =
                        acte.plafond_depasse === 1 &&
                        (acte.montant_rembourse || 0) === 0 &&
                        (acte.remboursement_brut || 0) > 0;
                      const isUnreferenced =
                        acte.taux_remboursement === 0 ||
                        acte.taux_remboursement == null;
                      return (
                        <div key={acte.id} className="p-3 space-y-1.5">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-sm">
                                {acte.label}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">
                                {acte.code || "Sans code"}
                              </p>
                            </div>
                            {isExhausted && (
                              <Badge
                                variant="destructive"
                                className="text-xs shrink-0"
                              >
                                Plafond epuise
                              </Badge>
                            )}
                            {isLimited && (
                              <Badge className="text-xs bg-orange-500 hover:bg-orange-600 shrink-0">
                                Limite par plafond
                              </Badge>
                            )}
                            {isUnreferenced && (
                              <Badge
                                variant="secondary"
                                className="text-xs shrink-0"
                              >
                                Non reference
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div>
                              <p className="text-muted-foreground">Montant</p>
                              <p className="font-medium">
                                {formatAmount(acte.amount)}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Taux</p>
                              <p className="font-medium">
                                {acte.taux_remboursement != null
                                  ? `${Math.round(acte.taux_remboursement * 100)}%`
                                  : "-"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">
                                Remb. brut
                              </p>
                              <p className="font-medium">
                                {acte.remboursement_brut != null
                                  ? formatAmount(acte.remboursement_brut)
                                  : "-"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Rembourse</p>
                              <p
                                className={`font-bold ${isExhausted ? "text-destructive" : isLimited ? "text-orange-500" : "text-green-600"}`}
                              >
                                {acte.montant_rembourse != null
                                  ? formatAmount(acte.montant_rembourse)
                                  : "-"}
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
                const exhaustedCount = actes.filter(
                  (a) =>
                    a.plafond_depasse === 1 &&
                    (a.montant_rembourse || 0) === 0 &&
                    (a.remboursement_brut || 0) > 0,
                ).length;
                const limitedCount = actes.filter(
                  (a) =>
                    a.plafond_depasse === 1 && (a.montant_rembourse || 0) > 0,
                ).length;
                const unreferencedCount = actes.filter(
                  (a) =>
                    a.taux_remboursement === 0 || a.taux_remboursement == null,
                ).length;
                const plafondAvant = viewBulletin.plafond_consomme_avant ?? 0;
                const plafondGlobal = viewBulletin.plafond_global ?? 0;
                const plafondEpuiseAvant =
                  plafondGlobal > 0 && plafondAvant >= plafondGlobal;

                return (
                  <div className="space-y-2">
                    {plafondEpuiseAvant && (
                      <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
                        <Ban className="h-4 w-4 shrink-0" />
                        <span>
                          Plafond annuel epuise — aucun remboursement possible
                        </span>
                      </div>
                    )}
                    {limitedCount > 0 && !plafondEpuiseAvant && (
                      <div className="flex items-center gap-2 rounded-md border border-orange-300 bg-orange-50 p-2 text-sm text-orange-700">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>
                          Remboursement limite par le plafond sur {limitedCount}{" "}
                          acte{limitedCount > 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                    {exhaustedCount > 0 && !plafondEpuiseAvant && (
                      <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-2 text-sm text-destructive">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>
                          {exhaustedCount} acte{exhaustedCount > 1 ? "s" : ""}{" "}
                          non rembourse{exhaustedCount > 1 ? "s" : ""} — plafond
                          atteint
                        </span>
                      </div>
                    )}
                    {unreferencedCount > 0 && (
                      <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2 text-sm text-muted-foreground">
                        <Info className="h-4 w-4 shrink-0" />
                        <span>
                          {unreferencedCount} acte
                          {unreferencedCount > 1 ? "s" : ""} non reference
                          {unreferencedCount > 1 ? "s" : ""} — taux 0%
                        </span>
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
                    const totalBrut = (viewBulletin.actes || []).reduce(
                      (s, a) => s + (a.remboursement_brut || 0),
                      0,
                    );
                    const totalFinal = viewBulletin.reimbursed_amount || 0;
                    const reduction = totalBrut - totalFinal;
                    return (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Montant declare total
                          </span>
                          <span className="font-medium">
                            {formatAmount(totalDeclare)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Remboursement brut total
                          </span>
                          <span className="font-medium">
                            {formatAmount(totalBrut)}
                          </span>
                        </div>
                        <div className="flex justify-between border-t pt-1">
                          <span className="font-medium">
                            Remboursement final total
                          </span>
                          <span className="font-bold text-green-600">
                            {formatAmount(totalFinal)}
                          </span>
                        </div>
                        {reduction > 0 && (
                          <div className="flex justify-between text-destructive">
                            <span className="text-xs">Reduction plafond</span>
                            <span className="text-xs font-medium">
                              -{formatAmount(reduction)}
                            </span>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Plafond avec impact bulletin */}
              {viewBulletin.plafond_global != null &&
                viewBulletin.plafond_global > 0 && (
                  <div className="rounded-md border bg-muted/10 p-3 space-y-2.5">
                    <div className="flex justify-between items-center">
                      <p className="font-medium text-sm">
                        Plafond annuel adherent
                      </p>
                      {viewBulletin.plafond_consomme != null &&
                        viewBulletin.plafond_consomme >=
                          viewBulletin.plafond_global && (
                          <Badge variant="destructive" className="text-xs">
                            Plafond atteint
                          </Badge>
                        )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Plafond global
                        </span>
                        <span className="font-medium">
                          {formatAmount(viewBulletin.plafond_global)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Avant ce bulletin
                        </span>
                        <span className="font-medium">
                          {formatAmount(
                            viewBulletin.plafond_consomme_avant ?? 0,
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Ce bulletin
                        </span>
                        <span className="font-medium text-blue-600">
                          +{formatAmount(viewBulletin.reimbursed_amount || 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Restant</span>
                        <span className="font-bold text-green-600">
                          {formatAmount(
                            viewBulletin.plafond_global -
                              (viewBulletin.plafond_consomme || 0),
                          )}
                        </span>
                      </div>
                    </div>
                    {/* Segmented progress bar */}
                    <div className="w-full bg-muted rounded-full h-2 flex overflow-hidden">
                      <div
                        className="h-2 bg-gray-400"
                        style={{
                          width: `${Math.min(100, ((viewBulletin.plafond_consomme_avant ?? 0) / viewBulletin.plafond_global) * 100)}%`,
                        }}
                      />
                      <div
                        className={`h-2 ${(viewBulletin.plafond_consomme || 0) >= viewBulletin.plafond_global ? "bg-orange-500" : "bg-green-500"}`}
                        style={{
                          width: `${Math.min(100 - ((viewBulletin.plafond_consomme_avant ?? 0) / viewBulletin.plafond_global) * 100, ((viewBulletin.reimbursed_amount || 0) / viewBulletin.plafond_global) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />{" "}
                        Avant
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{" "}
                        Ce bulletin
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-muted inline-block border" />{" "}
                        Restant
                      </span>
                    </div>
                  </div>
                )}

              {/* Scan upload */}
              <ScanUpload
                bulletinId={viewBulletin.id}
                existingScanUrl={viewBulletin.scan_url}
                existingScanFilename={
                  viewBulletin.scan_url
                    ? viewBulletin.scan_url.split("/").pop()
                    : null
                }
                onUploadComplete={() => fetchBulletinDetail(viewBulletin.id)}
              />

              {/* Status badge + actions */}
              <div className="flex justify-between items-center pt-2 border-t">
                {(() => {
                  const cfg = bulletinStatusConfig[viewBulletin.status] || {
                    label: viewBulletin.status,
                    variant: "outline" as const,
                  };
                  return (
                    <Badge variant={cfg.variant} className={cfg.className}>
                      {cfg.label}
                    </Badge>
                  );
                })()}
                {["draft", "in_batch"].includes(viewBulletin.status) && (
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
      <AlertDialog
        open={showValidateDialog}
        onOpenChange={(open) => {
          if (!open) {
            setShowValidateDialog(false);
            setValidateBulletinTarget(null);
            setValidateNotes("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Valider le bulletin</AlertDialogTitle>
            <AlertDialogDescription>
              Confirmez la validation du bulletin{" "}
              {validateBulletinTarget?.bulletin_number}. Le remboursement sera
              enregistré définitivement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {validateBulletinTarget && (
            <div className="py-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Adherent</p>
                  <p className="font-medium">
                    {validateBulletinTarget.adherent_first_name}{" "}
                    {validateBulletinTarget.adherent_last_name}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Montant declare</p>
                  <p className="font-medium">
                    {validateBulletinTarget.total_amount?.toFixed(3)} TND
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Actes</p>
                  <p className="font-medium">
                    {validateBulletinTarget.actes?.length || 0} acte(s)
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Montant rembourse</p>
                  <p className="font-medium text-green-600">
                    {(validateBulletinTarget.reimbursed_amount || 0).toFixed(3)}{" "}
                    TND
                  </p>
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
                validateMutation.mutate(
                  {
                    id: validateBulletinTarget.id,
                    reimbursed_amount:
                      validateBulletinTarget.reimbursed_amount ||
                      validateBulletinTarget.total_amount ||
                      0,
                    notes: validateNotes || undefined,
                  },
                  {
                    onSuccess: () => {
                      setShowValidateDialog(false);
                      setValidateBulletinTarget(null);
                      setValidateNotes("");
                      setViewBulletin(null);
                    },
                  },
                );
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
      <AlertDialog
        open={!!deleteBulletinId}
        onOpenChange={(open) => !open && setDeleteBulletinId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce bulletin ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Le bulletin sera définitivement
              supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteBulletinId) {
                  deleteMutation.mutate(deleteBulletinId);
                  setDeleteBulletinId(null);
                }
              }}
            >
              {deleteMutation.isPending ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation popup */}
      <AlertDialog
        open={bulkDeleteBulletinConfirm}
        onOpenChange={() => setBulkDeleteBulletinConfirm(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suppression multiple</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer <strong>{selectedBulletins.length}</strong>{" "}
              bulletin(s) sélectionné(s) ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                bulkDeleteMutation.mutate(selectedBulletins);
                setBulkDeleteBulletinConfirm(false);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {bulkDeleteMutation.isPending
                ? "Suppression..."
                : `Supprimer (${selectedBulletins.length})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete batches confirmation popup */}
      <AlertDialog
        open={bulkDeleteBatchConfirm}
        onOpenChange={() => setBulkDeleteBatchConfirm(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer les lots sélectionnés</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous vraiment supprimer <strong>{selectedBatches.length}</strong>{" "}
              lot(s) et leurs bulletins associés ? Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                bulkDeleteBatchesMutation.mutate(selectedBatches);
                setBulkDeleteBatchConfirm(false);
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              {bulkDeleteBatchesMutation.isPending
                ? "Suppression..."
                : `Supprimer (${selectedBatches.length})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FloatingHelp
        title="Aide - Saisie des bulletins"
        subtitle="Créez et gérez vos bulletins de soins"
        tips={[
          {
            icon: <ClipboardList className="h-4 w-4 text-blue-500" />,
            title: "Créer un bulletin",
            desc: "Sélectionnez un adhérent, renseignez les actes et médicaments, puis soumettez le bulletin pour validation.",
          },
          {
            icon: <ScanSearch className="h-4 w-4 text-green-500" />,
            title: "OCR automatique",
            desc: "Scannez une ordonnance ou une facture pour pré-remplir automatiquement les champs du bulletin.",
          },
          {
            icon: <ShieldCheck className="h-4 w-4 text-amber-500" />,
            title: "Vérification MF",
            desc: "Le matricule fiscal est vérifié automatiquement pour garantir la conformité du bulletin.",
          },
          {
            icon: <Package className="h-4 w-4 text-purple-500" />,
            title: "Lots de bulletins",
            desc: "Regroupez plusieurs bulletins dans un lot pour les soumettre et les suivre ensemble.",
          },
        ]}
      />
    </div>
  );
}

export default BulletinsSaisiePage;
