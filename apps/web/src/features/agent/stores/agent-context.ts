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

interface PerUserContext {
  selectedCompany: Company | null;
  selectedBatch: Batch | null;
}

interface AgentContextState {
  userId: string | null;
  selectedCompany: Company | null;
  selectedBatch: Batch | null;
  /** Saved contexts per userId */
  perUser: Record<string, PerUserContext>;
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
      perUser: {},
      setCompany: (company) => {
        const { userId, perUser } = get();
        const updated = { selectedCompany: company, selectedBatch: null };
        if (userId) {
          set({ ...updated, perUser: { ...perUser, [userId]: updated } });
        } else {
          set(updated);
        }
      },
      setBatch: (batch) => {
        const { userId, selectedCompany, perUser } = get();
        if (userId) {
          set({ selectedBatch: batch, perUser: { ...perUser, [userId]: { selectedCompany, selectedBatch: batch } } });
        } else {
          set({ selectedBatch: batch });
        }
      },
      setUserId: (userId) => set({ userId }),
      clearContext: () => {
        const state = get();
        // Save current user's context before clearing
        if (state.userId) {
          const perUser = { ...state.perUser };
          perUser[state.userId] = {
            selectedCompany: state.selectedCompany,
            selectedBatch: state.selectedBatch,
          };
          set({ userId: null, selectedCompany: null, selectedBatch: null, perUser });
        } else {
          set({ userId: null, selectedCompany: null, selectedBatch: null });
        }
      },
      clearIfDifferentUser: (userId: string) => {
        const state = get();
        const perUser = { ...state.perUser };

        // Save previous user's context if switching users
        if (state.userId && state.userId !== userId) {
          perUser[state.userId] = {
            selectedCompany: state.selectedCompany,
            selectedBatch: state.selectedBatch,
          };
        }

        // If same user is already active with context, keep it
        if (state.userId === userId && state.selectedCompany) {
          return;
        }

        // Restore saved context for this user
        const saved = perUser[userId];
        if (saved) {
          set({
            userId,
            selectedCompany: saved.selectedCompany,
            selectedBatch: saved.selectedBatch,
            perUser,
          });
        } else {
          set({ userId, selectedCompany: null, selectedBatch: null, perUser });
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
