import JSZip from 'jszip';
import React,{ useState, useRef, useEffect, useMemo, useCallback } from 'react';
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
import { uploadFilePresigned } from '../lib/presigned-upload';
import { getTenantHeader } from '@/lib/tenant';
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
import { useActesGroupes } from '@/features/agent/hooks/use-actes';
import { MedicationAutocomplete } from '@/features/bulletins/components/medication-autocomplete';
import { MfLookupInput } from '@/features/bulletins/components/mf-lookup-input';
import { InfoTooltip } from '@/components/ui/info-tooltip';
import { useOcrJobsStore, type FileMeta } from '@/stores/ocr-jobs';
import { saveFilesToIdb, loadFilesFromIdb, clearFilesFromIdb } from '@/lib/file-storage';
import { useOcrJobQuery, useRetryOcrJobMutation } from '@/features/bulletins/hooks/useBulkAnalyse';
import {
  CARE_TYPE_CONFIG,
  ALL_CARE_TYPES,
  FAMILLE_CODE_TO_CARE_TYPE,
  resolveCareType,
  getCareTypeConfig,
  getMfProviderType,
} from '@dhamen/shared';
import type { LucideIcon } from 'lucide-react';
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
  ChevronDown,
  Send,
  RefreshCw,
  Pencil,
  FileWarning,
  Scissors,
  Smile,
  Truck,
  Waves,
  Bone,
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
  /** SHA-256 hash of the source files (for duplicate detection) */
  _file_hash?: string;
  /** Source files for this specific bulletin (used at submit time) */
  _source_files?: File[];
}

// Types
interface BulletinSaisieActe {
  id: string;
  code: string | null;
  label: string;
  amount: number;
  care_type: string | null;
  nom_prof_sant: string | null;
  provider_name_resolved: string | null;
  medication_name: string | null;
  medication_dci: string | null;
  medication_family_name: string | null;
}

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
  actes_count?: number;
  mf_missing_count?: number;
  actes?: BulletinSaisieActe[];
}

interface BulletinSubItem {
  id: string;
  label: string;
  code: string | null;
  amount: number;
}

interface BulletinActeDetail {
  id: string;
  code: string;
  label: string;
  amount: number;
  care_type: string | null;
  taux_remboursement: number | null;
  montant_rembourse: number | null;
  remboursement_brut: number | null;
  plafond_depasse: number | null;
  ref_prof_sant: string | null;
  nom_prof_sant: string | null;
  provider_name_resolved: string | null;
  provider_mf: string | null;
  medication_name: string | null;
  medication_dci: string | null;
  medication_code_pct: string | null;
  medication_family_name: string | null;
  acte_ref_label: string | null;
  sub_items?: BulletinSubItem[];
}

interface BulletinFile {
  id: string;
  file_index: number;
  file_name: string | null;
  mime_type: string | null;
  file_size: number | null;
  created_at: string | null;
}

