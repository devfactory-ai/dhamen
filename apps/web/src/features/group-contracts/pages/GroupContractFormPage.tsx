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
import { InfoTooltip } from '@/components/ui/info-tooltip';
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
import { usePermissions } from '@/hooks/usePermissions';

// ---- Care types ----

// Remplacer CARE_TYPES existant par :
const CARE_TYPES = [
  { value: 'consultation_visite',     label: '1 - Soins Médicaux (Consultations & Visites)' },
  { value: 'pharmacie',               label: '2 - Frais Pharmaceutiques' },
  { value: 'laboratoire',             label: '3 - Analyses & Laboratoire' },
  { value: 'optique',                 label: '4 - Optique' },
  { value: 'chirurgie_refractive',    label: '5 - Chirurgie Réfractive (Laser)' },
  { value: 'actes_courants',          label: '6a - Actes Médicaux Courants' },
  { value: 'actes_specialistes',      label: '6b - Actes Spécialistes & Pratique Médicale Courante' },
  { value: 'transport',               label: '7 - Transport du Malade' },
  { value: 'chirurgie',               label: '8 - Frais Chirurgicaux' },
  { value: 'orthopedie',              label: '9 - Orthopédie & Prothèses (non dentaires)' },
  { value: 'hospitalisation',         label: '10 - Hospitalisation' },
  { value: 'accouchement',            label: '11 - Maternité (Accouchement & Grossesse)' },
  { value: 'dentaire',                label: '13 - Soins & Prothèses Dentaires' },
  { value: 'orthodontie',             label: '14 - Soins Orthodontiques (< 20 ans)' },
  { value: 'circoncision',            label: '15 - Circoncision' },
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
// Sub-items par défaut par care_type (lettres clés + sous-plafonds unifiés)
type SubItemFormRow = {
  key: string;
  mode: 'cle' | 'taux';
  lettre_value?: number | null;
  taux?: number | null;
  plafond?: number | null;
  max_jours?: number | null;
};
const DEFAULT_SUB_ITEMS: Record<string, SubItemFormRow[]> = {
  consultation_visite: [
    { key: 'C1', mode: 'cle', lettre_value: 45000 },
    { key: 'C2', mode: 'cle', lettre_value: 55000 },
    { key: 'C3', mode: 'cle', lettre_value: 55000 },
    { key: 'V1', mode: 'cle', lettre_value: 50000 },
    { key: 'V2', mode: 'cle', lettre_value: 55000 },
    { key: 'V3', mode: 'cle', lettre_value: 55000 },
  ],
  laboratoire: [
    { key: 'B', mode: 'cle', lettre_value: 320 },
    { key: 'P', mode: 'cle', lettre_value: 320 },
  ],
  actes_courants: [
    { key: 'PC',  mode: 'cle', lettre_value: 1500 },
    { key: 'AM',  mode: 'cle', lettre_value: 1750 },
    { key: 'AMM', mode: 'cle', lettre_value: 1750 },
    { key: 'AMO', mode: 'cle', lettre_value: 1750 },
    { key: 'AMY', mode: 'cle', lettre_value: 1750 },
  ],
  actes_specialistes: [
    { key: 'Z',   mode: 'cle', lettre_value: 2000 },
    { key: 'E',   mode: 'cle', lettre_value: 7000 },
    { key: 'K',   mode: 'cle', lettre_value: 1500 },
  ],
  chirurgie: [
    { key: 'KC', mode: 'cle', lettre_value: 10000 },
  ],
  hospitalisation: [
    { key: 'Clinique', mode: 'taux', taux: 100, plafond: 0, max_jours: null },
    { key: 'Hopital', mode: 'taux', taux: 100, plafond: 0, max_jours: null },
    { key: 'Sanatorium', mode: 'taux', taux: 100, plafond: 0, max_jours: 21 },
  ],
  optique: [
    { key: 'Monture', mode: 'taux', taux: 100, plafond: 0 },
    { key: 'Verres', mode: 'taux', taux: 100, plafond: 0 },
    { key: 'Doubles foyers', mode: 'taux', taux: 100, plafond: 0 },
    { key: 'Lentilles', mode: 'taux', taux: 100, plafond: 0 },
  ],
  chirurgie_refractive: [
    { key: 'Chirurgie refractive', mode: 'taux', taux: 100, plafond: 0 },
  ],
  pharmacie: [
    { key: 'Ordinaire', mode: 'taux', taux: 90, plafond: 0 },
    { key: 'Chronique', mode: 'taux', taux: 90, plafond: 0 },
  ],
  accouchement: [
    { key: 'ACC', mode: 'taux', taux: 100, plafond: 0 },
    { key: 'ACC_GEM', mode: 'taux', taux: 100, plafond: 0 },
    { key: 'IG', mode: 'taux', taux: 100, plafond: 0 },
  ],
  dentaire: [
    { key: 'DC', mode: 'cle', lettre_value: 3000, plafond: 600000 },
    { key: 'DP', mode: 'cle', lettre_value: 4000, plafond: 700000 },
  ],
};

const DEFAULT_CEILINGS: Record<string, {
  rate?: number;
  max_days?: number;
  conditions?: string;
  requires_prescription?: boolean;
  requires_cnam_complement?: boolean;
}> = {
  consultation_visite:    { rate: 100 },
  pharmacie:              { rate: 90,  requires_prescription: true },
  laboratoire:            { rate: 100, requires_prescription: true },
  optique:                { rate: 100 },
  chirurgie_refractive:   { rate: 100 },
  actes_courants:         { rate: 90 },
  actes_specialistes:     { rate: 90 },
  transport:              { rate: 100, requires_prescription: true },
  chirurgie:              { rate: 80,  requires_cnam_complement: true },
  orthopedie:             { rate: 100, requires_prescription: true },
  hospitalisation:        { rate: 100, requires_cnam_complement: true },
  accouchement:           { rate: 100 },
  dentaire:               { rate: 80 },
  orthodontie:            { rate: 80,
                            conditions: 'Pour les enfants de moins de 20 ans' },
  circoncision:           { rate: 100 },
  sanatorium:             { rate: 100, max_days: 21,
                            conditions: 'Maximum 21 jours. Après prise en charge CNAM',
                            requires_cnam_complement: true },
  cures_thermales:        { rate: 100, max_days: 21,
                            conditions: 'Maximum 21 jours. Prescrit par spécialiste. Après CNAM',
                            requires_prescription: true, requires_cnam_complement: true },
  frais_funeraires:       { rate: 100 },
};

/** Plafond label selon care_type — utilisé dans l'UI pour le header de colonne */
function plafondLabel(careType: string): string {
  if (careType === 'hospitalisation') return 'Plafond/jour (mill.)';
  if (careType === 'pharmacie') return 'Plafond annuel (mill.)';
  return 'Plafond/acte (mill.)';
}

// ---- Schemas ----

const subItemSchema = z.object({
  key: z.string().min(1),
  mode: z.enum(['cle', 'taux']),
  lettre_value: z.preprocess(v => (typeof v === 'number' && Number.isNaN(v) ? null : v), z.number().min(0).nullable().optional()),
  taux: z.preprocess(v => (typeof v === 'number' && Number.isNaN(v) ? null : v), z.number().min(0).max(100).nullable().optional()),
  plafond: z.preprocess(v => (typeof v === 'number' && Number.isNaN(v) ? null : v), z.number().min(0).nullable().optional()),
  max_jours: z.preprocess(v => (typeof v === 'number' && Number.isNaN(v) ? null : v), z.number().int().min(1).nullable().optional()),
});

const nanToNull = z.preprocess(
  (v) => (typeof v === 'number' && Number.isNaN(v) ? null : v),
  z.number().min(0).nullable().optional(),
);

const guaranteeSchema = z.object({
  care_type: z.string().min(1, 'Type de soin requis'),
  label: z.string().optional(),
  rate: nanToNull,
  annual_ceiling: nanToNull,
  per_act_ceiling: nanToNull,
  per_day_ceiling: nanToNull,
  max_days: z.preprocess(
    (v) => (typeof v === 'number' && Number.isNaN(v) ? null : v),
    z.number().int().min(1).nullable().optional(),
  ),
  sub_items: z.array(subItemSchema).optional(),
  conditions: z.string().optional(),
  requires_prescription: z.boolean().optional(),
  requires_cnam_complement: z.boolean().optional(),
  renewal_period: z.string().optional(),
  age_limit: nanToNull,
});

const formSchema = z.object({
  contract_type: z.enum(['group', 'individual']).default('group'),
  contract_number: z.string().min(1, 'Numéro de contrat requis'),
  company_id: z.string().optional(),
  adherent_id: z.string().optional(),
  company_name_extracted: z.string().optional(),
  company_address: z.string().optional(),
  matricule_fiscale: z.string().optional(),
  insurer_id: z.string().min(1, 'Assureur requis'),
  insurer_name_extracted: z.string().optional(),
  intermediary_name: z.string().optional(),
  intermediary_code: z.string().optional(),
  effective_date: z.string().min(1, 'Date d\'effet requise'),
  expiry_date: z.string().optional(),
  global_ceiling: nanToNull,
  carence_days: nanToNull,
  covered_risks: z.array(z.string()).optional(),
  covers_spouse: z.boolean().optional(),
  covers_children: z.boolean().optional(),
  children_max_age: nanToNull,
  children_student_max_age: nanToNull,
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
  contract_type?: string;
  company_id: string;
  insurer_id: string | null;
  // API returns raw DB column names
  intermediary_name: string | null;
  intermediary_code: string | null;
  effective_date: string;
  annual_renewal_date: string | null;
  end_date: string | null;
  annual_global_limit: number | null;
  carence_days: number | null;
  risk_illness: number;
  risk_disability: number;
  risk_death: number;
  covers_spouse: number;
  covers_children: number;
  children_max_age: number | null;
  children_student_max_age: number | null;
  covers_disabled_children: number;
  covers_retirees: number;
  plan_category: string | null;
  status: string;
  company_address: string | null;
  matricule_fiscale: string | null;
  adherent_id: string | null;
  notes: string | null;
  guarantees: Array<{
    id: string;
    care_type: string;
    label: string;
    reimbursement_rate: number | null;
    annual_limit: number | null;
    per_event_limit: number | null;
    daily_limit: number | null;
    max_days: number | null;
    letter_keys_json: string | null;
    sub_limits_json: string | null;
    conditions_text: string | null;
    requires_prescription: number;
    requires_cnam_complement: number;
    renewal_period_months: number | null;
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
  // Object form (from multi-pass extraction)
  letterKeys?: Record<string, number> | null;
  subLimits?: Record<string, number> | null;
  // String form (fallback if backend serializes early)
  letterKeysJson?: string | null;
  subLimitsJson?: string | null;
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

/** Clamp a date on blur: if < minDate → clear, if > maxDate → maxDate */
function clampDateValue(value: string, minDate: string, maxDate?: string): string {
  if (!value) return value;
  if (value < minDate) return "";
  if (maxDate && value > maxDate) return maxDate;
  return value;
}

export function GroupContractFormPage() {
  const { hasPermission } = usePermissions();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!id;
  const canCreate = hasPermission('contracts', 'create');
  const canUpdate = hasPermission('contracts', 'update');

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
    formState: { errors, isValid },
  } = useForm<FormData>({
    mode: 'onChange',
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
      carence_days: null,
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
      console.log("reponse", response);
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

  // Populate form when editing — wait for contract + insurers + companies
  useEffect(() => {
    if (existingContract && insurers && companies) {
      // Build covered_risks array from individual boolean columns
      const coveredRisks: string[] = [];
      if (existingContract.risk_illness) coveredRisks.push('Maladie');
      if (existingContract.risk_disability) coveredRisks.push('Invalidité');
      if (existingContract.risk_death) coveredRisks.push('Décès');

      const contractType = existingContract.contract_type === 'individual'
        ? 'individual' as const
        : 'group' as const;

      const insurerId = existingContract.insurer_id || '';
      const companyId = existingContract.company_id || '';

      // Parse guarantee JSON fields
      const parseJson = (val: string | null): Record<string, number> | null => {
        if (!val) return null;
        try { return JSON.parse(val); } catch { return null; }
      };

      reset({
        contract_type: contractType,
        contract_number: existingContract.contract_number,
        company_id: companyId,
        insurer_id: insurerId,
        company_address: existingContract.company_address || '',
        matricule_fiscale: existingContract.matricule_fiscale || '',
        intermediary_name: existingContract.intermediary_name || '',
        intermediary_code: existingContract.intermediary_code || '',
        effective_date: existingContract.effective_date || '',
        expiry_date: existingContract.annual_renewal_date || '',
        global_ceiling: existingContract.annual_global_limit != null ? existingContract.annual_global_limit / 1000 : null,
        carence_days: existingContract.carence_days ?? null,
        covered_risks: coveredRisks,
        category: existingContract.plan_category || 'standard',
        status: existingContract.status,
        covers_spouse: !!existingContract.covers_spouse,
        covers_children: !!existingContract.covers_children,
        children_max_age: existingContract.children_max_age ?? 20,
        children_student_max_age: existingContract.children_student_max_age ?? 28,
        covers_disabled_children: !!existingContract.covers_disabled_children,
        covers_retirees: !!existingContract.covers_retirees,
        guarantees: existingContract.guarantees.map((g) => ({
          care_type: g.care_type,
          label: g.label || '',
          rate: g.reimbursement_rate != null ? Math.round(g.reimbursement_rate * 100) : null,
          annual_ceiling: g.annual_limit,
          per_act_ceiling: g.per_event_limit,
          per_day_ceiling: g.daily_limit,
          max_days: g.max_days,
          sub_items: (() => {
            const items: SubItemFormRow[] = [];
            const parentRatePct = g.reimbursement_rate != null ? Math.round(g.reimbursement_rate * 100) : 100;
            // 1. Letter keys → mode 'cle'
            if (g.letter_keys_json) {
              const lks = parseJson(g.letter_keys_json) || {};
              for (const [key, value] of Object.entries(lks)) {
                items.push({ key, mode: 'cle', lettre_value: Number(value) });
              }
            }
            // 2. Sub-limits → mode 'taux', or merge plafond into existing 'cle' item
            if (g.sub_limits_json) {
              for (const [key, val] of Object.entries(parseJson(g.sub_limits_json) || {})) {
                const normalizedKey = key
                  .replace(/\s*\(par jour\)/i, '')
                  .replace(/^Hôpital$/i, 'Hopital')
                  .replace(/^hôpital$/i, 'Hopital');
                const plafondVal = typeof val === 'number' ? val
                  : (val as { plafond_acte?: number; plafond_jour?: number; plafond_annuel?: number }).plafond_acte
                    ?? (val as { plafond_jour?: number }).plafond_jour
                    ?? (val as { plafond_annuel?: number }).plafond_annuel
                    ?? null;
                const tauxVal = typeof val === 'object' && val !== null && (val as { taux?: number }).taux != null
                  ? Math.round((val as { taux: number }).taux * 100)
                  : null;
                const maxJoursVal = typeof val === 'object' && val !== null ? (val as { max_jours?: number }).max_jours ?? null : null;
                // Merge into existing 'cle' item if same key (e.g. DC/DP with both lettre_value and plafond)
                const existingCle = items.find(it => it.key.toUpperCase() === normalizedKey.toUpperCase() && it.mode === 'cle');
                if (existingCle) {
                  existingCle.plafond = plafondVal;
                  if (tauxVal != null) existingCle.taux = tauxVal;
                } else {
                  items.push({ key: normalizedKey, mode: 'taux', taux: tauxVal ?? parentRatePct, plafond: plafondVal, max_jours: maxJoursVal });
                }
              }
            }
            // 3. Ensure defaults exist (add missing keys)
            const defaults = DEFAULT_SUB_ITEMS[g.care_type] || [];
            const existingKeys = new Set(items.map((it) => it.key.toLowerCase()));
            for (const def of defaults) {
              if (!existingKeys.has(def.key.toLowerCase())) {
                items.push({ ...def, taux: def.taux ?? parentRatePct });
              }
            }
            return items;
          })(),
          conditions: g.conditions_text || '',
          requires_prescription: g.requires_prescription === 1,
          requires_cnam_complement: g.requires_cnam_complement === 1,
          renewal_period: g.renewal_period_months === 12 ? 'annual'
            : g.renewal_period_months === 24 ? 'biennial'
            : g.renewal_period_months === 36 ? 'triennial'
            : '',
          age_limit: g.age_limit,
        })),
      });

      // Explicitly set select values after reset to ensure Radix UI picks them up
      setTimeout(() => {
        if (insurerId) setValue('insurer_id', insurerId, { shouldValidate: true });
        if (companyId) setValue('company_id', companyId, { shouldValidate: true });
      }, 0);
    }
  }, [existingContract, insurers, companies, reset, setValue]);

  // Set contract type from URL on mount (new contracts only)
  useEffect(() => {
    if (!isEditing) {
      setValue('contract_type', urlContractType as 'group' | 'individual');
    }
  }, [urlContractType, isEditing, setValue]);

  // Auto-select BH Assurance as default insurer when insurers load
  const currentInsurerId = watch('insurer_id');
  useEffect(() => {
    if (!isEditing && insurers && insurers.length > 0 && !currentInsurerId) {
      const bh = insurers.find((ins) => ins.name.toLowerCase().includes('bh'));
      if (bh) {
        setValue('insurer_id', bh.id);
      } else if (insurers.length === 1) {
        setValue('insurer_id', insurers[0]!.id);
      }
    }
  }, [insurers, isEditing, currentInsurerId, setValue]);

  // ---- PDF Upload ----
const handlePdfUpload = useCallback(
  async (file: File) => {
    if (!file || file.type !== "application/pdf") {
      toast({
        title: "Veuillez selectionner un fichier PDF",
        variant: "destructive",
      });
      return;
    }

    setPdfUploading(true);
    setPdfExtracted(false);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await apiClient.upload<PdfAnalyseResponse>(
        "/group-contracts/analyse-pdf",
        formData,
        { timeout: 120000 },
      );

      if (!response.success) {
        throw new Error(
          response.error?.message || "Erreur lors de l'analyse du PDF",
        );
      }

      const result = response.data;
      if (!result?.extractedData) throw new Error("Aucune donnee extraite");

      const extracted = result.extractedData;

      // Clean spaces from regex extraction artifacts
      const cleanSpaces = (s: string | null | undefined): string =>
        s ? s.replace(/\s+/g, " ").trim() : "";

      // Pre-fill contract header info
      if (extracted.contractNumber)
        setValue("contract_number", extracted.contractNumber);
      if (extracted.companyName)
        setValue("company_name_extracted", cleanSpaces(extracted.companyName));
      if (extracted.companyAddress)
        setValue("company_address", cleanSpaces(extracted.companyAddress));
      if (extracted.matriculeFiscale)
        setValue("matricule_fiscale", extracted.matriculeFiscale);
      if (extracted.insurerName)
        setValue("insurer_name_extracted", cleanSpaces(extracted.insurerName));
      if (extracted.intermediaryName)
        setValue("intermediary_name", cleanSpaces(extracted.intermediaryName));
      if (extracted.intermediaryCode)
        setValue("intermediary_code", extracted.intermediaryCode);
      if (extracted.effectiveDate)
        setValue("effective_date", extracted.effectiveDate);
      if (extracted.annualRenewalDate)
        setValue("expiry_date", extracted.annualRenewalDate);
      if (extracted.annualGlobalLimit != null)
        setValue("global_ceiling", extracted.annualGlobalLimit / 1000);
      if (extracted.planCategory) setValue("category", extracted.planCategory);

      // Beneficiaries
      if (extracted.coversSpouse != null)
        setValue("covers_spouse", extracted.coversSpouse);
      if (extracted.coversChildren != null)
        setValue("covers_children", extracted.coversChildren);
      if (extracted.childrenMaxAge != null)
        setValue("children_max_age", extracted.childrenMaxAge);
      if (extracted.childrenStudentMaxAge != null)
        setValue("children_student_max_age", extracted.childrenStudentMaxAge);
      if (extracted.coversDisabledChildren != null)
        setValue("covers_disabled_children", extracted.coversDisabledChildren);
      if (extracted.coversRetirees != null)
        setValue("covers_retirees", extracted.coversRetirees);

      // Map covered risks from boolean flags
      const risks: string[] = [];
      if (extracted.riskIllness) {
        risks.push("Maladie");
        risks.push("Maternité");
      }
      if (extracted.riskDeath) risks.push("Décès");
      if (extracted.riskDisability) risks.push("Invalidité");
      setValue("covered_risks", risks);

      // Try to match company by name
      if (extracted.companyName && companies) {
        const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "");
        const extractedNorm = normalize(extracted.companyName);
        const matchedCompany = companies.find(
          (co) =>
            normalize(co.name).includes(extractedNorm) ||
            extractedNorm.includes(normalize(co.name)),
        );
        if (matchedCompany) setValue("company_id", matchedCompany.id);
      }

      // Try to match insurer by name
      if (extracted.insurerName && insurers) {
        const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, "");
        const extractedNorm = normalize(extracted.insurerName);
        const matchedInsurer = insurers.find(
          (ins) =>
            normalize(ins.name).includes(extractedNorm) ||
            extractedNorm.includes(normalize(ins.name)),
        );
        if (matchedInsurer) setValue("insurer_id", matchedInsurer.id);
      }

      // Pre-fill guarantees from Gemini extracted data
      const geminiGuarantees = extracted.guarantees || [];

      const CARE_TYPE_ALIASES: Record<string, string> = {
        consultation: "consultation_visite",
        consultation_visite: "consultation_visite",
        consultations_visites: "consultation_visite",
        "soins medicaux": "consultation_visite",
        "soins médicaux": "consultation_visite",
        pharmacy: "pharmacie",
        pharmacie: "pharmacie",
        "frais pharmaceutiques": "pharmacie",
        laboratory: "laboratoire",
        laboratoire: "laboratoire",
        analyses: "laboratoire",
        "analyses et travaux de laboratoire": "laboratoire",
        optical: "optique",
        optique: "optique",
        refractive_surgery: "chirurgie_refractive",
        chirurgie_refractive: "chirurgie_refractive",
        "chirurgie refractive": "chirurgie_refractive",
        medical_acts: "actes_courants",
        actes_courants: "actes_courants",
        "actes medicaux courants": "actes_courants",
        "actes médicaux courants": "actes_courants",
        actes_specialistes: "actes_specialistes",
        "actes specialistes": "actes_specialistes",
        "actes spécialistes": "actes_specialistes",
        "actes de specialistes": "actes_specialistes",
        "actes de spécialistes": "actes_specialistes",
        "actes specialistes et de pratique medicale courante": "actes_specialistes",
        "radiologie electro radiographie physiotherapie": "actes_specialistes",
        transport: "transport",
        "transport du malade": "transport",
        surgery: "chirurgie",
        chirurgie: "chirurgie",
        "frais chirurgicaux": "chirurgie",
        orthopedics: "orthopedie",
        orthopedie: "orthopedie",
        orthopédie: "orthopedie",
        "orthopedie protheses": "orthopedie",
        hospitalization: "hospitalisation",
        hospitalisation: "hospitalisation",
        maternity: "accouchement",
        accouchement: "accouchement",
        ivg: "accouchement",
        interruption_grossesse: "accouchement",
        "interruption involontaire de grossesse": "accouchement",
        maternite: "accouchement",
        "maternité": "accouchement",
        dental: "dentaire",
        dentaire: "dentaire",
        "soins et protheses dentaires": "dentaire",
        "soins et prothèses dentaires": "dentaire",
        orthodontics: "orthodontie",
        orthodontie: "orthodontie",
        "soins orthodontiques": "orthodontie",
        circumcision: "circoncision",
        circoncision: "circoncision",
        sanatorium: "hospitalisation",
        "sanatorium preventorium": "hospitalisation",
        thermal_cure: "cures_thermales",
        cures_thermales: "cures_thermales",
        "cures thermales": "cures_thermales",
        funeral: "frais_funeraires",
        frais_funeraires: "frais_funeraires",
        "frais funeraires": "frais_funeraires",
        "frais funéraires": "frais_funeraires",
      };

      const normalizeCareType = (raw: string): string => {
        const key = raw
          .toLowerCase()
          .trim()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9_ ]/g, "");
        if (CARE_TYPE_ALIASES[key]) return CARE_TYPE_ALIASES[key]!;
        for (const [alias, value] of Object.entries(CARE_TYPE_ALIASES)) {
          if (key.includes(alias) || alias.includes(key)) return value;
        }
        return raw;
      };

      if (geminiGuarantees.length > 0) {
        const mappedGuarantees = geminiGuarantees.map((g) => {
          const ratePercent =
            g.reimbursementRate != null
              ? Math.round(g.reimbursementRate * 100)
              : null;

          let renewalPeriod = "";
          if (g.renewalPeriodMonths) {
            if (g.renewalPeriodMonths <= 12) renewalPeriod = "annual";
            else if (g.renewalPeriodMonths <= 24) renewalPeriod = "biennial";
            else renewalPeriod = "triennial";
          }

          const conditionParts: string[] = [];
          if (g.conditionsText) conditionParts.push(g.conditionsText);
          if (g.exclusionsText)
            conditionParts.push(`Exclusions: ${g.exclusionsText}`);

          const normalizedCareType = normalizeCareType(
            g.careType || g.label || "",
          );

          return {
            care_type: normalizedCareType,
            label:
              g.label ||
              CARE_TYPES.find((ct) => ct.value === normalizedCareType)?.label ||
              "",
            rate: ratePercent,
            annual_ceiling: g.annualLimit != null ? g.annualLimit * 1000 : null,
            per_act_ceiling:
              g.perEventLimit != null ? g.perEventLimit * 1000 : null,
            per_day_ceiling: g.dailyLimit != null ? g.dailyLimit * 1000 : null,
            max_days: g.maxDays ?? null,
            sub_items: (() => {
              const items: SubItemFormRow[] = [];
              // Letter keys from TP upload
              let keys = g.letterKeys;
              if (!keys && g.letterKeysJson) {
                try { keys = JSON.parse(g.letterKeysJson); } catch { keys = null; }
              }
              if (keys) {
                for (const [key, value] of Object.entries(keys)) {
                  items.push({ key, mode: 'cle', lettre_value: Number(value) });
                }
              }
              // Sub-limits from TP upload
              let limits = g.subLimits;
              if (!limits && g.subLimitsJson) {
                try { limits = JSON.parse(g.subLimitsJson); } catch { limits = null; }
              }
              if (limits) {
                for (const [key, value] of Object.entries(limits)) {
                  items.push({ key, mode: 'taux', taux: ratePercent ?? 100, plafond: Number(value) });
                }
              }
              // Add defaults for missing keys
              const defaults = DEFAULT_SUB_ITEMS[normalizedCareType] || [];
              const existingKeys = new Set(items.map((it) => it.key.toLowerCase()));
              for (const def of defaults) {
                if (!existingKeys.has(def.key.toLowerCase())) {
                  items.push({ ...def });
                }
              }
              return items;
            })(),
            conditions: conditionParts.join(". "),
            requires_prescription: g.requiresPrescription || false,
            requires_cnam_complement: g.requiresCnamComplement || false,
            renewal_period: renewalPeriod,
            age_limit: g.ageLimit ?? null,
          };
        });

        setValue("guarantees", mappedGuarantees);

        const expanded: Record<number, boolean> = {};
        mappedGuarantees.forEach((_, i) => {
          expanded[i] = true;
        });
        setExpandedGuarantees(expanded);
      }

      const confidenceMap: Record<string, number> = {
        high: 0.9,
        medium: 0.7,
        low: 0.4,
      };
      setPdfConfidence(confidenceMap[result.confidence] ?? 0.5);
      setPdfExtracted(true);

      const guaranteeCount = geminiGuarantees.length;
      toast({
        title: "PDF analysé avec succès",
        description: `${guaranteeCount} garantie${guaranteeCount > 1 ? "s" : ""} extraite${guaranteeCount > 1 ? "s" : ""} automatiquement`,
        variant: "success",
      });
      if (result.errors && result.errors.length > 0) {
        toast({
          title: "Avertissements",
          description: result.errors.join(" | "),
          variant: "destructive",
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      toast({
        title: "Erreur d'analyse PDF",
        description: message,
        variant: "destructive",
      });
    } finally {
      setPdfUploading(false);
    }
  },
  [setValue, toast, companies, insurers],
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
        annualGlobalLimit: data.global_ceiling ? data.global_ceiling * 1000 : undefined,
        carenceDays: data.carence_days ?? 0,
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
          maxDays: g.max_days ?? undefined,
          letterKeysJson: (() => {
            const cleItems = (g.sub_items || []).filter((si) => si.mode === 'cle' && si.key && si.lettre_value != null);
            return cleItems.length > 0
              ? JSON.stringify(Object.fromEntries(cleItems.map((si) => [si.key, si.lettre_value])))
              : undefined;
          })(),
          subLimitsJson: (() => {
            const tauxItems = (g.sub_items || []).filter((si) => si.mode === 'taux' && si.key);
            // Also include 'cle' items that have a plafond (e.g. DC/DP dentaire with plafond_acte)
            const cleWithPlafond = (g.sub_items || []).filter((si) => si.mode === 'cle' && si.key && si.plafond != null && si.plafond > 0);
            const allSubLimitItems = [...tauxItems, ...cleWithPlafond];
            if (allSubLimitItems.length === 0) return undefined;
            const plafondKey = g.care_type === 'hospitalisation' ? 'plafond_jour'
              : g.care_type === 'pharmacie' ? 'plafond_annuel'
              : 'plafond_acte';
            return JSON.stringify(Object.fromEntries(
              allSubLimitItems.map((si) => {
                const entry: Record<string, number> = {};
                if (si.taux != null) entry.taux = si.taux / 100;
                if (si.plafond != null) entry[plafondKey] = si.plafond;
                if (si.max_jours != null) entry.max_jours = si.max_jours;
                return [si.key, Object.keys(entry).length > 0 ? entry : (si.plafond ?? 0)];
              })
            ));
          })(),
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

      const response = isEditing
        ? await apiClient.put(`/group-contracts/${id}`, payload)
        : await apiClient.post('/group-contracts', payload);
      if (!response.success) {
        throw new Error(response.error?.message || 'Erreur lors de la sauvegarde');
      }
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group-contracts'] });
      queryClient.invalidateQueries({ queryKey: ['group-contract', id] });
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
      max_days: null,
      sub_items: [],
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

  if ((isEditing && !canUpdate) || (!isEditing && !canCreate)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-lg font-semibold text-gray-900">Accès refusé</p>
        <p className="mt-1 text-sm text-gray-500">Vous n'avez pas la permission de {isEditing ? 'modifier' : 'créer'} un contrat.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-sm text-blue-600 hover:underline">Retour</button>
      </div>
    );
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
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="effective_date">Date d'effet *</Label>
                <Input id="effective_date" type="date" min="2000-01-01" {...register('effective_date', { onBlur: (e: React.FocusEvent<HTMLInputElement>) => { const v = clampDateValue(e.target.value, "2000-01-01"); if (v !== e.target.value) setValue('effective_date', v); } })} />
                {errors.effective_date && (
                  <p className="text-xs text-destructive">{errors.effective_date.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="expiry_date">Echéance annuelle</Label>
                <Input id="expiry_date" type="date" min="2000-01-01" {...register('expiry_date', { onBlur: (e: React.FocusEvent<HTMLInputElement>) => { const v = clampDateValue(e.target.value, "2000-01-01"); if (v !== e.target.value) setValue('expiry_date', v); } })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="global_ceiling">Plafond global annuel (DT)<InfoTooltip text="Plafond maximum de remboursement par adherent et par an. Ce montant couvre l'ensemble des types de soins. Des sous-plafonds par garantie peuvent s'appliquer." /></Label>
                <Input
                  id="global_ceiling"
                  type="number"
                  min="0"
                  {...register('global_ceiling', { valueAsNumber: true })}
                  placeholder="Ex: 6000"
                />
              </div>
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="carence_days">Jours de carence<InfoTooltip text="Nombre de jours apres l'adhesion pendant lesquels les soins ne sont pas encore pris en charge. Permet d'eviter les adhesions opportunistes." /></Label>
                <Input
                  id="carence_days"
                  type="number"
                  min="0"
                  {...register('carence_days', { valueAsNumber: true })}
                  placeholder="Ex: 0"
                />
                <p className="text-xs text-muted-foreground">Délai avant prise en charge</p>
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
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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

            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
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

                              // Auto-populate sub-items (lettres clés + sous-plafonds unifiés)
                              const defaultItems =
                                DEFAULT_SUB_ITEMS[val] || [];
                              setValue(
                                `guarantees.${index}.sub_items`,
                                defaultItems.map((d) => ({ ...d })),
                              );

                              // Auto-populate options
                              const defaults = DEFAULT_CEILINGS[val];
                              if (defaults) {
                                if (defaults.rate != null)
                                  setValue(
                                    `guarantees.${index}.rate`,
                                    defaults.rate,
                                  );
                                if (defaults.max_days != null)
                                  setValue(
                                    `guarantees.${index}.max_days`,
                                    defaults.max_days,
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
                      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
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
                        {careTypeValue !== 'hospitalisation' && (
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
                        )}
                        <div className="space-y-2">
                          <Label>Nbre max jours</Label>
                          <Input
                            type="number"
                            min="1"
                            {...register(
                              `guarantees.${index}.max_days`,
                              {
                                valueAsNumber: true,
                              },
                            )}
                            placeholder="Ex: 21"
                          />
                        </div>
                      </div>

                      {/* Row 3: Sub-items unifié (lettres clés + sous-plafonds) */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label>
                            Éléments de la garantie
                            <InfoTooltip text="Chaque élément peut être en mode Clé lettre (valeur unitaire CNAM) ou Taux/Plafond. Ajoutez des éléments selon la nomenclature du contrat." />
                          </Label>
                          <div className="flex gap-1">
                            <Button type="button" variant="ghost" size="sm" onClick={() => {
                              const current = watch(`guarantees.${index}.sub_items`) || [];
                              setValue(`guarantees.${index}.sub_items`, [...current, { key: '', mode: 'cle' as const, lettre_value: 0 }]);
                            }}>
                              <Plus className="mr-1 h-3 w-3" /> Clé lettre
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => {
                              const current = watch(`guarantees.${index}.sub_items`) || [];
                              setValue(`guarantees.${index}.sub_items`, [...current, { key: '', mode: 'taux' as const, taux: 100, plafond: 0 }]);
                            }}>
                              <Plus className="mr-1 h-3 w-3" /> Taux/Plafond
                            </Button>
                          </div>
                        </div>
                        {((watch(`guarantees.${index}.sub_items`) || []).length > 0) && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left py-1 px-2 font-medium text-gray-600">Code / Nom</th>
                                  <th className="text-left py-1 px-2 font-medium text-gray-600">Mode</th>
                                  <th className="text-left py-1 px-2 font-medium text-gray-600">Val. lettre (mill.)</th>
                                  <th className="text-left py-1 px-2 font-medium text-gray-600">Taux (%)</th>
                                  <th className="text-left py-1 px-2 font-medium text-gray-600">{plafondLabel(careTypeValue || '')}</th>
                                  {careTypeValue === 'hospitalisation' && (
                                    <th className="text-left py-1 px-2 font-medium text-gray-600">Max jours</th>
                                  )}
                                  <th className="py-1 px-2"></th>
                                </tr>
                              </thead>
                              <tbody>
                                {(watch(`guarantees.${index}.sub_items`) || []).map((si, siIdx) => (
                                  <tr key={siIdx} className="border-b">
                                    <td className="py-1 px-2">
                                      <Input placeholder="Ex: PC, AMM, Clinique..."
                                        {...register(`guarantees.${index}.sub_items.${siIdx}.key`)} className="w-36" />
                                    </td>
                                    <td className="py-1 px-2">
                                      <Select
                                        value={si.mode}
                                        onValueChange={(val) => setValue(`guarantees.${index}.sub_items.${siIdx}.mode`, val as 'cle' | 'taux')}
                                      >
                                        <SelectTrigger className="w-28 h-8 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="cle">Clé lettre</SelectItem>
                                          <SelectItem value="taux">Taux/Plafond</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </td>
                                    <td className="py-1 px-2">
                                      {si.mode === 'cle' ? (
                                        <Input type="number" min="0" placeholder="Valeur"
                                          {...register(`guarantees.${index}.sub_items.${siIdx}.lettre_value`, { valueAsNumber: true })}
                                          className="w-24" />
                                      ) : <span className="text-gray-300 px-2">—</span>}
                                    </td>
                                    <td className="py-1 px-2">
                                      {si.mode === 'taux' ? (
                                        <Input type="number" min="0" max="100"
                                          {...register(`guarantees.${index}.sub_items.${siIdx}.taux`, { valueAsNumber: true })}
                                          className="w-20" />
                                      ) : <span className="text-gray-300 px-2">—</span>}
                                    </td>
                                    <td className="py-1 px-2">
                                      {(si.mode === 'taux' || si.mode === 'cle') ? (
                                        <Input type="number" min="0" placeholder="Plafond"
                                          {...register(`guarantees.${index}.sub_items.${siIdx}.plafond`, { valueAsNumber: true })}
                                          className="w-28" />
                                      ) : <span className="text-gray-300 px-2">—</span>}
                                    </td>
                                    {careTypeValue === 'hospitalisation' && (
                                      <td className="py-1 px-2">
                                        {si.mode === 'taux' ? (
                                          <Input type="number" min="1" placeholder="—"
                                            {...register(`guarantees.${index}.sub_items.${siIdx}.max_jours`, { valueAsNumber: true })}
                                            className="w-20" />
                                        ) : <span className="text-gray-300 px-2">—</span>}
                                      </td>
                                    )}
                                    <td className="py-1 px-2">
                                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => {
                                        const current = watch(`guarantees.${index}.sub_items`) || [];
                                        setValue(`guarantees.${index}.sub_items`, current.filter((_, i) => i !== siIdx));
                                      }}>
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
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

                      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
                                Par événement
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
        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
          <Button type="button" variant="outline" onClick={() => navigate('/group-contracts')}>
            Annuler
          </Button>
          <Button type="submit" disabled={mutation.isPending || (!isValid && !isEditing)}>
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
              Voulez-vous réinitialiser tous les champs du formulaire ? Toutes les données
              saisies et extraites du PDF (garanties, informations du contrat, bénéficiaires)
              seront supprimées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Non, conserver</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetAll}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Oui, réinitialiser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default GroupContractFormPage;
