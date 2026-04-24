/**
 * Configuration centralisée des 18 familles de soins (care_types).
 *
 * Pilote le rendu frontend (labels, mode, icônes) et sert de source unique
 * de vérité pour les catégories garanties BH Assurance.
 */

/** Mode de saisie d'un acte */
export type CareTypeMode = 'simple' | 'compose' | 'sejour';

export interface CareTypeEntry {
  /** Libellé affiché dans le dropdown et les tableaux */
  label: string;
  /** Mode de saisie : simple (1 ligne), composé (sub-items), séjour (nombre_jours) */
  mode: CareTypeMode;
  /** Label du champ praticien */
  providerLabel: string;
  /** Placeholder du champ nom praticien */
  providerPlaceholder: string;
  /** Type de provider pour le lookup MF */
  providerType: 'doctor' | 'pharmacist' | 'lab' | 'clinic' | 'dentist' | 'optician' | 'ambulance' | 'none';
  /** Utiliser MedicationAutocomplete au lieu de ActeSelector */
  useMedicationAutocomplete: boolean;
  /** Label des sub-items (null = pas de sub-items en mode simple) */
  subItemLabel: string | null;
  /** Afficher le champ cotation dans les sub-items (B40, KC50…) */
  showCotation: boolean;
  /** Placeholder pour la description de soin */
  descriptionPlaceholder: string;
  /** Codes famille du référentiel d'actes associés (ex: ['FA0001']). Vide = pas de filtrage référentiel (ex: pharmacie). */
  familleCodes: string[];
  /** Nom d'icône lucide-react (résolu côté frontend) */
  icon: string;
  /** Couleurs pour les badges et icônes */
  bgColor: string;
  textColor: string;
}

