import type { BlackjackEvent, BlackjackPlayerView } from '@casino/game-engine';
import type {
  ActiveBlackjackRoundDto,
  ApiErrorDto,
  AuthResponseDto,
  BlackjackActionRequestDto,
  BlackjackRoundDto,
  HealthResponseDto,
  LedgerHistoryDto,
  LoginRequestDto,
  RegisterRequestDto,
  RotateSeedsResponseDto,
  RoundHistoryDto,
  SeedsDto,
  StartBlackjackRequestDto,
  WalletBalanceDto,
} from '@casino/shared';
import { useSessionStore } from '@/stores/session.store';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorDto,
  ) {
    super(body.message);
    this.name = 'ApiError';
  }

  /** Human-readable message, including validation details when present. */
  get detail(): string {
    return this.body.details?.length ? this.body.details.join('. ') : this.body.message;
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => null)) as ApiErrorDto | null;
  return new ApiError(
    res.status,
    body ?? { statusCode: res.status, code: 'NETWORK_ERROR', message: res.statusText },
  );
}

function request(path: string, init: RequestInit = {}, token?: string | null) {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // `include` so the httpOnly refresh cookie (scoped to /auth) travels cross-origin.
  return fetch(`${API_URL}${path}`, { ...init, headers, credentials: 'include' });
}

let inFlightRefresh: Promise<AuthResponseDto | null> | null = null;

/**
 * Exchanges the refresh cookie for a new access token. Single-flight: concurrent callers share
 * one request, because the server rotates the token and treats reuse as theft.
 */
export function refreshSession(): Promise<AuthResponseDto | null> {
  inFlightRefresh ??= (async () => {
    try {
      const res = await request('/auth/refresh', { method: 'POST' });
      if (!res.ok) {
        useSessionStore.getState().signOut();
        return null;
      }
      const auth = (await res.json()) as AuthResponseDto;
      useSessionStore.getState().signIn(auth);
      return auth;
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

/**
 * Typed fetch for authenticated routes. On a 401 it refreshes the session once and retries;
 * if that fails the user is signed out.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await request(path, init, useSessionStore.getState().accessToken);
  if (res.status === 401 && (await refreshSession())) {
    res = await request(path, init, useSessionStore.getState().accessToken);
  }
  if (!res.ok) throw await toApiError(res);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

async function authenticate(path: string, body: LoginRequestDto | RegisterRequestDto) {
  const res = await request(path, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw await toApiError(res);
  const auth = (await res.json()) as AuthResponseDto;
  useSessionStore.getState().signIn(auth);
  return auth;
}

export const login = (body: LoginRequestDto) => authenticate('/auth/login', body);
export const register = (body: RegisterRequestDto) => authenticate('/auth/register', body);

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' }).catch(() => undefined);
  useSessionStore.getState().signOut();
}

export async function loadBalance(): Promise<WalletBalanceDto> {
  const wallet = await apiFetch<WalletBalanceDto>('/wallet');
  useSessionStore.getState().setBalance(wallet.balance);
  return wallet;
}

export function getHistory(cursor?: string | null, limit = 20): Promise<LedgerHistoryDto> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiFetch<LedgerHistoryDto>(`/wallet/history?${params.toString()}`);
}

// --- blackjack / fairness / rounds ---------------------------------------------------------

export type BlackjackRound = BlackjackRoundDto<BlackjackPlayerView, BlackjackEvent>;

function adoptBalance<T extends { balance: string }>(dto: T): T {
  useSessionStore.getState().setBalance(dto.balance);
  return dto;
}

/**
 * `idempotencyKey` must be reused when retrying the same click, so a retry never bets twice.
 * The balance in the response is NOT applied here: the table applies it once the animation
 * has shown the outcome (otherwise the header would spoil the result).
 */
export function startBlackjack(bet: string, idempotencyKey: string): Promise<BlackjackRound> {
  return apiFetch<BlackjackRound>('/blackjack/rounds', {
    method: 'POST',
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ bet } satisfies StartBlackjackRequestDto),
  });
}

export function blackjackAction(
  roundId: string,
  body: BlackjackActionRequestDto,
): Promise<BlackjackRound> {
  return apiFetch<BlackjackRound>(`/blackjack/rounds/${encodeURIComponent(roundId)}/actions`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function getActiveBlackjack(): Promise<BlackjackRound | null> {
  const res = await apiFetch<ActiveBlackjackRoundDto<BlackjackPlayerView>>(
    '/blackjack/rounds/active',
  );
  return res.round ? adoptBalance(res.round as BlackjackRound) : null;
}

export function getBlackjackRound(roundId: string): Promise<BlackjackRound> {
  return apiFetch<BlackjackRound>(`/blackjack/rounds/${encodeURIComponent(roundId)}`);
}

export function getRounds(cursor?: string | null, limit = 20): Promise<RoundHistoryDto> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return apiFetch<RoundHistoryDto>(`/rounds?${params.toString()}`);
}

export function getSeeds(): Promise<SeedsDto> {
  return apiFetch<SeedsDto>('/fairness/seeds');
}

export function rotateSeeds(clientSeed?: string): Promise<RotateSeedsResponseDto> {
  return apiFetch<RotateSeedsResponseDto>('/fairness/rotate', {
    method: 'POST',
    body: JSON.stringify(clientSeed ? { clientSeed } : {}),
  });
}

export async function getHealth(): Promise<HealthResponseDto> {
  const res = await request('/health');
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as HealthResponseDto;
}

// TODO(fase-3): socket.io-client connection helper (add dependency in that phase)
