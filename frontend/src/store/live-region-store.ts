import { create } from 'zustand';

interface LiveRegionState {
  message: string;
  seq: number;
  announce: (message: string) => void;
}

/** A single shared polite `aria-live` announcer for connect/reconnect/
 * disconnect/save/failure state changes, mounted once in AppShell. `seq`
 * forces a re-announcement even when the same message repeats back-to-back
 * (screen readers otherwise ignore an unchanged live region). */
export const useLiveRegionStore = create<LiveRegionState>((set) => ({
  message: '',
  seq: 0,
  announce: (message) => set((s) => ({ message, seq: s.seq + 1 })),
}));

export const announce = (message: string): void => useLiveRegionStore.getState().announce(message);