interface BulletinDetail extends BulletinSaisie {
  actes?: BulletinActeDetail[];
  files?: BulletinFile[];
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
  non_remboursable: { label: 'Non remboursable', variant: 'destructive', className: 'bg-orange-600 hover:bg-orange-700' },
  paper_complete: { label: 'Soumis à validation', variant: 'default', className: 'bg-orange-500 hover:bg-orange-600' },
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

/** Map icon name strings from CARE_TYPE_CONFIG to actual lucide-react components */
const ICON_MAP: Record<string, LucideIcon> = {
  Stethoscope, Pill, FlaskConical, Building2, Eye, Baby, Heart,
  ClipboardList, Scissors, Smile, Truck, Waves, Bone,
};

/** Icons per famille code (aligned with Acorad families) */
const FAMILLE_ICON: Record<string, LucideIcon> = {
  FA0001: Stethoscope,     // Consultations et Visites
  FA0002: ClipboardList,   // Actes médicaux courants
  FA0003: Pill,            // Frais pharmaceutiques
  FA0004: FlaskConical,    // Analyses
  FA0005: Bone,            // Orthopédie
  FA0006: Eye,             // Optique
  FA0007: Building2,       // Hospitalisation clinique
  FA0008: Building2,       // Hospitalisation hôpital
  FA0009: ClipboardList,   // Actes spécialistes / pratique courante
  FA0010: Scissors,        // Frais chirurgicaux
  FA0011: Smile,           // Soins dentaires
  FA0012: Baby,            // Maternité
  FA0013: Waves,           // Cures thermales
  FA0014: Heart,           // Frais funéraires
  FA0015: Stethoscope,     // Circoncision
  FA0016: Truck,           // Transport du malade
  FA0017: FileImage,       // Radiologie
  FA0018: FileText,        // Frais soins étranger
  FA0019: Heart,           // Aide
  FA0020: Ban,             // Non remboursable
};

/** Get display config (label, icon component, colors) for any care_type value (handles legacy EN aliases) */
function careTypeDisplay(value: string | null | undefined) {
  const cfg = getCareTypeConfig(value);
  return {
    label: cfg.label,
    icon: ICON_MAP[cfg.icon] || Stethoscope,
    bgColor: cfg.bgColor,
    textColor: cfg.textColor,
  };
}

// Sub-item schema (medications within pharmacy acte, individual analyses within lab acte)
const subItemSchema = z.object({
  label: z.string().optional().or(z.literal('')), // TEMP: relaxed — was min(1)
  cotation: z.string().optional().or(z.literal('')),
  amount: z.number().min(0, 'Montant >= 0'),
  code: z.string().optional().or(z.literal('')),
});

// Form schema
const acteFormSchema = z.object({
  code: z.string().optional().or(z.literal('')),
  label: z.string().optional().or(z.literal('')), // TEMP: relaxed — was min(1)
  amount: z.number().positive('Montant > 0'),
  ref_prof_sant: z.string().optional().or(z.literal('')),
  nom_prof_sant: z.string().optional().or(z.literal('')),
  provider_id: z.string().optional(),
  care_type: z.string().default('consultation'),
  care_description: z.string().optional(),
  cod_msgr: z.string().optional(),
  lib_msgr: z.string().optional(),
  nombre_jours: z.number().int().positive().optional().or(z.literal(0)).transform(v => v || undefined),
  montant_jour: z.number().positive().optional().or(z.literal(0)).transform(v => v || undefined),
  sub_items: z.array(subItemSchema).optional(),
}).superRefine((data, ctx) => {
  const cfg = getCareTypeConfig(data.care_type);
  if (cfg.showCotation && data.sub_items?.length) {
    const hasCotation = data.sub_items.some(si => si.cotation && si.cotation.trim().length > 0);
    if (!hasCotation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Le coefficient est requis (ex: 30, 80, 420)',
        path: ['sub_items', 0, 'cotation'],
      });
    }
  }
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
  care_type: z.string().optional(),
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
  { keywords: ['dentaire', 'dent', 'dentist', 'soin dentaire'], code: 'DC', label: 'Soins Dentaires' },
  { keywords: ['prothese dentaire', 'prothèse dentaire', 'couronne', 'bridge', 'implant'], code: 'DP', label: 'Prothèses Dentaires' },
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

/** Collapsible list of sub-items (medications, analyses, etc.) within an acte */
function SubItemsList({ items, formatAmount }: { items: BulletinSubItem[]; formatAmount: (n: number) => string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="mt-1 pl-3 border-l-2 border-muted">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors w-full"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? '' : '-rotate-90'}`} />
        {items.length} element{items.length > 1 ? 's' : ''}
      </button>
      {open && (
        <div className="space-y-1 mt-1">
          {items.map((si, siIdx) => (
            <div key={si.id || siIdx} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">{siIdx + 1}.</span>
                <span>{si.label}</span>
                {si.code && (
                  <span className="font-mono text-[10px] bg-muted px-1 rounded">{si.code}</span>
                )}
              </div>
              <span className="font-medium tabular-nums">{formatAmount(si.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Clamp a date on blur: if < minDate → clear, if > maxDate → maxDate */
function clampDateValue(value: string, minDate: string, maxDate?: string): string {
  if (!value) return value;
  if (value < minDate) return "";
  if (maxDate && value > maxDate) return maxDate;
  return value;
}

export function BulletinsSaisiePage() {
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission("bulletins_soins", "create");
  const canUpdate = hasPermission("bulletins_soins", "update");
  const canDelete = hasPermission("bulletins_soins", "delete");

  // Track component mount state — detached OCR promises check this before setting React state
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const queryClient = useQueryClient();
  const { selectedCompany, selectedBatch, setBatch } = useAgentContext();
  const [searchParams] = useSearchParams();
  const initialTab = useMemo(() => searchParams.get("tab") || "saisie", []);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  // Restored file metadata from persisted session (File objects lost on navigation)
  const [restoredFilesMeta, setRestoredFilesMeta] = useState<FileMeta[]>([]);
  // Sub-folder grouping from webkitdirectory (stored at selection time to avoid webkitRelativePath issues)
  const [folderSubGroups, setFolderSubGroups] = useState<Map<
    string,
    number[]
  > | null>(null);
  // Inline message shown after folder/file selection (replaces toast.info alerts)
  const [fileSelectionInfo, setFileSelectionInfo] = useState<{
    type: "info" | "success" | "warning";
    message: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedBulletins, setSelectedBulletins] = useState<string[]>([]);
  const [bulkDeleteBulletinConfirm, setBulkDeleteBulletinConfirm] =
    useState(false);
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
  const isIndividualMode = selectedCompany?.id === "__INDIVIDUAL__";
  const [adherentSearch, setAdherentSearch] = useState("");
  const [showAdherentDropdown, setShowAdherentDropdown] = useState(false);
  const adherentDropdownVisible =
    showAdherentDropdown && adherentSearch.length >= 2;
  const { triggerRef: adherentPortalRef, position: adherentPortalPos } =
    useDropdownPortal(adherentDropdownVisible);
  const [selectedAdherentInfo, setSelectedAdherentInfo] =
    useState<AdherentSearchResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [showValidateDialog, setShowValidateDialog] = useState(false);
  const [validateBulletinTarget, setValidateBulletinTarget] =
    useState<BulletinDetail | null>(null);
  const [validateNotes, setValidateNotes] = useState("");
  const validateMutation = useBulletinValidation();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [editingBulletinId, setEditingBulletinId] = useState<string | null>(
    null,
  );
  const [analyzeProgress, setAnalyzeProgress] = useState<{
    current: number;
    total: number;
    groupName: string;
  } | null>(null);
  const [bulletinNumberFromOcr, setBulletinNumberFromOcr] = useState(false);
  const [showScanPreview, setShowScanPreview] = useState(false);
  const [ocrFeedback, setOcrFeedback] = useState<OcrFeedbackState | null>(null);
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [feedbackErrors, setFeedbackErrors] = useState<string[]>([]);
  const [feedbackComment, setFeedbackComment] = useState("");

  // Bulk ZIP analysis state
  const ocrJobsStore = useOcrJobsStore();
  const [bulkJobId, setBulkJobIdRaw] = useState<string | null>(null);
  const retryMutation = useRetryOcrJobMutation();
  const { data: bulkJobData } = useOcrJobQuery(bulkJobId);
  const [expandedBulkBulletinId, setExpandedBulkBulletinId] = useState<
    string | null
  >(null);

  // Wrapper: setBulkJobId also manages global store for cross-page tracking
  const setBulkJobId = useCallback(
    (jobId: string | null) => {
      // When clearing, mark old job as notified so global tracker stops polling it
      if (!jobId && bulkJobId) {
        ocrJobsStore.markNotified(bulkJobId);
      }
      setBulkJobIdRaw(jobId);
    },
    [ocrJobsStore, bulkJobId],
  );

  // Restore bulkJobId from global store on mount (if user navigated away and came back)
  useEffect(() => {
    const jobs = ocrJobsStore.activeJobs.filter((j) => !j.notified);
    if (jobs.length > 0 && !bulkJobId) {
      // Restore the most recent non-notified job
      const latest = jobs[jobs.length - 1];
      if (latest) setBulkJobIdRaw(latest.jobId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Multi-bulletin OCR state
  const [ocrBulletins, setOcrBulletins] = useState<OcrBulletinItem[]>([]);
  const [activeBulletinIndex, setActiveBulletinIndex] = useState(0);
  // Deferred form fill index: when set, triggers handleSwitchBulletin after render
  const [pendingFormFillIndex, setPendingFormFillIndex] = useState<
    number | null
  >(null);

  // Restore OCR results from previous session if user navigated away and came back
  const sessionRestoredRef = useRef(false);
  useEffect(() => {
    if (sessionRestoredRef.current) return;
    sessionRestoredRef.current = true;
    const session = ocrJobsStore.consumeAnalysisSession();
    if (session && session.companyId === selectedCompany?.id) {
      try {
        const restored = JSON.parse(session.bulletinsJson) as OcrBulletinItem[];
        if (restored.length > 0) {
          setOcrBulletins(restored);
          // Set index to -1 so handleSwitchBulletin(0) won't bail (guard: index === activeBulletinIndex)
          setActiveBulletinIndex(-1);
          setPendingFormFillIndex(0);
          // Restore file metadata for display + reconstruct File objects from IndexedDB
          if (session.filesMeta && session.filesMeta.length > 0) {
            setRestoredFilesMeta(session.filesMeta);
            if (session.fileSessionId) {
              (async () => {
                try {
                  const restoredFiles = await loadFilesFromIdb(
                    session.fileSessionId!,
                  );
                  if (restoredFiles.length > 0) {
                    setSelectedFiles(restoredFiles);
                    for (const b of restored) {
                      b._source_files = restoredFiles;
                    }
                    setOcrBulletins([...restored]);
                  }
                } catch {
                  /* IndexedDB unavailable, files lost — metadata still shown */
                }
              })();
            }
          }
          toast.info(
            `${restored.length} bulletin(s) restauré(s) — remplissage du formulaire...`,
          );
        }
      } catch {
        /* corrupted session, ignore */
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [savedBulletinIndices, setSavedBulletinIndices] = useState<Set<number>>(
    new Set(),
  );
  /** Snapshot of form data for each saved bulletin (for readonly display) */
  const [savedBulletinSnapshots, setSavedBulletinSnapshots] = useState<
    Record<number, BulletinFormData>
  >({});
  /** Whether the active bulletin is in readonly mode (already saved) */
  const isActiveBulletinSaved = savedBulletinIndices.has(activeBulletinIndex);
  /** State for adding ayant droit inline */
  const [isAddingAyantDroit, setIsAddingAyantDroit] = useState(false);
  const [ayantDroitForm, setAyantDroitForm] = useState<{
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    email: string;
    gender: string;
  }>({ firstName: "", lastName: "", dateOfBirth: "", email: "", gender: "" });

  const { data: adherentResults } = useSearchAdherents(
    adherentSearch,
    selectedCompany?.id,
  );
  const { data: familleData } = useAdherentFamille(selectedAdherentInfo?.id);

  // Load contracts for the selected company (for contract number dropdown)
  const { data: companyContracts } = useQuery({
    queryKey: ["company-contracts", selectedCompany?.id],
    queryFn: async () => {
      const res = await apiClient.get<
        Array<{ id: string; contract_number: string; status: string }>
      >("/group-contracts", {
        params: {
          companyId: selectedCompany!.id,
          status: "active",
          limit: "100",
        },
      });
      if (!res.success) return [];
      const raw = res.data as unknown as Array<{
        id: string;
        contract_number: string;
        status: string;
      }>;
      return (Array.isArray(raw) ? raw : []).map((gc) => ({
        id: gc.id,
        contractNumber: gc.contract_number,
      }));
    },
    enabled: !!selectedCompany?.id && selectedCompany.id !== "__INDIVIDUAL__",
  });

  // Auto-select adherent when search results contain an exact matricule match
  useEffect(() => {
    if (!adherentResults) return;
    const matricule = watch("adherent_matricule");
    if (!matricule) return;
    const match = (adherentResults as AdherentSearchResult[] | undefined)?.find(
      (a) => a.matricule === matricule,
    );
    if (match) {
      // Always refresh plafond data; only set form fields on first selection
      if (!selectedAdherentInfo) {
        setValue("adherent_first_name", match.firstName || "");
        setValue("adherent_last_name", match.lastName || "");
        if (match.email) setValue("adherent_email", match.email);
        if (!watchedBeneficiaryRel) {
          setValue("beneficiary_relationship", "self");
        }
        setShowAdherentDropdown(false);
      }
      setSelectedAdherentInfo(match);
    }
  }, [adherentResults]);

  const [selectedMedicationFamily, setSelectedMedicationFamily] =
    useState<string>("");
  const [mfStatuses, setMfStatuses] = useState<
    Record<
      number,
      import("@/features/bulletins/components/mf-lookup-input").MfStatus
    >
  >({});

  // Familles d'actes grouped (for famille dropdown in acte header)
  const { data: actesGroupes } = useActesGroupes();

  // Selected famille code per acte (for cascading famille → acte selector)
  const [acteFamilleCodes, setActeFamilleCodes] = useState<
    Record<number, string>
  >({});

  /**
   * Resolve the famille code for an acte — used by OCR to auto-select the famille dropdown.
   * Priority: 1) find acte code in actesGroupes, 2) fallback to care_type → familleCodes[0]
   */
  const resolveFamilleCodeForActe = useCallback(
    (
      acteCode: string | null | undefined,
      careType: string | null | undefined,
    ): string | null => {
      // 1. Try to find acte code in loaded actesGroupes
      if (acteCode && actesGroupes) {
        for (const groupe of actesGroupes) {
          if (groupe.actes.some((a) => a.code === acteCode)) {
            return groupe.famille.code;
          }
        }
      }
      // 2. Fallback: map care_type → first famille code from config
      if (careType) {
        const config = getCareTypeConfig(careType);
        if (config.familleCodes.length > 0) return config.familleCodes[0]!;
      }
      return null;
    },
    [actesGroupes],
  );

  // File hash for duplicate detection (pre-OCR)
  const [currentFileHash, setCurrentFileHash] = useState<string | null>(null);
  const skipHashCheckRef = useRef(false);
  const [duplicateBulletin, setDuplicateBulletin] = useState<{
    id: string;
    bulletinNumber: string;
    status: string;
    date: string;
    adherent: string;
    careType: string;
    totalAmount: number | null;
    reimbursedAmount: number | null;
    createdAt: string;
  } | null>(null);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [duplicateConfirm, setDuplicateConfirm] = useState<{
    cleanFiles: File[];
    duplicateFiles: Array<{
      name: string;
      bulletin: Record<string, unknown> | null;
    }>;
    formData: FormData;
    resolve: (proceed: boolean) => void;
  } | null>(null);

  // Duplicate alert is cleared directly by deleteMutation.onSuccess / handleRemoveFile / reset flows
  // No polling needed — all deletion paths already call setDuplicateBulletin(null)

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
    getValues,
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
        setAyantDroitForm((prev) => ({
          ...prev,
          firstName: parts[0]!,
          lastName: "",
        }));
      }
    }
  }, [watchedBenefName, selectedAdherentInfo]);

  // Estimate reimbursement in real-time
  const watchedMatricule = watch("adherent_matricule");
  const watchedBulletinDate = watch("bulletin_date");
  const estimateKey = JSON.stringify(
    (watchedActes || []).map((a) => ({
      code: a.code,
      amount: Number(a.amount) || 0,
      care_type: a.care_type,
      nombre_jours: (a as Record<string, unknown>).nombre_jours,
      subs: (
        (a as Record<string, unknown>).sub_items as
          | Array<{ cotation?: string; amount?: number }>
          | undefined
      )?.map((s) => s.cotation || s.amount),
    })),
  );
  const { data: estimateData } = useQuery({
    queryKey: [
      "estimate-reimbursement",
      watchedMatricule,
      watchedBulletinDate,
      estimateKey,
      selectedCompany?.id,
      watch("beneficiary_id") || watch("beneficiary_relationship"),
    ],
    queryFn: async () => {
      const actes = (watchedActes || [])
        .filter((a) => (a.code || a.label) && Number(a.amount) > 0)
        .map((a) => {
          // Extract coefficient from sub-item cotations (e.g., "B420" → 420, "KC50" → 50)
          // Also supports bare numbers (e.g., "30") when acte code is already a letter key (AMO, B, KC...)
          const subs = (a as Record<string, unknown>).sub_items as
            | Array<{ cotation?: string }>
            | undefined;
          let nbr_cle: number | undefined;
          let cotationCode: string | undefined;
          if (subs?.length) {
            let totalCoeff = 0;
            for (const si of subs) {
              const cot = si.cotation?.trim();
              if (!cot) continue;
              // Full cotation: "AMO30", "B420", "KC50"
              const match = cot.match(/^([A-Za-z]+)(\d+)$/);
              if (match) {
                totalCoeff += parseInt(match[2]!, 10);
                if (!cotationCode) cotationCode = cot;
              } else if (/^\d+$/.test(cot)) {
                // Bare number: "30" — combine with parent acte code (e.g., AMO + 30 → AMO30)
                totalCoeff += parseInt(cot, 10);
                if (!cotationCode && a.code) cotationCode = `${a.code}${cot}`;
              }
            }
            if (totalCoeff > 0) nbr_cle = totalCoeff;
          }
          // Send cotation code (e.g., "B420") as code when available, for letter-key parsing
          const code = cotationCode || a.code || "PH1";
          const nombre_jours = (a as Record<string, unknown>).nombre_jours as
            | number
            | undefined;
          return {
            code,
            amount: Number(a.amount),
            care_type: a.care_type,
            nbr_cle,
            nombre_jours:
              nombre_jours && nombre_jours > 0 ? nombre_jours : undefined,
          };
        });
      if (!actes.length) return null;
      const res = await apiClient.post<{
        reimbursed_amount: number | null;
        details: Array<{ code: string; reimbursed: number }>;
        warning?: string;
        no_active_contract?: boolean;
        contracts?: Array<{
          id: string;
          contract_number: string;
          plan_type: string;
          status: string;
          start_date: string;
          end_date: string;
        }>;
      }>("/bulletins-soins/agent/estimate", {
        adherent_matricule: watchedMatricule,
        bulletin_date: watchedBulletinDate,
        actes,
        company_id:
          selectedCompany?.id && selectedCompany.id !== "__INDIVIDUAL__"
            ? selectedCompany.id
            : undefined,
        beneficiary_id: (() => {
          const rel = watch("beneficiary_relationship");
          const benId = watch("beneficiary_id");
          if (rel === "spouse" && familleData?.conjoint?.id)
            return familleData.conjoint.id;
          if (rel === "child" && benId) return benId as string;
          return undefined;
        })(),
        beneficiary_relationship:
          watch("beneficiary_relationship") || undefined,
      });
      return res.success ? res.data : null;
    },
    enabled:
      !!watchedMatricule &&
      watchedMatricule.length >= 2 &&
      actesTotal > 0 &&
      !!watchedBulletinDate &&
      (!selectedAdherentInfo || !!selectedAdherentInfo.id) &&
      !(
        selectedAdherentInfo?.contractStartDate &&
        watchedBulletinDate < selectedAdherentInfo.contractStartDate
      ) &&
      !(
        selectedAdherentInfo?.contractEndDate &&
        watchedBulletinDate > selectedAdherentInfo.contractEndDate
      ),
    staleTime: 5000,
  });
  const estimatedReimbursement = estimateData?.reimbursed_amount;

  // care_type is now per-acte; derive "primary" care type from first acte for medication families query
  const selectedCareType = watchedActes?.[0]?.care_type || "consultation";
  // Check if any acte is pharmacy type (for medication families fetch)
  const hasPharmacyActe = watchedActes?.some(
    (a) => resolveCareType(a.care_type) === "pharmacie",
  );

  // Check if any MF is invalid or errored — blocks submit
  // Allowed (non-blocking) statuses: 'found', 'registered', 'not_found', 'forced', 'idle' (not yet checked)
  // Blocking statuses: 'loading' (in progress), 'invalid', 'error'
  const MF_BLOCKING_STATUSES: import("@/features/bulletins/components/mf-lookup-input").MfStatus[] =
    ["loading", "invalid", "error"];
  // MF missing = bulletin saved as incomplete draft (can't be validated), but NOT blocking save
  const hasAnyData = !!watchedMatricule?.trim() || actesTotal > 0;
  const hasMfMissing =
    hasAnyData &&
    watchedActes?.length > 0 &&
    watchedActes.some((_a) => !_a?.ref_prof_sant?.trim());
  const hasMfBlocking =
    watchedActes?.length > 0 &&
    watchedActes.some((_a, idx) => {
      const mfValue = _a?.ref_prof_sant?.trim();
      if (!mfValue) return false; // MF vide = not blocking save, just marks as incomplete
      const status = mfStatuses[idx];
      return status && MF_BLOCKING_STATUSES.includes(status);
    });
  const mfBlockingReason = (() => {
    if (!hasMfBlocking) return null;
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
  const watchedBulletinNumber = watch("bulletin_number");
  const watchedBenefId = watch("beneficiary_id");
  const watchedAdherentLastName = watch("adherent_last_name");
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

  // Resolve effective beneficiary ID for plafond display:
  // When beneficiary is conjoint/enfant, show THEIR individual plafond, not the principal's
  const effectivePlafondId = (() => {
    if (!selectedAdherentInfo?.id) return undefined;
    if (watchedBeneficiaryRel === "spouse" && familleData?.conjoint?.id)
      return familleData.conjoint.id;
    if (watchedBeneficiaryRel === "child" && watchedBenefId)
      return watchedBenefId as string;
    return selectedAdherentInfo.id; // self
  })();
  const { data: plafondsData } = useAdherentPlafonds(effectivePlafondId);

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
    queryKey: [
      "agent-bulletins",
      selectedCompany?.id,
      selectedBatch?.id,
      searchQuery,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append(
        "status",
        "draft,in_batch,paper_complete,approved,rejected",
      );
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

      // Send actes as JSON array (include sub_items for storage)
      form.append("actes", JSON.stringify(data.formData.actes));

      // Flag as incomplete if any acte is missing MF
      const hasMissingMf = data.formData.actes.some(
        (a) => !a.ref_prof_sant?.trim(),
      );
      if (hasMissingMf) {
        form.append("mf_incomplete", "1");
      }

      // Attach batch_id and company_id from agent context
      if (selectedBatch) {
        form.append("batch_id", selectedBatch.id);
      }
      if (selectedCompany) {
        form.append("company_id", selectedCompany.id);
      }

      // Attach file hash for duplicate detection (per-bulletin from OCR, or global from single file)
      const bulletinHash =
        ocrBulletins[activeBulletinIndex]?._file_hash || currentFileHash;
      console.log("[save-bulletin] hash sources:", {
        fromOcrBulletin: ocrBulletins[activeBulletinIndex]?._file_hash?.slice(
          0,
          16,
        ),
        fromCurrentFileHash: currentFileHash?.slice(0, 16),
        final: bulletinHash?.slice(0, 16) || "NULL",
      });
      if (bulletinHash) {
        form.append("file_hash", bulletinHash);
      }

      // Files are uploaded separately after creation via upload-scan endpoint
      // to avoid Worker CPU timeout with large multipart payloads

      // If editing existing bulletin → PUT, otherwise → POST create
      const endpoint = editingBulletinId
        ? `/bulletins-soins/agent/${editingBulletinId}/update`
        : "/bulletins-soins/agent/create";
      const result = await apiClient.upload<{
        id?: string;
        warnings?: string[];
      }>(endpoint, form);
      if (!result.success) {
        throw new Error(result.error?.message || "Erreur lors de la saisie");
      }

      // Upload files via presigned R2 URLs (falls back to legacy if not configured)
      if (!editingBulletinId && result.data?.id) {
        const filesToUpload =
          ocrBulletins[activeBulletinIndex]?._source_files || data.files;
        if (filesToUpload.length > 0) {
          let failedCount = 0;
          for (const file of filesToUpload) {
            try {
              await uploadFilePresigned(result.data!.id, file);
            } catch {
              failedCount++;
            }
          }
          if (failedCount > 0) {
            console.warn(
              `[save-bulletin] ${failedCount}/${filesToUpload.length} file uploads failed`,
            );
          }
        }
      }

      return { success: result.success, data: result.data };
    },
    onSuccess: (result: {
      success: boolean;
      data?: { warnings?: string[] };
    }) => {
      queryClient.invalidateQueries({ queryKey: ["agent-bulletins"] });
      const responseWarnings = result?.data?.warnings;

      // Multi-bulletin mode: mark current as saved and auto-advance
      if (ocrBulletins.length > 1) {
        // Snapshot current form data for readonly display
        const currentFormData = watch();
        setSavedBulletinSnapshots((prev) => ({
          ...prev,
          [activeBulletinIndex]: { ...currentFormData } as BulletinFormData,
        }));

        const newSaved = new Set(savedBulletinIndices);
        newSaved.add(activeBulletinIndex);
        setSavedBulletinIndices(newSaved);

        // Find next unsaved bulletin
        const nextUnsaved = ocrBulletins.findIndex(
          (_, i) => i !== activeBulletinIndex && !newSaved.has(i),
        );

        if (nextUnsaved !== -1) {
          if (responseWarnings && responseWarnings.length > 0) {
            toast.warning(
              responseWarnings[0] || "Attention: remboursement approximatif",
            );
          } else {
            toast.success(
              `Bulletin ${activeBulletinIndex + 1}/${ocrBulletins.length} enregistré — passage au suivant`,
            );
          }
          // Auto-switch to next unsaved bulletin
          handleSwitchBulletin(nextUnsaved);
          return;
        }

        // All bulletins saved
        toast.success(
          `Tous les ${ocrBulletins.length} bulletins ont été enregistrés !`,
        );
      } else {
        if (responseWarnings && responseWarnings.length > 0) {
          toast.warning(
            responseWarnings[0] || "Attention: remboursement approximatif",
          );
        } else {
          toast.success(
            editingBulletinId
              ? "Bulletin modifié avec succès!"
              : "Bulletin saisi avec succès!",
          );
        }
      }

      // Full cleanup
      reset();
      setSelectedFiles([]);
      setFolderSubGroups(null);
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
      setDuplicateBulletin(null);
      setCurrentFileHash(null);
      setSavedBulletinIndices(new Set());
      setSavedBulletinSnapshots({});
      const sessionToClean = ocrJobsStore.analysisSession?.fileSessionId;
      ocrJobsStore.clearAnalysisSession();
      if (sessionToClean) clearFilesFromIdb(sessionToClean).catch(() => {});
      setActiveBulletinIndex(0);
      setEditingBulletinId(null);
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
        `/bulletins-soins/agent/batches/${batchId}/export${force ? "?force=true" : ""}`,
        { responseType: "blob" },
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
        { responseType: "blob" },
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
      // Clear duplicate alert — the duplicated bulletin may have been the one deleted
      setDuplicateBulletin(null);
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
      setDuplicateBulletin(null);
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
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const submitToValidation = async (id: string) => {
    setSubmittingId(id);
    try {
      const response = await apiClient.post(
        `/bulletins-soins/agent/${id}/submit`,
        {},
      );
      if (response.success) {
        toast.success("Bulletin soumis à la validation");
        queryClient.invalidateQueries({ queryKey: ["agent-bulletins"] });
      } else {
        toast.error(response.error?.message || "Erreur lors de la soumission");
      }
    } catch {
      toast.error("Erreur lors de la soumission");
    } finally {
      setSubmittingId(null);
    }
  };

  const bulkSubmitToValidation = async (ids: string[]) => {
    try {
      const response = await apiClient.post(
        "/bulletins-soins/agent/bulk-submit",
        { ids },
      );
      if (response.success) {
        const resData = response.data as {
          submitted: number;
          skipped?: number;
          skippedReason?: string;
        };
        if (resData.skipped && resData.skipped > 0) {
          toast.warning(
            `${resData.submitted} bulletin(s) soumis. ${resData.skippedReason}`,
          );
        } else {
          toast.success(
            `${resData.submitted || ids.length} bulletin(s) soumis à la validation`,
          );
        }
        queryClient.invalidateQueries({ queryKey: ["agent-bulletins"] });
        setSelectedBulletins([]);
      } else {
        toast.error(response.error?.message || "Erreur lors de la soumission");
      }
    } catch {
      toast.error("Erreur lors de la soumission");
    }
  };

  const fetchBulletinDetail = async (id: string, editMode = false) => {
    const response = await apiClient.get<BulletinDetail>(
      `/bulletins-soins/agent/${id}`,
    );
    if (!response.success || !response.data) return;

    if (!editMode) {
      setViewBulletin(response.data);
      return;
    }

    // --- Edit mode: load bulletin into the saisie form ---
    const b = response.data;
    setEditingBulletinId(b.id);

    // Pre-fill adherent search
    const adherentLabel = [b.adherent_first_name, b.adherent_last_name]
      .filter(Boolean)
      .join(" ");
    setAdherentSearch(b.adherent_matricule || adherentLabel);
    setSelectedAdherentInfo({
      id: "",
      matricule: b.adherent_matricule || "",
      firstName: b.adherent_first_name || "",
      lastName: b.adherent_last_name || "",
      email: null,
      companyName: null,
      plafondGlobal: null,
      plafondConsomme: null,
      contractType: null,
      contractStartDate: null,
      contractEndDate: null,
      contractNumber: null,
      contractWarning: null,
    });

    // Pre-fill form fields
    reset({
      bulletin_number: b.bulletin_number || "",
      bulletin_date: b.bulletin_date
        ? b.bulletin_date.split("T")[0]
        : new Date().toISOString().split("T")[0],
      adherent_matricule: b.adherent_matricule || "",
      adherent_first_name: b.adherent_first_name || "",
      adherent_last_name: b.adherent_last_name || "",
      adherent_national_id: "",
      adherent_email: "",
      beneficiary_name: b.beneficiary_name || "",
      beneficiary_relationship: ["self", "spouse", "child"].includes(
        b.beneficiary_relationship || "",
      )
        ? (b.beneficiary_relationship as "self" | "spouse" | "child")
        : "self",
      actes: (b.actes || []).map((a) => ({
        code: a.code || "",
        label: a.label || "",
        amount: a.amount || 0,
        ref_prof_sant: a.ref_prof_sant || "",
        nom_prof_sant: a.nom_prof_sant || "",
        provider_id: "",
        care_type: resolveCareType(a.care_type),
        care_description: "",
        cod_msgr: (a as unknown as Record<string, string>).cod_msgr || "",
        lib_msgr: (a as unknown as Record<string, string>).lib_msgr || "",
        sub_items: (a.sub_items || []).map(
          (si: {
            label: string;
            code?: string | null;
            cotation?: string | null;
            amount: number;
          }) => ({
            label: si.label || "",
            code: si.code || "",
            cotation: si.cotation || "",
            amount: si.amount || 0,
          }),
        ),
      })),
    });

    // Auto-resolve famille codes for each acte so ActeSelector dropdowns are populated
    const resolvedFamilles: Record<number, string> = {};
    (b.actes || []).forEach((a, i) => {
      const resolved = resolveFamilleCodeForActe(a.code, a.care_type);
      if (resolved) resolvedFamilles[i] = resolved;
    });
    setActeFamilleCodes(resolvedFamilles);

    // Pre-set MF statuses as 'found' for actes that already have ref_prof_sant
    const initialMfStatuses: Record<
      number,
      import("@/features/bulletins/components/mf-lookup-input").MfStatus
    > = {};
    (b.actes || []).forEach((a, i) => {
      if (a.ref_prof_sant && (a.ref_prof_sant as string).trim()) {
        initialMfStatuses[i] = "found";
      }
    });
    setMfStatuses(initialMfStatuses);

    // Switch to saisie tab
    setActiveTab("saisie");
    toast.info("Bulletin chargé pour modification");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      const isValidType =
        [
          "application/pdf",
          "image/jpeg",
          "image/png",
          "image/jpg",
          "application/zip",
          "application/x-zip-compressed",
        ].includes(file.type) || file.name.toLowerCase().endsWith(".zip");
      const isValidSize = file.size <= 50 * 1024 * 1024; // 50MB for ZIP
      return isValidType && isValidSize;
    });

    if (validFiles.length !== files.length) {
      toast.error(
        "Certains fichiers ont été ignorés (format ou taille invalide)",
      );
    }

    // Clear restored metadata when new files are selected
    if (restoredFilesMeta.length > 0) setRestoredFilesMeta([]);

    // If files already exist OR editing a bulletin, just append new ones (no form reset)
    if (selectedFiles.length > 0 || editingBulletinId) {
      setSelectedFiles((prev) => [...prev, ...validFiles]);
      setFolderSubGroups(null); // Invalidate folder grouping when adding files via file input
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (validFiles.length > 0) {
        toast.success(`${validFiles.length} fichier(s) ajouté(s)`);
      }
      return;
    }

    // First upload: reset form fields
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
    setDuplicateBulletin(null);
    setCurrentFileHash(null);
    skipHashCheckRef.current = false;
    setMfStatuses({});
    setSelectedFiles(validFiles);
    setFolderSubGroups(null); // File input = not a folder selection
    // Reset input value so re-selecting the same files triggers onChange
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveFile = (index: number) => {
    const remaining = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(remaining);
    setFolderSubGroups(null); // Grouping invalidated when files change

    // Reset OCR bulletins and actes, but preserve adherent info
    setOcrBulletins([]);
    setDuplicateBulletin(null);
    setCurrentFileHash(null);
    setSavedBulletinIndices(new Set());
    setSavedBulletinSnapshots({});
    setActiveBulletinIndex(0);
    setOcrFeedback(null);
    setOcrPraticienInfos({});
    setAutoRegisterPraticien({});
    setMfStatuses({});
    // Reset only bulletin/actes fields, keep adherent fields intact
    setValue("bulletin_number", "");
    setValue("actes", [
      {
        care_type: watch("actes.0.care_type") || "consultation",
        code: "",
        label: "",
        amount: 0,
        ref_prof_sant: "",
        nom_prof_sant: "",
        care_description: "",
        cod_msgr: "",
        lib_msgr: "",
      },
    ]);
    if (remaining.length === 0) {
      // Reset everything including adherent when no files left
      setValue("adherent_matricule", "");
      setValue("adherent_first_name", "");
      setValue("adherent_last_name", "");
      setValue("adherent_national_id", "");
      setValue("adherent_contract_number", "");
      setValue("adherent_email", "");
      setValue("adherent_address", "");
      setValue("beneficiary_name", "");
      setValue(
        "bulletin_date",
        new Date().toISOString().split("T")[0] as string,
      );
      setSelectedAdherentInfo(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Filter valid file types from the folder
    const validFiles = files.filter((file) => {
      const isValidType =
        ["application/pdf", "image/jpeg", "image/png", "image/jpg"].includes(
          file.type,
        ) || file.name.toLowerCase().match(/\.(pdf|jpg|jpeg|png)$/);
      return isValidType && file.size <= 10 * 1024 * 1024;
    });

    if (validFiles.length === 0) {
      toast.error("Aucun fichier exploitable trouvé dans le dossier");
      if (folderInputRef.current) folderInputRef.current.value = "";
      return;
    }

    // Build sub-folder grouping from webkitRelativePath BEFORE storing in state
    // (webkitRelativePath is set by the browser and may not persist reliably)
    const groupMap = new Map<string, number[]>();

    // If editing or files already exist, append and reindex groups from current offset
    if (selectedFiles.length > 0 || editingBulletinId) {
      const offset = selectedFiles.length;
      for (let i = 0; i < validFiles.length; i++) {
        const relPath = validFiles[i]!.webkitRelativePath;
        if (relPath) {
          const parts = relPath.split("/").filter(Boolean);
          if (parts.length >= 3) {
            const subFolder = parts[1]!;
            if (!groupMap.has(subFolder)) groupMap.set(subFolder, []);
            groupMap.get(subFolder)!.push(offset + i);
          }
        }
      }
      setSelectedFiles((prev) => [...prev, ...validFiles]);
      setFolderSubGroups(groupMap.size > 1 ? groupMap : null);
      if (folderInputRef.current) folderInputRef.current.value = "";
      toast.success(
        `${validFiles.length} fichier(s) ajouté(s) depuis le dossier`,
      );
      return;
    }

    for (let i = 0; i < validFiles.length; i++) {
      const relPath = validFiles[i]!.webkitRelativePath;
      if (relPath) {
        const parts = relPath.split("/").filter(Boolean);
        // parent/subFolder/file.ext → 3 parts means file is inside a sub-folder
        if (parts.length >= 3) {
          const subFolder = parts[1]!;
          if (!groupMap.has(subFolder)) groupMap.set(subFolder, []);
          groupMap.get(subFolder)!.push(i);
        }
      }
    }

    console.log(
      "[folder-import] webkitRelativePath samples:",
      validFiles.slice(0, 3).map((f) => f.webkitRelativePath),
    );
    console.log(
      "[folder-import] Sub-folder groups:",
      Object.fromEntries(groupMap),
    );

    setSelectedFiles(validFiles);
    setFolderSubGroups(groupMap.size > 1 ? groupMap : null);
    setOcrFeedback(null);
    setOcrPraticienInfos({});
    setAutoRegisterPraticien({});
    setMfStatuses({});
    if (folderInputRef.current) folderInputRef.current.value = "";

    if (groupMap.size > 1) {
      toast.info(
        `${groupMap.size} sous-dossiers détectés — chaque sous-dossier sera traité comme un bulletin séparé`,
      );
    } else {
      toast.info(
        `${validFiles.length} fichier(s) détecté(s) — seront traités comme un seul bulletin`,
      );
    }
  };

  // Helper: flatten a single OCR item into normalized { infos_adherent, volet_medical }
  // Handles both formats:
  //   Format A: { infos_adherent, volet_medical }
  //   Format B: { adherent, actes, total_dossier }
  // Also expands nested ordonnance.medicaments and analyses into separate actes
  const normalizeOcrItem = (item: Record<string, unknown>): OcrBulletinItem => {
    // Determine adherent info
    const adherentRaw = item.infos_adherent || item.adherent || {};
    const adh = adherentRaw as Record<string, unknown>;

    // Determine raw actes (support volet_medical, actes, and actes_independants formats)
    const rawActesSource = (item.volet_medical ||
      item.actes ||
      item.actes_independants ||
      []) as Array<Record<string, unknown>>;

    // Normalize actes_independants format to standard format
    const rawActes: Array<Record<string, unknown>> = rawActesSource.map((a) => {
      // Already in standard format (has type_soin or nature_acte)
      if (a.type_soin || a.nature_acte) return a;
      // actes_independants format → normalize
      const typeRaw = ((a.type as string) || "").toUpperCase();
      const isPharm = typeRaw.includes("PHARMAC");
      const isLab = typeRaw.includes("LABORAT") || typeRaw.includes("ANALYSE");
      const typeSoin = isPharm
        ? "Pharmacie"
        : isLab
          ? "Laboratoire"
          : "Médecin";
      const montantRaw = String(
        a.montant || a.montant_total || a.total_ligne || "0",
      )
        .replace(/[^\d.,]/g, "")
        .replace(",", ".");
      return {
        ...a,
        type_soin: typeSoin,
        nature_acte: a.acte || a.medicament || typeSoin,
        date_acte: a.date,
        montant_facture: montantRaw,
        montant_honoraires: montantRaw,
        nom_praticien:
          a.praticien ||
          a.pharmacie ||
          a.laboratoire ||
          a.centre_radiologie ||
          "",
        matricule_fiscale: a.matricule_fiscale,
        cotation: a.cotation,
      };
    });

    // Extract date from first acte if available (Format B)
    const firstActe = (rawActes[0] || {}) as Record<string, unknown>;
    const infos_adherent: Record<string, unknown> = item.infos_adherent
      ? (item.infos_adherent as Record<string, unknown>)
      : {
          nom_prenom: adh.nom_prenom,
          numero_adherent: adh.numero_adherent,
          numero_contrat: adh.numero_contrat,
          adresse: adh.adresse,
          beneficiaire_coche: adh.beneficiaire,
          nom_beneficiaire: (() => {
            const benef = ((adh.beneficiaire as string) || "").toLowerCase();
            if (benef.includes("enfant")) {
              const enfants = adh.enfants as
                | Array<Record<string, string>>
                | undefined;
              return enfants?.[0]?.nom_prenom || undefined;
            }
            return (
              (adh.conjoint as Record<string, string>)?.nom_prenom || undefined
            );
          })(),
          date_signature: firstActe.date_acte || undefined,
        };

    // Build actes with sub_items — split pharmacie/analyse into separate actes when embedded
    const flatActes: Array<Record<string, unknown>> = [];
    for (const acte of rawActes) {
      // Normalize praticien sub-object into flat fields if needed
      const praticien = acte.praticien as Record<string, string> | undefined;
      if (praticien && !acte.nom_praticien) {
        acte.nom_praticien = praticien.nom_prenom || "";
        acte.matricule_fiscale = praticien.matricule_fiscale || "";
        acte.specialite = praticien.specialite || "";
      }

      // Check for embedded pharmacie sub-object → split into separate acte
      const pharmacie = acte.pharmacie as Record<string, unknown> | undefined;
      const pharmacieDetails = pharmacie?.details_lignes as
        | Array<Record<string, string>>
        | undefined;
      const pharmacieMeds = pharmacie?.medicaments as
        | Array<Record<string, string>>
        | undefined;
      const hasPharmacieData =
        (Array.isArray(pharmacieDetails) && pharmacieDetails.length > 0) ||
        (Array.isArray(pharmacieMeds) && pharmacieMeds.length > 0);

      // Check for embedded analyse sub-object → will be sub-items of this acte
      const analyseObj = acte.analyse as Record<string, unknown> | undefined;
      const resultats = (analyseObj?.resultats ||
        analyseObj?.details_lignes) as
        | Array<Record<string, string>>
        | undefined;

      // --- Main acte (consultation/médecin) ---
      // Collect sub-items that belong to the main acte (ordonnance meds if no separate pharmacie)
      const mainSubItems: Array<{
        label: string;
        amount: number;
        code: string;
        cotation?: string;
      }> = [];

      // ordonnance.medicaments → only as sub-items if NO separate pharmacie
      if (!hasPharmacieData) {
        const ordonnance = acte.ordonnance as
          | Record<string, unknown>
          | undefined;
        const meds = (ordonnance?.medicaments || acte.medicaments) as
          | Array<Record<string, string>>
          | undefined;
        if (Array.isArray(meds) && meds.length > 0) {
          for (const med of meds) {
            const rawPrix = (med.montant || med.prix || "0")
              .replace(/[^\d.,]/g, "")
              .replace(",", ".");
            mainSubItems.push({
              label: [med.nom, med.dosage].filter(Boolean).join(" "),
              amount: parseFloat(rawPrix) || 0,
              code: "",
            });
          }
        }
      }

      // analyse sub-items on main acte (lab/radiologie)
      if (Array.isArray(resultats) && resultats.length > 0) {
        for (const res of resultats) {
          const rawPrix = (res.montant || res.resultat || res.prix || "0")
            .replace(/[^\d.,]/g, "")
            .replace(",", ".");
          mainSubItems.push({
            label: res.designation || res.nom || res.libelle || res.acte || "",
            amount: parseFloat(rawPrix) || 0,
            code: res.code_amm || "",
          });
        }
        if (analyseObj?.nom_laboratoire) {
          acte._labo_nom = analyseObj.nom_laboratoire;
        }
      }

      // details_lignes at acte level (format actes_independants — pharmacy/lab)
      const acteLevelDetails = acte.details_lignes as
        | Array<Record<string, string>>
        | undefined;
      if (
        !resultats?.length &&
        Array.isArray(acteLevelDetails) &&
        acteLevelDetails.length > 0
      ) {
        for (const ligne of acteLevelDetails) {
          const rawPrix = (
            ligne.montant ||
            ligne.total_ligne ||
            ligne.prix_unitaire ||
            "0"
          )
            .replace(/[^\d.,]/g, "")
            .replace(",", ".");
          mainSubItems.push({
            label:
              ligne.designation ||
              ligne.nom ||
              ligne.medicament ||
              ligne.acte ||
              "",
            amount: parseFloat(rawPrix) || 0,
            code: ligne.code_amm || ligne.code_acte || "",
            cotation: ligne.cotation || "",
          });
        }
      }

      // Legacy: analyses/examens array
      const analyses = (acte.analyses || acte.examens) as
        | Array<Record<string, string>>
        | undefined;
      if (
        !resultats?.length &&
        Array.isArray(analyses) &&
        analyses.length > 0
      ) {
        for (const analyse of analyses) {
          const rawPrix = (analyse.montant || analyse.prix || "0")
            .replace(/[^\d.,]/g, "")
            .replace(",", ".");
          mainSubItems.push({
            label: analyse.nom || analyse.libelle || analyse.nature || "",
            amount: parseFloat(rawPrix) || 0,
            code: "",
          });
        }
      }

      if (mainSubItems.length > 0) {
        acte._sub_items = mainSubItems;
      }
      flatActes.push(acte);

      // --- Split: create separate pharmacie acte if embedded ---
      if (hasPharmacieData) {
        const pharmSubItems: Array<{
          label: string;
          amount: number;
          code: string;
        }> = [];

        // pharmacie.details_lignes (prix réels d'achat)
        if (Array.isArray(pharmacieDetails) && pharmacieDetails.length > 0) {
          for (const ligne of pharmacieDetails) {
            const rawPrix = (ligne.montant || ligne.prix_unitaire || "0")
              .replace(/[^\d.,]/g, "")
              .replace(",", ".");
            pharmSubItems.push({
              label: ligne.designation || ligne.nom || "",
              amount: parseFloat(rawPrix) || 0,
              code: ligne.code_amm || "",
            });
          }
        } else if (Array.isArray(pharmacieMeds) && pharmacieMeds.length > 0) {
          // pharmacie.medicaments fallback
          for (const med of pharmacieMeds) {
            const rawPrix = (med.prix || med.montant || "0")
              .replace(/[^\d.,]/g, "")
              .replace(",", ".");
            pharmSubItems.push({
              label: med.nom || "",
              amount: parseFloat(rawPrix) || 0,
              code: "",
            });
          }
        }

        const pharmMontant = String(pharmacie?.montant_total || "0")
          .replace(/[^\d.,]/g, "")
          .replace(",", ".");

        // All pharmacy meds go as sub-items (even single medication)
        const pharmActe: Record<string, unknown> = {
          type_soin: "Pharmacie",
          nature_acte: "Pharmacie",
          date_acte: pharmacie?.date_achat || acte.date_acte,
          montant_facture:
            pharmSubItems.length === 1
              ? String(pharmSubItems[0]!.amount || pharmMontant)
              : pharmMontant,
          montant_honoraires:
            pharmSubItems.length === 1
              ? String(pharmSubItems[0]!.amount || pharmMontant)
              : pharmMontant,
          nom_praticien: pharmacie?.nom_pharmacie || "",
          _pharmacie_nom: pharmacie?.nom_pharmacie || "",
          _sub_items: pharmSubItems,
        };
        flatActes.push(pharmActe);
      }
    }

    // Extract patient name from infos_patient (when beneficiary ≠ adherent)
    const infosPatient = item.infos_patient as
      | Record<string, unknown>
      | undefined;
    if (infosPatient?.nom_prenom_malade && !infos_adherent.nom_beneficiaire) {
      infos_adherent.nom_beneficiaire = infosPatient.nom_prenom_malade;
    }

    const numero_bulletin =
      (item.numero_bulletin as string) ||
      (infos_adherent.numero_bulletin as string) ||
      (adh.numero_bulletin as string) ||
      undefined;

    return {
      infos_adherent,
      volet_medical: flatActes,
      numero_bulletin,
      _file_hash: item._file_hash as string | undefined,
    };
  };

  /** Parse a raw OCR API response into an array of OcrBulletinItem */
  const parseOcrResponse = (
    result: Record<string, unknown>,
  ): OcrBulletinItem[] => {
    // Extract _file_hash from any level of the response
    const responseHash = (result._file_hash ||
      (result.data as Record<string, unknown>)?._file_hash) as
      | string
      | undefined;

    let rawParsed =
      result.donnees_ia || result.resultat || result.data || result;

    if (typeof result.raw_response === "string") {
      const jsonMatch = result.raw_response.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch?.[1]) {
        rawParsed = JSON.parse(jsonMatch[1]);
      }
    }

    const items = Array.isArray(rawParsed)
      ? rawParsed.map((item: Record<string, unknown>) => normalizeOcrItem(item))
      : [normalizeOcrItem(rawParsed as Record<string, unknown>)];

    // Propagate file hash to all parsed items
    if (responseHash) {
      for (const item of items) {
        if (!item._file_hash) item._file_hash = responseHash;
      }
    }

    return items;
  };

  /** Compute SHA-256 per-file hashes + combined hash — content-based, order-independent. */
  const computeFileHashes = async (
    files: File[],
  ): Promise<{
    perFile: { index: number; name: string; hash: string }[];
    combinedHash: string;
  }> => {
    const perFile: { index: number; name: string; hash: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const buf = await files[i]!.arrayBuffer();
      const h = await crypto.subtle.digest("SHA-256", buf);
      perFile.push({
        index: i,
        name: files[i]!.name,
        hash: Array.from(new Uint8Array(h))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(""),
      });
    }
    const sorted = [...perFile.map((f) => f.hash)].sort();
    const combined = new TextEncoder().encode(sorted.join(""));
    const finalHash = await crypto.subtle.digest("SHA-256", combined);
    const combinedHash = Array.from(new Uint8Array(finalHash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return { perFile, combinedHash };
  };

  /** Multi-level duplicate check — sends pre-computed hashes as JSON (no file upload = fast). */
  const checkFileDuplicate = async (
    files: File[],
  ): Promise<{
    isDuplicate: boolean;
    level?: string | null;
    perFile: Array<{
      index: number;
      name: string;
      hash: string;
      isDuplicate: boolean;
      bulletin: Record<string, unknown> | null;
    }>;
  }> => {
    const { perFile, combinedHash } = await computeFileHashes(files);
    const apiBase = apiClient.getBaseUrl();
    const token = localStorage.getItem("accessToken");
    const res = await fetch(
      `${apiBase}/bulletins-soins/agent/check-file-duplicate`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...getTenantHeader(),
        },
        body: JSON.stringify({ fileHashes: perFile, combinedHash }),
      },
    );
    if (!res.ok) return { isDuplicate: false, perFile: [] };
    const json = (await res.json()) as {
      success: boolean;
      data?: {
        isDuplicate: boolean;
        level?: string | null;
        files: Array<{
          index: number;
          name: string;
          hash: string;
          isDuplicate: boolean;
          bulletin: Record<string, unknown> | null;
        }>;
      };
    };
    const data = json.data;
    return {
      isDuplicate: data?.isDuplicate || false,
      level: data?.level,
      perFile: data?.files || [],
    };
  };

  const analyzeWithOCR = async () => {
    if (selectedFiles.length === 0) return;

    // Detect ZIP files
    const hasZip = selectedFiles.some(
      (f) =>
        f.name.toLowerCase().endsWith(".zip") ||
        f.type === "application/zip" ||
        f.type === "application/x-zip-compressed",
    );
    // Use pre-computed folder grouping from handleFolderChange (stored at selection time)
    const hasSubFolders = folderSubGroups !== null && folderSubGroups.size > 1;
    console.log(
      "[analyzeWithOCR] hasZip:",
      hasZip,
      "hasSubFolders:",
      hasSubFolders,
      "folderSubGroups:",
      folderSubGroups ? Object.fromEntries(folderSubGroups) : null,
    );

    let effectiveFiles = selectedFiles; // Files actually sent to OCR (after dedup filtering)

    // --- BULK: ZIP → extract client-side, group by sub-folder, /analyse-bulletin per group ---
    if (hasZip) {
      setIsAnalyzing(true);
      try {
        const ocrBase = (
          import.meta.env.VITE_OCR_API_URL_STAGING ||
          "https://ocr-api-bh-assurance-staging.yassine-techini.workers.dev"
        ).replace(/\/+$/, "");

        // 1. Extract files from ZIP and group by sub-folder
        const folderGroups = new Map<string, File[]>();
        for (const file of selectedFiles) {
          const isZip =
            file.name.toLowerCase().endsWith(".zip") ||
            file.type === "application/zip" ||
            file.type === "application/x-zip-compressed";
          if (isZip) {
            const zip = await JSZip.loadAsync(file);
            const entries = Object.entries(zip.files).filter(
              ([name, entry]) =>
                !entry.dir && /\.(pdf|jpg|jpeg|png)$/i.test(name),
            );
            for (const [name, entry] of entries) {
              const blob = await entry.async("blob");
              const ext = name.split(".").pop()?.toLowerCase() || "pdf";
              const mimeMap: Record<string, string> = {
                pdf: "application/pdf",
                jpg: "image/jpeg",
                jpeg: "image/jpeg",
                png: "image/png",
              };
              const fileName = name.split("/").pop() || name;
              const extracted = new File([blob], fileName, {
                type: mimeMap[ext] || "application/octet-stream",
              });

              // Group by parent folder path (first-level sub-folder)
              const parts = name.split("/").filter(Boolean);
              const groupKey =
                parts.length > 1 ? parts.slice(0, -1).join("/") : "racine";
              const existing = folderGroups.get(groupKey) || [];
              existing.push(extracted);
              folderGroups.set(groupKey, existing);
            }
          } else {
            // Non-zip files go to 'racine' group
            const existing = folderGroups.get("racine") || [];
            existing.push(file);
            folderGroups.set("racine", existing);
          }
        }

        if (folderGroups.size === 0) {
          toast.error("Aucun fichier valide trouvé dans le ZIP");
          setIsAnalyzing(false);
          return;
        }

        // 2. Build groups (same principle as folder import)
        const groups: { name: string; form: FormData }[] = [];
        for (const [folderName, files] of folderGroups) {
          const form = new FormData();
          for (const f of files) {
            form.append("files", f);
          }
          groups.push({ name: folderName, form });
        }

        toast.info(
          `${groups.length} groupe(s) détecté(s) dans le ZIP — vérification des doublons...`,
        );

        // 3. Pre-check all groups for duplicates BEFORE launching OCR
        setIsCheckingDuplicates(true);
        const skippedDuplicateNames: string[] = [];
        const cleanGroups: { name: string; form: FormData }[] = [];

        for (const { name, form } of groups) {
          try {
            const groupFiles = form.getAll("files") as File[];
            if (groupFiles.length === 0) continue;
            const dupResult = await checkFileDuplicate(groupFiles);
            if (dupResult.isDuplicate) {
              const cleanFiles = groupFiles.filter(
                (_, i) =>
                  !dupResult.perFile.find(
                    (pf) => pf.index === i && pf.isDuplicate,
                  ),
              );
              if (cleanFiles.length === 0) {
                const dupBulletin = dupResult.perFile.find(
                  (pf) => pf.bulletin,
                )?.bulletin;
                skippedDuplicateNames.push(
                  `${name} → N° ${(dupBulletin?.bulletinNumber as string) || "?"}`,
                );
                continue;
              }
              const cleanForm = new FormData();
              for (const f of cleanFiles) cleanForm.append("files", f);
              cleanGroups.push({ name, form: cleanForm });
              skippedDuplicateNames.push(`${name} (partiel)`);
            } else {
              cleanGroups.push({ name, form });
            }
          } catch {
            cleanGroups.push({ name, form });
          }
        }
        setIsCheckingDuplicates(false);

        if (skippedDuplicateNames.length > 0) {
          toast.warning(
            `${skippedDuplicateNames.length} doublon(s) ignoré(s) : ${skippedDuplicateNames.join(", ")}`,
            { duration: 6000 },
          );
        }

        if (cleanGroups.length === 0) {
          toast.error("Tous les bulletins sont des doublons — rien à analyser");
          setIsAnalyzing(false);
          return;
        }

        toast.info(
          `Analyse OCR de ${cleanGroups.length} bulletin(s) en cours... Vous pouvez naviguer librement.`,
          { id: "bulk-progress" },
        );

        // 4. Fire-and-forget: run OCR calls in background (survives page navigation)
        const capturedParseOcrResponse = parseOcrResponse;
        const capturedCompanyId = selectedCompany?.id || "";
        const capturedBatchId = selectedBatch?.id;
        const capturedMountedRef = mountedRef;
        const totalGroups = cleanGroups.length;

        // Copy group data (forms with files) before async — closure captures references
        const groupsCopy = cleanGroups.map(({ name, form }) => ({
          name,
          files: form.getAll("files") as File[],
        }));
        // Capture file metadata for display + store blobs in IndexedDB
        const allGroupFiles = groupsCopy.flatMap((g) => g.files);
        const capturedFilesMeta: FileMeta[] = allGroupFiles.map((f) => ({
          name: f.name,
          size: f.size,
          type: f.type,
        }));
        const sessionId = crypto.randomUUID();
        await saveFilesToIdb(sessionId, allGroupFiles).catch(() => {});

        (async () => {
          const allBulletins: OcrBulletinItem[] = [];
          const CONCURRENCY = 4;
          let completed = 0;

          for (let i = 0; i < groupsCopy.length; i += CONCURRENCY) {
            const batch = groupsCopy.slice(i, i + CONCURRENCY);
            if (capturedMountedRef.current && totalGroups > 1) {
              setAnalyzeProgress({
                current: completed + 1,
                total: totalGroups,
                groupName: batch.map((b) => b.name).join(", "),
              });
            }
            await Promise.allSettled(
              batch.map(async ({ name, files }) => {
                try {
                  const form = new FormData();
                  for (const f of files) form.append("files", f);
                  const res = await fetch(`${ocrBase}/analyse-bulletin`, {
                    method: "POST",
                    headers: { accept: "application/json" },
                    body: form,
                  });
                  if (!res.ok) {
                    toast.error(`Erreur OCR pour "${name}"`);
                    return;
                  }
                  const parsed = capturedParseOcrResponse(await res.json());
                  for (const b of parsed) b._source_files = files;
                  allBulletins.push(...parsed);
                } catch (err) {
                  console.error(`[zip-ocr] Erreur "${name}":`, err);
                  toast.error(`Erreur pour "${name}"`);
                }
              }),
            );
            completed += batch.length;
            if (totalGroups > CONCURRENCY) {
              toast.info(
                `Analyse ${Math.min(i + CONCURRENCY, totalGroups)}/${totalGroups} terminée...`,
                { id: "bulk-progress" },
              );
            }
          }

          // Analysis done — save results to persistent store
          if (allBulletins.length === 0) {
            toast.error("Aucun bulletin n'a pu être extrait du ZIP");
          } else {
            // Always save to Zustand (survives navigation)
            useOcrJobsStore.getState().saveAnalysisSession({
              id: sessionId,
              bulletinsJson: JSON.stringify(allBulletins, (k, v) =>
                k === "_source_files" ? undefined : v,
              ),
              companyId: capturedCompanyId,
              batchId: capturedBatchId,
              count: allBulletins.length,
              createdAt: new Date().toISOString(),
              filesMeta: capturedFilesMeta,
              fileSessionId: sessionId,
            });

            toast.success(
              `${allBulletins.length} bulletin(s) analysés depuis ${totalGroups} groupe(s) du ZIP`,
            );

            // If component is still mounted, fill form directly
            if (capturedMountedRef.current) {
              setOcrBulletins(allBulletins);
              setActiveBulletinIndex(-1);
              setSavedBulletinIndices(new Set());
              setSavedBulletinSnapshots({});
              setPendingFormFillIndex(0);
            }
          }

          // Cleanup analysis state if still mounted
          if (capturedMountedRef.current) {
            setIsAnalyzing(false);
            setAnalyzeProgress(null);
          }
        })();

        // Return immediately — OCR runs in background, isAnalyzing cleared when done
        return;
      } catch (error) {
        console.error("Bulk analysis error:", error);
        toast.error(
          error instanceof Error ? error.message : "Erreur lors de l'analyse",
        );
        setIsAnalyzing(false);
        return;
      }
    }

    // --- BULK: Folder with sub-folders → /analyse-bulletin per group ---
    else if (hasSubFolders && folderSubGroups) {
      setIsAnalyzing(true);
      try {
        const ocrBase = (
          import.meta.env.VITE_OCR_API_URL_STAGING ||
          "https://ocr-api-bh-assurance-staging.yassine-techini.workers.dev"
        ).replace(/\/+$/, "");
        // Pre-check all groups for duplicates BEFORE launching OCR
        const groups: { name: string; form: FormData }[] = [];
        for (const [subFolder, indices] of folderSubGroups) {
          const form = new FormData();
          for (const idx of indices) {
            const f = selectedFiles[idx];
            if (f) form.append("files", f);
          }
          groups.push({ name: subFolder, form });
        }

        setIsCheckingDuplicates(true);
        const skippedDuplicateNames: string[] = [];
        const cleanGroups: { name: string; form: FormData }[] = [];

        for (const { name, form } of groups) {
          try {
            const groupFiles = form.getAll("files") as File[];
            if (groupFiles.length === 0) continue;
            const dupResult = await checkFileDuplicate(groupFiles);
            if (dupResult.isDuplicate) {
              const cleanFiles = groupFiles.filter(
                (_, i) =>
                  !dupResult.perFile.find(
                    (pf) => pf.index === i && pf.isDuplicate,
                  ),
              );
              if (cleanFiles.length === 0) {
                const dupBulletin = dupResult.perFile.find(
                  (pf) => pf.bulletin,
                )?.bulletin;
                skippedDuplicateNames.push(
                  `${name} → N° ${(dupBulletin?.bulletinNumber as string) || "?"}`,
                );
                continue;
              }
              const cleanForm = new FormData();
              for (const f of cleanFiles) cleanForm.append("files", f);
              cleanGroups.push({ name, form: cleanForm });
              skippedDuplicateNames.push(`${name} (partiel)`);
            } else {
              cleanGroups.push({ name, form });
            }
          } catch {
            cleanGroups.push({ name, form });
          }
        }
        setIsCheckingDuplicates(false);

        if (skippedDuplicateNames.length > 0) {
          toast.warning(
            `${skippedDuplicateNames.length} doublon(s) ignoré(s) : ${skippedDuplicateNames.join(", ")}`,
            { duration: 6000 },
          );
        }

        if (cleanGroups.length === 0) {
          toast.error("Tous les bulletins sont des doublons — rien à analyser");
          setIsAnalyzing(false);
          return;
        }

        toast.info(
          `Analyse OCR de ${cleanGroups.length} bulletin(s) en cours... Vous pouvez naviguer librement.`,
          { id: "bulk-progress" },
        );

        // Fire-and-forget: run OCR calls in background (survives page navigation)
        const capturedParseOcrResponse = parseOcrResponse;
        const capturedCompanyId = selectedCompany?.id || "";
        const capturedBatchId = selectedBatch?.id;
        const capturedMountedRef = mountedRef;
        const totalGroups = cleanGroups.length;

        const groupsCopy = cleanGroups.map(({ name, form }) => ({
          name,
          files: form.getAll("files") as File[],
        }));
        const allFolderFiles = groupsCopy.flatMap((g) => g.files);
        const capturedFilesMeta: FileMeta[] = allFolderFiles.map((f) => ({
          name: f.name,
          size: f.size,
          type: f.type,
        }));
        const sessionId = crypto.randomUUID();
        await saveFilesToIdb(sessionId, allFolderFiles).catch(() => {});

        (async () => {
          const allBulletins: OcrBulletinItem[] = [];
          const CONCURRENCY = 4;
          let completed = 0;

          for (let i = 0; i < groupsCopy.length; i += CONCURRENCY) {
            const batch = groupsCopy.slice(i, i + CONCURRENCY);
            if (capturedMountedRef.current && totalGroups > 1) {
              setAnalyzeProgress({
                current: completed + 1,
                total: totalGroups,
                groupName: batch.map((b) => b.name).join(", "),
              });
            }
            await Promise.allSettled(
              batch.map(async ({ name, files }) => {
                try {
                  const form = new FormData();
                  for (const f of files) form.append("files", f);
                  const res = await fetch(`${ocrBase}/analyse-bulletin`, {
                    method: "POST",
                    headers: { accept: "application/json" },
                    body: form,
                  });
                  if (!res.ok) {
                    toast.error(`Erreur OCR pour "${name}"`);
                    return;
                  }
                  const parsed = capturedParseOcrResponse(await res.json());
                  for (const b of parsed) b._source_files = files;
                  allBulletins.push(...parsed);
                } catch (err) {
                  console.error(`[folder-ocr] Erreur "${name}":`, err);
                  toast.error(`Erreur pour "${name}"`);
                }
              }),
            );
            completed += batch.length;
            if (totalGroups > CONCURRENCY) {
              toast.info(
                `Analyse ${Math.min(i + CONCURRENCY, totalGroups)}/${totalGroups} terminée...`,
                { id: "bulk-progress" },
              );
            }
          }

          if (allBulletins.length === 0) {
            toast.error("Aucun bulletin n'a pu être extrait");
          } else {
            useOcrJobsStore.getState().saveAnalysisSession({
              id: sessionId,
              bulletinsJson: JSON.stringify(allBulletins, (k, v) =>
                k === "_source_files" ? undefined : v,
              ),
              companyId: capturedCompanyId,
              batchId: capturedBatchId,
              count: allBulletins.length,
              createdAt: new Date().toISOString(),
              filesMeta: capturedFilesMeta,
              fileSessionId: sessionId,
            });

            toast.success(
              `${allBulletins.length} bulletin(s) extraits de ${totalGroups} sous-dossier(s)`,
            );

            if (capturedMountedRef.current) {
              setOcrBulletins(allBulletins);
              setActiveBulletinIndex(-1);
              setSavedBulletinIndices(new Set());
              setSavedBulletinSnapshots({});
              setPendingFormFillIndex(0);
            }
          }

          if (capturedMountedRef.current) {
            setIsAnalyzing(false);
            setAnalyzeProgress(null);
          }
        })();

        return;
      } catch (error) {
        console.error("Bulk analysis error:", error);
        toast.error(
          error instanceof Error ? error.message : "Erreur lors de l'analyse",
        );
        setIsAnalyzing(false);
        return;
      }
    } else {
      // --- SINGLE FILE: 1) server-side duplicate check, 2) OCR if not duplicate ---
      setDuplicateBulletin(null);
      const formData = new FormData();
      for (const file of selectedFiles) {
        formData.append("files", file);
      }

      // Step 1: Server-side duplicate check per file
      if (!skipHashCheckRef.current) {
        setIsCheckingDuplicates(true);
        try {
          const dupResult = await checkFileDuplicate(selectedFiles);
          if (dupResult.isDuplicate) {
            const cleanFiles = selectedFiles.filter(
              (_, i) =>
                !dupResult.perFile.find(
                  (pf) => pf.index === i && pf.isDuplicate,
                ),
            );

            if (cleanFiles.length === 0) {
              // ALL files are duplicates — show alert for first one
              const firstDup = dupResult.perFile.find(
                (pf) => pf.isDuplicate && pf.bulletin,
              );
              if (firstDup?.bulletin) {
                const b = firstDup.bulletin;
                setDuplicateBulletin({
                  id: b.id as string,
                  bulletinNumber: b.bulletinNumber as string,
                  status: b.status as string,
                  date: b.date as string,
                  adherent: b.adherent as string,
                  careType: b.careType as string,
                  totalAmount: b.totalAmount as number | null,
                  reimbursedAmount: b.reimbursedAmount as number | null,
                  createdAt: b.createdAt as string,
                });
              }
              setIsCheckingDuplicates(false);
              return;
            }

            // Some files are duplicates — ask user to confirm before continuing
            setIsCheckingDuplicates(false);
            const duplicateFileInfos = dupResult.perFile
              .filter((pf) => pf.isDuplicate)
              .map((pf) => ({ name: pf.name, bulletin: pf.bulletin }));

            const proceed = await new Promise<boolean>((resolve) => {
              setDuplicateConfirm({
                cleanFiles,
                duplicateFiles: duplicateFileInfos,
                formData,
                resolve,
              });
            });
            setDuplicateConfirm(null);

            if (!proceed) return;

            formData.delete("files");
            for (const f of cleanFiles) formData.append("files", f);
            effectiveFiles = cleanFiles;
          }
        } catch (hashErr) {
          console.warn(
            "[OCR] Duplicate check failed, continuing with OCR:",
            hashErr,
          );
        } finally {
          setIsCheckingDuplicates(false);
        }
      }

      setIsAnalyzing(true);
      toast.info("Analyse OCR en cours... Vous pouvez naviguer librement.", {
        id: "single-ocr-progress",
      });

      // Step 2: Fire-and-forget OCR call (survives page navigation)
      const ocrBase = (
        import.meta.env.VITE_OCR_API_URL_STAGING ||
        "https://ocr-api-bh-assurance-staging.yassine-techini.workers.dev"
      ).replace(/\/+$/, "");
      const capturedParseOcrResponse = parseOcrResponse;
      const capturedCompanyId = selectedCompany?.id || "";
      const capturedBatchId = selectedBatch?.id;
      const capturedMountedRef = mountedRef;
      const capturedEffectiveFiles = [...effectiveFiles];
      const capturedFilesMeta: FileMeta[] = capturedEffectiveFiles.map((f) => ({
        name: f.name,
        size: f.size,
        type: f.type,
      }));
      const sessionId = crypto.randomUUID();
      await saveFilesToIdb(sessionId, capturedEffectiveFiles).catch(() => {});

      (async () => {
        try {
          const ocrRes = await fetch(`${ocrBase}/analyse-bulletin`, {
            method: "POST",
            headers: { accept: "application/json" },
            body: formData,
          });

          if (!ocrRes.ok) {
            toast.error(`Erreur OCR: ${ocrRes.status}`);
            return;
          }

          const result = await ocrRes.json();
          console.log(
            "[OCR] Raw API response:",
            JSON.stringify(result, null, 2),
          );

          const parsed = capturedParseOcrResponse(result);
          if (!parsed || parsed.length === 0) {
            toast.error("Aucun bulletin extrait");
            return;
          }

          // Associate source files
          if (!parsed[0]?._source_files) {
            if (
              parsed.length > 1 &&
              capturedEffectiveFiles.length === parsed.length
            ) {
              for (let i = 0; i < parsed.length; i++) {
                parsed[i]!._source_files = [capturedEffectiveFiles[i]!];
              }
            } else {
              for (const b of parsed) {
                b._source_files = [...capturedEffectiveFiles];
              }
            }
          }

          // Always save to Zustand (survives navigation)
          useOcrJobsStore.getState().saveAnalysisSession({
            id: sessionId,
            bulletinsJson: JSON.stringify(parsed, (k, v) =>
              k === "_source_files" ? undefined : v,
            ),
            companyId: capturedCompanyId,
            batchId: capturedBatchId,
            count: parsed.length,
            createdAt: new Date().toISOString(),
            filesMeta: capturedFilesMeta,
            fileSessionId: sessionId,
          });

          toast.success(`${parsed.length} bulletin(s) analysé(s)`);

          // If still mounted, fill form directly
          if (capturedMountedRef.current) {
            setOcrBulletins(parsed);
            setActiveBulletinIndex(-1);
            setSavedBulletinIndices(new Set());
            setSavedBulletinSnapshots({});
            setPendingFormFillIndex(0);
          }
        } catch (error) {
          console.error("OCR analysis error:", error);
          toast.error("Erreur lors de l'analyse du bulletin");
        } finally {
          if (capturedMountedRef.current) setIsAnalyzing(false);
        }
      })();

      // Return immediately — OCR runs in background
      return;
    }
  };

  /** Load a bulk-OCR bulletin into the main form for review/correction */
  const loadBulkBulletinIntoForm = (
    b: import("@/features/bulletins/hooks/useBulkAnalyse").PendingBulletin,
  ) => {
    // Reset form
    reset({
      bulletin_number: b.bulletin_number || "",
      bulletin_date: b.bulletin_date || new Date().toISOString().split("T")[0],
      adherent_matricule: b.adherent_matricule || "",
      adherent_first_name: b.adherent_first_name || "",
      adherent_last_name: b.adherent_last_name || "",
      adherent_national_id: "",
      adherent_contract_number: "",
      adherent_email: "",
      adherent_address: "",
      adherent_date_of_birth: "",
      beneficiary_name: b.beneficiary_name || "",
      beneficiary_id: "",
      beneficiary_relationship:
        (b.beneficiary_relationship as "self" | "spouse" | "child") || "self",
      beneficiary_email: "",
      beneficiary_address: "",
      beneficiary_date_of_birth: "",
      care_type: undefined,
      actes:
        b.actes.length > 0
          ? b.actes.map((a) => ({
              code: a.code || "",
              label: a.label || "",
              amount: a.amount || 0,
              ref_prof_sant: a.ref_prof_sant || "",
              nom_prof_sant: a.nom_prof_sant || "",
              care_type: resolveCareType(a.care_type),
              care_description: "",
              cod_msgr: "",
              lib_msgr: "",
            }))
          : [
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
    });

    // Reset related states
    setSelectedAdherentInfo(null);
    setAdherentSearch(b.adherent_matricule || "");
    setOcrPraticienInfos({});
    setMfStatuses({});
    setOcrFeedback(null);

    // Pre-fill praticien infos for MF lookup
    b.actes.forEach((a, i) => {
      if (a.ref_prof_sant || a.nom_prof_sant) {
        setOcrPraticienInfos((prev) => ({
          ...prev,
          [i]: { nom: a.nom_prof_sant || "", mf: a.ref_prof_sant || "" },
        }));
      }
    });

    // Close bulk panel and switch to saisie tab
    setBulkJobId(null);
    setActiveTab("saisie");
    toast.info(
      `Bulletin de ${b.adherent_first_name || ""} ${b.adherent_last_name || ""} chargé dans le formulaire`,
    );
  };

  /** Switch to a different OCR-analyzed bulletin and fill the form */
  const handleSwitchBulletin = (index: number) => {
    if (
      index < 0 ||
      index >= ocrBulletins.length ||
      index === activeBulletinIndex
    )
      return;

    // If switching to a saved bulletin, just update the index (detail view handles display)
    if (savedBulletinIndices.has(index)) {
      setActiveBulletinIndex(index);
      return;
    }

    const bulletin = ocrBulletins[index]!;
    const info = bulletin.infos_adherent as Record<string, string>;
    const actes = bulletin.volet_medical as Array<
      Record<string, string | null>
    >;

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
      const rawDate = info.date_bulletin || info.date_signature;
      if (rawDate) {
        const dateParts = rawDate.split(/[.\/]/);
        if (dateParts.length === 3) {
          const year =
            dateParts[2]!.length === 2 ? `20${dateParts[2]}` : dateParts[2];
          setValue("bulletin_date", `${year}-${dateParts[1]}-${dateParts[0]}`);
        }
      }
      if (info.beneficiaire_coche) {
        const benef = info.beneficiaire_coche.toLowerCase().trim();
        if (benef.includes("conjoint"))
          setValue(
            "beneficiary_relationship" as keyof BulletinFormData,
            "spouse",
          );
        else if (benef.includes("enfant"))
          setValue(
            "beneficiary_relationship" as keyof BulletinFormData,
            "child",
          );
        else if (benef.includes("parent") || benef.includes("ascendant"))
          setValue(
            "beneficiary_relationship" as keyof BulletinFormData,
            "parent",
          );
        else if (benef.includes("adh") || benef.includes("assur"))
          setValue(
            "beneficiary_relationship" as keyof BulletinFormData,
            "self",
          );
      } else {
        setValue("beneficiary_relationship" as keyof BulletinFormData, "self");
      }
      if (info.nom_beneficiaire)
        setValue("beneficiary_name", info.nom_beneficiaire.trim());
    }

    // Care type from type_soin + nature_acte
    const detectCareType = (
      typeSoin?: string | null,
      natureActe?: string | null,
    ): string => {
      const combined = [typeSoin, natureActe]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (!combined) return "consultation";
      if (combined.includes("pharmac") || combined.includes("medicament"))
        return "pharmacie";
      if (
        combined.includes("dentaire") ||
        combined.includes("dentist") ||
        combined.includes("dent ")
      )
        return "dentaire";
      if (combined.includes("orthodont")) return "orthodontie";
      if (
        combined.includes("optique") ||
        combined.includes("lunette") ||
        combined.includes("verres")
      )
        return "optique";
      if (
        combined.includes("chirurg") &&
        (combined.includes("refract") || combined.includes("lasik"))
      )
        return "chirurgie_refractive";
      if (
        combined.includes("chirurg") ||
        combined.includes("operation") ||
        combined.includes("bloc")
      )
        return "chirurgie";
      if (
        combined.includes("labo") ||
        combined.includes("analyse") ||
        combined.includes("biolog")
      )
        return "laboratoire";
      if (
        combined.includes("radio") ||
        combined.includes("echograph") ||
        combined.includes("scanner") ||
        combined.includes("irm") ||
        combined.includes("physiother")
      )
        return "actes_specialistes";
      if (combined.includes("kine")) return "actes_courants";
      if (combined.includes("accouchement") || combined.includes("maternite"))
        return "accouchement";
      if (combined.includes("hosp") || combined.includes("clinique"))
        return "hospitalisation";
      if (combined.includes("circoncision")) return "circoncision";
      if (
        combined.includes("orthopedie") ||
        combined.includes("orthoped") ||
        combined.includes("prothese orthoped")
      )
        return "orthopedie";
      if (combined.includes("transport") || combined.includes("ambulance"))
        return "transport";
      if (combined.includes("cure") || combined.includes("thermal"))
        return "cures_thermales";
      if (combined.includes("sanatorium")) return "sanatorium";
      if (combined.includes("funeraire") || combined.includes("deces"))
        return "frais_funeraires";
      if (combined.includes("interruption") || combined.includes("ivg"))
        return "accouchement";
      return "consultation";
    };

    if (Array.isArray(actes) && actes.length > 0 && actes[0]?.type_soin) {
      setValue(
        "care_type",
        detectCareType(
          actes[0].type_soin,
          actes[0].nature_acte as string | null,
        ),
      );
    }

    // Fill actes with sub_items
    if (Array.isArray(actes) && actes.length > 0) {
      actes.forEach((acte: Record<string, unknown>, i: number) => {
        const acteCareType = detectCareType(
          acte.type_soin as string | null,
          acte.nature_acte as string | null,
        );
        const isPharmacy = resolveCareType(acteCareType) === "pharmacie";
        const rawMontant = (
          (acte.montant_facture as string) ||
          (acte.montant_honoraires as string) ||
          "0"
        )
          .replace(/[^\d.,]/g, "")
          .replace(",", ".");
        const montant = parseFloat(rawMontant) || 0;
        const mapped = (acte.nature_acte as string)
          ? mapNatureActeToCode(acte.nature_acte as string)
          : null;
        const code = isPharmacy
          ? "PH1"
          : (acte.matched_code as string) || mapped?.code || "";
        const ocrSubs = acte._sub_items as
          | Array<{
              label: string;
              amount: number;
              code: string;
              cotation?: string;
            }>
          | undefined;
        const label = isPharmacy
          ? "Pharmacie"
          : (acte.matched_label as string) ||
            mapped?.label ||
            (acte.nature_acte as string) ||
            "";
        // For pharmacy without sub-items, create one from the nature_acte
        if (isPharmacy && (!ocrSubs || ocrSubs.length === 0)) {
          acte._sub_items = [
            {
              label: (acte.nature_acte as string) || "",
              amount: montant,
              code: "",
              cotation: "",
            },
          ];
        }
        const nomPraticien =
          (acte._labo_nom as string) ||
          (acte._pharmacie_nom as string) ||
          (acte.nom_praticien as string) ||
          "";
        const refProfSant =
          (acte.mf_extracted as string) ||
          (acte.matricule_fiscale as string) ||
          "";

        if (refProfSant || nomPraticien) {
          setOcrPraticienInfos((prev) => ({
            ...prev,
            [i]: {
              nom: nomPraticien,
              mf: refProfSant,
              specialite: (acte.nature_acte as string) || undefined,
            },
          }));
        }

        // Build sub_items from OCR-extracted nested items
        const ocrSubItems = acte._sub_items as
          | Array<{
              label: string;
              amount: number;
              code: string;
              cotation?: string;
            }>
          | undefined;
        const subItems = ocrSubItems?.map((si) => ({
          label: si.label,
          amount: si.amount,
          code: si.code || "",
          cotation: si.cotation || "",
        }));

        if (i === 0) {
          setValue("actes.0.code", code);
          setValue("actes.0.label", label);
          setValue("actes.0.amount", montant);
          setValue("actes.0.nom_prof_sant", nomPraticien);
          setValue("actes.0.ref_prof_sant", refProfSant);
          setValue("actes.0.care_type", acteCareType);
          if ((acte.nature_acte as string) && !isPharmacy)
            setValue("actes.0.care_description", acte.nature_acte as string);
          if (subItems && subItems.length > 0)
            setValue("actes.0.sub_items", subItems);
        } else {
          appendActe({
            code,
            label,
            amount: montant,
            nom_prof_sant: nomPraticien,
            ref_prof_sant: refProfSant,
            care_type: acteCareType,
            cod_msgr: "",
            lib_msgr: "",
            care_description: !isPharmacy
              ? (acte.nature_acte as string) || ""
              : "",
            sub_items: subItems,
          });
        }
      });

      // Auto-resolve famille codes for ActeSelector dropdowns
      const resolvedFamilles: Record<number, string> = {};
      actes.forEach((acte: Record<string, unknown>, i: number) => {
        const acteCareType = detectCareType(
          acte.type_soin as string | null,
          acte.nature_acte as string | null,
        );
        const acteCode =
          (acte.matched_code as string) ||
          mapNatureActeToCode(acte.nature_acte as string)?.code ||
          "";
        const resolved = resolveFamilleCodeForActe(acteCode, acteCareType);
        if (resolved) resolvedFamilles[i] = resolved;
      });
      setActeFamilleCodes(resolvedFamilles);
    }
  };

  // Deferred form fill: triggered by session restoration or detached OCR completion
  useEffect(() => {
    if (
      pendingFormFillIndex !== null &&
      ocrBulletins.length > 0 &&
      pendingFormFillIndex < ocrBulletins.length
    ) {
      handleSwitchBulletin(pendingFormFillIndex);
      setPendingFormFillIndex(null);
    }
  }, [pendingFormFillIndex, ocrBulletins.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // Refetch adherent data when bulletin date changes (contract dates may differ)
  useEffect(() => {
    if (!selectedAdherentInfo?.id || !watchedBulletinDate) return;
    const matricule = watch("adherent_matricule");
    if (!matricule || matricule.length < 2) return;
    const companyId =
      selectedCompany?.id && selectedCompany.id !== "__INDIVIDUAL__"
        ? selectedCompany.id
        : undefined;
    const params: Record<string, string> = { q: matricule };
    if (companyId) params.companyId = companyId;
    apiClient
      .get<AdherentSearchResult[]>("/adherents/search", { params })
      .then((res) => {
        if (!res.success || !res.data) return;
        const match = res.data.find((a) => a.matricule === matricule);
        if (match) setSelectedAdherentInfo(match);
      });
  }, [watchedBulletinDate]);

  // --- OCR Feedback handlers ---
  const sendOcrFeedback = async (
    statut: "valide" | "invalide" | "partiellement_valide",
  ) => {
    if (!ocrFeedback) return;
    setIsSendingFeedback(true);
    const ocrBase = (
      import.meta.env.VITE_OCR_API_URL_STAGING ||
      "https://ocr-api-bh-assurance-staging.yassine-techini.workers.dev"
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
    const lastName = watchedAdherentLastName;
    const dateOfBirth = watch("adherent_date_of_birth");

    const contractNumber = watch("adherent_contract_number");

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
    if (!contractNumber) {
      toast.error(
        "Numéro de contrat est obligatoire pour enregistrer l'adhérent",
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
          contractNumber,
          nationalId: watch("adherent_national_id") || undefined,
          email: watch("adherent_email") || undefined,
          address: watch("adherent_address") || undefined,
          companyId: selectedCompany?.id || undefined,
          dossierComplet: false,
        },
      );
      if (result.success && result.data) {
        toast.success("Adhérent enregistré avec succès");
        if (result.data.matricule) {
          setValue("adherent_matricule", result.data.matricule);
        }
        // Pre-fill ayantDroitForm from current beneficiary data before UI switches to "registered" mode
        const currentBenefName = watch("beneficiary_name");
        const currentBenefDob = watch("beneficiary_date_of_birth");
        const currentBenefEmail = watch("beneficiary_email");
        if (currentBenefName) {
          const parts = currentBenefName.trim().split(/\s+/);
          setAyantDroitForm((prev) => ({
            ...prev,
            lastName: parts[0] || prev.lastName,
            firstName:
              parts.length >= 2 ? parts.slice(1).join(" ") : prev.firstName,
            dateOfBirth: currentBenefDob || prev.dateOfBirth,
            email: currentBenefEmail || prev.email,
          }));
        }
        // Refresh adherent search + estimation to pick up the new record and contract
        setAdherentSearch(matricule || lastName);
        setShowAdherentDropdown(true);
        await queryClient.invalidateQueries({ queryKey: ["adherents"] });
        await queryClient.invalidateQueries({
          queryKey: ["estimate-reimbursement"],
        });
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
  const handleAddAyantDroit = async (lienParente: "C" | "E") => {
    if (!selectedAdherentInfo?.id) return;
    const { firstName, lastName, dateOfBirth, email, gender } = ayantDroitForm;
    if (!firstName || !lastName || !dateOfBirth) {
      toast.error("Nom, prénom et date de naissance sont requis");
      return;
    }
    setIsAddingAyantDroit(true);
    try {
      const result = await apiClient.post<{
        id: string;
        matricule: string;
        firstName: string;
        lastName: string;
        codeType: string;
      }>(`/adherents/${selectedAdherentInfo.id}/add-ayant-droit`, {
        lienParente,
        firstName,
        lastName,
        dateOfBirth,
        gender: gender || undefined,
        email: lienParente === "C" && email ? email : undefined,
      });
      if (result.success && result.data) {
        toast.success(
          `${lienParente === "C" ? "Conjoint(e)" : "Enfant"} ajouté(e) avec succès`,
        );
        // Refresh family data
        queryClient.invalidateQueries({
          queryKey: ["adherent-famille", selectedAdherentInfo.id],
        });
        // Auto-select as beneficiary
        setValue("beneficiary_name", `${firstName} ${lastName}`);
        setValue("beneficiary_id", result.data.id);
        // Reset form
        setAyantDroitForm({
          firstName: "",
          lastName: "",
          dateOfBirth: "",
          email: "",
          gender: "",
        });
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
      toast.error(
        "Veuillez sélectionner une entreprise avant d'enregistrer un bulletin.",
      );
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
      // Validate against the adherent's individual contract dates
      if (
        selectedAdherentInfo?.contractStartDate &&
        data.bulletin_date < selectedAdherentInfo.contractStartDate
      ) {
        validationErrors.push(
          `La date du bulletin (${data.bulletin_date}) est antérieure au début du contrat de l'adhérent (${selectedAdherentInfo.contractStartDate}).`,
        );
      }
      if (
        selectedAdherentInfo?.contractEndDate &&
        data.bulletin_date > selectedAdherentInfo.contractEndDate
      ) {
        validationErrors.push(
          `La date du bulletin (${data.bulletin_date}) est postérieure à la fin du contrat de l'adhérent (${selectedAdherentInfo.contractEndDate}).`,
        );
      }
    }

    // Total amount must be > 0 (sub_items are informational, only main amount counts)
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
        (a) =>
          (!a.code || a.code.trim() === "") &&
          resolveCareType(a.careType) !== "pharmacie",
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

    // TEMP: show as warnings instead of blocking — to be reverted
    if (validationErrors.length > 0) {
      validationErrors.forEach((err) => toast.warning(err));
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

  // Revalidate cached batch: if restored from localStorage, check it still exists and is open
  const { data: revalidatedBatch, isFetched: batchRevalidated } = useQuery({
    queryKey: ["revalidate-batch", selectedBatch?.id, selectedCompany?.id],
    queryFn: async () => {
      const params = new URLSearchParams({
        companyId: selectedCompany!.id,
        status: "all",
        limit: "1",
        search: selectedBatch!.name,
      });
      const response = await apiClient.get<Batch[]>(
        `/bulletins-soins/agent/batches?${params}`,
      );
      if (!response.success) return null;
      return (
        (response.data || []).find((b: Batch) => b.id === selectedBatch!.id) ||
        null
      );
    },
    enabled: !!selectedBatch && !!selectedCompany,
    staleTime: 30000,
  });

  useEffect(() => {
    if (!selectedBatch || !batchRevalidated) return;
    if (!revalidatedBatch) {
      // Batch no longer exists or not accessible — clear it
      setBatch(null);
      toast.error("Le lot sélectionné n'existe plus ou n'est plus accessible");
    } else if (revalidatedBatch.status !== "open") {
      // Batch exists but is no longer open
      setBatch(null);
      toast.error(
        `Le lot "${revalidatedBatch.name}" n'est plus ouvert (${revalidatedBatch.status})`,
      );
    }
  }, [selectedBatch?.id, batchRevalidated, revalidatedBatch, setBatch]);

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
    return new Intl.NumberFormat("fr-TN", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    }).format(amount);
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
                          <SelectTrigger className="w-full sm:w-[220px] rounded-md h-9">
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
                    Sélectionnez un lot ouvert ou créez-en un nouveau pour
                    commencer la saisie de bulletins.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <form
              onSubmit={handleSubmit(onSubmitForm, (formErrors) => {
                // DEBUG: log full form errors to console
                console.error(
                  "[BulletinForm] Validation errors:",
                  JSON.stringify(formErrors, null, 2),
                );
                // Show validation errors from Zod schema when form is invalid
                const messages: string[] = [];

                // Helper: recursively extract all error messages from nested form errors
                const extractErrors = (
                  obj: Record<string, unknown>,
                  prefix: string,
                ) => {
                  for (const [key, val] of Object.entries(obj)) {
                    if (!val || typeof val !== "object") continue;
                    const rec = val as Record<string, unknown>;
                    if (typeof rec.message === "string" && rec.message) {
                      messages.push(`${prefix}${key}: ${rec.message}`);
                    } else {
                      extractErrors(rec, `${prefix}${key}.`);
                    }
                  }
                };

                // Top-level fields
                const topFields: Array<[string, string]> = [
                  ["bulletin_date", "Date"],
                  ["adherent_matricule", "Matricule"],
                  ["care_type", "Type de soin"],
                  ["beneficiary_relationship", "Lien bénéficiaire"],
                  ["beneficiary_name", "Nom bénéficiaire"],
                ];
                for (const [field, label] of topFields) {
                  const err = (
                    formErrors as Record<string, { message?: string }>
                  )[field];
                  if (err?.message) messages.push(`${label}: ${err.message}`);
                }

                // Actes root error
                if (formErrors.actes?.root)
                  messages.push(
                    formErrors.actes.root.message || "Erreur actes",
                  );

                // Per-acte errors (including sub_items)
                if (formErrors.actes && Array.isArray(formErrors.actes)) {
                  formErrors.actes.forEach((acteErr, idx) => {
                    if (!acteErr) return;
                    const acteRec = acteErr as Record<string, unknown>;
                    for (const [key, val] of Object.entries(acteRec)) {
                      if (!val || typeof val !== "object") continue;
                      const rec = val as Record<string, unknown>;
                      if (typeof rec.message === "string" && rec.message) {
                        messages.push(
                          `Acte ${idx + 1} — ${key}: ${rec.message}`,
                        );
                      } else if (key === "sub_items" && Array.isArray(val)) {
                        (val as Array<Record<string, unknown>>).forEach(
                          (si, siIdx) => {
                            if (!si) return;
                            for (const [siKey, siVal] of Object.entries(si)) {
                              const siRec = siVal as Record<
                                string,
                                unknown
                              > | null;
                              if (siRec && typeof siRec.message === "string") {
                                messages.push(
                                  `Acte ${idx + 1} — sous-item ${siIdx + 1} ${siKey}: ${siRec.message}`,
                                );
                              }
                            }
                          },
                        );
                      }
                    }
                  });
                }

                // Fallback: if no specific messages extracted, dump all errors
                if (messages.length === 0) {
                  extractErrors(formErrors as Record<string, unknown>, "");
                }

                if (messages.length > 0) {
                  messages.forEach((m) => toast.error(m));
                } else {
                  toast.error("Veuillez vérifier les champs du formulaire.");
                  console.warn(
                    "[BulletinForm] Unhandled validation errors:",
                    formErrors,
                  );
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
                          {savedBulletinIndices.size} enregistré
                          {savedBulletinIndices.size !== 1 ? "s" : ""} sur{" "}
                          {ocrBulletins.length}
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
                  <div className="flex gap-2 overflow-x-auto pb-1 pt-2">
                    {ocrBulletins.map((b, idx) => {
                      const isSaved = savedBulletinIndices.has(idx);
                      const isActive = idx === activeBulletinIndex;
                      const adhName =
                        (b.infos_adherent?.nom_prenom as string) ||
                        `Bulletin ${idx + 1}`;
                      const numBulletin =
                        b.numero_bulletin ||
                        (b.infos_adherent?.numero_bulletin as string);
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
                                : "border-gray-200 bg-white hover:border-blue-300 hover:shadow-sm",
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
                            {b.volet_medical?.length || 0} acte
                            {(b.volet_medical?.length || 0) !== 1 ? "s" : ""}
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
              {isActiveBulletinSaved &&
              savedBulletinSnapshots[activeBulletinIndex] ? (
                (() => {
                  const snap = savedBulletinSnapshots[activeBulletinIndex]!;
                  return (
                    <div className="space-y-4">
                      {/* Header banner */}
                      <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3">
                        <Lock className="h-5 w-5 text-emerald-600 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-emerald-800">
                            Bulletin enregistré
                          </p>
                          <p className="text-xs text-emerald-600">
                            Sélectionnez un bulletin non enregistré pour
                            continuer la saisie.
                          </p>
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
                              <FileText className="h-4 w-4 text-blue-600" />{" "}
                              Informations du bulletin
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-xs text-gray-500">
                                  N° Bulletin
                                </p>
                                <p className="font-medium text-gray-900 font-mono">
                                  {snap.bulletin_number}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Date</p>
                                <p className="font-medium text-gray-900">
                                  {snap.bulletin_date
                                    ? new Date(
                                        snap.bulletin_date,
                                      ).toLocaleDateString("fr-TN")
                                    : "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">
                                  Matricule
                                </p>
                                <p className="font-medium text-gray-900 font-mono">
                                  {snap.adherent_matricule}
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Adherent info */}
                          <div className="rounded-2xl border border-gray-200 bg-white p-5">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                              <User className="h-4 w-4 text-blue-600" />{" "}
                              Adhérent
                            </h3>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                              <div>
                                <p className="text-xs text-gray-500">Nom</p>
                                <p className="font-medium text-gray-900">
                                  {snap.adherent_last_name || "—"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-gray-500">Prénom</p>
                                <p className="font-medium text-gray-900">
                                  {snap.adherent_first_name || "—"}
                                </p>
                              </div>
                              {snap.adherent_email && (
                                <div>
                                  <p className="text-xs text-gray-500">Email</p>
                                  <p className="font-medium text-gray-900">
                                    {snap.adherent_email}
                                  </p>
                                </div>
                              )}
                              {snap.beneficiary_relationship &&
                                snap.beneficiary_relationship !== "self" && (
                                  <>
                                    <div>
                                      <p className="text-xs text-gray-500">
                                        Bénéficiaire
                                      </p>
                                      <p className="font-medium text-gray-900">
                                        {snap.beneficiary_name || "—"}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-xs text-gray-500">
                                        Lien
                                      </p>
                                      <Badge
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        {snap.beneficiary_relationship ===
                                        "spouse"
                                          ? "Conjoint(e)"
                                          : snap.beneficiary_relationship ===
                                              "child"
                                            ? "Enfant"
                                            : snap.beneficiary_relationship}
                                      </Badge>
                                    </div>
                                  </>
                                )}
                            </div>
                          </div>

                          {/* Actes */}
                          <div className="rounded-2xl border border-gray-200 bg-white p-5">
                            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                              <Stethoscope className="h-4 w-4 text-amber-600" />{" "}
                              Actes ({snap.actes?.length || 0})
                            </h3>
                            <div className="space-y-2">
                              {snap.actes?.map((acte, i) => (
                                <div
                                  key={i}
                                  className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      {acte.code && (
                                        <Badge
                                          variant="outline"
                                          className="text-[10px] px-1.5 font-mono"
                                        >
                                          {acte.code}
                                        </Badge>
                                      )}
                                      <p className="text-sm font-medium text-gray-900 truncate">
                                        {acte.label}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-500">
                                      {acte.nom_prof_sant && (
                                        <span>Dr. {acte.nom_prof_sant}</span>
                                      )}
                                      {acte.ref_prof_sant && (
                                        <span className="font-mono">
                                          {acte.ref_prof_sant}
                                        </span>
                                      )}
                                      <Badge
                                        variant="outline"
                                        className="text-[9px] px-1"
                                      >
                                        {careTypeDisplay(acte.care_type).label}
                                      </Badge>
                                    </div>
                                  </div>
                                  <p className="text-sm font-bold text-gray-900 ml-4 whitespace-nowrap">
                                    {new Intl.NumberFormat("fr-TN", {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 2,
                                    }).format(acte.amount)}{" "}
                                    DT
                                  </p>
                                </div>
                              ))}
                            </div>
                            <div className="flex justify-end mt-3 pt-3 border-t border-gray-100">
                              <div className="text-right">
                                <p className="text-xs text-gray-500">Total</p>
                                <p className="text-lg font-bold text-gray-900">
                                  {new Intl.NumberFormat("fr-TN", {
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 2,
                                  }).format(
                                    (snap.actes || []).reduce(
                                      (sum, a) => sum + (Number(a.amount) || 0),
                                      0,
                                    ),
                                  )}{" "}
                                  DT
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
                              <p className="text-sm font-semibold text-emerald-800">
                                Bulletin sauvegardé
                              </p>
                            </div>
                            <p className="text-xs text-emerald-700">
                              Ce bulletin a été enregistré avec succès. Il
                              apparaît dans la liste des bulletins.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
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
                          {editingBulletinId ? (
                            <ScanUpload
                              bulletinId={editingBulletinId}
                              readOnly={false}
                            />
                          ) : selectedFiles.length > 0 ? (
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
                                  disabled={isAnalyzing || isCheckingDuplicates}
                                  className="rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800"
                                >
                                  {isCheckingDuplicates ? (
                                    <>
                                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                      Vérification doublons...
                                    </>
                                  ) : isAnalyzing ? (
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
                              {/* Bulk OCR progress bar */}
                              {isAnalyzing &&
                                analyzeProgress &&
                                analyzeProgress.total > 1 && (
                                  <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-blue-800 font-medium flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        En cours de traitement bulletin{" "}
                                        {analyzeProgress.current}/
                                        {analyzeProgress.total}
                                      </span>
                                      <span className="text-blue-600 text-xs">
                                        {analyzeProgress.groupName}
                                      </span>
                                    </div>
                                    <div className="h-2 w-full rounded-full bg-blue-200 overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-blue-600 transition-all duration-300"
                                        style={{
                                          width: `${(analyzeProgress.current / analyzeProgress.total) * 100}%`,
                                        }}
                                      />
                                    </div>
                                  </div>
                                )}
                            </div>
                          ) : restoredFilesMeta.length > 0 ? (
                            <div className="space-y-3">
                              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
                                <p className="text-xs font-medium text-emerald-700 flex items-center gap-1.5">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Fichiers analysés (session restaurée)
                                </p>
                                {restoredFilesMeta.map((fm, i) => (
                                  <div
                                    key={`${fm.name}-${i}`}
                                    className="flex items-center gap-2 text-sm text-gray-700 pl-5"
                                  >
                                    {fm.type.startsWith("image/") ? (
                                      <FileImage className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                    ) : (
                                      <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                                    )}
                                    <span className="truncate">{fm.name}</span>
                                    <span className="text-xs text-gray-400 shrink-0">
                                      {fm.size < 1024
                                        ? `${fm.size} o`
                                        : fm.size < 1048576
                                          ? `${(fm.size / 1024).toFixed(0)} Ko`
                                          : `${(fm.size / 1048576).toFixed(1)} Mo`}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setRestoredFilesMeta([]);
                                  fileInputRef.current?.click();
                                }}
                                className="rounded-xl"
                              >
                                <Upload className="h-4 w-4 mr-2" />
                                Remplacer les fichiers
                              </Button>
                            </div>
                          ) : (
                            <div
                              className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50/50 px-6 py-10 hover:border-blue-400 hover:bg-blue-50/30 transition-colors"
                              onDragOver={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                e.currentTarget.classList.add(
                                  "border-blue-400",
                                  "bg-blue-50/30",
                                );
                              }}
                              onDragLeave={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                e.currentTarget.classList.remove(
                                  "border-blue-400",
                                  "bg-blue-50/30",
                                );
                              }}
                              onDrop={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                e.currentTarget.classList.remove(
                                  "border-blue-400",
                                  "bg-blue-50/30",
                                );
                                const droppedFiles = Array.from(
                                  e.dataTransfer.files,
                                );
                                if (droppedFiles.length > 0)
                                  handleFileChange({
                                    target: { files: e.dataTransfer.files },
                                  } as React.ChangeEvent<HTMLInputElement>);
                              }}
                            >
                              <Upload className="h-10 w-10 text-gray-400 mb-3" />
                              <p className="font-semibold text-sm text-gray-700">
                                Glissez-déposez vos fichiers ici
                              </p>
                              <p className="text-xs text-gray-500 mt-1 mb-4">
                                PDF, JPG, PNG ou ZIP
                              </p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-2 text-xs font-semibold text-white hover:from-blue-700 hover:to-blue-800 transition-all flex items-center gap-1.5"
                                  onClick={() => fileInputRef.current?.click()}
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  Fichier(s)
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-1.5"
                                  onClick={() =>
                                    folderInputRef.current?.click()
                                  }
                                >
                                  <FolderPlus className="h-3.5 w-3.5" />
                                  Dossier
                                </button>
                              </div>
                              <div className="mt-4 rounded-lg bg-blue-50 border border-blue-100 px-4 py-2.5 text-xs text-blue-700 max-w-sm">
                                <p className="font-medium mb-1">
                                  Comment ça marche ?
                                </p>
                                <ul className="space-y-0.5 text-blue-600">
                                  <li>
                                    • <strong>Images / PDF</strong> → traité
                                    comme un seul bulletin
                                  </li>
                                  <li>
                                    • <strong>ZIP / Dossier</strong> → chaque
                                    sous-dossier = un bulletin séparé
                                  </li>
                                </ul>
                              </div>
                            </div>
                          )}
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png,.zip"
                            multiple
                            onChange={handleFileChange}
                            className="hidden"
                          />
                          <input
                            ref={folderInputRef}
                            type="file"
                            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                            // @ts-ignore webkitdirectory is not in React types
                            webkitdirectory=""
                            directory=""
                            multiple
                            onChange={handleFolderChange}
                            className="hidden"
                          />

                          {/* Bulk ZIP Processing Panel */}
                          {bulkJobId &&
                            bulkJobData &&
                            selectedFiles.length > 0 && (
                              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                  <h3 className="text-sm font-semibold text-blue-900 flex items-center gap-2">
                                    <Package className="h-4 w-4" />
                                    Traitement en masse
                                  </h3>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setBulkJobId(null);
                                      setSelectedFiles([]);
                                      setFolderSubGroups(null);
                                      setDuplicateBulletin(null);
                                      setCurrentFileHash(null);
                                    }}
                                    className="text-xs text-gray-500"
                                  >
                                    <X className="h-3 w-3 mr-1" /> Fermer
                                  </Button>
                                </div>

                                {/* Progress bar */}
                                <div className="space-y-1">
                                  <div className="flex justify-between text-xs text-gray-600">
                                    <span>
                                      {
                                        bulkJobData.job
                                          .total_bulletins_extracted
                                      }{" "}
                                      bulletin(s) détecté(s)
                                    </span>
                                    <span>
                                      {bulkJobData.job.bulletins_ready +
                                        bulkJobData.job.bulletins_pending}{" "}
                                      /{" "}
                                      {
                                        bulkJobData.job
                                          .total_bulletins_extracted
                                      }{" "}
                                      traité(s)
                                    </span>
                                  </div>
                                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-500"
                                      style={{
                                        width:
                                          bulkJobData.job
                                            .total_bulletins_extracted > 0
                                            ? `${((bulkJobData.job.bulletins_ready + bulkJobData.job.bulletins_pending) / bulkJobData.job.total_bulletins_extracted) * 100}%`
                                            : "0%",
                                      }}
                                    />
                                  </div>
                                </div>

                                {/* Bulletin list */}
                                {bulkJobData.bulletins.length > 0 && (
                                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                                    {bulkJobData.bulletins.map((b, bIdx) => {
                                      const errors: Array<{
                                        field: string;
                                        code: string;
                                        message: string;
                                      }> = b.validation_errors
                                        ? (() => {
                                            try {
                                              return JSON.parse(
                                                b.validation_errors,
                                              );
                                            } catch {
                                              return [];
                                            }
                                          })()
                                        : [];
                                      const isReady =
                                        b.validation_status ===
                                        "ready_for_validation";
                                      const needsCorrection =
                                        b.validation_status ===
                                        "pending_correction";
                                      const isProcessing =
                                        b.validation_status ===
                                          "processing_ocr" ||
                                        b.validation_status === "pending_ocr" ||
                                        b.validation_status ===
                                          "pending_validation" ||
                                        b.validation_status === "validating";
                                      const isExpanded =
                                        expandedBulkBulletinId === b.id;

                                      return (
                                        <div
                                          key={b.id}
                                          className={cn(
                                            "rounded-lg border text-sm transition-all",
                                            isReady &&
                                              "border-green-200 bg-green-50",
                                            needsCorrection &&
                                              "border-orange-200 bg-orange-50",
                                            isProcessing &&
                                              "border-blue-200 bg-blue-50",
                                          )}
                                        >
                                          {/* Header row — clickable to expand */}
                                          <div
                                            className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-black/5 rounded-lg"
                                            onClick={() =>
                                              setExpandedBulkBulletinId(
                                                isExpanded ? null : b.id,
                                              )
                                            }
                                          >
                                            <div className="flex items-center gap-2">
                                              <ChevronRight
                                                className={cn(
                                                  "h-4 w-4 text-gray-400 transition-transform",
                                                  isExpanded && "rotate-90",
                                                )}
                                              />
                                              <span className="text-xs text-gray-400 font-mono w-5">
                                                {bIdx + 1}
                                              </span>
                                              <span className="font-medium">
                                                {b.adherent_first_name || ""}{" "}
                                                {b.adherent_last_name || ""}
                                                {!b.adherent_first_name &&
                                                  !b.adherent_last_name &&
                                                  "Bulletin en cours..."}
                                              </span>
                                              {b.adherent_matricule && (
                                                <span className="text-xs text-gray-500 font-mono">
                                                  {b.adherent_matricule}
                                                </span>
                                              )}
                                              {b.total_amount != null &&
                                                b.total_amount > 0 && (
                                                  <span className="text-xs font-semibold text-gray-700">
                                                    {b.total_amount.toFixed(3)}{" "}
                                                    TND
                                                  </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                              <Badge
                                                variant={
                                                  isReady
                                                    ? "default"
                                                    : needsCorrection
                                                      ? "destructive"
                                                      : "secondary"
                                                }
                                                className="text-xs"
                                              >
                                                {isReady && "Prêt"}
                                                {needsCorrection &&
                                                  "À corriger"}
                                                {isProcessing && "En cours..."}
                                              </Badge>
                                            </div>
                                          </div>

                                          {/* Expanded detail panel */}
                                          {isExpanded && !isProcessing && (
                                            <div className="px-4 pb-3 pt-1 border-t border-dashed space-y-3">
                                              {/* Adherent info */}
                                              <div>
                                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                                  Adhérent
                                                </p>
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                                  <div>
                                                    <span className="text-gray-500">
                                                      Matricule :
                                                    </span>{" "}
                                                    <span className="font-mono font-medium">
                                                      {b.adherent_matricule ||
                                                        "—"}
                                                    </span>
                                                  </div>
                                                  <div>
                                                    <span className="text-gray-500">
                                                      Nom :
                                                    </span>{" "}
                                                    <span className="font-medium">
                                                      {b.adherent_last_name ||
                                                        "—"}
                                                    </span>
                                                  </div>
                                                  <div>
                                                    <span className="text-gray-500">
                                                      Prénom :
                                                    </span>{" "}
                                                    <span className="font-medium">
                                                      {b.adherent_first_name ||
                                                        "—"}
                                                    </span>
                                                  </div>
                                                  <div>
                                                    <span className="text-gray-500">
                                                      Date bulletin :
                                                    </span>{" "}
                                                    <span className="font-medium">
                                                      {b.bulletin_date || "—"}
                                                    </span>
                                                  </div>
                                                  {b.bulletin_number && (
                                                    <div>
                                                      <span className="text-gray-500">
                                                        N° bulletin :
                                                      </span>{" "}
                                                      <span className="font-mono font-medium">
                                                        {b.bulletin_number}
                                                      </span>
                                                    </div>
                                                  )}
                                                  {b.beneficiary_name && (
                                                    <div>
                                                      <span className="text-gray-500">
                                                        Bénéficiaire :
                                                      </span>{" "}
                                                      <span className="font-medium">
                                                        {b.beneficiary_name} (
                                                        {b.beneficiary_relationship ||
                                                          "—"}
                                                        )
                                                      </span>
                                                    </div>
                                                  )}
                                                </div>
                                              </div>

                                              {/* Actes table */}
                                              {b.actes.length > 0 && (
                                                <div>
                                                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                                                    Actes ({b.actes.length})
                                                  </p>
                                                  <div className="rounded border border-gray-200 overflow-hidden">
                                                    <table className="w-full text-xs">
                                                      <thead className="bg-gray-100">
                                                        <tr>
                                                          <th className="px-2 py-1 text-left font-medium text-gray-600">
                                                            Code
                                                          </th>
                                                          <th className="px-2 py-1 text-left font-medium text-gray-600">
                                                            Désignation
                                                          </th>
                                                          <th className="px-2 py-1 text-left font-medium text-gray-600">
                                                            Praticien
                                                          </th>
                                                          <th className="px-2 py-1 text-left font-medium text-gray-600">
                                                            MF
                                                          </th>
                                                          <th className="px-2 py-1 text-right font-medium text-gray-600">
                                                            Montant
                                                          </th>
                                                        </tr>
                                                      </thead>
                                                      <tbody>
                                                        {b.actes.map((a) => (
                                                          <tr
                                                            key={a.id}
                                                            className="border-t border-gray-100"
                                                          >
                                                            <td className="px-2 py-1 font-mono">
                                                              {a.code || "—"}
                                                            </td>
                                                            <td className="px-2 py-1">
                                                              {a.label || "—"}
                                                            </td>
                                                            <td className="px-2 py-1">
                                                              {a.nom_prof_sant ||
                                                                "—"}
                                                            </td>
                                                            <td className="px-2 py-1 font-mono">
                                                              {a.ref_prof_sant ||
                                                                "—"}
                                                            </td>
                                                            <td className="px-2 py-1 text-right font-semibold">
                                                              {(
                                                                a.amount || 0
                                                              ).toFixed(3)}
                                                            </td>
                                                          </tr>
                                                        ))}
                                                      </tbody>
                                                      <tfoot className="bg-gray-50 font-semibold">
                                                        <tr className="border-t">
                                                          <td
                                                            colSpan={4}
                                                            className="px-2 py-1 text-right"
                                                          >
                                                            Total
                                                          </td>
                                                          <td className="px-2 py-1 text-right">
                                                            {(
                                                              b.total_amount ||
                                                              0
                                                            ).toFixed(3)}{" "}
                                                            TND
                                                          </td>
                                                        </tr>
                                                      </tfoot>
                                                    </table>
                                                  </div>
                                                </div>
                                              )}

                                              {/* Validation errors */}
                                              {needsCorrection &&
                                                errors.length > 0 && (
                                                  <div>
                                                    <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-1">
                                                      Erreurs de validation
                                                    </p>
                                                    <div className="space-y-0.5">
                                                      {errors.map((err, i) => (
                                                        <p
                                                          key={i}
                                                          className="text-xs text-orange-700 flex items-center gap-1"
                                                        >
                                                          <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                                                          {err.message}
                                                        </p>
                                                      ))}
                                                    </div>
                                                  </div>
                                                )}

                                              {/* Action button */}
                                              <div className="flex justify-end">
                                                <Button
                                                  type="button"
                                                  variant={
                                                    needsCorrection
                                                      ? "outline"
                                                      : "default"
                                                  }
                                                  size="sm"
                                                  className="text-xs"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    loadBulkBulletinIntoForm(b);
                                                  }}
                                                >
                                                  {needsCorrection ? (
                                                    <>
                                                      <AlertTriangle className="h-3 w-3 mr-1" />{" "}
                                                      Corriger dans le
                                                      formulaire
                                                    </>
                                                  ) : (
                                                    <>
                                                      <Check className="h-3 w-3 mr-1" />{" "}
                                                      Charger dans le formulaire
                                                    </>
                                                  )}
                                                </Button>
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Still processing indicator */}
                                {bulkJobData.job.status !== "completed" &&
                                  bulkJobData.job.status !== "failed" &&
                                  bulkJobData.job.bulletins_ready +
                                    bulkJobData.job.bulletins_pending <
                                    bulkJobData.job
                                      .total_bulletins_extracted && (
                                    <div className="flex items-center gap-2">
                                      <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
                                      <p className="text-xs text-blue-600">
                                        Traitement en cours — actualisation
                                        automatique...
                                      </p>
                                    </div>
                                  )}

                                {/* Error state: job finished but no bulletins created */}
                                {(bulkJobData.job.status === "completed" ||
                                  bulkJobData.job.status === "failed") &&
                                  bulkJobData.bulletins.length === 0 && (
                                    <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-2">
                                      <p className="text-xs text-orange-800 flex items-center gap-1">
                                        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                                        Le traitement OCR n'a pas pu extraire
                                        les bulletins. L'API OCR a peut-être
                                        expiré ou échoué.
                                      </p>
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        disabled={retryMutation.isPending}
                                        onClick={() => {
                                          retryMutation.mutate(bulkJobId!, {
                                            onSuccess: () => {
                                              toast.success(
                                                "Job relancé — les bulletins vont être re-traités",
                                              );
                                            },
                                            onError: (err) => {
                                              toast.error(
                                                err.message ||
                                                  "Erreur lors du retry",
                                              );
                                            },
                                          });
                                        }}
                                        className="text-xs"
                                      >
                                        {retryMutation.isPending ? (
                                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                        ) : (
                                          <RefreshCw className="h-3 w-3 mr-1" />
                                        )}
                                        Réessayer le traitement
                                      </Button>
                                    </div>
                                  )}
                              </div>
                            )}

                          {/* OCR Feedback Panel */}
                          {ocrFeedback?.visible &&
                            (() => {
                              const adh = (ocrFeedback.donneesIa
                                .infos_adherent || {}) as Record<
                                string,
                                string
                              >;
                              const actes = (ocrFeedback.donneesIa
                                .volet_medical || []) as Record<
                                string,
                                string
                              >[];
                              const adhFields: [string, string][] = [
                                ["Nom/prenom", adh.nom_prenom],
                                ["N° adherent", adh.numero_adherent],
                                ["N° contrat", adh.numero_contrat],
                                ["N° bulletin", adh.numero_bulletin],
                                // ["Adresse", adh.adresse],
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
                                      Informations adhérent
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
                                            {Object.entries(
                                              acteFieldLabels,
                                            ).map(([key, fieldLabel]) => {
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
                                    onChange={(e) =>
                                      setFeedbackComment(e.target.value)
                                    }
                                    rows={2}
                                    className="text-sm rounded-md h-9"
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
                                      onClick={() =>
                                        sendOcrFeedback("invalide")
                                      }
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

                      {/* Duplicate file detection alert */}
                      {duplicateBulletin && (
                        <div className="rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-orange-50 p-5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="flex items-start gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100">
                              <FileWarning className="h-6 w-6 text-amber-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-bold text-amber-900">
                                Document déjà analysé
                              </h3>
                              <p className="mt-1 text-sm text-amber-800">
                                Ce fichier a déjà été traité et enregistré comme
                                bulletin{" "}
                                <strong>
                                  N° {duplicateBulletin.bulletinNumber}
                                </strong>
                                .
                              </p>
                              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                <div className="rounded-lg bg-white/60 px-3 py-2">
                                  <p className="text-amber-600 font-medium">
                                    Adhérent
                                  </p>
                                  <p className="font-semibold text-gray-900 truncate">
                                    {duplicateBulletin.adherent || "-"}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-white/60 px-3 py-2">
                                  <p className="text-amber-600 font-medium">
                                    Date
                                  </p>
                                  <p className="font-semibold text-gray-900">
                                    {duplicateBulletin.date
                                      ? new Date(
                                          duplicateBulletin.date,
                                        ).toLocaleDateString("fr-TN")
                                      : "-"}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-white/60 px-3 py-2">
                                  <p className="text-amber-600 font-medium">
                                    Montant
                                  </p>
                                  <p className="font-semibold text-gray-900">
                                    {duplicateBulletin.totalAmount != null
                                      ? `${Number(duplicateBulletin.totalAmount).toFixed(3)} DT`
                                      : "-"}
                                  </p>
                                </div>
                                <div className="rounded-lg bg-white/60 px-3 py-2">
                                  <p className="text-amber-600 font-medium">
                                    Statut
                                  </p>
                                  <p className="font-semibold text-gray-900 capitalize">
                                    {duplicateBulletin.status}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-3 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDuplicateBulletin(null);
                                    skipHashCheckRef.current = true;
                                    analyzeWithOCR();
                                  }}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                  Analyser quand même
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDuplicateBulletin(null)}
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
                                >
                                  Fermer
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Partial duplicate confirmation dialog */}
                      {duplicateConfirm && (
                        <div className="rounded-2xl border-2 border-blue-300 bg-gradient-to-r from-blue-50 to-indigo-50 p-5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                          <div className="flex items-start gap-4">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100">
                              <FileWarning className="h-6 w-6 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm font-bold text-blue-900">
                                {duplicateConfirm.duplicateFiles.length}{" "}
                                fichier(s) déjà enregistré(s)
                              </h3>
                              <p className="mt-1 text-sm text-blue-800">
                                {duplicateConfirm.cleanFiles.length} fichier(s)
                                restant(s) à analyser. Voulez-vous continuer ?
                              </p>
                              <div className="mt-2 space-y-1.5">
                                {duplicateConfirm.duplicateFiles.map(
                                  (df, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center gap-2 text-xs text-blue-700 bg-white/60 rounded-lg px-3 py-1.5"
                                    >
                                      <FileWarning className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                      <span className="truncate font-medium">
                                        {df.name}
                                      </span>
                                      {df.bulletin && (
                                        <span className="text-blue-500 ml-auto shrink-0">
                                          → N°{" "}
                                          {df.bulletin.bulletinNumber as string}
                                        </span>
                                      )}
                                    </div>
                                  ),
                                )}
                              </div>
                              <div className="mt-3 flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => duplicateConfirm.resolve(true)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                                >
                                  <ScanSearch className="h-3.5 w-3.5" />
                                  Continuer l'analyse (
                                  {duplicateConfirm.cleanFiles.length} fichier
                                  {duplicateConfirm.cleanFiles.length > 1
                                    ? "s"
                                    : ""}
                                  )
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    duplicateConfirm.resolve(false)
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors"
                                >
                                  Annuler
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Section 02 + 03 + 04 — disabled pendant l'analyse OCR */}
                      <div
                        className={`space-y-6 transition-opacity duration-300 ${isAnalyzing || isCheckingDuplicates ? "opacity-50 pointer-events-none" : ""}`}
                      >
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
                                    className="rounded-md pr-24 h-9"
                                  />
                                  {watchedBulletinNumber &&
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
                                {(() => {
                                  const { onChange: rhfOnChange, ...restRegister } = register("bulletin_date");
                                  return (
                                    <Input
                                      type="date"
                                      {...restRegister}
                                      min="2000-01-01"
                                      max={new Date().toISOString().split("T")[0]}
                                      className={`rounded-md h-9 ${
                                        (selectedAdherentInfo?.contractStartDate &&
                                          watchedBulletinDate &&
                                          watchedBulletinDate <
                                            selectedAdherentInfo.contractStartDate) ||
                                        (selectedAdherentInfo?.contractEndDate &&
                                          watchedBulletinDate &&
                                          watchedBulletinDate >
                                            selectedAdherentInfo.contractEndDate)
                                          ? "border-red-500 focus:ring-red-500"
                                          : ""
                                      }`}
                                      onChange={(e) => {
                                        rhfOnChange(e);
                                      }}
                                      onBlur={(e) => {
                                        const v = clampDateValue(e.target.value, "2000-01-01", new Date().toISOString().split("T")[0]);
                                        if (v !== e.target.value) setValue("bulletin_date", v);
                                      }}
                                    />
                                  );
                                })()}
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
                              <div
                                className="space-y-2 relative"
                                ref={adherentPortalRef}
                              >
                                <Label className="text-sm text-gray-700">
                                  Matricule *
                                  <InfoTooltip text="Tapez le nom, prénom ou numéro de matricule de l'adhérent. La liste des résultats s'affichera automatiquement. La couverture sera vérifiée en temps réel." />
                                </Label>
                                <div className="relative">
                                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                  <Input
                                    value={adherentSearch}
                                    placeholder="Rechercher par nom ou matricule..."
                                    className="pl-9 rounded-md h-9"
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
                                  !selectedAdherentInfo &&
                                  adherentPortalPos &&
                                  createPortal(
                                    <div
                                      className="fixed z-[9999] bg-white border border-red-200 rounded-lg shadow-lg px-3 py-2"
                                      style={{
                                        top: adherentPortalPos.top,
                                        left: adherentPortalPos.left,
                                        width: adherentPortalPos.width,
                                      }}
                                    >
                                      <p className="text-sm text-red-600 flex items-center gap-1.5">
                                        <Ban className="w-3.5 h-3.5" />
                                        Aucun adherent trouve avec cette
                                        matricule
                                      </p>
                                    </div>,
                                    document.body,
                                  )}
                                {adherentDropdownVisible &&
                                  adherentResults &&
                                  adherentResults.length > 0 &&
                                  adherentPortalPos &&
                                  createPortal(
                                    <div
                                      className="fixed z-[9999] bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto"
                                      style={{
                                        top: adherentPortalPos.top,
                                        left: adherentPortalPos.left,
                                        width: adherentPortalPos.width,
                                      }}
                                    >
                                      {adherentResults.map((a) => (
                                        <button
                                          key={a.id}
                                          type="button"
                                          className="w-full px-3 py-2 text-left hover:bg-gray-50 text-sm border-b last:border-0"
                                          onMouseDown={(e) => {
                                            e.preventDefault();
                                            const matriculeVal =
                                              a.matricule || "";
                                            setValue(
                                              "adherent_matricule",
                                              matriculeVal,
                                              {
                                                shouldValidate: true,
                                                shouldDirty: true,
                                              },
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
                                            setValue(
                                              "beneficiary_relationship",
                                              "self",
                                            );
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
                                          {a.contractWarning && (
                                            <span className="block text-xs text-amber-600 mt-0.5">
                                              ⚠ {a.contractWarning}
                                            </span>
                                          )}
                                        </button>
                                      ))}
                                    </div>,
                                    document.body,
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
                                      !watchedBeneficiaryRel ||
                                        watchedBeneficiaryRel === "self"
                                        ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                                        : "border-gray-200 hover:bg-gray-50 text-gray-700",
                                    )}
                                  >
                                    <input
                                      type="radio"
                                      name="beneficiary_selection"
                                      className="h-4 w-4 text-blue-600 border-gray-300"
                                      checked={
                                        !watchedBeneficiaryRel ||
                                        watchedBeneficiaryRel === "self"
                                      }
                                      onChange={() => {
                                        // Preserve current beneficiary data in ayantDroitForm before clearing
                                        const currentName =
                                          watch("beneficiary_name");
                                        const currentDob = watch(
                                          "beneficiary_date_of_birth",
                                        );
                                        const currentEmail =
                                          watch("beneficiary_email");
                                        if (currentName) {
                                          const parts = currentName
                                            .trim()
                                            .split(/\s+/);
                                          setAyantDroitForm((prev) => ({
                                            ...prev,
                                            lastName: parts[0] || prev.lastName,
                                            firstName:
                                              parts.length >= 2
                                                ? parts.slice(1).join(" ")
                                                : prev.firstName,
                                            dateOfBirth:
                                              currentDob || prev.dateOfBirth,
                                            email: currentEmail || prev.email,
                                          }));
                                        }
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
                                      watchedBeneficiaryRel === "spouse"
                                        ? "border-purple-500 bg-purple-50 text-purple-700 font-medium"
                                        : "border-gray-200 hover:bg-gray-50 text-gray-700",
                                    )}
                                  >
                                    <input
                                      type="radio"
                                      name="beneficiary_selection"
                                      className="h-4 w-4 text-purple-600 border-gray-300"
                                      checked={
                                        watchedBeneficiaryRel === "spouse"
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
                                        } else if (
                                          ayantDroitForm.firstName ||
                                          ayantDroitForm.lastName
                                        ) {
                                          // Restore from saved ayantDroitForm (e.g. OCR data preserved across radio switches)
                                          setValue(
                                            "beneficiary_name",
                                            `${ayantDroitForm.lastName} ${ayantDroitForm.firstName}`.trim(),
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
                                      watchedBeneficiaryRel === "child"
                                        ? "border-emerald-500 bg-emerald-50 text-emerald-700 font-medium"
                                        : "border-gray-200 hover:bg-gray-50 text-gray-700",
                                    )}
                                  >
                                    <input
                                      type="radio"
                                      name="beneficiary_selection"
                                      className="h-4 w-4 text-emerald-600 border-gray-300"
                                      checked={
                                        watchedBeneficiaryRel === "child"
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
                                        } else if (
                                          ayantDroitForm.firstName ||
                                          ayantDroitForm.lastName
                                        ) {
                                          // Restore from saved ayantDroitForm (e.g. OCR data preserved across radio switches)
                                          setValue(
                                            "beneficiary_name",
                                            `${ayantDroitForm.lastName} ${ayantDroitForm.firstName}`.trim(),
                                          );
                                        }
                                      }}
                                    />
                                    <span className="text-sm">Enfant</span>
                                  </label>
                                </div>

                                {/* === ADHÉRENT sélectionné === */}
                                {(!watchedBeneficiaryRel ||
                                  watchedBeneficiaryRel === "self") &&
                                  (selectedAdherentInfo ? (
                                    <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-4 space-y-3">
                                      <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                                          {(
                                            selectedAdherentInfo
                                              .firstName?.[0] || ""
                                          ).toUpperCase()}
                                          {(
                                            selectedAdherentInfo
                                              .lastName?.[0] || ""
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
                                      {selectedAdherentInfo.contractWarning && (
                                        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                                          <span>
                                            {
                                              selectedAdherentInfo.contractWarning
                                            }
                                          </span>
                                        </div>
                                      )}
                                      <div className="grid grid-cols-1 gap-2 text-xs">
                                        {selectedAdherentInfo.email && (
                                          <div>
                                            <p className="text-gray-500">
                                              Email
                                            </p>
                                            <p className="text-gray-700">
                                              {selectedAdherentInfo.email}
                                            </p>
                                          </div>
                                        )}
                                        {selectedAdherentInfo.plafondGlobal !=
                                          null && (
                                          <div className="flex flex-col">
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
                                  ) : watchedMatricule ? (
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
                                            className="rounded-md text-sm h-9"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs text-gray-500">
                                            Prénom
                                          </Label>
                                          <Input
                                            {...register("adherent_first_name")}
                                            placeholder="Prénom"
                                            className="rounded-md text-sm h-9"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs text-gray-500">
                                            Date de naissance
                                          </Label>
                                          <Input
                                            type="date"
                                            {...register(
                                              "adherent_date_of_birth",
                                              { onBlur: (e: React.FocusEvent<HTMLInputElement>) => { const v = clampDateValue(e.target.value, "1900-01-01"); if (v !== e.target.value) setValue("adherent_date_of_birth", v); } },
                                            )}
                                            min="1900-01-01"
                                            max={
                                              new Date()
                                                .toISOString()
                                                .split("T")[0]
                                            }
                                            className="rounded-md text-sm h-9"
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs text-gray-500">
                                            N° Contrat *
                                          </Label>
                                          {companyContracts &&
                                          companyContracts.length > 0 ? (
                                            <select
                                              {...register(
                                                "adherent_contract_number",
                                              )}
                                              className="w-full rounded-md border border-gray-200 bg-white px-3 h-9 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            >
                                              <option value="">
                                                Sélectionner un contrat
                                              </option>
                                              {companyContracts.map((c) => (
                                                <option
                                                  key={c.id}
                                                  value={c.contractNumber}
                                                >
                                                  {c.contractNumber}
                                                </option>
                                              ))}
                                            </select>
                                          ) : (
                                            <Input
                                              {...register(
                                                "adherent_contract_number",
                                              )}
                                              placeholder="N° Contrat"
                                              className="rounded-md text-sm h-9"
                                            />
                                          )}
                                        </div>
                                        <div className="space-y-1 sm:col-span-2">
                                          <Label className="text-xs text-gray-500">
                                            Email
                                          </Label>
                                          <Input
                                            type="email"
                                            {...register("adherent_email")}
                                            placeholder="email@exemple.com"
                                            className="rounded-md text-sm h-9"
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
                                {watchedBeneficiaryRel === "spouse" &&
                                  (selectedAdherentInfo &&
                                  familleData?.conjoint ? (
                                    <div className="rounded-xl border border-purple-200 bg-purple-50/30 p-4 space-y-3">
                                      <div className="flex items-center gap-3">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-600 text-sm font-bold text-white">
                                          {(
                                            familleData.conjoint
                                              .firstName?.[0] || ""
                                          ).toUpperCase()}
                                          {(
                                            familleData.conjoint
                                              .lastName?.[0] || ""
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
                                                familleData.conjoint
                                                  .dateOfBirth,
                                              ).toLocaleDateString("fr-TN")}
                                            </p>
                                          </div>
                                        )}
                                        {familleData.conjoint.email && (
                                          <div>
                                            <p className="text-gray-500">
                                              Email
                                            </p>
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
                                          Conjoint(e) non enregistré(e) —
                                          ajouter aux ayants droit
                                        </p>
                                      </div>
                                      <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1">
                                          <Label className="text-xs text-gray-500">
                                            Prénom
                                          </Label>
                                          <Input
                                            placeholder="Prénom"
                                            className="rounded-md text-sm h-9"
                                            value={ayantDroitForm.firstName}
                                            onChange={(e) =>
                                              setAyantDroitForm((p) => ({
                                                ...p,
                                                firstName: e.target.value,
                                              }))
                                            }
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs text-gray-500">
                                            Nom
                                          </Label>
                                          <Input
                                            placeholder="Nom"
                                            className="rounded-md text-sm h-9"
                                            value={ayantDroitForm.lastName}
                                            onChange={(e) =>
                                              setAyantDroitForm((p) => ({
                                                ...p,
                                                lastName: e.target.value,
                                              }))
                                            }
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs text-gray-500">
                                            Date de naissance
                                          </Label>
                                          <Input
                                            type="date"
                                            className="rounded-md text-sm h-9"
                                            min="1900-01-01"
                                            max={
                                              new Date()
                                                .toISOString()
                                                .split("T")[0]
                                            }
                                            value={ayantDroitForm.dateOfBirth}
                                            onChange={(e) => setAyantDroitForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
                                            onBlur={(e) => {
                                              const v = clampDateValue(e.target.value, "1900-01-01");
                                              if (v !== e.target.value) setAyantDroitForm((p) => ({ ...p, dateOfBirth: v }));
                                            }}
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs text-gray-500">
                                            Email
                                          </Label>
                                          <Input
                                            type="email"
                                            placeholder="email@exemple.com"
                                            className="rounded-md text-sm h-9"
                                            value={ayantDroitForm.email}
                                            onChange={(e) =>
                                              setAyantDroitForm((p) => ({
                                                ...p,
                                                email: e.target.value,
                                              }))
                                            }
                                          />
                                        </div>
                                      </div>
                                      <div className="flex items-center justify-end pt-1">
                                        <Button
                                          type="button"
                                          size="sm"
                                          onClick={() =>
                                            handleAddAyantDroit("C")
                                          }
                                          disabled={isAddingAyantDroit}
                                          className="gap-1.5 bg-purple-600 hover:bg-purple-700"
                                        >
                                          {isAddingAyantDroit ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          ) : (
                                            <UserPlus className="h-3.5 w-3.5" />
                                          )}
                                          {isAddingAyantDroit
                                            ? "Ajout..."
                                            : "Ajouter comme conjoint(e)"}
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    /* Adherent NOT registered — simple manual input */
                                    <div className="rounded-xl border border-purple-200 bg-purple-50/30 p-4 space-y-3">
                                      <p className="text-sm font-medium text-purple-800">
                                        Saisir les informations du/de la
                                        conjoint(e)
                                      </p>
                                      <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1">
                                          <Label className="text-xs text-gray-500">
                                            Nom et prénom
                                          </Label>
                                          <Input
                                            placeholder="Nom et prénom"
                                            className="rounded-md text-sm h-9"
                                            value={watchedBenefName || ""}
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
                                            className="rounded-md text-sm h-9"
                                            min="1900-01-01"
                                            {...register(
                                              "beneficiary_date_of_birth",
                                              { onBlur: (e: React.FocusEvent<HTMLInputElement>) => { const v = clampDateValue(e.target.value, "1900-01-01"); if (v !== e.target.value) setValue("beneficiary_date_of_birth", v); } },
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
                                            className="rounded-md text-sm h-9"
                                            {...register("beneficiary_email")}
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ))}

                                {/* === ENFANT === */}
                                {watchedBeneficiaryRel === "child" &&
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
                                              watchedBenefId === enfant.id
                                                ? "border-emerald-500 bg-emerald-50/50"
                                                : "border-gray-200 hover:bg-gray-50",
                                            )}
                                          >
                                            <input
                                              type="radio"
                                              name="child_selection"
                                              className="h-4 w-4 text-emerald-600 border-gray-300"
                                              checked={
                                                watchedBenefId === enfant.id
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
                                                {enfant.firstName}{" "}
                                                {enfant.lastName}
                                              </p>
                                              <div className="flex items-center gap-3 text-[11px] text-gray-500 mt-0.5">
                                                {enfant.dateOfBirth && (
                                                  <span>
                                                    {new Date(
                                                      enfant.dateOfBirth,
                                                    ).toLocaleDateString(
                                                      "fr-TN",
                                                    )}
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
                                          Enfant non enregistré(e) — ajouter aux
                                          ayants droit
                                        </p>
                                      </div>
                                      <div className="grid gap-3 sm:grid-cols-2">
                                        <div className="space-y-1">
                                          <Label className="text-xs text-gray-500">
                                            Prénom
                                          </Label>
                                          <Input
                                            placeholder="Prénom"
                                            className="rounded-md text-sm h-9"
                                            value={ayantDroitForm.firstName}
                                            onChange={(e) =>
                                              setAyantDroitForm((p) => ({
                                                ...p,
                                                firstName: e.target.value,
                                              }))
                                            }
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs text-gray-500">
                                            Nom
                                          </Label>
                                          <Input
                                            placeholder="Nom"
                                            className="rounded-md text-sm h-9"
                                            value={ayantDroitForm.lastName}
                                            onChange={(e) =>
                                              setAyantDroitForm((p) => ({
                                                ...p,
                                                lastName: e.target.value,
                                              }))
                                            }
                                          />
                                        </div>
                                        <div className="space-y-1">
                                          <Label className="text-xs text-gray-500">
                                            Date de naissance
                                          </Label>
                                          <Input
                                            type="date"
                                            className="rounded-md text-sm h-9"
                                            min="1900-01-01"
                                            max={
                                              new Date()
                                                .toISOString()
                                                .split("T")[0]
                                            }
                                            value={ayantDroitForm.dateOfBirth}
                                            onChange={(e) => setAyantDroitForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
                                            onBlur={(e) => {
                                              const v = clampDateValue(e.target.value, "1900-01-01");
                                              if (v !== e.target.value) setAyantDroitForm((p) => ({ ...p, dateOfBirth: v }));
                                            }}
                                          />
                                        </div>
                                        {/* Pas de champ email pour les enfants */}
                                      </div>
                                      <div className="flex items-center justify-end pt-1">
                                        <Button
                                          type="button"
                                          size="sm"
                                          onClick={() =>
                                            handleAddAyantDroit("E")
                                          }
                                          disabled={isAddingAyantDroit}
                                          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                                        >
                                          {isAddingAyantDroit ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                          ) : (
                                            <UserPlus className="h-3.5 w-3.5" />
                                          )}
                                          {isAddingAyantDroit
                                            ? "Ajout..."
                                            : "Ajouter comme enfant"}
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
                                            className="rounded-md text-sm h-9"
                                            value={watchedBenefName || ""}
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
                                            className="rounded-md text-sm h-9"
                                            min="1900-01-01"
                                            {...register(
                                              "beneficiary_date_of_birth",
                                              { onBlur: (e: React.FocusEvent<HTMLInputElement>) => { const v = clampDateValue(e.target.value, "1900-01-01"); if (v !== e.target.value) setValue("beneficiary_date_of_birth", v); } },
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
                              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
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
                                  provider_id:
                                    lastActe?.provider_id || undefined,
                                  care_type:
                                    lastActe?.care_type || "consultation",
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
                              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1 bg-[#e9effd] p-3"
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
                              const currentActe = watchedActes?.[index];
                              const acteCareType = resolveCareType(
                                currentActe?.care_type,
                              );
                              return (
                                <div key={field.id} className="py-4 space-y-3">
                                  {/* Famille d'actes per acte */}
                                  <div className="flex items-end gap-2 w-full">
                                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                                      <span className="text-xs font-semibold text-gray-400 uppercase">
                                        Famille d'Actes
                                      </span>
                                      <Select
                                        value={
                                          acteFamilleCodes[index] || undefined
                                        }
                                        disabled={
                                          isSubmitting || isRegisteringAdherent
                                        }
                                        onValueChange={(val) => {
                                          // Handle care_types without famille (CT:xxx prefix)
                                          const isCareTypeOnly =
                                            val.startsWith("CT:");
                                          const familleCode = isCareTypeOnly
                                            ? ""
                                            : val;
                                          const newCareType = isCareTypeOnly
                                            ? val.slice(3)
                                            : FAMILLE_CODE_TO_CARE_TYPE[
                                                familleCode
                                              ] || "consultation";

                                          setActeFamilleCodes((prev) => ({
                                            ...prev,
                                            [index]: val,
                                          }));
                                          setValue(
                                            `actes.${index}.care_type`,
                                            newCareType,
                                          );
                                          // Reset sub_items + amount when switching
                                          setValue(
                                            `actes.${index}.sub_items`,
                                            [],
                                          );
                                          setValue(`actes.${index}.amount`, 0);

                                          if (isCareTypeOnly) {
                                            // Care type sans famille: saisie directe (mode simple)
                                            const config =
                                              getCareTypeConfig(newCareType);
                                            setValue(
                                              `actes.${index}.code`,
                                              newCareType.toUpperCase(),
                                            );
                                            setValue(
                                              `actes.${index}.label`,
                                              config.label,
                                            );
                                          } else if (
                                            getCareTypeConfig(newCareType)
                                              .useMedicationAutocomplete
                                          ) {
                                            setValue(
                                              `actes.${index}.code`,
                                              "PH1",
                                            );
                                            setValue(
                                              `actes.${index}.label`,
                                              getCareTypeConfig(newCareType)
                                                .label || "Pharmacie",
                                            );
                                            setValue(
                                              `actes.${index}.sub_items`,
                                              [
                                                {
                                                  label: "",
                                                  cotation: "",
                                                  amount: 0,
                                                  code: "",
                                                },
                                              ],
                                            );
                                          } else {
                                            setValue(`actes.${index}.code`, "");
                                            setValue(
                                              `actes.${index}.label`,
                                              "",
                                            );
                                          }
                                        }}
                                      >
                                        <SelectTrigger className="w-full h-9 rounded-md text-xs">
                                          <SelectValue placeholder="Famille d'actes" />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-72">
                                          {(actesGroupes || [])
                                            .filter((g) => g.actes.length > 0)
                                            .map((groupe) => {
                                              const FIcon =
                                                FAMILLE_ICON[
                                                  groupe.famille.code
                                                ] || ClipboardList;
                                              return (
                                                <SelectItem
                                                  key={groupe.famille.code}
                                                  value={groupe.famille.code}
                                                >
                                                  <span className="flex items-center gap-1.5">
                                                    <FIcon className="h-3.5 w-3.5 shrink-0" />
                                                    {groupe.famille.label}
                                                    {/* <span className="font-mono text-[10px] text-gray-400">
                                                  ({groupe.famille.code})
                                                </span> */}
                                                  </span>
                                                </SelectItem>
                                              );
                                            })}
                                          {/* Care types sans famille d'actes (saisie directe) */}
                                          {ALL_CARE_TYPES?.filter(
                                            (ct) =>
                                              CARE_TYPE_CONFIG[ct]?.familleCodes
                                                .length === 0,
                                          ).map((ct) => (
                                            <SelectItem
                                              key={`ct-${ct}`}
                                              value={`CT:${ct}`}
                                            >
                                              <span className="flex items-center gap-1.5">
                                                <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                                                {CARE_TYPE_CONFIG[ct]?.label}
                                              </span>
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
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
                                          {
                                            getCareTypeConfig(acteCareType)
                                              .providerLabel
                                          }{" "}
                                          *
                                        </Label>
                                        <Input
                                          {...register(
                                            `actes.${index}.nom_prof_sant`,
                                          )}
                                          placeholder={
                                            getCareTypeConfig(acteCareType)
                                              .providerPlaceholder
                                          }
                                          className="rounded-md text-sm h-9"
                                        />
                                        {errors.actes?.[index]
                                          ?.nom_prof_sant && (
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
                                                  Informations extraites du
                                                  tampon
                                                </p>
                                                <div className="grid grid-cols-1 gap-0.5 text-[11px] text-amber-700">
                                                  {ocrPraticienInfos[index]
                                                    ?.nom && (
                                                    <p>
                                                      <span className="text-amber-500">
                                                        Nom :
                                                      </span>{" "}
                                                      {
                                                        ocrPraticienInfos[
                                                          index
                                                        ]!.nom
                                                      }
                                                    </p>
                                                  )}
                                                  {ocrPraticienInfos[index]
                                                    ?.mf && (
                                                    <p>
                                                      <span className="text-amber-500">
                                                        MF :
                                                      </span>{" "}
                                                      <span className="font-mono">
                                                        {
                                                          ocrPraticienInfos[
                                                            index
                                                          ]!.mf
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
                                                        ocrPraticienInfos[
                                                          index
                                                        ]!.specialite
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
                                                        ocrPraticienInfos[
                                                          index
                                                        ]!.adresse
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
                                                        ocrPraticienInfos[
                                                          index
                                                        ]!.telephone
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
                                                  autoRegisterPraticien[
                                                    index
                                                  ] ?? true
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
                                                    {currentActe?.ref_prof_sant}
                                                  </span>{" "}
                                                  n'existe pas dans la base.
                                                  {currentActe?.nom_prof_sant?.trim()
                                                    ? ` Il sera créé sous le nom "${currentActe.nom_prof_sant.trim()}".`
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
                                          key={`mf-${index}-${editingBulletinId || ""}`}
                                          value={
                                            currentActe?.ref_prof_sant || ""
                                          }
                                          initialFound={
                                            !!editingBulletinId &&
                                            !!currentActe?.ref_prof_sant?.trim()
                                          }
                                          onChange={(val) =>
                                            setValue(
                                              `actes.${index}.ref_prof_sant`,
                                              val,
                                            )
                                          }
                                          onProviderFound={(provider) => {
                                            // Autocomplete: fill name and provider_id from existing provider
                                            console.log("provider", provider);
                                            setValue(
                                              `actes.${index}.nom_prof_sant`,
                                              provider.name,
                                            );
                                            setValue(
                                              `actes.${index}.provider_id`,
                                              provider.id,
                                            );
                                            // Provider found — no need to auto-register
                                            setAutoRegisterPraticien(
                                              (prev) => ({
                                                ...prev,
                                                [index]: false,
                                              }),
                                            );
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
                                              setAutoRegisterPraticien(
                                                (prev) => ({
                                                  ...prev,
                                                  [index]: true,
                                                }),
                                              );
                                            } else if (
                                              status === "found" ||
                                              status === "registered"
                                            ) {
                                              setAutoRegisterPraticien(
                                                (prev) => ({
                                                  ...prev,
                                                  [index]: false,
                                                }),
                                              );
                                            }
                                            setMfStatuses((prev) => ({
                                              ...prev,
                                              [index]: status,
                                            }));
                                          }}
                                          providerType={getMfProviderType(
                                            acteCareType,
                                          )}
                                          error={
                                            errors.actes?.[index]?.ref_prof_sant
                                              ?.message
                                          }
                                        />
                                      </div>
                                    </div>

                                    {/* Acte description / selector */}
                                    <div className="sm:col-span-6 space-y-2">
                                      {/* For non-pharmacy: show ActeSelector; pharmacy uses sub-items only */}
                                      {/* Hide ActeSelector for care types without familleCodes (direct entry) */}
                                      {!getCareTypeConfig(acteCareType)
                                        .useMedicationAutocomplete &&
                                        getCareTypeConfig(acteCareType)
                                          .familleCodes.length > 0 && (
                                          <div>
                                            <Label className="text-sm text-gray-700">
                                              Acte médical *
                                            </Label>
                                            <ActeSelector
                                              value={currentActe?.code || ""}
                                              familleCode={
                                                acteFamilleCodes[index]
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
                                                // Sync care_type from selected acte code
                                                const fc =
                                                  acteFamilleCodes[index];
                                                if (fc) {
                                                  let ct =
                                                    FAMILLE_CODE_TO_CARE_TYPE[
                                                      fc
                                                    ] || "consultation";
                                                  // Hospitalisation: distinguish clinique vs hôpital by acte code
                                                  if (fc === "FA0007") {
                                                    const upper =
                                                      code.toUpperCase();
                                                    if (
                                                      upper === "HP" ||
                                                      upper === "SANA"
                                                    ) {
                                                      ct =
                                                        "hospitalisation_hopital";
                                                    } else {
                                                      ct = "hospitalisation";
                                                    }
                                                  }
                                                  setValue(
                                                    `actes.${index}.care_type`,
                                                    ct,
                                                  );
                                                }
                                              }}
                                            />
                                            {errors.actes?.[index]?.label && (
                                              <p className="text-xs text-destructive mt-1">
                                                {
                                                  errors.actes[index].label
                                                    ?.message
                                                }
                                              </p>
                                            )}
                                          </div>
                                        )}
                                      {/* Description de soin — Textarea */}
                                      <div>
                                        <Label className="text-sm text-gray-700">
                                          {getCareTypeConfig(acteCareType)
                                            .useMedicationAutocomplete
                                            ? "Observation"
                                            : "Description de soin"}
                                        </Label>
                                        <Textarea
                                          {...register(
                                            getCareTypeConfig(acteCareType)
                                              .useMedicationAutocomplete
                                              ? `actes.${index}.lib_msgr`
                                              : `actes.${index}.care_description`,
                                          )}
                                          placeholder={
                                            getCareTypeConfig(acteCareType)
                                              .descriptionPlaceholder
                                          }
                                          rows={2}
                                          className="rounded-md text-sm resize-none"
                                        />
                                      </div>
                                    </div>

                                    {/* Amount + Nombre de jours */}
                                    <div className="sm:col-span-3 space-y-2">
                                      {/* Montant principal — toujours visible */}
                                      <div>
                                        <Label className="text-sm text-gray-700">
                                          Montant (TND)
                                        </Label>
                                        <Input
                                          type="number"
                                          step="0.001"
                                          {...register(
                                            `actes.${index}.amount`,
                                            {
                                              valueAsNumber: true,
                                            },
                                          )}
                                          placeholder="0.000"
                                          readOnly={
                                            getCareTypeConfig(acteCareType)
                                              .mode === "sejour" &&
                                            !!(
                                              currentActe?.montant_jour &&
                                              currentActe?.nombre_jours
                                            )
                                          }
                                          className={cn(
                                            "rounded-md text-right h-9",
                                            getCareTypeConfig(acteCareType)
                                              .mode === "sejour" &&
                                              currentActe?.montant_jour &&
                                              currentActe?.nombre_jours &&
                                              "bg-gray-50 font-semibold",
                                          )}
                                        />
                                        {errors.actes?.[index]?.amount && (
                                          <p className="text-xs text-destructive mt-1">
                                            {
                                              errors.actes[index].amount
                                                ?.message
                                            }
                                          </p>
                                        )}
                                      </div>
                                      {/* Séjour mode: montant par jour + nombre de jours en dessous */}
                                      {getCareTypeConfig(acteCareType).mode ===
                                        "sejour" && (
                                        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-dashed border-gray-200">
                                          <div>
                                            <Label className="text-xs text-gray-500">
                                              Montant / jour
                                            </Label>
                                            <Input
                                              type="number"
                                              step="0.001"
                                              {...register(
                                                `actes.${index}.montant_jour`,
                                                {
                                                  valueAsNumber: true,
                                                  onChange: (
                                                    e: React.ChangeEvent<HTMLInputElement>,
                                                  ) => {
                                                    const mj =
                                                      parseFloat(
                                                        e.target.value,
                                                      ) || 0;
                                                    const nj =
                                                      currentActe?.nombre_jours ||
                                                      0;
                                                    if (mj > 0 && nj > 0) {
                                                      setValue(
                                                        `actes.${index}.amount`,
                                                        Math.round(
                                                          mj * nj * 1000,
                                                        ) / 1000,
                                                      );
                                                    }
                                                  },
                                                },
                                              )}
                                              placeholder="0.000"
                                              className="rounded-md text-right text-sm h-9"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs text-gray-500">
                                              Nb jours
                                            </Label>
                                            <Input
                                              type="number"
                                              min="1"
                                              step="1"
                                              {...register(
                                                `actes.${index}.nombre_jours`,
                                                {
                                                  valueAsNumber: true,
                                                  onChange: (
                                                    e: React.ChangeEvent<HTMLInputElement>,
                                                  ) => {
                                                    const nj =
                                                      parseInt(
                                                        e.target.value,
                                                      ) || 0;
                                                    const mj =
                                                      currentActe?.montant_jour ||
                                                      0;
                                                    if (mj > 0 && nj > 0) {
                                                      setValue(
                                                        `actes.${index}.amount`,
                                                        Math.round(
                                                          mj * nj * 1000,
                                                        ) / 1000,
                                                      );
                                                    }
                                                  },
                                                },
                                              )}
                                              placeholder="—"
                                              className="rounded-md text-right text-sm h-9"
                                            />
                                          </div>
                                        </div>
                                      )}
                                      {/* Warning: dépassement limites barème */}
                                      {(() => {
                                        const amt = currentActe?.amount;
                                        if (!amt || !plafondsData?.parFamille)
                                          return null;
                                        const careToFamille: Record<
                                          string,
                                          string
                                        > = {
                                          consultation: "FA0001",
                                          consultation_visite: "FA0001",
                                          pharmacie: "FA0003",
                                          laboratoire: "FA0004",
                                          hospitalisation: "FA0007",
                                          hospitalisation_hopital: "FA0007",
                                          optique: "FA0006",
                                          dentaire: "FA0011",
                                          dentaire_prothese: "FA0011",
                                          actes_courants: "FA0009",
                                          actes_specialistes: "FA0017",
                                          chirurgie: "FA0010",
                                          chirurgie_fso: "FA0010",
                                          chirurgie_usage_unique: "FA0010",
                                          accouchement: "FA0012",
                                          accouchement_gemellaire: "FA0012",
                                          interruption_grossesse: "FA0012",
                                          orthopedie: "FA0005",
                                          cures_thermales: "FA0013",
                                          orthodontie: "FA0011",
                                          circoncision: "FA0015",
                                          transport: "FA0016",
                                          frais_funeraires: "FA0014",
                                          chirurgie_refractive: "FA0009",
                                          sanatorium: "FA0007",
                                        };
                                        const familleCode =
                                          careToFamille[acteCareType];
                                        const plafond = familleCode
                                          ? plafondsData.parFamille.find(
                                              (p) =>
                                                p.familleCode === familleCode,
                                            )
                                          : null;
                                        const warnings: string[] = [];
                                        if (
                                          plafond?.perEventLimit &&
                                          amt * 1000 > plafond.perEventLimit
                                        ) {
                                          warnings.push(
                                            `Depasse le plafond par acte: ${(plafond.perEventLimit / 1000).toFixed(3)} DT`,
                                          );
                                        }
                                        if (
                                          plafond?.dailyLimit &&
                                          amt * 1000 > plafond.dailyLimit
                                        ) {
                                          warnings.push(
                                            `Depasse le plafond journalier: ${(plafond.dailyLimit / 1000).toFixed(3)} DT`,
                                          );
                                        }
                                        if (
                                          plafond &&
                                          amt * 1000 > plafond.montantRestant
                                        ) {
                                          warnings.push(
                                            `Depasse le plafond annuel restant: ${(plafond.montantRestant / 1000).toFixed(3)} DT`,
                                          );
                                        }
                                        if (warnings.length === 0) return null;
                                        return (
                                          <div className="mt-1 space-y-0.5">
                                            {warnings.map((w, i) => (
                                              <p
                                                key={i}
                                                className="text-xs text-amber-600 flex items-center gap-1"
                                              >
                                                <span>⚠</span> {w}
                                              </p>
                                            ))}
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>

                                  {/* Sub-items: medications (pharmacy) or analyses (lab) */}
                                  {(() => {
                                    const currentSubItems = ((
                                      currentActe as unknown as Record<
                                        string,
                                        unknown
                                      >
                                    )?.sub_items || []) as Array<{
                                      label: string;
                                      cotation?: string;
                                      amount: number;
                                      code?: string;
                                    }>;
                                    const acteCfg =
                                      getCareTypeConfig(acteCareType);
                                    if (
                                      currentSubItems.length === 0 &&
                                      acteCfg.mode !== "compose"
                                    )
                                      return null;

                                    const subLabel =
                                      acteCfg.subItemLabel || "Détails";
                                    const SubIcon =
                                      careTypeDisplay(acteCareType).icon;
                                    const subIcon = (
                                      <SubIcon className="h-3.5 w-3.5" />
                                    );

                                    return (
                                      <div className="mt-3 rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                                        <div className="flex items-center justify-between mb-2">
                                          <p className="text-xs font-semibold text-gray-500 flex items-center gap-1.5 uppercase">
                                            {subIcon}
                                            {subLabel} ({currentSubItems.length}
                                            )
                                          </p>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const updated = [
                                                ...currentSubItems,
                                                {
                                                  label: "",
                                                  cotation: "",
                                                  amount: 0,
                                                  code: "",
                                                },
                                              ];
                                              setValue(
                                                `actes.${index}.sub_items`,
                                                updated,
                                              );
                                              // Auto-set parent acte label if empty
                                              const currentLabel = getValues(
                                                `actes.${index}.label`,
                                              );
                                              if (!currentLabel) {
                                                const cfg =
                                                  getCareTypeConfig(
                                                    acteCareType,
                                                  );
                                                setValue(
                                                  `actes.${index}.label`,
                                                  cfg.label || acteCareType,
                                                );
                                              }
                                            }}
                                            className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-0.5"
                                          >
                                            <Plus className="h-3.5 w-3.5" />
                                            Ajouter
                                          </button>
                                        </div>
                                        <div className="space-y-2">
                                          {currentSubItems.map(
                                            (subItem, subIdx) => (
                                              <div
                                                key={subIdx}
                                                className="flex items-center gap-2"
                                              >
                                                <div className="flex-1">
                                                  {getCareTypeConfig(
                                                    acteCareType,
                                                  )
                                                    .useMedicationAutocomplete ? (
                                                    <MedicationAutocomplete
                                                      value={subItem.label}
                                                      placeholder="Rechercher un médicament..."
                                                      className="[&_input]:h-9 [&_input]:text-sm [&_input]:rounded-md"
                                                      onFreeText={(text) => {
                                                        const updated = [
                                                          ...currentSubItems,
                                                        ];
                                                        updated[subIdx] = {
                                                          ...updated[subIdx]!,
                                                          label: text,
                                                        };
                                                        setValue(
                                                          `actes.${index}.sub_items`,
                                                          updated,
                                                        );
                                                      }}
                                                      onSelect={(med) => {
                                                        const priceDT =
                                                          med.price_public
                                                            ? med.price_public /
                                                              1000
                                                            : 0;
                                                        const label = [
                                                          med.brand_name,
                                                          med.dci
                                                            ? `- ${med.dci}`
                                                            : "",
                                                          med.dosage || "",
                                                        ]
                                                          .filter(Boolean)
                                                          .join(" ")
                                                          .trim();
                                                        const updated = [
                                                          ...currentSubItems,
                                                        ];
                                                        updated[subIdx] = {
                                                          ...updated[subIdx]!,
                                                          label,
                                                          code:
                                                            med.code_pct ||
                                                            med.code_amm ||
                                                            "",
                                                          amount: priceDT,
                                                        };
                                                        setValue(
                                                          `actes.${index}.sub_items`,
                                                          updated,
                                                        );
                                                        const newTotal =
                                                          updated.reduce(
                                                            (s, si) =>
                                                              s +
                                                              (Number(
                                                                si.amount,
                                                              ) || 0),
                                                            0,
                                                          );
                                                        setValue(
                                                          `actes.${index}.amount`,
                                                          Math.round(
                                                            newTotal * 1000,
                                                          ) / 1000,
                                                        );
                                                        // Auto-set parent acte label if empty
                                                        const currentLabel =
                                                          getValues(
                                                            `actes.${index}.label`,
                                                          );
                                                        if (!currentLabel) {
                                                          const cfg =
                                                            getCareTypeConfig(
                                                              acteCareType,
                                                            );
                                                          setValue(
                                                            `actes.${index}.label`,
                                                            cfg.label ||
                                                              acteCareType,
                                                          );
                                                        }
                                                      }}
                                                    />
                                                  ) : (
                                                    <Input
                                                      value={subItem.label}
                                                      onChange={(e) => {
                                                        const updated = [
                                                          ...currentSubItems,
                                                        ];
                                                        updated[subIdx] = {
                                                          ...updated[subIdx]!,
                                                          label: e.target.value,
                                                        };
                                                        setValue(
                                                          `actes.${index}.sub_items`,
                                                          updated,
                                                        );
                                                      }}
                                                      placeholder="Nom de l'analyse"
                                                      className="rounded-md text-sm h-9"
                                                    />
                                                  )}
                                                </div>
                                                {/* Cotation — uniquement pour types avec showCotation */}
                                                {getCareTypeConfig(acteCareType)
                                                  .showCotation && (
                                                  <div className="w-24">
                                                    <Input
                                                      value={
                                                        subItem.cotation || ""
                                                      }
                                                      onChange={(e) => {
                                                        const updated = [
                                                          ...currentSubItems,
                                                        ];
                                                        updated[subIdx] = {
                                                          ...updated[subIdx]!,
                                                          cotation:
                                                            e.target.value,
                                                        };
                                                        setValue(
                                                          `actes.${index}.sub_items`,
                                                          updated,
                                                        );
                                                      }}
                                                      placeholder="Coefficient *"
                                                      className={`rounded-md text-sm h-9 ${!subItem.cotation?.trim() ? "border-amber-400" : ""}`}
                                                    />
                                                  </div>
                                                )}
                                                <div className="w-28">
                                                  <Input
                                                    type="number"
                                                    step="0.001"
                                                    value={subItem.amount || ""}
                                                    onChange={(e) => {
                                                      const updated = [
                                                        ...currentSubItems,
                                                      ];
                                                      updated[subIdx] = {
                                                        ...updated[subIdx]!,
                                                        amount:
                                                          parseFloat(
                                                            e.target.value,
                                                          ) || 0,
                                                      };
                                                      setValue(
                                                        `actes.${index}.sub_items`,
                                                        updated,
                                                      );
                                                      // Recalculate total amount from sub_items
                                                      const newTotal =
                                                        updated.reduce(
                                                          (s, si) =>
                                                            s +
                                                            (Number(
                                                              si.amount,
                                                            ) || 0),
                                                          0,
                                                        );
                                                      setValue(
                                                        `actes.${index}.amount`,
                                                        Math.round(
                                                          newTotal * 1000,
                                                        ) / 1000,
                                                      );
                                                    }}
                                                    placeholder="0.000"
                                                    className="rounded-md text-sm text-right h-9"
                                                  />
                                                </div>
                                                <span className="text-xs text-gray-400 w-7">
                                                  DT
                                                </span>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const updated =
                                                      currentSubItems.filter(
                                                        (_, si) =>
                                                          si !== subIdx,
                                                      );
                                                    setValue(
                                                      `actes.${index}.sub_items`,
                                                      updated,
                                                    );
                                                    // Recalculate total amount from remaining sub_items
                                                    const newTotal =
                                                      updated.reduce(
                                                        (s, si) =>
                                                          s +
                                                          (Number(si.amount) ||
                                                            0),
                                                        0,
                                                      );
                                                    setValue(
                                                      `actes.${index}.amount`,
                                                      Math.round(
                                                        newTotal * 1000,
                                                      ) / 1000,
                                                    );
                                                  }}
                                                  className="shrink-0 p-1 text-gray-300 hover:text-red-500 transition-colors"
                                                >
                                                  <X className="h-3.5 w-3.5" />
                                                </button>
                                              </div>
                                            ),
                                          )}
                                        </div>
                                        {currentSubItems.length > 0 && (
                                          <div className="flex justify-end mt-2 pt-2 border-t border-gray-200">
                                            <p className="text-xs font-semibold text-gray-600">
                                              Sous-total :{" "}
                                              {currentSubItems
                                                .reduce(
                                                  (s, si) =>
                                                    s +
                                                    (Number(si.amount) || 0),
                                                  0,
                                                )
                                                .toFixed(3)}{" "}
                                              DT
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
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
                              done:
                                selectedFiles.length > 0 ||
                                restoredFilesMeta.length > 0,
                            },
                            {
                              label: "Données générales",
                              done: !!(
                                watchedBulletinNumber && watchedBulletinDate
                              ),
                            },
                            {
                              label: "Adhérent identifié",
                              done:
                                !!selectedAdherentInfo ||
                                !!(watchedMatricule && watchedAdherentLastName),
                            },
                            {
                              label: "Bénéficiaire sélectionné",
                              done:
                                !!selectedAdherentInfo &&
                                (watchedBeneficiaryRel === "self" ||
                                  !!watchedBenefName),
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
                          <div className="space-y-2">
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
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-2 text-xs font-medium text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-colors"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Ajouter un fichier
                            </button>
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

                      {/* Contract warning banner — date hors contrat adhérent OR estimate no_active_contract */}
                      {((selectedAdherentInfo?.contractStartDate &&
                        watchedBulletinDate &&
                        watchedBulletinDate <
                          selectedAdherentInfo.contractStartDate) ||
                        (selectedAdherentInfo?.contractEndDate &&
                          watchedBulletinDate &&
                          watchedBulletinDate >
                            selectedAdherentInfo.contractEndDate) ||
                        estimateData?.no_active_contract) && (
                        <div className="rounded-2xl border p-4 border-red-200 bg-red-50">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-600" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-red-800">
                                Aucun contrat actif à cette date
                              </p>
                              {selectedAdherentInfo?.contractStartDate &&
                                selectedAdherentInfo?.contractEndDate && (
                                  <p className="text-[10px] text-red-600 mt-1">
                                    Contrat de l'adhérent :{" "}
                                    {selectedAdherentInfo.contractStartDate} →{" "}
                                    {selectedAdherentInfo.contractEndDate}
                                  </p>
                                )}
                              {estimateData?.no_active_contract &&
                                estimateData.contracts &&
                                estimateData.contracts.length > 0 && (
                                  <div className="mt-2 space-y-1.5">
                                    <p className="text-[10px] text-red-700 font-medium uppercase tracking-wider">
                                      Contrats existants :
                                    </p>
                                    {estimateData.contracts.map((ct) => (
                                      <div
                                        key={ct.id}
                                        className="flex items-center justify-between rounded-lg bg-white/80 border border-red-100 px-3 py-1.5"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <FileText className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                          <span className="text-xs font-medium text-gray-800 truncate">
                                            {ct.contract_number}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span
                                            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                                              ct.status === "active"
                                                ? "bg-green-100 text-green-700"
                                                : ct.status === "expired"
                                                  ? "bg-gray-100 text-gray-600"
                                                  : ct.status === "suspended"
                                                    ? "bg-orange-100 text-orange-700"
                                                    : "bg-red-100 text-red-600"
                                            }`}
                                          >
                                            {ct.status === "active"
                                              ? "Actif"
                                              : ct.status === "expired"
                                                ? "Expiré"
                                                : ct.status === "suspended"
                                                  ? "Suspendu"
                                                  : "Annulé"}
                                          </span>
                                          <span className="text-[10px] text-gray-500">
                                            {ct.start_date} → {ct.end_date}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Total amount + reimbursement estimate */}
                      <div className="rounded-2xl border border-gray-200 bg-white p-5">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                            Montant déclaré
                          </span>
                          <span className="text-lg font-bold text-gray-900">
                            {formatAmount(actesTotal)} TND
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                          <span className="text-xs font-semibold uppercase tracking-wider text-green-600">
                            Total à rembourser
                          </span>
                          <span className="text-2xl font-bold text-green-600">
                            {estimatedReimbursement != null
                              ? formatAmount(estimatedReimbursement)
                              : "—"}{" "}
                            <span className="text-sm font-medium text-green-500">
                              TND
                            </span>
                          </span>
                        </div>
                        {estimateData?.warning &&
                          !estimateData?.no_active_contract && (
                            <p className="text-[10px] text-amber-600 mt-1">
                              {estimateData.warning}
                            </p>
                          )}
                        <p className="text-xs text-gray-400 mt-1 text-center">
                          {
                            (watchedActes || []).filter((a) => a.amount > 0)
                              .length
                          }{" "}
                          acte(s) médical(aux)
                        </p>
                      </div>

                      {/* Action buttons */}
                      {canCreate && (
                        <button
                          type="submit"
                          disabled={
                            isSubmitting ||
                            hasMfBlocking ||
                            hasBeneficiaryBlocking ||
                            (!selectedAdherentInfo && !!watchedMatricule) ||
                            !(watchedActes?.length > 0 && watchedMatricule)
                          }
                          className="w-full rounded-xl bg-gradient-to-r from-gray-900 to-blue-950 px-6 py-3.5 text-sm font-semibold text-white hover:from-gray-800 hover:to-blue-900 transition-all shadow-lg disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />{" "}
                              Enregistrement...
                            </>
                          ) : !selectedAdherentInfo && !!watchedMatricule ? (
                            <>
                              <AlertTriangle className="h-4 w-4" /> Adhérent non
                              enregistré
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
                          ) : hasMfMissing ? (
                            <>
                              <AlertTriangle className="h-4 w-4" />{" "}
                              {editingBulletinId
                                ? "Sauvegarder comme brouillon"
                                : "Enregistrer comme brouillon"}{" "}
                              (MF praticien manquante)
                            </>
                          ) : (
                            <>
                              {editingBulletinId
                                ? "Sauvegarder les modifications"
                                : "Enregistrer le bulletin"}
                            </>
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          reset({
                            bulletin_number: "",
                            bulletin_date: new Date()
                              .toISOString()
                              .split("T")[0],
                            adherent_matricule: "",
                            adherent_first_name: "",
                            adherent_last_name: "",
                            adherent_national_id: "",
                            adherent_email: "",
                            beneficiary_name: "",
                            beneficiary_relationship: undefined,
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
                          });
                          setSelectedFiles([]);
                          setRestoredFilesMeta([]);
                          setFolderSubGroups(null);
                          setSelectedAdherentInfo(null);
                          setOcrFeedback(null);
                          setMfStatuses({});
                          setBulletinNumberFromOcr(false);
                          setEditingBulletinId(null);
                          setOcrBulletins([]);
                          setActiveBulletinIndex(0);
                          setOcrPraticienInfos({});
                          setCurrentFileHash(null);
                          setAdherentSearch("");
                          setShowAdherentDropdown(false);
                          setShowScanPreview(false);
                          setSavedBulletinIndices(new Set());
                          setSavedBulletinSnapshots({});
                          setFeedbackComment("");
                          setFeedbackErrors([]);
                          setFileSelectionInfo(null);
                          setAnalyzeProgress(null);
                          const s = ocrJobsStore.analysisSession?.fileSessionId;
                          if (s) clearFilesFromIdb(s).catch(() => {});
                          ocrJobsStore.clearAnalysisSession();
                          setDuplicateBulletin(null);
                          setActeFamilleCodes({});
                          setNewPractitioners([]);
                          setAutoRegisterPraticien({});
                          setIsAddingAyantDroit(false);
                          setBulkJobIdRaw(null);
                          setExpandedBulkBulletinId(null);
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
                    className="pl-9 w-full sm:w-64 rounded-md h-9 border-gray-200 bg-gray-50 focus:bg-white"
                  />
                </div>
                {selectedBulletins.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
                      onClick={() => bulkSubmitToValidation(selectedBulletins)}
                    >
                      <Send className="h-4 w-4" />
                      Soumettre ({selectedBulletins.length})
                    </Button>
                    {canDelete && (
                      <Button
                        variant="outline"
                        className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => setBulkDeleteBulletinConfirm(true)}
                        disabled={bulkDeleteMutation.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                        Supprimer ({selectedBulletins.length})
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <DataTable
              columns={[
                ...(canDelete
                  ? [
                      {
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
                            onClick={(e: React.MouseEvent) =>
                              e.stopPropagation()
                            }
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        ),
                      },
                    ]
                  : []),
                {
                  key: "bulletin_number",
                  header: "Bulletin",
                  render: (row: BulletinSaisie) => {
                    const ctDisplay = careTypeDisplay(row.care_type);
                    const Icon = ctDisplay.icon;
                    return (
                      <div className="flex items-center gap-2.5">
                        <div
                          className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                            ctDisplay.bgColor || "bg-gray-100",
                          )}
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4",
                              ctDisplay.textColor || "text-gray-600",
                            )}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {row.adherent_first_name} {row.adherent_last_name}
                          </p>
                          <p className="text-xs text-gray-400">
                            <span className="font-mono">
                              {row.bulletin_number || "Brouillon"}
                            </span>
                            <span className="mx-1">·</span>
                            {formatDate(row.bulletin_date)}
                          </p>
                        </div>
                      </div>
                    );
                  },
                },
                {
                  key: "adherent",
                  header: "Adhérent",
                  render: (row: BulletinSaisie) => (
                    <div>
                      <p className="text-xs text-gray-500 font-mono">
                        {row.adherent_matricule}
                      </p>
                      {row.beneficiary_name && (
                        <p
                          className="text-xs text-blue-600 mt-0.5 truncate"
                          title={`Ayant droit: ${row.beneficiary_name}`}
                        >
                          {row.beneficiary_name}
                        </p>
                      )}
                    </div>
                  ),
                },
                {
                  key: "care_type",
                  header: "Type de soins",
                  render: (row: BulletinSaisie) => {
                    const ctDisplay = careTypeDisplay(row.care_type);
                    const Icon = ctDisplay.icon;
                    return (
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-700">
                          {ctDisplay.label}
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
                    const isMfIncomplete = (row.mf_missing_count ?? 0) > 0;
                    return (
                      <div className="flex flex-col items-center gap-1">
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
                        {isMfIncomplete && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                            title={`${row.mf_missing_count} acte(s) sans matricule fiscale`}
                          >
                            <AlertTriangle className="h-3 w-3" /> MF manquante
                          </span>
                        )}
                      </div>
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
                        <>
                          {/* Modifier — always available for drafts */}
                          <button
                            type="button"
                            className="rounded-lg p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                            title="Modifier le bulletin"
                            onClick={() => fetchBulletinDetail(row.id, true)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          {/* Valider — blocked when incomplete or MF missing */}
                          {(() => {
                            const incomplete = (row.actes_count ?? 0) === 0;
                            const mfMissing = (row.mf_missing_count ?? 0) > 0;
                            const blocked = incomplete || mfMissing;
                            const reason = incomplete
                              ? "Bulletin incomplet — aucun acte saisi"
                              : mfMissing
                                ? "MF praticien manquante — modifier le bulletin d'abord"
                                : "Valider";
                            return (
                              <button
                                type="button"
                                className={cn(
                                  "rounded-lg p-2 transition-colors",
                                  blocked
                                    ? "text-gray-300 cursor-not-allowed"
                                    : "text-gray-400 hover:text-green-600 hover:bg-green-50",
                                )}
                                title={reason}
                                disabled={blocked}
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
                            );
                          })()}
                          {/* Soumettre — only for reimbursable bulletins, blocked when incomplete or MF missing */}
                          {row.reimbursed_amount != null &&
                            row.reimbursed_amount > 0 &&
                            (() => {
                              const incomplete = (row.actes_count ?? 0) === 0;
                              const mfMissing = (row.mf_missing_count ?? 0) > 0;
                              const blocked = incomplete || mfMissing;
                              const reason = incomplete
                                ? "Bulletin incomplet — aucun acte saisi"
                                : mfMissing
                                  ? "MF praticien manquante — modifier le bulletin d'abord"
                                  : "Soumettre à validation";
                              return (
                                <button
                                  type="button"
                                  className={cn(
                                    "rounded-lg p-2 transition-colors",
                                    blocked
                                      ? "text-gray-300 cursor-not-allowed"
                                      : "text-gray-400 hover:text-orange-600 hover:bg-orange-50",
                                  )}
                                  title={reason}
                                  disabled={submittingId === row.id || blocked}
                                  onClick={() => submitToValidation(row.id)}
                                >
                                  <Send className="h-4 w-4" />
                                </button>
                              );
                            })()}
                        </>
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
                className="w-full rounded-md border border-gray-200 bg-white h-9 pl-10 pr-4 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <FilterDropdown
              label="Statut"
              value={
                {
                  all: "Tous les statuts",
                  open: "Ouvert",
                  closed: "Fermé",
                  exported: "Exporté",
                }[batchStatusFilter] || "Tous les statuts"
              }
              open={batchStatusDropdownOpen}
              onToggle={() =>
                setBatchStatusDropdownOpen(!batchStatusDropdownOpen)
              }
              onClose={() => setBatchStatusDropdownOpen(false)}
              menuWidth="w-48"
            >
              <FilterOption
                selected={batchStatusFilter === "all"}
                onClick={() => {
                  setBatchStatusFilter("all");
                  setBatchPage(1);
                  setBatchStatusDropdownOpen(false);
                }}
              >
                Tous les statuts
              </FilterOption>
              <FilterOption
                selected={batchStatusFilter === "open"}
                onClick={() => {
                  setBatchStatusFilter("open");
                  setBatchPage(1);
                  setBatchStatusDropdownOpen(false);
                }}
              >
                Ouvert
              </FilterOption>
              <FilterOption
                selected={batchStatusFilter === "closed"}
                onClick={() => {
                  setBatchStatusFilter("closed");
                  setBatchPage(1);
                  setBatchStatusDropdownOpen(false);
                }}
              >
                Fermé
              </FilterOption>
              <FilterOption
                selected={batchStatusFilter === "exported"}
                onClick={() => {
                  setBatchStatusFilter("exported");
                  setBatchPage(1);
                  setBatchStatusDropdownOpen(false);
                }}
              >
                Exporté
              </FilterOption>
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
              ...(canDelete && batchesData.length > 0
                ? [
                    {
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
                    },
                  ]
                : []),
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
                  Le lot sera créé vide. Les prochains bulletins saisis y seront
                  ajoutés automatiquement.
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
                    {careTypeDisplay(viewBulletin.care_type).label}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Adhérent</p>
                  <p className="font-medium">
                    {viewBulletin.adherent_first_name}{" "}
                    {viewBulletin.adherent_last_name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {viewBulletin.adherent_matricule}
                  </p>
                </div>
                {viewBulletin.beneficiary_name &&
                  viewBulletin.beneficiary_relationship !== "self" && (
                    <div>
                      <p className="text-muted-foreground">Bénéficiaire</p>
                      <p className="font-medium">
                        {viewBulletin.beneficiary_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {viewBulletin.beneficiary_relationship === "spouse"
                          ? "Conjoint(e)"
                          : viewBulletin.beneficiary_relationship === "child"
                            ? "Enfant"
                            : viewBulletin.beneficiary_relationship}
                      </p>
                    </div>
                  )}
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
                                {acte.acte_ref_label &&
                                  acte.acte_ref_label !== acte.label && (
                                    <span className="ml-1 text-muted-foreground">
                                      ({acte.acte_ref_label})
                                    </span>
                                  )}
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

                          {/* Praticien / Provider */}
                          {(acte.nom_prof_sant ||
                            acte.provider_name_resolved) && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <span>
                                {acte.provider_name_resolved ||
                                  acte.nom_prof_sant}
                              </span>
                              {acte.ref_prof_sant && (
                                <span className="font-mono text-[10px] bg-muted px-1 rounded">
                                  MF {acte.ref_prof_sant}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Medication info */}
                          {acte.medication_name && (
                            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                              <span>{acte.medication_name}</span>
                              {acte.medication_dci &&
                                acte.medication_dci !==
                                  acte.medication_name && (
                                  <span className="italic">
                                    ({acte.medication_dci})
                                  </span>
                                )}
                              {acte.medication_family_name && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1 py-0 h-4"
                                >
                                  {acte.medication_family_name}
                                </Badge>
                              )}
                            </div>
                          )}

                          {/* Sub-items (medications, analyses, etc.) — collapsible */}
                          {acte.sub_items && acte.sub_items.length > 0 && (
                            <SubItemsList
                              items={acte.sub_items}
                              formatAmount={formatAmount}
                            />
                          )}

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
                          {formatAmount(viewBulletin.plafond_global / 1000)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">
                          Avant ce bulletin
                        </span>
                        <span className="font-medium">
                          {formatAmount(
                            (viewBulletin.plafond_consomme_avant ?? 0) / 1000,
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
                            (viewBulletin.plafond_global -
                              (viewBulletin.plafond_consomme || 0)) /
                              1000,
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
                          width: `${Math.min(100 - ((viewBulletin.plafond_consomme_avant ?? 0) / viewBulletin.plafond_global) * 100, (((viewBulletin.reimbursed_amount || 0) * 1000) / viewBulletin.plafond_global) * 100)}%`,
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
                onUploadComplete={() => fetchBulletinDetail(viewBulletin.id)}
                readOnly={!["draft", "in_batch"].includes(viewBulletin.status)}
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
            <AlertDialogTitle>
              {(validateBulletinTarget?.reimbursed_amount || 0) <= 0
                ? "Bulletin non remboursable"
                : "Valider le bulletin"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(validateBulletinTarget?.reimbursed_amount || 0) <= 0 ? (
                <>
                  Le bulletin {validateBulletinTarget?.bulletin_number} ne peut
                  pas être remboursé (contrat non actif à la date du bulletin,
                  plafond épuisé, ou acte non couvert). Il sera classé comme non
                  remboursable.
                </>
              ) : (
                <>
                  Confirmez la validation du bulletin{" "}
                  {validateBulletinTarget?.bulletin_number}. Le remboursement
                  sera enregistré définitivement.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {validateBulletinTarget && (
            <div className="py-4 space-y-3">
              {(validateBulletinTarget.reimbursed_amount || 0) <= 0 && (
                <div className="rounded-md border border-orange-200 bg-orange-50 p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-orange-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-orange-800">
                    Le montant remboursable est de 0 DT. Ce bulletin sera marqué
                    comme &quot;non remboursable&quot;.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Adhérent</p>
                  <p className="font-medium">
                    {validateBulletinTarget.adherent_first_name}{" "}
                    {validateBulletinTarget.adherent_last_name}
                  </p>
                </div>
                {validateBulletinTarget.beneficiary_name &&
                  validateBulletinTarget.beneficiary_relationship !==
                    "self" && (
                    <div>
                      <p className="text-muted-foreground">Bénéficiaire</p>
                      <p className="font-medium">
                        {validateBulletinTarget.beneficiary_name}{" "}
                        <span className="text-xs text-muted-foreground">
                          (
                          {validateBulletinTarget.beneficiary_relationship ===
                          "spouse"
                            ? "Conjoint(e)"
                            : validateBulletinTarget.beneficiary_relationship ===
                                "child"
                              ? "Enfant"
                              : validateBulletinTarget.beneficiary_relationship}
                          )
                        </span>
                      </p>
                    </div>
                  )}
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
                  <p
                    className={`font-medium ${(validateBulletinTarget.reimbursed_amount || 0) <= 0 ? "text-orange-600" : "text-green-600"}`}
                  >
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
              className={
                (validateBulletinTarget?.reimbursed_amount || 0) <= 0
                  ? "bg-orange-600 hover:bg-orange-700"
                  : ""
              }
              onClick={(e) => {
                e.preventDefault();
                if (!validateBulletinTarget) return;
                validateMutation.mutate(
                  {
                    id: validateBulletinTarget.id,
                    reimbursed_amount:
                      validateBulletinTarget.reimbursed_amount != null
                        ? validateBulletinTarget.reimbursed_amount
                        : validateBulletinTarget.total_amount || 0,
                    notes: validateNotes || undefined,
                  },
                  {
                    onSuccess: async () => {
                      setShowValidateDialog(false);
                      setValidateBulletinTarget(null);
                      setValidateNotes("");
                      setViewBulletin(null);
                      // Refresh selectedAdherentInfo so plafond is up to date
                      if (selectedAdherentInfo?.matricule) {
                        const companyId =
                          selectedCompany?.id &&
                          selectedCompany.id !== "__INDIVIDUAL__"
                            ? selectedCompany.id
                            : undefined;
                        const params: Record<string, string> = {
                          q: selectedAdherentInfo.matricule,
                        };
                        if (companyId) params.companyId = companyId;
                        const res = await apiClient.get<AdherentSearchResult[]>(
                          "/adherents/search",
                          { params },
                        );
                        if (res.success && res.data && res.data.length > 0) {
                          const updated = res.data.find(
                            (a) =>
                              a.matricule === selectedAdherentInfo.matricule,
                          );
                          if (updated) setSelectedAdherentInfo(updated);
                        }
                      }
                    },
                  },
                );
              }}
              disabled={validateMutation.isPending}
            >
              {validateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {(validateBulletinTarget?.reimbursed_amount || 0) <= 0
                    ? "Traitement..."
                    : "Validation..."}
                </>
              ) : (validateBulletinTarget?.reimbursed_amount || 0) <= 0 ? (
                <>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Marquer non remboursable
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
              Voulez-vous vraiment supprimer{" "}
              <strong>{selectedBulletins.length}</strong> bulletin(s)
              sélectionné(s) ? Cette action est irréversible.
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
              Voulez-vous vraiment supprimer{" "}
              <strong>{selectedBatches.length}</strong> lot(s) et leurs
              bulletins associés ? Cette action est irréversible.
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
