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
  selectedCompany: Company | null;
  selectedBatch: Batch | null;
  setCompany: (company: Company | null) => void;
  setBatch: (batch: Batch | null) => void;
  clearContext: () => void;
  isContextReady: () => boolean;
}

export const useAgentContext = create<AgentContextState>()(
  persist(
    (set, get) => ({
      selectedCompany: null,
      selectedBatch: null,
      setCompany: (company) => set({ selectedCompany: company, selectedBatch: null }),
      setBatch: (batch) => set({ selectedBatch: batch }),
      clearContext: () => set({ selectedCompany: null, selectedBatch: null }),
      isContextReady: () => {
        const state = get();
        return state.selectedCompany !== null && state.selectedBatch !== null;
      },
    }),
    {
      name: 'agent-context',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
