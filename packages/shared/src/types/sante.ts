/**
 * SoinFlow types for health reimbursement module
 */

// ============================================
// Enums and Constants
// ============================================

export const SANTE_TYPE_SOINS = [
  'pharmacie',
  'consultation',
  'hospitalisation',
  'optique',
  'dentaire',
  'laboratoire',
  'kinesitherapie',
  'autre',
] as const;

export type SanteTypeSoin = (typeof SANTE_TYPE_SOINS)[number];

export const SANTE_STATUTS_DEMANDE = [
  'soumise',
  'en_examen',
  'info_requise',
  'approuvee',
  'en_paiement',
  'payee',
  'rejetee',
] as const;

export type SanteStatutDemande = (typeof SANTE_STATUTS_DEMANDE)[number];

export const SANTE_SOURCES_DEMANDE = ['adherent', 'praticien'] as const;

export type SanteSourceDemande = (typeof SANTE_SOURCES_DEMANDE)[number];

export const SANTE_TYPES_PRATICIEN = [
  'medecin',
  'pharmacien',
  'dentiste',
  'opticien',
  'laborantin',
  'kinesitherapeute',
  'infirmier',
  'autre',
] as const;

export type SanteTypePraticien = (typeof SANTE_TYPES_PRATICIEN)[number];

export const SANTE_TYPES_DOCUMENT = [
  'bulletin_soin',
  'ordonnance',
  'facture',
  'devis',
  'compte_rendu',
  'autre',
] as const;

export type SanteTypeDocument = (typeof SANTE_TYPES_DOCUMENT)[number];

export const SANTE_STATUTS_ACTE = ['cree', 'valide', 'paye', 'annule'] as const;

export type SanteStatutActe = (typeof SANTE_STATUTS_ACTE)[number];

export const SANTE_STATUTS_PAIEMENT = ['en_attente', 'initie', 'execute', 'echoue', 'annule'] as const;

export type SanteStatutPaiement = (typeof SANTE_STATUTS_PAIEMENT)[number];

export const SANTE_TYPES_BENEFICIAIRE = ['adherent', 'praticien'] as const;

export type SanteTypeBeneficiaire = (typeof SANTE_TYPES_BENEFICIAIRE)[number];

export const SANTE_METHODES_PAIEMENT = ['virement', 'cheque', 'especes'] as const;

export type SanteMethodePaiement = (typeof SANTE_METHODES_PAIEMENT)[number];

// ============================================
// Garanties et Formules
// ============================================

