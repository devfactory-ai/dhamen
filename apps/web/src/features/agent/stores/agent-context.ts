import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface Company {
  id: string;
  name: string;
  matriculeFiscal: string;
}

interface Batch {
  id: string;
  name: string;
  status: string;
  companyId: string;
}

interface AgentContextState {
  userId: string | null;
  selectedCompany: Company | null;
  selectedBatch: Batch | null;
  setCompany: (company: Company | null) => void;
  setBatch: (batch: Batch | null) => void;
  setUserId: (userId: string) => void;
  clearContext: () => void;
  clearIfDifferentUser: (userId: string) => void;
  isContextReady: () => boolean;
}

export const useAgentContext = create<AgentContextState>()(
  persist(
    (set, get) => ({
      userId: null,
      selectedCompany: null,
      selectedBatch: null,
      setCompany: (company) => set({ selectedCompany: company, selectedBatch: null }),
      setBatch: (batch) => set({ selectedBatch: batch }),
      setUserId: (userId) => set({ userId }),
      clearContext: () => set({ userId: null, selectedCompany: null, selectedBatch: null }),
      clearIfDifferentUser: (userId: string) => {
        const state = get();
        if (state.userId && state.userId !== userId) {
          set({ userId, selectedCompany: null, selectedBatch: null });
        } else {
          set({ userId });
        }
      },
      isContextReady: () => {
        const state = get();
        return state.selectedCompany !== null && state.selectedBatch !== null;
      },
    }),
    {
      name: 'agent-context',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
