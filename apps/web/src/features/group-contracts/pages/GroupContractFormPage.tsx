import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight,
  Upload,
  FileText,
  Loader2,
  Check,
  X,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  User,
  Search,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/stores/toast';
import { useAgentContext } from '@/features/agent/stores/agent-context';

// ---- Care types ----

// Remplacer CARE_TYPES existant par :
const CARE_TYPES = [
  { value: 'consultation_visite',     label: '1 - Soins Médicaux (Consultations & Visites)' },
  { value: 'pharmacie',               label: '2 - Frais Pharmaceutiques' },
  { value: 'laboratoire',             label: '3 - Analyses & Laboratoire' },
  { value: 'optique',                 label: '4 - Optique' },
  { value: 'chirurgie_refractive',    label: '5 - Chirurgie Réfractive (Laser)' },
  { value: 'actes_courants',          label: '6 - Actes Médicaux Courants & Radiologie' },
  { value: 'transport',               label: '7 - Transport du Malade' },
  { value: 'chirurgie',               label: '8 - Frais Chirurgicaux' },
  { value: 'orthopedie',              label: '9 - Orthopédie & Prothèses (non dentaires)' },
  { value: 'hospitalisation',         label: '10 - Hospitalisation' },
  { value: 'accouchement',            label: '11 - Accouchement' },
  { value: 'interruption_grossesse',  label: '12 - Interruption Involontaire de Grossesse' },
  { value: 'dentaire',                label: '13 - Soins & Prothèses Dentaires' },
  { value: 'orthodontie',             label: '14 - Soins Orthodontiques (< 20 ans)' },
  { value: 'circoncision',            label: '15 - Circoncision' },
  { value: 'sanatorium',              label: '16 - Sanatorium / Préventorium' },
  { value: 'cures_thermales',         label: '17 - Cures Thermales' },
  { value: 'frais_funeraires',        label: '18 - Frais Funéraires (Décès)' },
] as const;

const COVERED_RISKS_OPTIONS = [
  'Maladie',
  'Accident',
  'Maternité',
  'Décès',
  'Invalidité',
  'Hospitalisation',
];
// Ajouter ces constantes après CARE_TYPES
const DEFAULT_LETTER_KEYS: Record<string, { key: string; value: number }[]> = {
  consultation_visite: [
    { key: 'C1', value: 45000 },   // Consultation généraliste
    { key: 'C2', value: 55000 },   // Consultation spécialiste
    { key: 'C3', value: 55000 },   // Consultation professeur
    { key: 'V1', value: 50000 },   // Visite généraliste
    { key: 'V2', value: 55000 },   // Visite spécialiste
    { key: 'V3', value: 55000 },   // Visite professeur
  ],
  laboratoire: [
    { key: 'B', value: 320 },
    { key: 'P', value: 320 },      // Anatomie/Cytologie
  ],
  actes_courants: [
    { key: 'Z',   value: 2000 },   // Radio diagnostique /unité
    { key: 'E',   value: 7000 },   // Échographie /unité
    { key: 'PC',  value: 1500 },   // Pratiques courantes
    { key: 'AMM', value: 10000 },  // Injection insuline
  ],
  chirurgie: [
    { key: 'KC', value: 10000 },
  ],
};

const DEFAULT_CEILINGS: Record<string, {
  rate?: number;
  annual_ceiling?: number;
  per_act_ceiling?: number;
  per_day_ceiling?: number;
  conditions?: string;
  requires_prescription?: boolean;
  requires_cnam_complement?: boolean;
}> = {
  consultation_visite:    { rate: 100 },
  pharmacie:              { rate: 90,  annual_ceiling: 1000000, requires_prescription: true },
  laboratoire:            { rate: 100, requires_prescription: true },
  optique:                { rate: 100, annual_ceiling: 300000 },   // monture
  chirurgie_refractive:   { rate: 100, annual_ceiling: 350000 },
  actes_courants:         { rate: 100 },
  transport:              { rate: 100, annual_ceiling: 100000,  requires_prescription: true },
  chirurgie:              { rate: 80,  per_act_ceiling: 300000,  requires_cnam_complement: true },
  orthopedie:             { rate: 100, annual_ceiling: 600000,  requires_prescription: true },
  hospitalisation:        { rate: 100, per_day_ceiling: 120000, requires_cnam_complement: true },
  accouchement:           { rate: 100, per_act_ceiling: 200000 },
  interruption_grossesse: { rate: 100, per_act_ceiling: 100000, requires_prescription: true },
  dentaire:               { rate: 80,  annual_ceiling: 1200000 },
  orthodontie:            { rate: 80,  annual_ceiling: 600000,
                            conditions: 'Pour les enfants de moins de 20 ans' },
  circoncision:           { rate: 100, per_act_ceiling: 200000 },
  sanatorium:             { rate: 100, per_day_ceiling: 30000,
                            conditions: 'Maximum 21 jours. Après prise en charge CNAM',
                            requires_cnam_complement: true },
  cures_thermales:        { rate: 100, per_day_ceiling: 30000,
                            conditions: 'Maximum 21 jours. Prescrit par spécialiste. Après CNAM',
                            requires_prescription: true, requires_cnam_complement: true },
  frais_funeraires:       { rate: 100, per_act_ceiling: 200000 },
};

// ---- Schemas ----

const letterKeySchema = z.object({
  key: z.string().min(1),
  value: z.number().min(0),
});

const subLimitSchema = z.object({
  key: z.string().min(1),
  value: z.number().min(0),
});