export interface SanteGarantieFormule {
  id: string;
  code: string;
  nom: string;
  description: string | null;
  tauxCouverture: Record<SanteTypeSoin, number>;
  plafonds: Record<SanteTypeSoin, number>;
  plafondGlobal: number | null;
  tarifMensuel: number;
  isActive: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Praticiens
// ============================================

export interface SantePraticien {
  id: string;
  providerId: string | null;
  nom: string;
  prenom: string | null;
  specialite: string;
  typePraticien: SanteTypePraticien;
  estConventionne: boolean;
  conventionNumero: string | null;
  conventionDebut: string | null;
  conventionFin: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  ville: string | null;
  codePostal: string | null;
  lat: number | null;
  lng: number | null;
  numeroOrdre: string | null;
  numeroCnam: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SantePraticienPublic {
  id: string;
  nom: string;
  prenom: string | null;
  specialite: string;
  typePraticien: SanteTypePraticien;
  estConventionne: boolean;
  telephone: string | null;
  adresse: string | null;
  ville: string | null;
  lat: number | null;
  lng: number | null;
}

// ============================================
// Demandes
// ============================================

export interface SanteDemande {
  id: string;
  numeroDemande: string;
  adherentId: string;
  praticienId: string | null;
  formuleId: string | null;
  source: SanteSourceDemande;
  typeSoin: SanteTypeSoin;
  statut: SanteStatutDemande;
  montantDemande: number;
  montantRembourse: number | null;
  montantResteCharge: number | null;
  estTiersPayant: boolean;
  montantPraticien: number | null;
  dateSoin: string;
  traitePar: string | null;
  dateTraitement: string | null;
  motifRejet: string | null;
  notesInternes: string | null;
  scoreFraude: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface SanteDemandeAvecDetails extends SanteDemande {
  adherent?: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string | null;
  };
  praticien?: SantePraticienPublic | null;
  documents?: SanteDocument[];
}

// ============================================
// Documents
// ============================================

export interface SanteDocument {
  id: string;
  demandeId: string;
  typeDocument: SanteTypeDocument;
  r2Key: string;
  r2Bucket: string;
  nomFichier: string;
  mimeType: string;
  tailleOctets: number;
  ocrStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  ocrResultJson: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

// ============================================
// Actes Praticiens (Digital workflow)
// ============================================

export interface SanteActePraticien {
  id: string;
  praticienId: string;
  adherentId: string;
  demandeId: string | null;
  codeActe: string;
  libelleActe: string;
  montantActe: number;
  tauxCouverture: number;
  montantCouvert: number;
  montantPatient: number;
  statut: SanteStatutActe;
  dateActe: string;
  qrCodeAdherent: string | null;
  signatureAdherent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SanteActeAvecDetails extends SanteActePraticien {
  praticien?: SantePraticienPublic;
  adherent?: {
    id: string;
    firstName: string;
    lastName: string;
    matricule: string | null;
  };
}

// ============================================
// Plafonds Consommés
// ============================================

export interface SantePlafondConsomme {
  id: string;
  adherentId: string;
  annee: number;
  typeSoin: SanteTypeSoin | 'global';
  montantConsomme: number;
  montantPlafond: number;
  pourcentageConsomme: number;
  updatedAt: string;
}

// ============================================
// Paiements
// ============================================

export interface SantePaiement {
  id: string;
  demandeId: string;
  typeBeneficiaire: SanteTypeBeneficiaire;
  beneficiaireId: string;
  montant: number;
  methode: SanteMethodePaiement;
  ribEncrypted: string | null;
  statut: SanteStatutPaiement;
  dateInitiation: string | null;
  dateExecution: string | null;
  referencePaiement: string | null;
  motifEchec: string | null;
  idempotencyKey: string | null;
  initiePar: string | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================
// Adherent Extension (for SoinFlow)
// ============================================

export interface AdherentSante {
  id: string;
  module: 'dhamen' | 'sante';
  matricule: string | null;
  formuleId: string | null;
  plafondGlobal: number | null;
  ayantsDroit: AyantDroit[];
  companyName: string | null;
  companyId: string | null;
  // Base fields from adherents
  nationalIdEncrypted: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'M' | 'F' | null;
  phoneEncrypted: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AyantDroit {
  id: string;
  prenom: string;
  nom: string;
  dateNaissance: string;
  lienParente: 'conjoint' | 'enfant' | 'parent' | 'autre';
  formuleId?: string;
}

// ============================================
// Request/Response DTOs
// ============================================

export interface CreateSanteDemandeRequest {
  adherentId: string;
  typeSoin: SanteTypeSoin;
  montantDemande: number;
  dateSoin: string;
  praticienId?: string;
  notes?: string;
}

export interface UpdateSanteDemandeStatutRequest {
  statut: SanteStatutDemande;
  montantRembourse?: number;
  motifRejet?: string;
  notesInternes?: string;
}

export interface CreateSanteActeRequest {
  adherentId: string;
  codeActe: string;
  libelleActe: string;
  montantActe: number;
  dateActe: string;
  qrCodeAdherent?: string;
}

export interface VerifyEligibiliteResponse {
  eligible: boolean;
  adherent: {
    id: string;
    nom: string;
    prenom: string;
    matricule: string | null;
    formule: string | null;
  };
  plafonds: SantePlafondConsomme[];
  message?: string;
}

// ============================================
// Filters for listing
// ============================================

export interface SanteDemandeFilterParams {
  statut?: SanteStatutDemande;
  source?: SanteSourceDemande;
  typeSoin?: SanteTypeSoin;
  adherentId?: string;
  praticienId?: string;
  dateDebut?: string;
  dateFin?: string;
}

export interface SantePraticienFilterParams {
  typePraticien?: SanteTypePraticien;
  ville?: string;
  estConventionne?: boolean;
  search?: string;
}
