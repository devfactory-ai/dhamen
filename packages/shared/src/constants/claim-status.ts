import type { ClaimStatus } from '../types/claim';

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  pending: 'En attente',
  eligible: 'Éligible',
  approved: 'Approuvée',
  pending_review: 'En révision',
  blocked: 'Bloquée',
  rejected: 'Rejetée',
  paid: 'Payée',
};

export const CLAIM_STATUS_COLORS: Record<ClaimStatus, string> = {
  pending: 'gray',
  eligible: 'blue',
  approved: 'green',
  pending_review: 'yellow',
  blocked: 'red',
  rejected: 'red',
  paid: 'green',
};

/**
 * Valid status transitions for claims
 */
export const CLAIM_STATUS_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  pending: ['eligible', 'rejected'],
  eligible: ['approved', 'pending_review', 'blocked', 'rejected'],
  approved: ['paid', 'rejected'],
  pending_review: ['approved', 'blocked', 'rejected'],
  blocked: ['pending_review', 'rejected'],
  rejected: [],
  paid: [],
};

export function canTransitionTo(from: ClaimStatus, to: ClaimStatus): boolean {
  return CLAIM_STATUS_TRANSITIONS[from].includes(to);
}
