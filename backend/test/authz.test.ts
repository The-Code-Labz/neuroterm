import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp, registerUser, TEST_STATIC_TOKEN, type TestAppContext } from './helpers/testApp';

describe('per-user authorization', () => {
  let ctx: TestAppContext;

  beforeEach(() => {
    ctx = buildTestApp();
  });

  it('rejects requests with no token', async () => {
    const res = await request(ctx.app).get('/api/credentials');
    expect(res.status).toBe(401);
  });

  it('rejects requests with a garbage token', async () => {
    const res = await request(ctx.app).get('/api/credentials').set('Authorization', 'Bearer garbage');
    expect(res.status).toBe(401);
  });

  it('the first registered user becomes admin; the second becomes a regular user', async () => {
    const admin = await registerUser(ctx.app, 'admin1');
    const user  = await registerUser(ctx.app, 'user1');

    const meAdmin = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${admin.token}`);
    const meUser  = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${user.token}`);
    expect(meAdmin.body.role).toBe('admin');
    expect(meUser.body.role).toBe('user');
  });

  it('a regular user cannot see another user\'s credentials', async () => {
    await registerUser(ctx.app, 'admin1'); // becomes admin, not relevant here
    const alice = await registerUser(ctx.app, 'alice');
    const bob   = await registerUser(ctx.app, 'bob');

    const created = await request(ctx.app)
      .post('/api/credentials')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ name: 'alice-box', username: 'root', auth_type: 'password', password: 'hunter2' });
    expect(created.status).toBe(201);
    const credId = created.body.id as string;

    // Bob can't see it in his list
    const bobList = await request(ctx.app).get('/api/credentials').set('Authorization', `Bearer ${bob.token}`);
    expect(bobList.body).toEqual([]);

    // Bob can't fetch it directly, patch it, or delete it — 404, not 403
    // (avoids confirming the resource exists to a non-owner).
    const bobGet = await request(ctx.app).get(`/api/credentials/${credId}`).set('Authorization', `Bearer ${bob.token}`);
    expect(bobGet.status).toBe(404);

    const bobPatch = await request(ctx.app)
      .patch(`/api/credentials/${credId}`)
      .set('Authorization', `Bearer ${bob.token}`)
      .send({ name: 'pwned' });
    expect(bobPatch.status).toBe(404);

    const bobDelete = await request(ctx.app).delete(`/api/credentials/${credId}`).set('Authorization', `Bearer ${bob.token}`);
    expect(bobDelete.status).toBe(404);

    // Alice can still see/manage her own
    const aliceGet = await request(ctx.app).get(`/api/credentials/${credId}`).set('Authorization', `Bearer ${alice.token}`);
    expect(aliceGet.status).toBe(200);
  });

  it('admin can see and manage every user\'s credentials', async () => {
    const admin = await registerUser(ctx.app, 'admin1');
    const alice = await registerUser(ctx.app, 'alice');

    const created = await request(ctx.app)
      .post('/api/credentials')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ name: 'alice-box', username: 'root', auth_type: 'password', password: 'hunter2' });

    const adminGet = await request(ctx.app)
      .get(`/api/credentials/${created.body.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminGet.status).toBe(200);
  });

  it('the static bearer token behaves as a superuser (legacy/single-operator behavior)', async () => {
    const alice = await registerUser(ctx.app, 'alice');

    const created = await request(ctx.app)
      .post('/api/credentials')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ name: 'alice-box', username: 'root', auth_type: 'password', password: 'hunter2' });

    const staticGet = await request(ctx.app)
      .get(`/api/credentials/${created.body.id}`)
      .set('Authorization', `Bearer ${TEST_STATIC_TOKEN}`);
    expect(staticGet.status).toBe(200);
  });

  it('a connection cannot be attached to a credential owned by a different user', async () => {
    await registerUser(ctx.app, 'admin1');
    const alice = await registerUser(ctx.app, 'alice');
    const bob   = await registerUser(ctx.app, 'bob');

    const aliceCred = await request(ctx.app)
      .post('/api/credentials')
      .set('Authorization', `Bearer ${alice.token}`)
      .send({ name: 'alice-cred', username: 'root', auth_type: 'password', password: 'hunter2' });

    const bobConnection = await request(ctx.app)
      .post('/api/connections')
      .set('Authorization', `Bearer ${bob.token}`)
      .send({
        name: 'bob-conn', host: '10.0.0.1', username: 'root', auth_type: 'password', password: 'x',
        credential_id: aliceCred.body.id, tmux_session: 'bobsession',
      });

    expect(bobConnection.status).toBe(400);
  });

  it('demoted/deleted users lose access immediately even with an unexpired JWT', async () => {
    const admin = await registerUser(ctx.app, 'admin1');
    const alice = await registerUser(ctx.app, 'alice');

    const beforeDelete = await request(ctx.app).get('/api/auth/me').set('Authorization', `Bearer ${alice.token}`);
    expect(beforeDelete.status).toBe(200);

    ctx.db.prepare(`DELETE FROM users WHERE id = ?`).run(alice.id);

    const afterDelete = await request(ctx.app).get('/api/credentials').set('Authorization', `Bearer ${alice.token}`);
    expect(afterDelete.status).toBe(401);
    void admin;
  });
});
