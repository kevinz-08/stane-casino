import type { AuthResponseDto, UserDto } from '@casino/shared';
import { create } from 'zustand';

export type SessionStatus = 'unknown' | 'anonymous' | 'authenticated';

interface SessionState {
  /** `unknown` until the first refresh attempt on page load settles. */
  status: SessionStatus;
  user: UserDto | null;
  /** Short-lived access token, kept in memory only (never in localStorage). */
  accessToken: string | null;
  /** Chip balance as a decimal string (bigint over the wire). Display only: the server decides. */
  balance: string | null;
  signIn: (auth: AuthResponseDto) => void;
  setBalance: (balance: string) => void;
  signOut: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: 'unknown',
  user: null,
  accessToken: null,
  balance: null,
  signIn: (auth) =>
    set({ status: 'authenticated', user: auth.user, accessToken: auth.accessToken }),
  setBalance: (balance) => set({ balance }),
  signOut: () => set({ status: 'anonymous', user: null, accessToken: null, balance: null }),
}));
