import { z } from 'zod';

export const subItemSchema = z.object({
  label: z.string().optional().default(''),
  code: z.string().optional(),
  cotation: z.string().optional(),
  amount: z.number().min(0, 'Montant >= 0'),
});

const CARE_TYPE_LABELS: Record<string, string> = {
  consultation: 'Consultation',
  pharmacie: 'Pharmacie',
  pharmacy: 'Pharmacie',
  laboratoire: 'Laboratoire',
  lab: 'Laboratoire',
  optique: 'Optique',
  actes_courants: 'Actes courants',
  actes_specialistes: 'Actes spécialistes',
  chirurgie: 'Chirurgie',
  hospitalisation: 'Hospitalisation',
  hospital: 'Hospitalisation',
  dentaire: 'Dentaire',
  orthodontie: 'Orthodontie',
  accouchement: 'Accouchement',
  transport: 'Transport',
  chirurgie_refractive: 'Chirurgie réfractive',
  orthopedie: 'Orthopédie',
  circoncision: 'Circoncision',
  sanatorium: 'Sanatorium',
  cures_thermales: 'Cures thermales',
  frais_funeraires: 'Frais funéraires',
  interruption_grossesse: 'Interruption de grossesse',
};

export const acteBulletinSchema = z.object({
  code: z.string().optional(),
  label: z.string().optional().default(''),
  amount: z.number().positive('Le montant doit être supérieur à 0'),
  ref_prof_sant: z.string().optional().or(z.literal('')),
  nom_prof_sant: z.string().optional().or(z.literal('')),
  /** Provider ID resolved by frontend MF lookup — skips backend re-search if set */
  provider_id: z.string().optional(),
  care_type: z.enum([
    // 18 canonical French care_types
    'consultation', 'pharmacie', 'laboratoire', 'optique', 'chirurgie_refractive',
    'actes_courants', 'actes_specialistes', 'transport', 'chirurgie', 'orthopedie', 'hospitalisation',
    'accouchement', 'interruption_grossesse', 'dentaire', 'orthodontie',
    'circoncision', 'sanatorium', 'cures_thermales', 'frais_funeraires',
    // Legacy English aliases (backward compat)
    'pharmacy', 'lab', 'hospital',
  ]).optional(),
  care_description: z.string().optional(),
  cod_msgr: z.string().optional(),
  lib_msgr: z.string().optional(),
  /** Pre-resolved IDs from frontend — skips backend lookups when provided */
  medication_id: z.string().optional(),
  medication_family_id: z.string().optional(),
  acte_ref_id: z.string().optional(),
  /** Coefficient lettre-clé (ex: 120 pour B120, 50 pour KC50) */
  nbr_cle: z.number().int().positive().optional(),
  /** Nombre de jours (hospitalisation, cures thermales) */
  nombre_jours: z.number().int().positive().optional(),
  /** Sub-items: individual medications/analyses within this acte */
  sub_items: z.array(subItemSchema).optional(),
}).transform((acte) => {
  // Auto-fill label when empty: use care_type label or first sub_item label
  if (!acte.label) {
    if (acte.care_type && CARE_TYPE_LABELS[acte.care_type]) {
      acte.label = CARE_TYPE_LABELS[acte.care_type]!;
    } else if (acte.sub_items && acte.sub_items.length > 0) {
      acte.label = acte.sub_items[0]!.label || 'Acte médical';
    } else {
      acte.label = 'Acte médical';
    }
  }
  return acte;
});

export const actesArraySchema = z
  .array(acteBulletinSchema)
  .min(1, 'Au moins un acte médical requis');

export type ActeBulletinInput = z.infer<typeof acteBulletinSchema>;
