import type { AuthResponseDto } from '@casino/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '@/stores/session.store';
import { ApiError, apiFetch, refreshSession } from './api';
import { formatChips } from './format';

const auth = (token: string): AuthResponseDto => ({
  accessToken: token,
  expiresIn: 900,
  user: { id: 'u1', email: 'a@b.c', displayName: 'Ada', role: 'PLAYER', createdAt: '' },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('api client', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    useSessionStore.setState({ status: 'unknown', user: null, accessToken: null, balance: null });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shares one refresh request between concurrent callers', async () => {
    fetchMock.mockResolvedValue(json(200, auth('t1')));
    const [a, b] = await Promise.all([refreshSession(), refreshSession()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    expect(useSessionStore.getState()).toMatchObject({
      status: 'authenticated',
      accessToken: 't1',
    });
  });

  it('refreshes once and retries a request that got 401', async () => {
    useSessionStore.setState({ status: 'authenticated', accessToken: 'expired' });
    fetchMock
      .mockResolvedValueOnce(
        json(401, { statusCode: 401, code: 'INVALID_ACCESS_TOKEN', message: 'x' }),
      )
      .mockResolvedValueOnce(json(200, auth('fresh')))
      .mockResolvedValueOnce(json(200, { balance: '10' }));

    await expect(apiFetch('/wallet')).resolves.toEqual({ balance: '10' });

    const retried = fetchMock.mock.calls[2]?.[1]?.headers as Headers;
    expect(retried.get('Authorization')).toBe('Bearer fresh');
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: 'POST', credentials: 'include' });
  });

  it('signs out when the refresh also fails, and surfaces the API error', async () => {
    useSessionStore.setState({ status: 'authenticated', accessToken: 'expired' });
    const unauthorized = { statusCode: 401, code: 'INVALID_ACCESS_TOKEN', message: 'expired' };
    fetchMock
      .mockResolvedValueOnce(json(401, unauthorized))
      .mockResolvedValueOnce(
        json(401, { statusCode: 401, code: 'INVALID_REFRESH_TOKEN', message: 'x' }),
      );

    const error = await apiFetch('/wallet').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).body.code).toBe('INVALID_ACCESS_TOKEN');
    expect(useSessionStore.getState().status).toBe('anonymous');
  });

  it('formats bigint chip amounts without losing precision', () => {
    expect(formatChips('12345678901234567890')).toBe('12.345.678.901.234.567.890');
    expect(formatChips(null)).toBe('—');
    expect(formatChips('1.5')).toBe('—');
  });
});
