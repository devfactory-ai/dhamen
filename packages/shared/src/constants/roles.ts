import type { Role } from '../types/user';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrateur',
  INSURER_ADMIN: 'Administrateur Assureur',
  INSURER_AGENT: 'Agent Assureur',
  PHARMACIST: 'Pharmacien',
  DOCTOR: 'Médecin',
  LAB_MANAGER: 'Responsable Laboratoire',
  CLINIC_ADMIN: 'Administrateur Clinique',
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: 'Accès complet à la plateforme',
  INSURER_ADMIN: 'Gestion complète des opérations assureur',
  INSURER_AGENT: 'Opérations courantes assureur (claims, adhérents)',
  PHARMACIST: 'Délivrance pharmacie et vérification éligibilité',
  DOCTOR: 'Consultations et prescriptions',
  LAB_MANAGER: 'Gestion des analyses et résultats',
  CLINIC_ADMIN: 'Gestion des hospitalisations et séjours',
};

export const PROVIDER_ROLES: Role[] = ['PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN'];

export const INSURER_ROLES: Role[] = ['INSURER_ADMIN', 'INSURER_AGENT'];

export const ADMIN_ROLES: Role[] = ['ADMIN'];