export const CARE_TYPE_CONFIG: Record<string, CareTypeEntry> = {
  consultation: {
    label: 'Consultation',
    mode: 'simple',
    providerLabel: 'Médecin',
    providerPlaceholder: 'Dr. Mohamed Ali',
    providerType: 'doctor',
    useMedicationAutocomplete: false,
    subItemLabel: null,
    showCotation: false,
    descriptionPlaceholder: 'Motif de consultation, diagnostic, observations...',
    familleCodes: ['FA0001'],
    icon: 'Stethoscope',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-600',
  },
  pharmacie: {
    label: 'Pharmacie',
    mode: 'compose',
    providerLabel: 'Pharmacien',
    providerPlaceholder: 'Nom pharmacie',
    providerType: 'pharmacist',
    useMedicationAutocomplete: true,
    subItemLabel: 'Médicaments',
    showCotation: false,
    descriptionPlaceholder: 'Observation (ex: ordonnance n°...)',
    familleCodes: ['FA0003'],
    icon: 'Pill',
    bgColor: 'bg-green-50',
    textColor: 'text-green-600',
  },
  laboratoire: {
    label: 'Analyses',
    mode: 'compose',
    providerLabel: 'Laboratoire',
    providerPlaceholder: 'Nom du labo',
    providerType: 'lab',
    useMedicationAutocomplete: false,
    subItemLabel: 'Analyses',
    showCotation: true,
    descriptionPlaceholder: 'Ref. ordonnance, analyses prescrites...',
    familleCodes: ['FA0004'],
    icon: 'FlaskConical',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-600',
  },
  optique: {
    label: 'Optique',
    mode: 'compose',
    providerLabel: 'Opticien',
    providerPlaceholder: 'Nom opticien',
    providerType: 'optician',
    useMedicationAutocomplete: false,
    subItemLabel: 'Items optique',
    showCotation: false,
    descriptionPlaceholder: 'Monture, verres, lentilles...',
    familleCodes: ['FA0006'],
    icon: 'Eye',
    bgColor: 'bg-cyan-50',
    textColor: 'text-cyan-600',
  },
  chirurgie_refractive: {
    label: 'Chirurgie réfractive',
    mode: 'simple',
    providerLabel: 'Médecin',
    providerPlaceholder: 'Dr. Ophtalmologue',
    providerType: 'doctor',
    useMedicationAutocomplete: false,
    subItemLabel: null,
    showCotation: false,
    descriptionPlaceholder: 'Type d\'intervention réfractive...',
    familleCodes: ['FA0009'],
    icon: 'Eye',
    bgColor: 'bg-cyan-50',
    textColor: 'text-cyan-600',
  },
  actes_courants: {
    label: 'Actes courants',
    mode: 'compose',
    providerLabel: 'Médecin',
    providerPlaceholder: 'Dr. Mohamed Ali',
    providerType: 'doctor',
    useMedicationAutocomplete: false,
    subItemLabel: 'Actes (PC/AM/R)',
    showCotation: true,
    descriptionPlaceholder: 'Radiologie, échographie, kinésithérapie...',
    familleCodes: ['FA0009', 'FA0017'],
    icon: 'ClipboardList',
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-600',
  },
  transport: {
    label: 'Transport sanitaire',
    mode: 'simple',
    providerLabel: 'Ambulance',
    providerPlaceholder: 'Société de transport',
    providerType: 'ambulance',
    useMedicationAutocomplete: false,
    subItemLabel: null,
    showCotation: false,
    descriptionPlaceholder: 'Trajet, motif du transport...',
    familleCodes: ['FA0016'],
    icon: 'Truck',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-600',
  },
  chirurgie: {
    label: 'Chirurgie',
    mode: 'compose',
    providerLabel: 'Médecin',
    providerPlaceholder: 'Dr. Chirurgien',
    providerType: 'doctor',
    useMedicationAutocomplete: false,
    subItemLabel: 'Composantes (KC/SO/ANE/PUU)',
    showCotation: true,
    descriptionPlaceholder: 'Type d\'intervention chirurgicale...',
    familleCodes: ['FA0010'],
    icon: 'Scissors',
    bgColor: 'bg-red-50',
    textColor: 'text-red-600',
  },
  orthopedie: {
    label: 'Orthopédie',
    mode: 'simple',
    providerLabel: 'Médecin',
    providerPlaceholder: 'Dr. Orthopédiste',
    providerType: 'doctor',
    useMedicationAutocomplete: false,
    subItemLabel: null,
    showCotation: false,
    descriptionPlaceholder: 'Appareillage, prothèse orthopédique...',
    familleCodes: ['FA0005'],
    icon: 'Bone',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-600',
  },
  hospitalisation: {
    label: 'Hospitalisation (Clinique)',
    mode: 'sejour',
    providerLabel: 'Établissement',
    providerPlaceholder: 'Clinique',
    providerType: 'clinic',
    useMedicationAutocomplete: false,
    subItemLabel: null,
    showCotation: false,
    descriptionPlaceholder: 'Motif d\'hospitalisation, durée de séjour...',
    familleCodes: ['FA0007'],
    icon: 'Building2',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-600',
  },
  hospitalisation_hopital: {
    label: 'Hospitalisation (Hôpital)',
    mode: 'sejour',
    providerLabel: 'Établissement',
    providerPlaceholder: 'Hôpital',
    providerType: 'clinic',
    useMedicationAutocomplete: false,
    subItemLabel: null,
    showCotation: false,
    descriptionPlaceholder: 'Motif d\'hospitalisation, durée de séjour...',
    familleCodes: ['FA0008'],
    icon: 'Building2',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-600',
  },
  accouchement: {
    label: 'Accouchement',
    mode: 'simple',
    providerLabel: 'Établissement',
    providerPlaceholder: 'Clinique / Hôpital',
    providerType: 'clinic',
    useMedicationAutocomplete: false,
    subItemLabel: null,
    showCotation: false,
    descriptionPlaceholder: 'Accouchement normal, césarienne...',
    familleCodes: ['FA0012'],
    icon: 'Baby',
    bgColor: 'bg-pink-50',
    textColor: 'text-pink-600',
  },
  interruption_grossesse: {
    label: 'Interruption de grossesse',
    mode: 'simple',
    providerLabel: 'Établissement',
    providerPlaceholder: 'Clinique / Hôpital',
    providerType: 'clinic',
    useMedicationAutocomplete: false,
    subItemLabel: null,
    showCotation: false,
    descriptionPlaceholder: 'Motif médical...',
    familleCodes: ['FA0012'],
    icon: 'Heart',
    bgColor: 'bg-pink-50',
    textColor: 'text-pink-600',
  },
  dentaire: {
    label: 'Dentaire',
    mode: 'compose',
    providerLabel: 'Dentiste',
    providerPlaceholder: 'Dr. Dentiste',
    providerType: 'dentist',
    useMedicationAutocomplete: false,
    subItemLabel: 'Soins / Prothèses',
    showCotation: false,
    descriptionPlaceholder: 'Soins dentaires, prothèses...',
    familleCodes: ['FA0011'],
    icon: 'Smile',
    bgColor: 'bg-teal-50',
    textColor: 'text-teal-600',
  },
  orthodontie: {
    label: 'Orthodontie',
    mode: 'simple',
    providerLabel: 'Dentiste',
    providerPlaceholder: 'Dr. Orthodontiste',
    providerType: 'dentist',
    useMedicationAutocomplete: false,
    subItemLabel: null,
    showCotation: false,
    descriptionPlaceholder: 'Traitement orthodontique, appareil...',
    familleCodes: ['FA0011'],
    icon: 'Smile',
    bgColor: 'bg-teal-50',
    textColor: 'text-teal-600',
  },
  circoncision: {
    label: 'Circoncision',
    mode: 'simple',
    providerLabel: 'Médecin',
    providerPlaceholder: 'Dr. Chirurgien',
    providerType: 'doctor',
    useMedicationAutocomplete: false,
    subItemLabel: null,
    showCotation: false,
    descriptionPlaceholder: 'Circoncision...',
    familleCodes: ['FA0015'],
    icon: 'Stethoscope',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-600',
  },
  sanatorium: {
    label: 'Sanatorium',
    mode: 'sejour',
    providerLabel: 'Établissement',
    providerPlaceholder: 'Établissement de soins',
    providerType: 'clinic',
    useMedicationAutocomplete: false,
    subItemLabel: null,
    showCotation: false,
    descriptionPlaceholder: 'Séjour en sanatorium...',
    familleCodes: ['FA0007'],
    icon: 'Building2',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-600',
  },
  cures_thermales: {
    label: 'Cures thermales',
    mode: 'sejour',
    providerLabel: 'Établissement',
    providerPlaceholder: 'Centre thermal',
    providerType: 'clinic',
    useMedicationAutocomplete: false,
    subItemLabel: null,
    showCotation: false,
    descriptionPlaceholder: 'Cure thermale, durée du séjour...',
    familleCodes: ['FA0013'],
    icon: 'Waves',
    bgColor: 'bg-sky-50',
    textColor: 'text-sky-600',
  },
  frais_funeraires: {
    label: 'Frais funéraires',
    mode: 'simple',
    providerLabel: 'Prestataire',
    providerPlaceholder: 'Prestataire funéraire',
    providerType: 'none',
    useMedicationAutocomplete: false,
    subItemLabel: null,
    showCotation: false,
    descriptionPlaceholder: 'Frais funéraires...',
    familleCodes: ['FA0014'],
    icon: 'Heart',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-600',
  },
} as const;

