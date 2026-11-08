import type { INestApplication } from '@nestjs/common';
import { INITIAL_CHIP_GRANT, REFRESH_COOKIE_NAME } from '@casino/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, uniqueEmail } from './helpers';

const PASSWORD = 'correct horse battery';

function refreshCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith(`${REFRESH_COOKIE_NAME}=`));
  if (!cookie) throw new Error('no refresh cookie in response');
  return cookie.split(';')[0] as string;
}

describe('auth (HTTP end-to-end)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
  });
  afterAll(async () => {
    await app?.close();
  });

  const register = (email = uniqueEmail(), displayName = 'Ada') =>
    http.post('/auth/register').send({ email, password: PASSWORD, displayName });

  it('register → access token, httpOnly refresh cookie and a funded wallet', async () => {
    const email = uniqueEmail();
    const res = await register(email).expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email, displayName: 'Ada', role: 'PLAYER' });
    expect(res.body.user.passwordHash).toBeUndefined();
    const cookie = ([] as string[]).concat(res.headers['set-cookie'] ?? []).join(';');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Path=\/auth/);

    const auth = { Authorization: `Bearer ${res.body.accessToken}` };
    const me = await http.get('/users/me').set(auth).expect(200);
    expect(me.body.id).toBe(res.body.user.id);

    const wallet = await http.get('/wallet').set(auth).expect(200);
    expect(wallet.body.balance).toBe(INITIAL_CHIP_GRANT.toString());
  });

  it('e-mails are case-insensitive and unique', async () => {
    const email = uniqueEmail();
    await register(email).expect(201);
    const dup = await register(email.toUpperCase()).expect(409);
    expect(dup.body.code).toBe('EMAIL_TAKEN');
  });

  it('validates the payload and rejects unknown fields', async () => {
    const res = await http
      .post('/auth/register')
      .send({ email: 'nope', password: 'short', displayName: '<b>', role: 'ADMIN' })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect(res.body.details).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/email/),
        expect.stringMatching(/password/),
        expect.stringMatching(/displayName/),
        expect.stringMatching(/role should not exist/),
      ]),
    );
  });

  it('login works with the right password and fails the same way for bad password or user', async () => {
    const email = uniqueEmail();
    await register(email).expect(201);

    const ok = await http.post('/auth/login').send({ email, password: PASSWORD }).expect(200);
    expect(ok.body.user.email).toBe(email);

    const wrong = await http.post('/auth/login').send({ email, password: 'wrong password!' });
    const unknown = await http
      .post('/auth/login')
      .send({ email: uniqueEmail(), password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('protected routes require a valid access token', async () => {
    expect((await http.get('/wallet').expect(401)).body.code).toBe('UNAUTHENTICATED');
    const bad = await http.get('/wallet').set('Authorization', 'Bearer not.a.jwt').expect(401);
    expect(bad.body.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('refresh rotates the token; replaying an old one revokes the whole session', async () => {
    const res = await register().expect(201);
    const first = refreshCookie(res);

    const refreshed = await http.post('/auth/refresh').set('Cookie', first).expect(200);
    const second = refreshCookie(refreshed);
    expect(second).not.toBe(first);
    expect(refreshed.body.user.id).toBe(res.body.user.id);

    // Reuse of the rotated token (grace window is 0 in tests) → family revoked.
    const reuse = await http.post('/auth/refresh').set('Cookie', first).expect(401);
    expect(reuse.body.code).toBe('INVALID_REFRESH_TOKEN');
    await http.post('/auth/refresh').set('Cookie', second).expect(401);
  });

  it('logout revokes the session and clears the cookie', async () => {
    const res = await register().expect(201);
    const cookie = refreshCookie(res);

    const out = await http.post('/auth/logout').set('Cookie', cookie).expect(204);
    expect(([] as string[]).concat(out.headers['set-cookie'] ?? []).join(';')).toMatch(
      new RegExp(`${REFRESH_COOKIE_NAME}=;`),
    );
    await http.post('/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('refresh without, or with a forged, cookie is rejected', async () => {
    await http.post('/auth/refresh').expect(401);
    await http.post('/auth/refresh').set('Cookie', `${REFRESH_COOKIE_NAME}=abc.def`).expect(401);
    await http.post('/auth/refresh').set('Cookie', `${REFRESH_COOKIE_NAME}=garbage`).expect(401);
  });

  it('echoes a valid x-request-id and generates one otherwise', async () => {
    const echoed = await http.get('/health').set('x-request-id', 'trace-123').expect(200);
    expect(echoed.headers['x-request-id']).toBe('trace-123');

    const generated = await http.get('/health').set('x-request-id', 'bad id with spaces');
    expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);

    const failed = await http.get('/wallet').set('x-request-id', 'trace-err').expect(401);
    expect(failed.body.requestId).toBe('trace-err');
  });
});

describe('auth rate limiting', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp((config) => ({
      ...config,
      rateLimit: { ...config.rateLimit, authLimit: 3 },
    }));
  });
  afterAll(async () => {
    await app?.close();
  });

  it('throttles credential routes per IP but not the rest', async () => {
    const http = request(app.getHttpServer());
    const attempt = () =>
      http.post('/auth/login').send({ email: uniqueEmail(), password: PASSWORD });

    for (let i = 0; i < 3; i++) expect((await attempt()).status).toBe(401);
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe('TOO_MANY_REQUESTS');

    await http.get('/health').expect(200);
    await http.post('/auth/refresh').expect(401); // not a credential route
  });
});
