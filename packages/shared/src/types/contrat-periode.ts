/**
 * Types for contrat périodes and barèmes (REQ-009)
 */

import type { TypeCalcul } from './acte';

export interface ContratPeriode {
  id: string;
  contractId: string;
  numero: number;
  dateDebut: string;
  dateFin: string;
  refPeriode: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContratBareme {
  id: string;
  periodeId: string;
  acteRefId: string | null;
  familleId: string | null;
  typeCalcul: TypeCalcul;
  valeur: number;
  plafondActe: number | null;
  plafondFamilleAnnuel: number | null;
  limite: number | null;
  contreVisite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContratBaremeAvecActe extends ContratBareme {
  acteCode: string;
  acteLabel: string;
  familleCode: string;
  familleLabel: string;
}
