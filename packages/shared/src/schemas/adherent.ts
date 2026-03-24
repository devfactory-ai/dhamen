import { z } from 'zod';

export const genderSchema = z.enum(['M', 'F']);
export const etatCivilSchema = z.enum(['celibataire', 'marie', 'divorce', 'veuf']);
export const regimeSocialSchema = z.enum(['CNSS', 'CNRPS']);
export const codeTypeSchema = z.enum(['A', 'C', 'E']);
export const codeSituationFamSchema = z.enum(['C', 'M', 'D', 'V']);
export const typePieceIdentiteSchema = z.enum(['CIN', 'PASSEPORT', 'CARTE_SEJOUR', 'AUTRE']);
export const etatFicheSchema = z.enum(['TEMPORAIRE', 'NON_TEMPORAIRE']);

export const adherentCreateSchema = z.object({
  // Identité
  nationalId: z.string().optional().or(z.literal('')),
  typePieceIdentite: typePieceIdentiteSchema.optional(),
  dateEditionPiece: z.string().optional(),
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)'),
  gender: genderSchema.optional(),
  lieuNaissance: z.string().optional(),
  etatCivil: etatCivilSchema.optional(),
  dateMarriage: z.string().optional(),
  // Contact
  phone: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().email().optional(),
  // Adresse
  rue: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  // Entreprise & couverture
  companyId: z.string().optional(),
  matricule: z.string().optional(),
  plafondGlobal: z.number().min(0).optional(),
  dateDebutAdhesion: z.string().optional(),
  dateFinAdhesion: z.string().optional(),
  rang: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  // Renseignements complémentaires
  banque: z.string().optional(),
  rib: z.string().optional(),
  regimeSocial: regimeSocialSchema.optional(),
  handicap: z.boolean().optional(),
  fonction: z.string().optional(),
  maladiChronique: z.boolean().optional(),
  matriculeConjoint: z.string().optional(),
  // Famille
  codeType: codeTypeSchema.optional(),
  parentAdherentId: z.string().optional(),
  rangPres: z.number().int().min(0).max(99).optional(),
  codeSituationFam: codeSituationFamSchema.optional(),
  // Champs Acorad
  contreVisiteObligatoire: z.boolean().optional(),
  etatFiche: etatFicheSchema.optional(),
  credit: z.number().min(0).optional(),
});

export const adherentUpdateSchema = z.object({
  // Identité
  typePieceIdentite: typePieceIdentiteSchema.optional(),
  dateEditionPiece: z.string().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: genderSchema.optional(),
  lieuNaissance: z.string().optional(),
  etatCivil: etatCivilSchema.optional(),
  dateMarriage: z.string().optional(),
  // Contact
  phone: z.string().optional(),
  mobile: z.string().optional(),
  email: z.string().email().optional(),
  // Adresse
  rue: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  // Entreprise & couverture
  matricule: z.string().optional(),
  plafondGlobal: z.number().min(0).optional(),
  dateDebutAdhesion: z.string().optional(),
  dateFinAdhesion: z.string().optional(),
  rang: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  // Renseignements complémentaires
  banque: z.string().optional(),
  rib: z.string().optional(),
  regimeSocial: regimeSocialSchema.optional(),
  handicap: z.boolean().optional(),
  fonction: z.string().optional(),
  maladiChronique: z.boolean().optional(),
  matriculeConjoint: z.string().optional(),
  // Famille
  codeType: codeTypeSchema.optional(),
  parentAdherentId: z.string().optional(),
  rangPres: z.number().int().min(0).max(99).optional(),
  codeSituationFam: codeSituationFamSchema.optional(),
  // Champs Acorad
  contreVisiteObligatoire: z.boolean().optional(),
  etatFiche: etatFicheSchema.optional(),
  credit: z.number().min(0).optional(),
});

export const adherentFiltersSchema = z.object({
  city: z.string().optional(),
  search: z.string().optional(),
});

/**
 * Schema for CSV import row validation
 */
export const adherentCsvRowSchema = z.object({
  nationalId: z.string().min(1, 'Numéro national requis'),
  firstName: z.string().min(1, 'Prénom requis'),
  lastName: z.string().min(1, 'Nom requis'),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format date invalide (YYYY-MM-DD)'),
  gender: genderSchema.optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  // Champs optionnels enrichis (compatibilité Acorad/MAJSPROLS)
  matricule: z.string().optional(),
  contractNumber: z.string().optional(),
  memberType: z.enum(['A', 'C', 'E']).optional(), // A=Principal, C=Conjoint, E=Enfant
  rang: z.string().optional(),
  maritalStatus: z.string().optional(),
  dateDebutAdhesion: z.string().optional(),
  dateFinAdhesion: z.string().optional(),
  dateMarriage: z.string().optional(),
  rib: z.string().optional(),
  postalCode: z.string().optional(),
  chronicDisease: z.boolean().optional(),
  handicap: z.boolean().optional(),
});

export const adherentImportSchema = z.object({
  adherents: z.array(adherentCsvRowSchema).min(1, 'Au moins un adhérent requis').max(1000, 'Maximum 1000 adhérents par import'),
  skipDuplicates: z.boolean().optional().default(true),
  companyId: z.string().optional(),
});

export type AdherentCreateInput = z.infer<typeof adherentCreateSchema>;
export type AdherentUpdateInput = z.infer<typeof adherentUpdateSchema>;
export type AdherentFiltersInput = z.infer<typeof adherentFiltersSchema>;
export type AdherentCsvRow = z.infer<typeof adherentCsvRowSchema>;
export type AdherentImportInput = z.infer<typeof adherentImportSchema>;