const guaranteeSchema = z.object({
  care_type: z.string().min(1, 'Type de soin requis'),
  label: z.string().optional(),
  rate: z.number().min(0).max(100).nullable().optional(),
  annual_ceiling: z.number().min(0).nullable().optional(),
  per_act_ceiling: z.number().min(0).nullable().optional(),
  per_day_ceiling: z.number().min(0).nullable().optional(),
  letter_keys: z.array(letterKeySchema).optional(),
  sub_limits: z.array(subLimitSchema).optional(),
  conditions: z.string().optional(),
  requires_prescription: z.boolean().optional(),
  requires_cnam_complement: z.boolean().optional(),
  renewal_period: z.string().optional(),
  age_limit: z.number().min(0).nullable().optional(),
});

const formSchema = z.object({
  contract_type: z.enum(['group', 'individual']).default('group'),
  contract_number: z.string().min(1, 'Numéro de contrat requis'),
  company_id: z.string().optional(),
  adherent_id: z.string().optional(),
  company_name_extracted: z.string().optional(),
  company_address: z.string().optional(),
  matricule_fiscale: z.string().optional(),
  insurer_id: z.string().optional(),
  insurer_name_extracted: z.string().optional(),
  intermediary_name: z.string().optional(),
  intermediary_code: z.string().optional(),
  effective_date: z.string().min(1, 'Date d\'effet requise'),
  expiry_date: z.string().optional(),
  global_ceiling: z.number().min(0).nullable().optional(),
  covered_risks: z.array(z.string()).optional(),
  covers_spouse: z.boolean().optional(),
  covers_children: z.boolean().optional(),
  children_max_age: z.number().min(0).nullable().optional(),
  children_student_max_age: z.number().min(0).nullable().optional(),
  covers_disabled_children: z.boolean().optional(),
  covers_retirees: z.boolean().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  guarantees: z.array(guaranteeSchema),
});

type FormData = z.infer<typeof formSchema>;

interface Company {
  id: string;
  name: string;
}

interface AdherentOption {
  id: string;
  nom: string;
  prenom: string;
  matricule?: string;
}

interface Insurer {
  id: string;
  name: string;
}

interface ExistingContract {
  id: string;
  contract_number: string;
  company_id: string;
  insurer_id: string | null;
  intermediary: string | null;
  effective_date: string;
  expiry_date: string | null;
  global_ceiling: number | null;
  covered_risks: string | null;
  category: string | null;
  status: string;
  guarantees: Array<{
    id: string;
    care_type: string;
    label: string;
    rate: number | null;
    annual_ceiling: number | null;
    per_act_ceiling: number | null;
    per_day_ceiling: number | null;
    letter_keys: Record<string, number> | null;
    sub_limits: Record<string, number> | null;
    conditions: string | null;
    requires_prescription: number;
    requires_cnam_complement: number;
    renewal_period: string | null;
    age_limit: number | null;
  }>;
}

interface GeminiGuarantee {
  guaranteeNumber?: number;
  careType: string;
  label?: string;
  reimbursementRate?: number | null;
  isFixedAmount?: boolean;
  annualLimit?: number | null;
  perEventLimit?: number | null;
  dailyLimit?: number | null;
  maxDays?: number | null;
  letterKeys?: Record<string, number> | null;
  subLimits?: Record<string, number> | null;
  conditionsText?: string | null;
  requiresPrescription?: boolean;
  requiresCnamComplement?: boolean;
  renewalPeriodMonths?: number | null;
  ageLimit?: number | null;
  exclusionsText?: string | null;
}

interface PdfAnalyseResponse {
  documentId: string;
  uploadedFiles: Array<{ name: string; r2Key: string; size: number }>;
  extractedData: {
    contractNumber?: string | null;
    companyName?: string | null;
    companyAddress?: string | null;
    matriculeFiscale?: string | null;
    insurerName?: string | null;
    intermediaryName?: string | null;
    intermediaryCode?: string | null;
    effectiveDate?: string | null;
    annualRenewalDate?: string | null;
    riskIllness?: boolean;
    riskDisability?: boolean;
    riskDeath?: boolean;
    coversSpouse?: boolean;
    coversChildren?: boolean;
    childrenMaxAge?: number | null;
    childrenStudentMaxAge?: number | null;
    coversDisabledChildren?: boolean;
    coversRetirees?: boolean;
    annualGlobalLimit?: number | null;
    planCategory?: string | null;
    guarantees?: GeminiGuarantee[];
  } | null;
  totalFiles: number;
  confidence: string;
  engine: string;
  message?: string;
  errors?: string[];
}

