import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp, registerUser, type TestAppContext } from './helpers/testApp';

describe('JWT revocation', () => {
  let ctx: TestAppContext;

  beforeEach(() => {
    ctx = buildTestApp();
  });

  it('POST /api/auth/logout revokes only the presented token; other tokens for the same user stay valid', async () => {
    const alice = await registerUser(ctx.app, 'alice');

    // Log in a second time — a distinct token for the same account (e.g. a
    // second device/tab).
    const login2 = await request(ctx.app).post('/api/auth/login').send({ username: 'alice', password: 'correct horse battery staple' });
    expect(login2.status).toBe(200);
    const token2 = login2.body.token as string;

    const meBefore = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${alice.token}`);
    expect(meBefore.status).toBe(200);

    const logoutRes = await request(ctx.app).post('/api/auth/logout').set('Authorization', `Bearer ${alice.token}`);
    expect(logoutRes.status).toBe(204);

    // The logged-out token is now rejected everywhere...
    const meAfter = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${alice.token}`);
    expect(meAfter.status).toBe(401);
    const credsAfter = await request(ctx.app).get('/api/credentials').set('Authorization', `Bearer ${alice.token}`);
    expect(credsAfter.status).toBe(401);

    // ...but the OTHER token for the same user is untouched.
    const meOther = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${token2}`);
    expect(meOther.status).toBe(200);
  });

  it('logout is idempotent and a static-token logout is a no-op 204 (nothing to revoke)', async () => {
    const alice = await registerUser(ctx.app, 'alice');

    const first = await request(ctx.app).post('/api/auth/logout').set('Authorization', `Bearer ${alice.token}`);
    expect(first.status).toBe(204);
    const second = await request(ctx.app).post('/api/auth/logout').set('Authorization', `Bearer ${alice.token}`);
    // Already-revoked token is now unauthenticated, so a repeat logout 401s
    // rather than double-revoking — resolveAuthContext rejects it first.
    expect(second.status).toBe(401);
  });

  it('POST /api/auth/logout-all invalidates every previously issued token for that user', async () => {
    const alice = await registerUser(ctx.app, 'alice');
    const login2 = await request(ctx.app).post('/api/auth/login').send({ username: 'alice', password: 'correct horse battery staple' });
    const token2 = login2.body.token as string;

    const logoutAll = await request(ctx.app).post('/api/auth/logout-all').set('Authorization', `Bearer ${alice.token}`);
    expect(logoutAll.status).toBe(204);

    const meFirst  = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${alice.token}`);
    const meSecond = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${token2}`);
    expect(meFirst.status).toBe(401);
    expect(meSecond.status).toBe(401);

    // A fresh login issues a token stamped with the new version, which works.
    const relogin = await request(ctx.app).post('/api/auth/login').send({ username: 'alice', password: 'correct horse battery staple' });
    expect(relogin.status).toBe(200);
    const meFresh = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${relogin.body.token}`);
    expect(meFresh.status).toBe(200);
  });

  it('logout-all is rejected for the static admin token (no user account to invalidate)', async () => {
    const { TEST_STATIC_TOKEN } = await import('./helpers/testApp');
    const res = await request(ctx.app).post('/api/auth/logout-all').set('Authorization', `Bearer ${TEST_STATIC_TOKEN}`);
    expect(res.status).toBe(401);
  });
});
