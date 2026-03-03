import { create } from 'zustand';
import type { ReactElement, ReactNode } from 'react';

export type ToastVariant = 'default' | 'destructive' | 'success' | 'warning' | 'info';

export interface ToasterToast {
  id: string;
  title?: string;
  description?: string;
  action?: ReactElement;
  variant?: ToastVariant;
  icon?: ReactNode;
  duration?: number;
  progress?: boolean;
  createdAt?: number;
}

interface ToastState {
  toasts: ToasterToast[];
  toast: (toast: Omit<ToasterToast, 'id' | 'createdAt'>) => string;
  dismiss: (id: string) => void;
  dismissAll: () => void;
  update: (id: string, toast: Partial<ToasterToast>) => void;
}

let toastId = 0;
const timers = new Map<string, NodeJS.Timeout>();

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  toast: (toast) => {
    const id = String(++toastId);
    const duration = toast.duration ?? 5000;
    const createdAt = Date.now();

    set((state) => ({
      toasts: [...state.toasts, { ...toast, id, createdAt }],
    }));

    // Auto dismiss after duration
    if (duration > 0) {
      const timer = setTimeout(() => {
        get().dismiss(id);
      }, duration);
      timers.set(id, timer);
    }

    return id;
  },
  dismiss: (id) => {
    const timer = timers.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.delete(id);
    }
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
  dismissAll: () => {
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    timers.clear();
    set({ toasts: [] });
  },
  update: (id, updates) => {
    set((state) => ({
      toasts: state.toasts.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    }));
  },
}));

export function useToast() {
  const { toast, dismiss, dismissAll, update } = useToastStore();

  return {
    toast,
    dismiss,
    dismissAll,
    update,
    success: (title: string, description?: string) =>
      toast({ title, description, variant: 'success' }),
    error: (title: string, description?: string) =>
      toast({ title, description, variant: 'destructive' }),
    warning: (title: string, description?: string) =>
      toast({ title, description, variant: 'warning' }),
    info: (title: string, description?: string) =>
      toast({ title, description, variant: 'info' }),
    promise: async <T,>(
      promise: Promise<T>,
      {
        loading,
        success,
        error,
      }: {
        loading: string;
        success: string | ((data: T) => string);
        error: string | ((err: unknown) => string);
      }
    ): Promise<T> => {
      const id = toast({
        title: loading,
        variant: 'default',
        duration: 0,
        progress: true,
      });

      try {
        const result = await promise;
        update(id, {
          title: typeof success === 'function' ? success(result) : success,
          variant: 'success',
          progress: false,
          duration: 3000,
        });
        setTimeout(() => dismiss(id), 3000);
        return result;
      } catch (err) {
        update(id, {
          title: typeof error === 'function' ? error(err) : error,
          variant: 'destructive',
          progress: false,
          duration: 5000,
        });
        setTimeout(() => dismiss(id), 5000);
        throw err;
      }
    },
  };
}
