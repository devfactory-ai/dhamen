/**
 * Zod schemas for SoinFlow validation
 */
import { z } from 'zod';
import {
  SANTE_TYPE_SOINS,
  SANTE_STATUTS_DEMANDE,
  SANTE_SOURCES_DEMANDE,
  SANTE_TYPES_PRATICIEN,
  SANTE_TYPES_DOCUMENT,
  SANTE_STATUTS_ACTE,
  SANTE_STATUTS_PAIEMENT,
  SANTE_TYPES_BENEFICIAIRE,
  SANTE_METHODES_PAIEMENT,
} from '../types/sante';

// ============================================
// Base schemas
// ============================================

export const santeTypeSoinSchema = z.enum(SANTE_TYPE_SOINS);
export const santeStatutDemandeSchema = z.enum(SANTE_STATUTS_DEMANDE);
export const santeSourceDemandeSchema = z.enum(SANTE_SOURCES_DEMANDE);
export const santeTypePraticienSchema = z.enum(SANTE_TYPES_PRATICIEN);
export const santeTypeDocumentSchema = z.enum(SANTE_TYPES_DOCUMENT);
export const santeStatutActeSchema = z.enum(SANTE_STATUTS_ACTE);
export const santeStatutPaiementSchema = z.enum(SANTE_STATUTS_PAIEMENT);
export const santeTypeBeneficiaireSchema = z.enum(SANTE_TYPES_BENEFICIAIRE);
export const santeMethodePaiementSchema = z.enum(SANTE_METHODES_PAIEMENT);

// ============================================
// Garanties Formule schemas
// ============================================