export function GroupContractFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!id;

  // Determine contract type from URL param or agent context
  const agentContext = useAgentContext();
  const isIndividualFromContext = agentContext.isIndividualMode();
  const urlContractType = searchParams.get('type') === 'individual' || isIndividualFromContext ? 'individual' : 'group';
  const [selectedAdherent, setSelectedAdherent] = useState<AdherentOption | null>(null);

  const [pdfUploading, setPdfUploading] = useState(false);
  const [pdfExtracted, setPdfExtracted] = useState(false);
  const [pdfConfidence, setPdfConfidence] = useState<number | null>(null);
  const [expandedGuarantees, setExpandedGuarantees] = useState<Record<number, boolean>>({});
  const [isDragging, setIsDragging] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);

  // ---- Form ----

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    control,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      contract_type: 'group',
      contract_number: '',
      company_id: '',
      adherent_id: '',
      company_name_extracted: '',
      company_address: '',
      matricule_fiscale: '',
      insurer_id: '',
      insurer_name_extracted: '',
      intermediary_name: '',
      intermediary_code: '',
      effective_date: '',
      expiry_date: '',
      global_ceiling: null,
      covered_risks: [],
      covers_spouse: true,
      covers_children: true,
      children_max_age: null,
      children_student_max_age: null,
      covers_disabled_children: true,
      covers_retirees: false,
      category: '',
      status: 'draft',
      guarantees: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'guarantees',
  });

  const watchedCoveredRisks = watch('covered_risks') || [];

  // ---- Data fetching ----

  const { data: companies } = useQuery({
    queryKey: ['companies-list'],
    queryFn: async () => {
      const response = await apiClient.get<Company[]>('/companies?limit=100');
      if (!response.success) return [];
      const raw = response as unknown as { data: Company[] };
      return Array.isArray(raw.data) ? raw.data : [];
    },
  });

  const { data: insurers } = useQuery({
    queryKey: ['insurers-list'],
    queryFn: async () => {
      const response = await apiClient.get<Insurer[]>('/insurers?limit=100');
      if (!response.success) return [];
      const raw = response as unknown as { data: Insurer[] };
      return Array.isArray(raw.data) ? raw.data : [];
    },
  });

  // Adherent search for individual contracts
  const [adherentSearch, setAdherentSearch] = useState('');
  const contractType = watch('contract_type');

  const { data: adherentResults } = useQuery({
    queryKey: ['adherents-search', adherentSearch],
    queryFn: async () => {
      const response = await apiClient.get<AdherentOption[]>(`/adherents?search=${encodeURIComponent(adherentSearch)}&limit=10&type=individuel`);
      if (!response.success) return [];
      const raw = response as unknown as { data: AdherentOption[] };
      return Array.isArray(raw.data) ? raw.data : [];
    },
    enabled: contractType === 'individual' && adherentSearch.length >= 2,
  });

  const { data: existingContract, isLoading: contractLoading } = useQuery({
    queryKey: ['group-contract', id],
    queryFn: async () => {
      const response = await apiClient.get<ExistingContract>(`/group-contracts/${id}`);
      if (!response.success) throw new Error(response.error?.message);
      return response.data;
    },
    enabled: isEditing,
  });

  // Populate form when editing
  useEffect(() => {
    if (existingContract) {
      const coveredRisks = existingContract.covered_risks
        ? JSON.parse(existingContract.covered_risks)
        : [];

      reset({
        contract_number: existingContract.contract_number,
        company_id: existingContract.company_id,
        insurer_id: existingContract.insurer_id || '',
        intermediary: existingContract.intermediary || '',
        effective_date: existingContract.effective_date || '',
        expiry_date: existingContract.expiry_date || '',
        global_ceiling: existingContract.global_ceiling,
        covered_risks: coveredRisks,
        category: existingContract.category || '',
        status: existingContract.status,
        guarantees: existingContract.guarantees.map((g) => ({
          care_type: g.care_type,
          label: g.label || '',
          rate: g.rate,
          annual_ceiling: g.annual_ceiling,
          per_act_ceiling: g.per_act_ceiling,
          per_day_ceiling: g.per_day_ceiling,
          letter_keys: g.letter_keys
            ? Object.entries(g.letter_keys).map(([key, value]) => ({ key, value }))
            : [],
          sub_limits: g.sub_limits
            ? Object.entries(g.sub_limits).map(([key, value]) => ({ key, value }))
            : [],
          conditions: g.conditions || '',
          requires_prescription: g.requires_prescription === 1,
          requires_cnam_complement: g.requires_cnam_complement === 1,
          renewal_period: g.renewal_period || '',
          age_limit: g.age_limit,
        })),
      });
    }
  }, [existingContract, reset]);

  // Set contract type from URL on mount (new contracts only)
  useEffect(() => {
    if (!isEditing) {
      setValue('contract_type', urlContractType as 'group' | 'individual');
    }
  }, [urlContractType, isEditing, setValue]);

  // ---- PDF Upload ----

  const handlePdfUpload = useCallback(
    async (file: File) => {
      if (!file || file.type !== 'application/pdf') {
        toast({ title: 'Veuillez selectionner un fichier PDF', variant: 'destructive' });
        return;
      }

      setPdfUploading(true);
      setPdfExtracted(false);

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await apiClient.upload<PdfAnalyseResponse>(
          '/group-contracts/analyse-pdf',
          formData,
          { timeout: 120000 }
        );

        if (!response.success) {
          throw new Error(response.error?.message || 'Erreur lors de l\'analyse du PDF');
        }

        const result = response.data;
        if (!result?.extractedData) throw new Error('Aucune donnee extraite');

        const extracted = result.extractedData;

        // Pre-fill contract header info
        if (extracted.contractNumber) setValue('contract_number', extracted.contractNumber);
        if (extracted.companyName) setValue('company_name_extracted', extracted.companyName);
        if (extracted.companyAddress) setValue('company_address', extracted.companyAddress);
        if (extracted.matriculeFiscale) setValue('matricule_fiscale', extracted.matriculeFiscale);
        if (extracted.insurerName) setValue('insurer_name_extracted', extracted.insurerName);
        if (extracted.intermediaryName) setValue('intermediary_name', extracted.intermediaryName);
        if (extracted.intermediaryCode) setValue('intermediary_code', extracted.intermediaryCode);
        if (extracted.effectiveDate) setValue('effective_date', extracted.effectiveDate);
        if (extracted.annualRenewalDate) setValue('expiry_date', extracted.annualRenewalDate);
        if (extracted.annualGlobalLimit != null) setValue('global_ceiling', extracted.annualGlobalLimit);
        if (extracted.planCategory) setValue('category', extracted.planCategory);

        // Beneficiaries
        if (extracted.coversSpouse != null) setValue('covers_spouse', extracted.coversSpouse);
        if (extracted.coversChildren != null) setValue('covers_children', extracted.coversChildren);
        if (extracted.childrenMaxAge != null) setValue('children_max_age', extracted.childrenMaxAge);
        if (extracted.childrenStudentMaxAge != null) setValue('children_student_max_age', extracted.childrenStudentMaxAge);
        if (extracted.coversDisabledChildren != null) setValue('covers_disabled_children', extracted.coversDisabledChildren);
        if (extracted.coversRetirees != null) setValue('covers_retirees', extracted.coversRetirees);

        // Map covered risks from boolean flags
        const risks: string[] = [];
        if (extracted.riskIllness) {
          risks.push('Maladie');
          risks.push('Maternité'); // Maladie includes maternite in Tunisian contracts
        }
        if (extracted.riskDeath) risks.push('Décès');
        if (extracted.riskDisability) risks.push('Invalidité');
        setValue('covered_risks', risks);

        // Try to match company by name
        if (extracted.companyName && companies) {
          const matchedCompany = companies.find(
            (co) => co.name.toLowerCase().includes(extracted.companyName!.toLowerCase()) ||
                     extracted.companyName!.toLowerCase().includes(co.name.toLowerCase())
          );
          if (matchedCompany) setValue('company_id', matchedCompany.id);
        }

        // Try to match insurer by name
        if (extracted.insurerName && insurers) {
          const matchedInsurer = insurers.find(
            (ins) => ins.name.toLowerCase().includes(extracted.insurerName!.toLowerCase()) ||
                     extracted.insurerName!.toLowerCase().includes(ins.name.toLowerCase())
          );
          if (matchedInsurer) setValue('insurer_id', matchedInsurer.id);
        }

        // Pre-fill guarantees from Gemini extracted data
        const geminiGuarantees = extracted.guarantees || [];
        if (geminiGuarantees.length > 0) {
          const mappedGuarantees = geminiGuarantees.map((g) => {
            // Convert reimbursementRate (0-1 decimal) to percentage (0-100)
            const ratePercent = g.reimbursementRate != null
              ? Math.round(g.reimbursementRate * 100)
              : null;

            // Map renewalPeriodMonths to select value
            let renewalPeriod = '';
            if (g.renewalPeriodMonths) {
              if (g.renewalPeriodMonths <= 12) renewalPeriod = 'annual';
              else if (g.renewalPeriodMonths <= 24) renewalPeriod = 'biennial';
              else renewalPeriod = 'triennial';
            }

            // Build conditions from conditionsText + exclusionsText
            const conditionParts: string[] = [];
            if (g.conditionsText) conditionParts.push(g.conditionsText);
            if (g.exclusionsText) conditionParts.push(`Exclusions: ${g.exclusionsText}`);

            return {
              care_type: g.careType,
              label: g.label || CARE_TYPES.find((ct) => ct.value === g.careType)?.label || '',
              rate: ratePercent,
              annual_ceiling: g.annualLimit ?? null,
              per_act_ceiling: g.perEventLimit ?? null,
              per_day_ceiling: g.dailyLimit ?? null,
              letter_keys: g.letterKeys
                ? Object.entries(g.letterKeys).map(([key, value]) => ({ key, value }))
                : [],
              sub_limits: g.subLimits
                ? Object.entries(g.subLimits).map(([key, value]) => ({ key, value }))
                : [],
              conditions: conditionParts.join('. '),
              requires_prescription: g.requiresPrescription || false,
              requires_cnam_complement: g.requiresCnamComplement || false,
              renewal_period: renewalPeriod,
              age_limit: g.ageLimit ?? null,
            };
          });

          setValue('guarantees', mappedGuarantees);

          // Expand all guarantees to show extracted data
          const expanded: Record<number, boolean> = {};
          mappedGuarantees.forEach((_, i) => { expanded[i] = true; });
          setExpandedGuarantees(expanded);
        }

        // Map confidence string to number for display
        const confidenceMap: Record<string, number> = { high: 0.9, medium: 0.7, low: 0.4 };
        setPdfConfidence(confidenceMap[result.confidence] ?? 0.5);
        setPdfExtracted(true);

        const guaranteeCount = geminiGuarantees.length;
        toast({
          title: 'PDF analyse avec succes',
          description: `${guaranteeCount} garantie${guaranteeCount > 1 ? 's' : ''} extraite${guaranteeCount > 1 ? 's' : ''} automatiquement`,
          variant: 'success',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erreur inconnue';
        toast({ title: 'Erreur d\'analyse PDF', description: message, variant: 'destructive' });
      } finally {
        setPdfUploading(false);
      }
    },
    [setValue, toast, companies, insurers]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handlePdfUpload(file);
    },
    [handlePdfUpload]
  );

  const onFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handlePdfUpload(file);
    },
    [handlePdfUpload]
  );

  // ---- Submit ----

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      // Map form fields to API schema (camelCase)
      const isIndividual = data.contract_type === 'individual';
      const payload = {
        contractType: data.contract_type,
        contractNumber: data.contract_number,
        companyId: isIndividual ? undefined : data.company_id,
        adherentId: isIndividual ? data.adherent_id : undefined,
        insurerId: data.insurer_id || undefined,
        companyAddress: data.company_address || undefined,
        matriculeFiscale: data.matricule_fiscale || undefined,
        intermediaryName: data.intermediary_name || undefined,
        intermediaryCode: data.intermediary_code || undefined,
        effectiveDate: data.effective_date,
        annualRenewalDate: data.expiry_date || undefined,
        annualGlobalLimit: data.global_ceiling ?? undefined,
        planCategory: data.category || 'standard',
        status: data.status || 'draft',
        riskIllness: data.covered_risks?.includes('Maladie') ?? true,
        riskDisability: data.covered_risks?.includes('Invalidité') ?? false,
        riskDeath: data.covered_risks?.includes('Décès') ?? false,
        coversSpouse: data.covers_spouse ?? true,
        coversChildren: data.covers_children ?? true,
        childrenMaxAge: data.children_max_age ?? 20,
        childrenStudentMaxAge: data.children_student_max_age ?? 28,
        coversDisabledChildren: data.covers_disabled_children ?? true,
        coversRetirees: data.covers_retirees ?? false,
        guarantees: data.guarantees.map((g, idx) => ({
          guaranteeNumber: idx + 1,
          careType: g.care_type,
          label: g.label || CARE_TYPES.find((ct) => ct.value === g.care_type)?.label || g.care_type,
          reimbursementRate: g.rate != null ? g.rate / 100 : undefined,
          isFixedAmount: g.rate == null,
          annualLimit: g.annual_ceiling ?? undefined,
          perEventLimit: g.per_act_ceiling ?? undefined,
          dailyLimit: g.per_day_ceiling ?? undefined,
          letterKeysJson: g.letter_keys?.length
            ? JSON.stringify(Object.fromEntries(g.letter_keys.map((lk) => [lk.key, lk.value])))
            : undefined,
          subLimitsJson: g.sub_limits?.length
            ? JSON.stringify(Object.fromEntries(g.sub_limits.map((sl) => [sl.key, sl.value])))
            : undefined,
          conditionsText: g.conditions || undefined,
          requiresPrescription: g.requires_prescription ?? false,
          requiresCnamComplement: g.requires_cnam_complement ?? false,
          renewalPeriodMonths: g.renewal_period === 'annual' ? 12
            : g.renewal_period === 'biennial' ? 24
            : g.renewal_period === 'triennial' ? 36
            : undefined,
          ageLimit: g.age_limit ?? undefined,
        })),
      };

      if (isEditing) {
        return apiClient.put(`/group-contracts/${id}`, payload);
      }
      return apiClient.post('/group-contracts', payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-contracts'] });
      toast({
        title: isEditing ? 'Contrat modifié avec succès' : 'Contrat créé avec succès',
        variant: 'success',
      });
      navigate('/group-contracts');
    },
    onError: (err: Error) => {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    },
  });

  const onSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  const toggleGuarantee = (index: number) => {
    setExpandedGuarantees((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const toggleRisk = (risk: string) => {
    const current = watchedCoveredRisks;
    if (current.includes(risk)) {
      setValue(
        'covered_risks',
        current.filter((r) => r !== risk),
        { shouldDirty: true, shouldValidate: true }
      );
    } else {
      setValue('covered_risks', [...current, risk], { shouldDirty: true, shouldValidate: true });
    }
  };

  const addGuarantee = () => {
    append({
      care_type: '',
      label: '',
      rate: null,
      annual_ceiling: null,
      per_act_ceiling: null,
      per_day_ceiling: null,
      letter_keys: [],
      sub_limits: [],
      conditions: '',
      requires_prescription: false,
      requires_cnam_complement: false,
      renewal_period: '',
      age_limit: null,
    });
    setExpandedGuarantees((prev) => ({ ...prev, [fields.length]: true }));
  };

  const handleResetAll = () => {
    reset({
      contract_number: '',
      company_id: '',
      company_name_extracted: '',
      company_address: '',
      matricule_fiscale: '',
      insurer_id: '',
      insurer_name_extracted: '',
      intermediary_name: '',
      intermediary_code: '',
      effective_date: '',
      expiry_date: '',
      global_ceiling: null,
      covered_risks: [],
      covers_spouse: true,
      covers_children: true,
      children_max_age: null,
      children_student_max_age: null,
      covers_disabled_children: true,
      covers_retirees: false,
      category: '',
      status: 'draft',
      guarantees: [],
    });
    setPdfExtracted(false);
    setPdfConfidence(null);
    setExpandedGuarantees({});
    setShowResetDialog(false);
    toast({ title: 'Formulaire réinitialisé', variant: 'success' });
  };

  if (isEditing && contractLoading) {
    return <div className="flex items-center justify-center p-8">Chargement...</div>;
  }

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/group-contracts" className="hover:text-gray-900 transition-colors">Contrats</Link>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-900 font-medium">
          {isEditing ? 'Modifier' : contractType === 'individual' ? 'Nouveau contrat individuel' : 'Nouveau contrat groupe'}
        </span>
      </nav>
      <PageHeader
        title={isEditing ? 'Modifier le contrat' : contractType === 'individual' ? 'Nouveau contrat individuel' : 'Nouveau contrat groupe'}
        description={
          isEditing
            ? `Modifier ${existingContract?.contract_number || ''}`
            : contractType === 'individual'
              ? 'Créer un nouveau contrat d\'assurance individuel'
              : 'Créer un nouveau contrat d\'assurance groupe'
        }
      />

      {/* PDF Upload Zone */}
      {!isEditing && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import PDF du contrat
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pdfExtracted && (
              <div className="mb-4 flex items-center justify-between rounded-lg bg-green-50 p-3 text-green-800 border border-green-200">
                <div className="flex items-center gap-2">
                  <Check className="h-5 w-5" />
                  <span className="font-medium">Données extraites du PDF</span>
                  {pdfConfidence != null && (
                    <Badge variant="secondary" className="ml-2">
                      Confiance : {Math.round(pdfConfidence * 100)}%
                    </Badge>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                  onClick={() => setShowResetDialog(true)}
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Réinitialiser
                </Button>
              </div>
            )}

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              {pdfUploading ? (
                <div className="flex flex-col items-center gap-4 py-4">
                  <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-semibold">Analyse IA du contrat en cours...</p>
                    <p className="text-xs text-muted-foreground">
                      Extraction du numéro, souscripteur, assureur, garanties et baremes
                    </p>
                    <p className="text-xs text-amber-600 font-medium mt-2">
                      Cette operation peut prendre 30 a 60 secondes selon la taille du PDF
                    </p>
                  </div>
                  <div className="w-48 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full animate-pulse" style={{ width: '60%' }} />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                    <FileText className="h-7 w-7 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium">
                      Glissez-deposez un PDF de contrat ici
                    </p>
                    <p className="text-sm text-muted-foreground">
                      ou cliquez pour selectionner un fichier
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={onFileSelect}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Contract Info */}
        <Card>
          <CardHeader>
            <CardTitle>Informations du contrat</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Row 1: Contract number + Status + Category */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="contract_number">Numéro de contrat *</Label>
                <Input
                  id="contract_number"
                  {...register('contract_number')}
                  placeholder="Ex: 2026 701 000 08"
                />
                {errors.contract_number && (
                  <p className="text-xs text-destructive">{errors.contract_number.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Statut</Label>
                <Select
                  value={watch('status') || 'draft'}
                  onValueChange={(val) => setValue('status', val)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Brouillon</SelectItem>
                    <SelectItem value="active">Actif</SelectItem>
                    <SelectItem value="suspended">Suspendu</SelectItem>
                    <SelectItem value="expired">Expire</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Catégorie</Label>
                <Input
                  id="category"
                  {...register('category')}
                  placeholder="Ex: standard, premium"
                />
              </div>
            </div>

            {/* Row 2: Assureur + Intermediaire + Code */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Assureur</Label>
                <Select
                  value={watch('insurer_id') || undefined}
                  onValueChange={(val) => setValue('insurer_id', val)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionner un assureur" />
                  </SelectTrigger>
                  <SelectContent>
                    {(insurers || []).map((ins) => (
                      <SelectItem key={ins.id} value={ins.id}>
                        {ins.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {watch('insurer_name_extracted') && !watch('insurer_id') && (
                  <p className="text-xs text-amber-600">
                    Extrait du PDF: {watch('insurer_name_extracted')}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="intermediary_name">Intermédiaire</Label>
                <Input
                  id="intermediary_name"
                  {...register('intermediary_name')}
                  placeholder="Nom de l'intermediaire"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="intermediary_code">Code intermediaire</Label>
                <Input
                  id="intermediary_code"
                  {...register('intermediary_code')}
                  placeholder="Ex: 111"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Souscripteur */}
        <Card>
          <CardHeader>
            <CardTitle>{contractType === 'individual' ? 'Adhérent' : 'Souscripteur'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {contractType === 'individual' ? (
              <>
                {/* Adherent search for individual contracts */}
                <div className="space-y-2">
                  <Label>Rechercher un adhérent *</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      value={adherentSearch}
                      onChange={(e) => setAdherentSearch(e.target.value)}
                      placeholder="Nom, prénom ou matricule..."
                      className="pl-9"
                    />
                  </div>
                  {adherentSearch.length >= 2 && adherentResults && adherentResults.length > 0 && !selectedAdherent && (
                    <div className="rounded-md border bg-white shadow-md max-h-48 overflow-y-auto">
                      {adherentResults.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-b-0"
                          onClick={() => {
                            setValue('adherent_id', a.id);
                            setSelectedAdherent(a);
                            setAdherentSearch('');
                          }}
                        >
                          <span className="font-medium">{a.prenom} {a.nom}</span>
                          {a.matricule && <span className="text-gray-500 ml-2">({a.matricule})</span>}
                        </button>
                      ))}
                    </div>
                  )}
                  {adherentSearch.length >= 2 && adherentResults && adherentResults.length === 0 && (
                    <p className="text-xs text-gray-500">Aucun adhérent trouvé</p>
                  )}
                </div>
                {selectedAdherent && (
                  <div className="flex items-center justify-between rounded-lg bg-blue-50 border border-blue-200 p-3">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-900">
                        {selectedAdherent.prenom} {selectedAdherent.nom}
                      </span>
                      {selectedAdherent.matricule && (
                        <Badge variant="secondary" className="text-xs">{selectedAdherent.matricule}</Badge>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setSelectedAdherent(null);
                        setValue('adherent_id', '');
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Company selector for group contracts */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Société *</Label>
                    <Select
                      value={watch('company_id') || undefined}
                      onValueChange={(val) => setValue('company_id', val)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Sélectionner une société" />
                      </SelectTrigger>
                      <SelectContent>
                        {(companies || []).filter((c) => c.id !== '__INDIVIDUAL__').map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {watch('company_name_extracted') && !watch('company_id') && (
                      <p className="text-xs text-amber-600">
                        Extrait du PDF: {watch('company_name_extracted')}
                      </p>
                    )}
                    {errors.company_id && (
                      <p className="text-xs text-destructive">{errors.company_id.message}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="matricule_fiscale">Matricule fiscale</Label>
                    <Input
                      id="matricule_fiscale"
                      {...register('matricule_fiscale')}
                      placeholder="Ex: 0002788H"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_address">Adresse du souscripteur</Label>
                  <Input
                    id="company_address"
                    {...register('company_address')}
                    placeholder="Ex: Rue Mohieddine ElKlibi El Manar 2, Tunis 2092"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Dates et Plafonds */}
        <Card>
          <CardHeader>
            <CardTitle>Dates et plafonds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="effective_date">Date d'effet *</Label>
                <Input id="effective_date" type="date" {...register('effective_date')} />
                {errors.effective_date && (
                  <p className="text-xs text-destructive">{errors.effective_date.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiry_date">Echeance annuelle</Label>
                <Input id="expiry_date" type="date" {...register('expiry_date')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="global_ceiling">Plafond global annuel (DT)</Label>
                <Input
                  id="global_ceiling"
                  type="number"
                  min="0"
                  {...register('global_ceiling', { valueAsNumber: true })}
                  placeholder="Ex: 6000"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Bénéficiaires et Risques */}
        <Card>
          <CardHeader>
            <CardTitle>Bénéficiaires et risques garantis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Risques garantis */}
            <div className="space-y-2">
              <Label>Risques garantis</Label>
              <div className="flex flex-wrap gap-2">
                {COVERED_RISKS_OPTIONS.map((risk) => {
                  const isSelected = watchedCoveredRisks.includes(risk);
                  return (
                    <button
                      key={risk}
                      type="button"
                      onClick={() => toggleRisk(risk)}
                      className={`rounded-full px-3 py-1.5 text-sm font-medium border transition-colors ${
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-foreground border-input hover:bg-muted'
                      }`}
                    >
                      {isSelected && <Check className="mr-1 inline h-3 w-3" />}
                      {risk}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bénéficiaires toggles */}
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={watch('covers_spouse') ?? true}
                  onCheckedChange={(checked) => setValue('covers_spouse', checked, { shouldDirty: true })}
                />
                <Label className="text-sm">Conjoint couvert</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={watch('covers_children') ?? true}
                  onCheckedChange={(checked) => setValue('covers_children', checked, { shouldDirty: true })}
                />
                <Label className="text-sm">Enfants couverts</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={watch('covers_disabled_children') ?? true}
                  onCheckedChange={(checked) => setValue('covers_disabled_children', checked, { shouldDirty: true })}
                />
                <Label className="text-sm">Enfants handicapes (sans limite)</Label>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label>Age max enfants</Label>
                <Input
                  type="number"
                  min="0"
                  {...register('children_max_age', { valueAsNumber: true })}
                  placeholder="Ex: 20"
                />
              </div>
              <div className="space-y-2">
                <Label>Age max etudiants</Label>
                <Input
                  type="number"
                  min="0"
                  {...register('children_student_max_age', { valueAsNumber: true })}
                  placeholder="Ex: 28"
                />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch
                  checked={watch('covers_retirees') ?? false}
                  onCheckedChange={(checked) => setValue('covers_retirees', checked, { shouldDirty: true })}
                />
                <Label className="text-sm">Personnel retraite couvert</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Guarantees */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Garanties ({fields.length})</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addGuarantee}>
                <Plus className="mr-2 h-4 w-4" />
                Ajouter une garantie
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {fields.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                Aucune garantie ajoutee. Cliquez sur &quot;Ajouter une garantie&quot; ou importez un PDF.
              </div>
            )}

            {fields.map((field, index) => {
              const isExpanded = expandedGuarantees[index] ?? false;
              const careTypeValue = watch(`guarantees.${index}.care_type`);
              const careTypeLabel =
                CARE_TYPES.find((ct) => ct.value === careTypeValue)?.label || careTypeValue || `Garantie ${index + 1}`;

              return (
                <div key={field.id} className="rounded-lg border bg-card">
                  {/* Guarantee header */}
                  <div
                    className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => toggleGuarantee(index)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {index + 1}
                      </span>
                      <div>
                        <p className="font-medium text-sm">{careTypeLabel}</p>
                        {watch(`guarantees.${index}.rate`) != null && (
                          <p className="text-xs text-muted-foreground">
                            Taux: {watch(`guarantees.${index}.rate`)}%
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          remove(index);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Guarantee body */}
                  {isExpanded && (
                    <div className="border-t px-4 py-4 space-y-4">
                      {/* Row 1: Care type + label */}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Type de soin *</Label>
                          <Select
                            value={careTypeValue || undefined}
                            onValueChange={(val) => {
                              setValue(`guarantees.${index}.care_type`, val);

                              // Auto-label
                              const label =
                                CARE_TYPES.find((ct) => ct.value === val)
                                  ?.label || "";
                              setValue(`guarantees.${index}.label`, label);

                              // Auto-populate letter keys
                              const defaultKeys =
                                DEFAULT_LETTER_KEYS[val] || [];
                              setValue(
                                `guarantees.${index}.letter_keys`,
                                defaultKeys,
                              );

                              // Auto-populate ceilings and options
                              const defaults = DEFAULT_CEILINGS[val];
                              if (defaults) {
                                if (defaults.rate != null)
                                  setValue(
                                    `guarantees.${index}.rate`,
                                    defaults.rate,
                                  );
                                if (defaults.annual_ceiling != null)
                                  setValue(
                                    `guarantees.${index}.annual_ceiling`,
                                    defaults.annual_ceiling,
                                  );
                                if (defaults.per_act_ceiling != null)
                                  setValue(
                                    `guarantees.${index}.per_act_ceiling`,
                                    defaults.per_act_ceiling,
                                  );
                                if (defaults.per_day_ceiling != null)
                                  setValue(
                                    `guarantees.${index}.per_day_ceiling`,
                                    defaults.per_day_ceiling,
                                  );
                                if (defaults.conditions)
                                  setValue(
                                    `guarantees.${index}.conditions`,
                                    defaults.conditions,
                                  );
                                if (defaults.requires_prescription)
                                  setValue(
                                    `guarantees.${index}.requires_prescription`,
                                    defaults.requires_prescription,
                                  );
                                if (defaults.requires_cnam_complement)
                                  setValue(
                                    `guarantees.${index}.requires_cnam_complement`,
                                    defaults.requires_cnam_complement,
                                  );
                              }
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Sélectionner" />
                            </SelectTrigger>
                            <SelectContent>
                              {CARE_TYPES.map((ct) => (
                                <SelectItem key={ct.value} value={ct.value}>
                                  {ct.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {errors.guarantees?.[index]?.care_type && (
                            <p className="text-xs text-destructive">
                              {errors.guarantees[index]?.care_type?.message}
                            </p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label>Libelle</Label>
                          <Input
                            {...register(`guarantees.${index}.label`)}
                            placeholder="Libelle personnalise"
                          />
                        </div>
                      </div>

                      {/* Row 2: Rate + ceilings */}
                      <div className="grid gap-4 sm:grid-cols-4">
                        <div className="space-y-2">
                          <Label>Taux (%)</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            {...register(`guarantees.${index}.rate`, {
                              valueAsNumber: true,
                            })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Plafond annuel (millimes)</Label>
                          <Input
                            type="number"
                            min="0"
                            {...register(`guarantees.${index}.annual_ceiling`, {
                              valueAsNumber: true,
                            })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Plafond/acte (millimes)</Label>
                          <Input
                            type="number"
                            min="0"
                            {...register(
                              `guarantees.${index}.per_act_ceiling`,
                              {
                                valueAsNumber: true,
                              },
                            )}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Plafond/jour (millimes)</Label>
                          <Input
                            type="number"
                            min="0"
                            {...register(
                              `guarantees.${index}.per_day_ceiling`,
                              {
                                valueAsNumber: true,
                              },
                            )}
                          />
                        </div>
                      </div>

                      {/* Row 3: Letter keys */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Cles lettres</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const current =
                                watch(`guarantees.${index}.letter_keys`) || [];
                              setValue(`guarantees.${index}.letter_keys`, [
                                ...current,
                                { key: "", value: 0 },
                              ]);
                            }}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            Ajouter
                          </Button>
                        </div>
                        {(watch(`guarantees.${index}.letter_keys`) || []).map(
                          (_, lkIdx) => (
                            <div
                              key={lkIdx}
                              className="flex items-center gap-2"
                            >
                              <Input
                                placeholder="Cle (ex: C, CS, V)"
                                {...register(
                                  `guarantees.${index}.letter_keys.${lkIdx}.key`,
                                )}
                                className="w-32"
                              />
                              <Input
                                type="float"
                                min="0"
                                placeholder="Valeur"
                                {...register(
                                  `guarantees.${index}.letter_keys.${lkIdx}.value`,
                                  {
                                    valueAsNumber: true,
                                  },
                                )}
                                className="w-32"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  const current =
                                    watch(`guarantees.${index}.letter_keys`) ||
                                    [];
                                  setValue(
                                    `guarantees.${index}.letter_keys`,
                                    current.filter((_, i) => i !== lkIdx),
                                  );
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ),
                        )}
                      </div>

                      {/* Row 4: Sub-limits */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>Sous-plafonds</Label>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const current =
                                watch(`guarantees.${index}.sub_limits`) || [];
                              setValue(`guarantees.${index}.sub_limits`, [
                                ...current,
                                { key: "", value: 0 },
                              ]);
                            }}
                          >
                            <Plus className="mr-1 h-3 w-3" />
                            Ajouter
                          </Button>
                        </div>
                        {(watch(`guarantees.${index}.sub_limits`) || []).map(
                          (_, slIdx) => (
                            <div
                              key={slIdx}
                              className="flex items-center gap-2"
                            >
                              <Input
                                placeholder="Description"
                                {...register(
                                  `guarantees.${index}.sub_limits.${slIdx}.key`,
                                )}
                                className="flex-1"
                              />
                              <Input
                                type="number"
                                min="0"
                                placeholder="Montant"
                                {...register(
                                  `guarantees.${index}.sub_limits.${slIdx}.value`,
                                  {
                                    valueAsNumber: true,
                                  },
                                )}
                                className="w-32"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  const current =
                                    watch(`guarantees.${index}.sub_limits`) ||
                                    [];
                                  setValue(
                                    `guarantees.${index}.sub_limits`,
                                    current.filter((_, i) => i !== slIdx),
                                  );
                                }}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ),
                        )}
                      </div>

                      {/* Row 5: Conditions + options */}
                      <div className="space-y-2">
                        <Label>Conditions</Label>
                        <Input
                          {...register(`guarantees.${index}.conditions`)}
                          placeholder="Conditions particulieres..."
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-4">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={
                              watch(
                                `guarantees.${index}.requires_prescription`,
                              ) || false
                            }
                            onCheckedChange={(checked) =>
                              setValue(
                                `guarantees.${index}.requires_prescription`,
                                checked,
                                { shouldDirty: true },
                              )
                            }
                          />
                          <Label className="text-sm">Ordonnance requise</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={
                              watch(
                                `guarantees.${index}.requires_cnam_complement`,
                              ) || false
                            }
                            onCheckedChange={(checked) =>
                              setValue(
                                `guarantees.${index}.requires_cnam_complement`,
                                checked,
                                { shouldDirty: true },
                              )
                            }
                          />
                          <Label className="text-sm">Complement CNAM</Label>
                        </div>
                        <div className="space-y-2">
                          <Label>Période renouvellement</Label>
                          <Select
                            value={
                              watch(`guarantees.${index}.renewal_period`) ||
                              undefined
                            }
                            onValueChange={(val) =>
                              setValue(
                                `guarantees.${index}.renewal_period`,
                                val,
                              )
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Sélectionner" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="annual">Annuel</SelectItem>
                              <SelectItem value="biennial">
                                Bisannuel
                              </SelectItem>
                              <SelectItem value="triennial">
                                Triennal
                              </SelectItem>
                              <SelectItem value="per_event">
                                Par evenement
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Limite d'age</Label>
                          <Input
                            type="number"
                            min="0"
                            {...register(`guarantees.${index}.age_limit`, {
                              valueAsNumber: true,
                            })}
                            placeholder="Ex: 18"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/group-contracts')}>
            Annuler
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Enregistrement...' : isEditing ? 'Enregistrer' : 'Créer le contrat'}
          </Button>
        </div>
      </form>

      {/* Reset confirmation dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Réinitialiser le formulaire ?</AlertDialogTitle>
            <AlertDialogDescription>
              Voulez-vous reinitialiser tous les champs du formulaire ? Toutes les donnees
              saisies et extraites du PDF (garanties, informations du contrat, beneficiaires)
              seront supprimees.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Non, conserver</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetAll}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Oui, reinitialiser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default GroupContractFormPage;
