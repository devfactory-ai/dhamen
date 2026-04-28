import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface OcrBulletinResult {
  numero_bulletin?: string;
  adherent_name?: string;
  total_amount?: number;
  care_type?: string;
  actes_count?: number;
}

export interface ActiveOcrJob {
  jobId: string;
  companyId: string;
  totalBulletins: number;
  createdAt: string;
  /** Set to true once we've shown the browser notification for this job */
  notified: boolean;
}

/** Lightweight file metadata (File objects can't be serialized) */
export interface FileMeta {
  name: string;
  size: number;
  type: string;
}

/** Persisted analysis session — survives page navigation */
export interface AnalysisSession {
  id: string;
  /** Serialized OcrBulletinItem[] from the analysis */
  bulletinsJson: string;
  /** Which company/batch context was active */
  companyId: string;
  batchId?: string;
  /** Number of bulletins */
  count: number;
  createdAt: string;
  /** Has this session been restored already? */
  consumed: boolean;
  /** File metadata for display after navigation (File objects lost on unmount) */
  filesMeta?: FileMeta[];
  /** IndexedDB session key for retrieving actual file blobs */
  fileSessionId?: string;
}

interface OcrJobsState {
  activeJobs: ActiveOcrJob[];
  addJob: (job: Omit<ActiveOcrJob, 'notified'>) => void;
  removeJob: (jobId: string) => void;
  markNotified: (jobId: string) => void;
  getActiveJobIds: () => string[];
  /** Analysis session persistence for navigation */
  analysisSession: AnalysisSession | null;
  saveAnalysisSession: (session: Omit<AnalysisSession, 'consumed'>) => void;
  consumeAnalysisSession: () => AnalysisSession | null;
  clearAnalysisSession: () => void;
}

export const useOcrJobsStore = create<OcrJobsState>()(
  persist(
    (set, get) => ({
      activeJobs: [],
      addJob: (job) =>
        set((state) => ({
          activeJobs: [
            ...state.activeJobs.filter((j) => j.jobId !== job.jobId),
            { ...job, notified: false },
          ],
        })),
      removeJob: (jobId) =>
        set((state) => ({
          activeJobs: state.activeJobs.filter((j) => j.jobId !== jobId),
        })),
      markNotified: (jobId) =>
        set((state) => ({
          activeJobs: state.activeJobs.map((j) =>
            j.jobId === jobId ? { ...j, notified: true } : j
          ),
        })),
      getActiveJobIds: () => get().activeJobs.map((j) => j.jobId),
      // Analysis session
      analysisSession: null,
      saveAnalysisSession: (session) =>
        set({ analysisSession: { ...session, consumed: false } }),
      consumeAnalysisSession: () => {
        const session = get().analysisSession;
        if (session && !session.consumed) {
          set({ analysisSession: { ...session, consumed: true } });
          return session;
        }
        return null;
      },
      clearAnalysisSession: () => set({ analysisSession: null }),
    }),
    {
      name: 'ocr-active-jobs',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