export const santeGarantieFormuleCreateSchema = z.object({
  code: z.string().min(2).max(50),
  nom: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  tauxCouverture: z.record(santeTypeSoinSchema, z.number().min(0).max(100)),
  plafonds: z.record(santeTypeSoinSchema, z.number().min(0)),
  plafondGlobal: z.number().min(0).optional(),
  tarifMensuel: z.number().min(0),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)'),
  effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const santeGarantieFormuleUpdateSchema = santeGarantieFormuleCreateSchema.partial();

// ============================================
// Praticien schemas
// ============================================

export const santePraticienCreateSchema = z.object({
  providerId: z.string().optional(),
  nom: z.string().min(2).max(100),
  prenom: z.string().max(100).optional(),
  specialite: z.string().min(2).max(100),
  typePraticien: santeTypePraticienSchema,
  estConventionne: z.boolean().default(false),
  conventionNumero: z.string().max(50).optional(),
  conventionDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  conventionFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  telephone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  adresse: z.string().max(255).optional(),
  ville: z.string().max(100).optional(),
  codePostal: z.string().max(10).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  numeroOrdre: z.string().max(50).optional(),
  numeroCnam: z.string().max(50).optional(),
});

export const santePraticienUpdateSchema = santePraticienCreateSchema.partial();

export const santePraticienFiltersSchema = z.object({
  typePraticien: santeTypePraticienSchema.optional(),
  ville: z.string().optional(),
  estConventionne: z.coerce.boolean().optional(),
  search: z.string().max(100).optional(),
});

// ============================================
// Demande schemas
// ============================================

export const santeDemandeCreateSchema = z.object({
  adherentId: z.string().min(1),
  typeSoin: santeTypeSoinSchema,
  montantDemande: z.number().min(1, 'Le montant doit être supérieur à 0'),
  dateSoin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)'),
  praticienId: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export const santeDemandeUpdateStatutSchema = z.object({
  statut: santeStatutDemandeSchema,
  montantRembourse: z.number().min(0).optional(),
  motifRejet: z.string().max(500).optional(),
  notesInternes: z.string().max(2000).optional(),
});

export const santeDemandeFiltersSchema = z.object({
  statut: santeStatutDemandeSchema.optional(),
  source: santeSourceDemandeSchema.optional(),
  typeSoin: santeTypeSoinSchema.optional(),
  adherentId: z.string().optional(),
  praticienId: z.string().optional(),
  dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ============================================
// Document schemas
// ============================================

export const santeDocumentUploadSchema = z.object({
  typeDocument: santeTypeDocumentSchema,
  nomFichier: z.string().min(1).max(255),
  mimeType: z.string().regex(/^(image\/(jpeg|png|gif|webp)|application\/pdf)$/, 'Type de fichier non autorisé'),
  tailleOctets: z.number().min(1).max(10 * 1024 * 1024, 'Fichier trop volumineux (max 10MB)'),
});

export const santeDocumentCreateSchema = z.object({
  demandeId: z.string().min(1),
  typeDocument: santeTypeDocumentSchema,
});

// ============================================
// Acte Praticien schemas
// ============================================

export const santeActeCreateSchema = z.object({
  adherentId: z.string().min(1),
  codeActe: z.string().min(1).max(50),
  libelleActe: z.string().min(2).max(255),
  montantActe: z.number().min(1),
  tauxCouverture: z.number().min(0).max(100),
  montantCouvert: z.number().min(0),
  montantPatient: z.number().min(0),
  dateActe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)').optional(),
  qrCodeAdherent: z.string().max(500).optional(),
});

export const santeActeValidateSchema = z.object({
  signatureAdherent: z.boolean(),
});

export const santeActeUpdateStatutSchema = z.object({
  statut: santeStatutActeSchema,
});

export const santeActeFiltersSchema = z.object({
  praticienId: z.string().optional(),
  adherentId: z.string().optional(),
  statut: santeStatutActeSchema.optional(),
  dateDebut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dateFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// ============================================
// Paiement schemas
// ============================================

export const santePaiementInitiateSchema = z.object({
  demandeId: z.string().min(1),
  typeBeneficiaire: santeTypeBeneficiaireSchema,
  beneficiaireId: z.string().min(1),
  montant: z.number().min(1),
  methode: santeMethodePaiementSchema.default('virement'),
  rib: z.string().max(100).optional(),
  idempotencyKey: z.string().min(16).max(64),
});

// ============================================
// Ayant Droit schema
// ============================================

export const ayantDroitSchema = z.object({
  id: z.string(),
  prenom: z.string().min(2).max(100),
  nom: z.string().min(2).max(100),
  dateNaissance: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lienParente: z.enum(['conjoint', 'enfant', 'parent', 'autre']),
  formuleId: z.string().optional(),
});

// ============================================
// Adherent Sante extension schema
// ============================================

export const adherentSanteExtensionSchema = z.object({
  module: z.enum(['dhamen', 'sante']).default('sante'),
  matricule: z.string().max(50).optional(),
  formuleId: z.string().optional(),
  plafondGlobal: z.number().min(0).optional(),
  ayantsDroit: z.array(ayantDroitSchema).default([]),
  companyName: z.string().max(255).optional(),
  companyId: z.string().optional(),
});

// Type exports
export type SanteGarantieFormuleCreate = z.infer<typeof santeGarantieFormuleCreateSchema>;
export type SanteGarantieFormuleUpdate = z.infer<typeof santeGarantieFormuleUpdateSchema>;
export type SantePraticienCreate = z.infer<typeof santePraticienCreateSchema>;
export type SantePraticienUpdate = z.infer<typeof santePraticienUpdateSchema>;
export type SantePraticienFilters = z.infer<typeof santePraticienFiltersSchema>;
export type SanteDemandeCreate = z.infer<typeof santeDemandeCreateSchema>;
export type SanteDemandeUpdateStatut = z.infer<typeof santeDemandeUpdateStatutSchema>;
export type SanteDemandeFilters = z.infer<typeof santeDemandeFiltersSchema>;
export type SanteDocumentUpload = z.infer<typeof santeDocumentUploadSchema>;
export type SanteActeCreate = z.infer<typeof santeActeCreateSchema>;
export type SanteActeValidate = z.infer<typeof santeActeValidateSchema>;
export type SanteActeUpdateStatut = z.infer<typeof santeActeUpdateStatutSchema>;
export type SanteActeFilters = z.infer<typeof santeActeFiltersSchema>;
export type SantePaiementInitiate = z.infer<typeof santePaiementInitiateSchema>;
export type AyantDroitInput = z.infer<typeof ayantDroitSchema>;
export type AdherentSanteExtension = z.infer<typeof adherentSanteExtensionSchema>;
