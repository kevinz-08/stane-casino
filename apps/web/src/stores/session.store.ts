import { create } from 'zustand';

interface SessionState {
  userId: string | null;
  /** Chip balance as a decimal string (bigint over the wire). Display only: the server is the authority. */
  balance: string | null;
  setSession: (userId: string | null, balance: string | null) => void;
}

// TODO(fase-1): hydrate from the API; never trust this for anything but rendering.
export const useSessionStore = create<SessionState>((set) => ({
  userId: null,
  balance: null,
  setSession: (userId, balance) => set({ userId, balance }),
}));