/** All care_type values ordered for dropdown display */
export const ALL_CARE_TYPES = Object.keys(CARE_TYPE_CONFIG) as Array<keyof typeof CARE_TYPE_CONFIG>;

/**
 * Reverse mapping: famille code → care_type.
 * Uses the first care_type that lists this famille code.
 */
export const FAMILLE_CODE_TO_CARE_TYPE: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [careType, config] of Object.entries(CARE_TYPE_CONFIG)) {
    for (const fc of config.familleCodes) {
      if (!(fc in map)) {
        map[fc] = careType;
      }
    }
  }
  return map;
})();

/**
 * Maps legacy English care_type values to the new French keys.
 * Keeps French keys unchanged.
 */
const LEGACY_ALIAS: Record<string, string> = {
  pharmacy: 'pharmacie',
  lab: 'laboratoire',
  hospital: 'hospitalisation',
  // consultation stays the same
};

/**
 * Resolve any care_type value (legacy EN or new FR) to the canonical French key.
 * Returns 'consultation' as fallback for unknown values.
 */
export function resolveCareType(value: string | null | undefined): string {
  if (!value) return 'consultation';
  const resolved = LEGACY_ALIAS[value] || value;
  return resolved in CARE_TYPE_CONFIG ? resolved : 'consultation';
}

/**
 * Get the config entry for a care_type value (handles legacy aliases).
 */
export function getCareTypeConfig(value: string | null | undefined): CareTypeEntry {
  return CARE_TYPE_CONFIG[resolveCareType(value)]!;
}

/**
 * Maps provider type from care_type config to the MfLookupInput providerType prop.
 */
export function getMfProviderType(careType: string): 'doctor' | 'pharmacist' | 'lab' | 'clinic' {
  const config = getCareTypeConfig(careType);
  switch (config.providerType) {
    case 'pharmacist': return 'pharmacist';
    case 'lab': return 'lab';
    case 'clinic': return 'clinic';
    case 'dentist': return 'doctor';
    case 'optician': return 'doctor';
    case 'ambulance': return 'clinic';
    case 'none': return 'doctor';
    default: return 'doctor';
  }
}
