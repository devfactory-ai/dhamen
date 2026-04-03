import type { Role } from '../types/user';
import type { Resource, Action } from '../permissions';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrateur',
  INSURER_ADMIN: 'Administrateur Assureur',
  INSURER_AGENT: 'Agent Assureur',
  PHARMACIST: 'Pharmacien',
  DOCTOR: 'Médecin',
  LAB_MANAGER: 'Responsable Laboratoire',
  CLINIC_ADMIN: 'Administrateur Clinique',
  ADHERENT: 'Adhérent',
  // HR role
  HR: 'Responsable RH',
  // SoinFlow roles
  SOIN_GESTIONNAIRE: 'Gestionnaire SoinFlow',
  SOIN_AGENT: 'Agent SoinFlow',
  PRATICIEN: 'Praticien',
  SOIN_RESPONSABLE: 'Responsable SoinFlow',
  SOIN_DIRECTEUR: 'Directeur SoinFlow',
  // Compliance
  COMPLIANCE_OFFICER: 'Responsable Conformité',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: 'Accès complet à la plateforme',
  INSURER_ADMIN: 'Gestion complète des opérations assureur',
  INSURER_AGENT: 'Opérations courantes assureur (claims, adhérents)',
  PHARMACIST: 'Délivrance pharmacie et vérification éligibilité',
  DOCTOR: 'Consultations et prescriptions',
  LAB_MANAGER: 'Gestion des analyses et résultats',
  CLINIC_ADMIN: 'Gestion des hospitalisations et séjours',
  ADHERENT: 'Accès mobile aux données personnelles',
  // HR role
  HR: 'Gestion des adhérents de l\'entreprise',
  // SoinFlow roles
  SOIN_GESTIONNAIRE: 'Validation des demandes, supervision et rapports SoinFlow',
  SOIN_AGENT: 'Traitement quotidien des demandes SoinFlow',
  PRATICIEN: 'Soumission d\'actes digitaux et tiers-payant',
  SOIN_RESPONSABLE: 'Supervision des équipes et approbations SoinFlow',
  SOIN_DIRECTEUR: 'Direction et vision stratégique SoinFlow',
  // Compliance
  COMPLIANCE_OFFICER: 'Audit et conformité réglementaire',
};

export const PROVIDER_ROLES: Role[] = ['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN'];

export const INSURER_ROLES: Role[] = ['INSURER_ADMIN', 'INSURER_AGENT'];

export const ADMIN_ROLES: Role[] = ['ADMIN'];

export const MOBILE_ROLES: Role[] = ['ADHERENT'];

// HR roles - Company HR staff
export const HR_ROLES: Role[] = ['HR'];

// SoinFlow role groups
export const SOINFLOW_ROLES: Role[] = ['SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'SOIN_RESPONSABLE', 'SOIN_DIRECTEUR'];

export const SOINFLOW_INTERNAL_ROLES: Role[] = ['SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'SOIN_RESPONSABLE', 'SOIN_DIRECTEUR'];

// Compliance roles
export const COMPLIANCE_ROLES: Role[] = ['COMPLIANCE_OFFICER'];

// Rôles masqués temporairement de l'interface (pas encore activés)
export const HIDDEN_ROLES: Role[] = ['SOIN_GESTIONNAIRE', 'SOIN_AGENT', 'PRATICIEN', 'SOIN_RESPONSABLE', 'SOIN_DIRECTEUR', 'COMPLIANCE_OFFICER'];

// ROLE_LABELS filtré sans les rôles masqués (pour les dropdowns frontend)
export const VISIBLE_ROLE_LABELS: Partial<Record<Role, string>> = Object.fromEntries(
  Object.entries(ROLE_LABELS).filter(([key]) => !HIDDEN_ROLES.includes(key as Role))
) as Partial<Record<Role, string>>;

// Labels for resources (French)
export const RESOURCE_LABELS: Record<Resource, string> = {
  users: 'Utilisateurs',
  providers: 'Praticiens',
  adherents: 'Adhérents',
  insurers: 'Compagnies Partenaires',
  contracts: 'Contrats',
  claims: 'Prises en charge',
  reconciliations: 'Réconciliations',
  conventions: 'Conventions',
  audit_logs: 'Journaux d\'audit',
  companies: 'Entreprises',
  bulletins_soins: 'Bulletins de soins',
  sante_demandes: 'Demandes santé',
  sante_documents: 'Documents santé',
  sante_garanties: 'Garanties santé',
  sante_praticiens: 'Praticiens santé',
  sante_actes: 'Actes santé',
  sante_paiements: 'Paiements santé',
};

// Labels for actions (French)
export const ACTION_LABELS: Record<Action, string> = {
  create: 'Créer',
  read: 'Lire',
  update: 'Modifier',
  delete: 'Supprimer',
  list: 'Lister',
  approve: 'Approuver',
  reject: 'Rejeter',
  validate: 'Valider',
  upload: 'Téléverser',
  download: 'Télécharger',
  initiate: 'Initier',
  process: 'Traiter',
};

// Roles that cannot be modified via the admin panel
export const PROTECTED_ROLES: Role[] = ['ADMIN'];
