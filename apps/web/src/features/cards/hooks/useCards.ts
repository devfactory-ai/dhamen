/**
 * Cards Hooks
 *
 * React Query hooks for virtual card management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../../lib/api-client';

export interface VirtualCard {
  id: string;
  adherentId: string;
  cardNumber: string;
  qrCodeToken: string;
  status: 'active' | 'suspended' | 'revoked' | 'expired';
  issuedAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  usageCount: number;
  createdAt: string;
}

export interface VirtualCardWithAdherent extends VirtualCard {
  adherent: {
    id: string;
    adherentNumber: string;
    firstName: string;
    lastName: string;
    cin: string;
    dateOfBirth: string;
    photoUrl: string | null;
  };
  contract: {
    id: string;
    contractNumber: string;
    insurerName: string;
    insurerLogo: string | null;
    startDate: string;
    endDate: string;
    status: string;
  };
  coverage: {
    consultation: number;
    pharmacy: number;
    lab: number;
    imaging: number;
    hospitalization: number;
    dental: number;
    optical: number;
  };
}

export interface CardVerification {
  id: string;
  cardId: string;
  providerId: string | null;
  verificationType: 'qr_scan' | 'card_number' | 'nfc' | 'api';
  status: 'success' | 'failed' | 'expired' | 'revoked';
  createdAt: string;
}

export interface VerificationResult {
  valid: boolean;
  verificationId?: string;
  card?: VirtualCardWithAdherent;
  reason?: string;
}

interface ListCardsParams {
  adherentId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

// List cards
export function useCards(params: ListCardsParams = {}) {
  return useQuery({
    queryKey: ['cards', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (params.adherentId) searchParams.set('adherentId', params.adherentId);
      if (params.status) searchParams.set('status', params.status);
      if (params.page) searchParams.set('page', params.page.toString());
      if (params.limit) searchParams.set('limit', params.limit.toString());

      const response = await apiClient.get(`/cards?${searchParams.toString()}`);
      return response.data;
    },
  });
}

// Get single card
export function useCard(cardId: string | undefined) {
  return useQuery({
    queryKey: ['cards', cardId],
    queryFn: async () => {
      const response = await apiClient.get(`/cards/${cardId}`);
      return response.data.data.card as VirtualCardWithAdherent;
    },
    enabled: !!cardId,
  });
}

// Get active card for adherent
export function useAdherentActiveCard(adherentId: string | undefined) {
  return useQuery({
    queryKey: ['cards', 'adherent', adherentId, 'active'],
    queryFn: async () => {
      const response = await apiClient.get(`/cards/adherent/${adherentId}/active`);
      return response.data.data.card as VirtualCardWithAdherent;
    },
    enabled: !!adherentId,
    retry: false,
  });
}

// Get QR code data
export function useCardQRCode(cardId: string | undefined) {
  return useQuery({
    queryKey: ['cards', cardId, 'qr'],
    queryFn: async () => {
      const response = await apiClient.get(`/cards/${cardId}/qr`);
      return response.data.data as { qrCodeData: string; expiresIn: number };
    },
    enabled: !!cardId,
    refetchInterval: 4 * 60 * 1000, // Refresh every 4 minutes (before 5 min expiry)
  });
}

// Get verification history
export function useCardVerificationHistory(cardId: string | undefined, page = 1, limit = 20) {
  return useQuery({
    queryKey: ['cards', cardId, 'history', page, limit],
    queryFn: async () => {
      const response = await apiClient.get(`/cards/${cardId}/history?page=${page}&limit=${limit}`);
      return response.data;
    },
    enabled: !!cardId,
  });
}

// Generate new card
export function useGenerateCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { adherentId: string; validityMonths?: number }) => {
      const response = await apiClient.post('/cards/generate', data);
      return response.data.data.card as VirtualCard;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['cards', 'adherent', variables.adherentId] });
    },
  });
}

// Verify card
export function useVerifyCard() {
  return useMutation({
    mutationFn: async (data: { qrCodeData?: string; cardNumber?: string }) => {
      const response = await apiClient.post('/cards/verify', data);
      return response.data.data as VerificationResult;
    },
  });
}

// Suspend card
export function useSuspendCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cardId, reason }: { cardId: string; reason: string }) => {
      const response = await apiClient.post(`/cards/${cardId}/suspend`, { reason });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['cards', variables.cardId] });
    },
  });
}

// Reactivate card
export function useReactivateCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cardId, reason }: { cardId: string; reason?: string }) => {
      const response = await apiClient.post(`/cards/${cardId}/reactivate`, { reason });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['cards', variables.cardId] });
    },
  });
}

// Revoke card
export function useRevokeCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cardId, reason }: { cardId: string; reason: string }) => {
      const response = await apiClient.post(`/cards/${cardId}/revoke`, { reason });
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['cards', variables.cardId] });
    },
  });
}

// Renew card
export function useRenewCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ cardId, validityMonths }: { cardId: string; validityMonths?: number }) => {
      const response = await apiClient.post(`/cards/${cardId}/renew`, { validityMonths });
      return response.data.data.card as VirtualCard;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
    },
  });
}
