import type { Role } from '../types/user';

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
